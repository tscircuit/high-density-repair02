import { readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} from "node:worker_threads"
import type { DatasetSample } from "../lib/high-density-repair-solver"
import { HighDensityRepairSolver } from "../lib/high-density-repair-solver"
import { findBufferZoneSegmentsNotStraightFromBoundary } from "../lib/high-density-repair-solver/functions/findBufferZoneSegmentsNotStraightFromBoundary"
import { findInteriorDiagonalSegmentsInBufferZone } from "../lib/high-density-repair-solver/functions/findInteriorDiagonalSegmentsInBufferZone"
import { getBoundaryRect } from "../lib/high-density-repair-solver/functions/getBoundaryRect"

// Run with: bun run benchmark:first-1000

type WorkerInput = {
  sampleName: string
  samplePath: string
  margin: number
  progressIntervalMs: number
}

type WorkerProgressMessage = {
  type: "progress"
  sampleName: string
  iterations: number
  elapsedMs: number
}

type WorkerDoneMessage = {
  type: "done"
  sampleName: string
  iterations: number
  elapsedMs: number
  frameCount: number
  totalTraceCount: number
  boundaryHitCount: number
  boundaryHitTraceCount: number
  bufferHitCount: number
  bufferHitTraceCount: number
}

type WorkerErrorMessage = {
  type: "error"
  sampleName: string
  iterations: number
  elapsedMs: number
  error: string
}

type WorkerMessage =
  | WorkerProgressMessage
  | WorkerDoneMessage
  | WorkerErrorMessage

type SampleResult = {
  sampleName: string
  iterations: number
  elapsedMs: number
  frameCount: number
  totalTraceCount: number
  boundaryHitCount: number
  boundaryHitTraceCount: number
  bufferHitCount: number
  bufferHitTraceCount: number
  error?: string
}

type RunningSampleState = {
  sampleName: string
  workerId: number
}

const formatMs = (ms: number) => `${ms.toFixed(2)}ms`
const formatSummaryLine = (label: string, value: string | number) =>
  `  ${label.padEnd(22)} ${value}`
const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const parseNumberArg = (flag: string, fallback: number) => {
  const index = Bun.argv.indexOf(flag)
  if (index === -1) return fallback

  const rawValue = Bun.argv[index + 1]
  const value = Number(rawValue)
  if (!rawValue || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid value for ${flag}: ${rawValue ?? "<missing>"}`)
  }

  return value
}

const getDatasetSamplePaths = () => {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const datasetDir = join(currentDir, "../node_modules/dataset-hd08/samples")

  return readdirSync(datasetDir)
    .filter((entry) => /^sample\d+\.json$/.test(entry))
    .sort((a, b) => a.localeCompare(b))
    .map((entry) => ({
      sampleName: entry.replace(/\.json$/, ""),
      samplePath: join(datasetDir, entry),
    }))
}

const runWorker = async () => {
  const { sampleName, samplePath, margin, progressIntervalMs } =
    workerData as WorkerInput

  const sample = (await Bun.file(samplePath).json()) as DatasetSample
  const solver = new HighDensityRepairSolver({
    sample,
    margin,
    captureProgressFrames: true,
  })
  const startedAt = performance.now()
  let lastProgressAt = startedAt

  try {
    while (!solver.solved && !solver.failed) {
      solver.step()

      const now = performance.now()
      if (
        solver.iterations === 1 ||
        now - lastProgressAt >= progressIntervalMs
      ) {
        parentPort?.postMessage({
          type: "progress",
          sampleName,
          iterations: solver.iterations,
          elapsedMs: now - startedAt,
        } satisfies WorkerProgressMessage)
        lastProgressAt = now
      }
    }

    const elapsedMs = performance.now() - startedAt
    const output = solver.getOutput() as { frameCount?: number } | null

    if (solver.failed) {
      parentPort?.postMessage({
        type: "error",
        sampleName,
        iterations: solver.iterations,
        elapsedMs,
        error: solver.error ?? `${sampleName} failed`,
      } satisfies WorkerErrorMessage)
      return
    }

    const boundary = getBoundaryRect(sample.nodeWithPortPoints)
    const boundaryHits = boundary
      ? findInteriorDiagonalSegmentsInBufferZone(
          solver.repairedRoutes,
          boundary,
          margin,
        )
      : []
    const bufferHits = boundary
      ? findBufferZoneSegmentsNotStraightFromBoundary(
          solver.repairedRoutes,
          boundary,
          margin,
        )
      : []
    const boundaryHitTraceCount = new Set(
      boundaryHits.map((hit) => hit.routeIndex),
    ).size
    const bufferHitTraceCount = new Set(bufferHits.map((hit) => hit.routeIndex))
      .size

    parentPort?.postMessage({
      type: "done",
      sampleName,
      iterations: solver.iterations,
      elapsedMs,
      frameCount: output?.frameCount ?? 0,
      totalTraceCount: solver.repairedRoutes.length,
      boundaryHitCount: boundaryHits.length,
      boundaryHitTraceCount,
      bufferHitCount: bufferHits.length,
      bufferHitTraceCount,
    } satisfies WorkerDoneMessage)
  } catch (error) {
    parentPort?.postMessage({
      type: "error",
      sampleName,
      iterations: solver.iterations,
      elapsedMs: performance.now() - startedAt,
      error: getErrorMessage(error),
    } satisfies WorkerErrorMessage)
  }
}

const runMain = async () => {
  const limit = parseNumberArg("--limit", 1000)
  const margin = parseNumberArg("--margin", 0.4)
  const progressIntervalMs = parseNumberArg("--progress-interval", 200)

  const samplePaths = getDatasetSamplePaths().slice(0, limit)
  const concurrency = 1

  if (samplePaths.length === 0) {
    throw new Error("No dataset samples found")
  }

  let nextIndex = 0
  let completed = 0
  let totalIterations = 0
  const results: SampleResult[] = []
  const runningSamples = new Map<number, RunningSampleState>()

  const launchWorker = (workerId: number) => {
    if (nextIndex >= samplePaths.length) return

    const sampleInfo = samplePaths[nextIndex++]
    const startedAt = performance.now()
    runningSamples.set(workerId, {
      sampleName: sampleInfo.sampleName,
      workerId,
    })

    const worker = new Worker(new URL(import.meta.url), {
      workerData: {
        sampleName: sampleInfo.sampleName,
        samplePath: sampleInfo.samplePath,
        margin,
        progressIntervalMs,
      } satisfies WorkerInput,
    })

    worker.on("message", (message: WorkerMessage) => {
      const runningState = runningSamples.get(workerId)
      if (!runningState) return

      if (message.type === "progress") {
        return
      }

      runningSamples.delete(workerId)
      completed += 1
      totalIterations += message.iterations

      if (message.type === "done") {
        results.push({
          sampleName: message.sampleName,
          iterations: message.iterations,
          elapsedMs: message.elapsedMs,
          frameCount: message.frameCount,
          totalTraceCount: message.totalTraceCount,
          boundaryHitCount: message.boundaryHitCount,
          boundaryHitTraceCount: message.boundaryHitTraceCount,
          bufferHitCount: message.bufferHitCount,
          bufferHitTraceCount: message.bufferHitTraceCount,
        })
        if (message.boundaryHitCount > 0 || message.bufferHitCount > 0) {
          const hitParts = [
            message.boundaryHitCount > 0
              ? `boundaryHits=${message.boundaryHitCount} boundaryHitTraces=${message.boundaryHitTraceCount}`
              : null,
            message.bufferHitCount > 0
              ? `bufferHits=${message.bufferHitCount} bufferHitTraces=${message.bufferHitTraceCount}`
              : null,
          ].filter(Boolean)

          console.log(
            `[sample-hit] ${message.sampleName} worker=${workerId} iterations=${message.iterations} frames=${message.frameCount} traces=${message.totalTraceCount} ${hitParts.join(" ")} time=${formatMs(message.elapsedMs)}`,
          )
        }
      } else {
        results.push({
          sampleName: message.sampleName,
          iterations: message.iterations,
          elapsedMs: message.elapsedMs,
          frameCount: 0,
          totalTraceCount: 0,
          boundaryHitCount: 0,
          boundaryHitTraceCount: 0,
          bufferHitCount: 0,
          bufferHitTraceCount: 0,
          error: message.error,
        })
        console.log(
          `[sample-error] ${message.sampleName} worker=${workerId} iterations=${message.iterations} time=${formatMs(message.elapsedMs)} error=${message.error}`,
        )
      }

      void worker.terminate()

      if (completed >= samplePaths.length) {
        const failed = results.filter((result) => result.error).length
        const succeeded = results.length - failed
        const succeededResults = results.filter((result) => !result.error)
        const totalSampleSolveTimeMs = results.reduce(
          (sum, result) => sum + result.elapsedMs,
          0,
        )
        const totalTraceCount = results.reduce(
          (sum, result) => sum + result.totalTraceCount,
          0,
        )
        const boundaryRepairedSampleCount = succeededResults.filter(
          (result) => result.boundaryHitCount === 0,
        ).length
        const bufferRepairedSampleCount = succeededResults.filter(
          (result) => result.bufferHitCount === 0,
        ).length
        const boundaryRepairPercent =
          succeeded > 0 ? (boundaryRepairedSampleCount / succeeded) * 100 : 0
        const bufferRepairPercent =
          succeeded > 0 ? (bufferRepairedSampleCount / succeeded) * 100 : 0

        console.log("")
        console.log("Benchmark summary")
        console.log(formatSummaryLine("Samples", results.length))
        console.log(formatSummaryLine("Succeeded", succeeded))
        console.log(formatSummaryLine("Failed", failed))
        console.log(formatSummaryLine("Total traces", totalTraceCount))
        console.log(formatSummaryLine("Total iterations", totalIterations))
        console.log(
          formatSummaryLine(
            "Total solve time",
            formatMs(totalSampleSolveTimeMs),
          ),
        )
        console.log(
          formatSummaryLine(
            "Average solve time",
            formatMs(totalSampleSolveTimeMs / results.length),
          ),
        )
        console.log("")
        console.log("Repairs")
        console.log(
          formatSummaryLine(
            "Boundary",
            `${boundaryRepairedSampleCount}/${succeeded} (${boundaryRepairPercent.toFixed(2)}%)`,
          ),
        )
        console.log(
          formatSummaryLine(
            `Boundary buffer ${margin} mm area`,
            `${bufferRepairedSampleCount}/${succeeded} (${bufferRepairPercent.toFixed(2)}%)`,
          ),
        )

        process.exitCode = failed > 0 ? 1 : 0
        return
      }

      launchWorker(workerId)
    })

    worker.on("error", (error) => {
      const errorMessage = getErrorMessage(error)
      runningSamples.delete(workerId)
      completed += 1
      console.log(
        `[worker-error] ${sampleInfo.sampleName} worker=${workerId} error=${errorMessage}`,
      )
      results.push({
        sampleName: sampleInfo.sampleName,
        iterations: 0,
        elapsedMs: performance.now() - startedAt,
        frameCount: 0,
        totalTraceCount: 0,
        boundaryHitCount: 0,
        boundaryHitTraceCount: 0,
        bufferHitCount: 0,
        bufferHitTraceCount: 0,
        error: errorMessage,
      })

      if (completed >= samplePaths.length) {
        process.exitCode = 1
        return
      }

      launchWorker(workerId)
    })
  }

  console.log(
    `Starting benchmark: samples=${samplePaths.length} workers=${concurrency} margin=${margin} progressInterval=${progressIntervalMs}ms`,
  )

  for (let workerId = 1; workerId <= concurrency; workerId += 1) {
    launchWorker(workerId)
  }
}

if (isMainThread) {
  await runMain()
} else {
  await runWorker()
}
