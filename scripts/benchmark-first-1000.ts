import { readdirSync, writeFileSync } from "node:fs"
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
  dataset: DatasetName
  sampleName: string
  samplePath: string
  margin: number
  progressIntervalMs: number
}

type WorkerProgressMessage = {
  type: "progress"
  dataset: DatasetName
  sampleName: string
  iterations: number
  elapsedMs: number
}

type WorkerDoneMessage = {
  type: "done"
  dataset: DatasetName
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
  dataset: DatasetName
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
  dataset: DatasetName
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

type BenchmarkReport = {
  sampleCount: number
  succeeded: number
  failed: number
  totalSolveTimeMs: number
  averageSolveTimeMs: number
  totalTraceCount: number
  totalIterations: number
  boundaryRepairedCount: number
  boundaryRepairedPercent: number
  bufferRepairedCount: number
  bufferRepairedPercent: number
  metadata: {
    datasets: DatasetName[]
    margin: number
    concurrency: number
    scenarioLimitUsed: number
  }
  sampleResults: Array<{
    dataset: DatasetName
    sampleName: string
    iterations: number
    elapsedMs: number
    totalTraceCount: number
    boundaryHitCount: number
    boundaryHitTraceCount: number
    bufferHitCount: number
    bufferHitTraceCount: number
    error?: string
  }>
}

type RunningSampleState = {
  dataset: DatasetName
  sampleName: string
  workerId: number
}

type DatasetName = "dataset01" | "dataset02"

type SamplePathEntry = {
  dataset: DatasetName
  sampleName: string
  samplePath: string
}

const formatMs = (ms: number) => `${ms.toFixed(2)}ms`
const formatSummaryLine = (label: string, value: string | number) =>
  `  ${label.padEnd(22)} ${value}`
const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)
const toPercent = (part: number, total: number) =>
  total > 0 ? (part / total) * 100 : 0

const buildBenchmarkReport = ({
  results,
  totalIterations,
  datasets,
  margin,
  concurrency,
  scenarioLimitUsed,
}: {
  results: SampleResult[]
  totalIterations: number
  datasets: DatasetName[]
  margin: number
  concurrency: number
  scenarioLimitUsed: number
}): BenchmarkReport => {
  const failed = results.filter((result) => result.error).length
  const succeeded = results.length - failed
  const succeededResults = results.filter((result) => !result.error)
  const totalSolveTimeMs = results.reduce(
    (sum, result) => sum + result.elapsedMs,
    0,
  )
  const totalTraceCount = results.reduce(
    (sum, result) => sum + result.totalTraceCount,
    0,
  )
  const boundaryRepairedCount = succeededResults.filter(
    (result) => result.boundaryHitCount === 0,
  ).length
  const bufferRepairedCount = succeededResults.filter(
    (result) => result.bufferHitCount === 0,
  ).length

  return {
    sampleCount: results.length,
    succeeded,
    failed,
    totalSolveTimeMs,
    averageSolveTimeMs:
      results.length > 0 ? totalSolveTimeMs / results.length : 0,
    totalTraceCount,
    totalIterations,
    boundaryRepairedCount,
    boundaryRepairedPercent: toPercent(boundaryRepairedCount, succeeded),
    bufferRepairedCount,
    bufferRepairedPercent: toPercent(bufferRepairedCount, succeeded),
    metadata: {
      datasets,
      margin,
      concurrency,
      scenarioLimitUsed,
    },
    sampleResults: results.map((result) => ({
      dataset: result.dataset,
      sampleName: result.sampleName,
      iterations: result.iterations,
      elapsedMs: result.elapsedMs,
      totalTraceCount: result.totalTraceCount,
      boundaryHitCount: result.boundaryHitCount,
      boundaryHitTraceCount: result.boundaryHitTraceCount,
      bufferHitCount: result.bufferHitCount,
      bufferHitTraceCount: result.bufferHitTraceCount,
      ...(result.error ? { error: result.error } : {}),
    })),
  }
}

const writeBenchmarkReport = (report: BenchmarkReport) => {
  writeFileSync("benchmark-result.json", `${JSON.stringify(report, null, 2)}\n`)
}

const logBenchmarkSummary = (report: BenchmarkReport) => {
  const boundaryLabel = `${report.boundaryRepairedCount}/${report.succeeded} (${report.boundaryRepairedPercent.toFixed(2)}%)`
  const bufferLabel = `${report.bufferRepairedCount}/${report.succeeded} (${report.bufferRepairedPercent.toFixed(2)}%)`
  const tableRows: Array<[string, string]> = [
    ["Samples", String(report.sampleCount)],
    ["Succeeded", String(report.succeeded)],
    ["Failed", String(report.failed)],
    ["Total traces", String(report.totalTraceCount)],
    ["Total iterations", String(report.totalIterations)],
    ["Total solve time", formatMs(report.totalSolveTimeMs)],
    ["Average solve time", formatMs(report.averageSolveTimeMs)],
    ["Boundary repaired %", boundaryLabel],
    ["Buffer repaired %", bufferLabel],
  ]
  const metricHeader = "Metric"
  const valueHeader = "Value"
  const metricWidth = Math.max(
    metricHeader.length,
    ...tableRows.map(([metric]) => metric.length),
  )
  const valueWidth = Math.max(
    valueHeader.length,
    ...tableRows.map(([, value]) => value.length),
  )
  const horizontal = `+${"-".repeat(metricWidth + 2)}+${"-".repeat(valueWidth + 2)}+`
  const renderRow = (left: string, right: string) =>
    `| ${left.padEnd(metricWidth)} | ${right.padEnd(valueWidth)} |`

  console.log("")
  console.log("Benchmark summary")
  console.log(formatSummaryLine("Samples", report.sampleCount))
  console.log(formatSummaryLine("Succeeded", report.succeeded))
  console.log(formatSummaryLine("Failed", report.failed))
  console.log(formatSummaryLine("Total traces", report.totalTraceCount))
  console.log(formatSummaryLine("Total iterations", report.totalIterations))
  console.log(
    formatSummaryLine("Total solve time", formatMs(report.totalSolveTimeMs)),
  )
  console.log(
    formatSummaryLine(
      "Average solve time",
      formatMs(report.averageSolveTimeMs),
    ),
  )
  console.log("")
  console.log("Repairs")
  console.log(formatSummaryLine("Boundary", boundaryLabel))
  console.log(
    formatSummaryLine(
      `Boundary buffer ${report.metadata.margin} mm area`,
      bufferLabel,
    ),
  )
  console.log("")
  console.log("Benchmark summary table")
  console.log(horizontal)
  console.log(renderRow(metricHeader, valueHeader))
  console.log(horizontal)
  for (const [metric, value] of tableRows) {
    console.log(renderRow(metric, value))
  }
  console.log(horizontal)
}

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

const parseScenarioLimitArg = (
  flags: string[],
): { mode: "limited"; limit: number } | { mode: "all" } => {
  let index = -1
  for (const flag of flags) {
    const candidateIndex = Bun.argv.indexOf(flag)
    if (candidateIndex !== -1) {
      index = candidateIndex
    }
  }

  if (index === -1) {
    return { mode: "limited", limit: 5000 }
  }

  const rawValue = Bun.argv[index + 1]
  if (!rawValue) {
    throw new Error(`Invalid value for ${flags.join(" or ")}: <missing>`)
  }

  if (rawValue.toLowerCase() === "all") {
    return { mode: "all" }
  }

  const value = Number(rawValue)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Invalid value for ${flags.join(" or ")}: ${rawValue ?? "<missing>"}`,
    )
  }

  return { mode: "limited", limit: value }
}

const parseDatasetArg = (): DatasetName[] => {
  const rawValues: string[] = []
  for (let index = 0; index < Bun.argv.length; index += 1) {
    if (Bun.argv[index] === "--dataset") {
      const value = Bun.argv[index + 1]
      if (!value) {
        throw new Error("Missing value for --dataset")
      }
      rawValues.push(value)
    }
  }

  if (rawValues.length === 0) {
    return ["dataset01", "dataset02"]
  }

  const parsed = rawValues
    .flatMap((value) => value.split(/[,\s/]+/))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.toLowerCase())
    .flatMap((value) =>
      value === "all" ? ["dataset01", "dataset02"] : [value],
    )

  const datasets: DatasetName[] = []
  for (const dataset of parsed) {
    if (dataset !== "dataset01" && dataset !== "dataset02") {
      throw new Error(`Invalid dataset: ${dataset}`)
    }
    if (!datasets.includes(dataset)) {
      datasets.push(dataset)
    }
  }

  if (datasets.length === 0) {
    throw new Error("At least one dataset must be selected")
  }

  return datasets
}

const getDataset01SamplePaths = (): SamplePathEntry[] => {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const datasetDir = join(currentDir, "../node_modules/dataset-hd08/samples")

  return readdirSync(datasetDir)
    .filter((entry) => /^sample\d+\.json$/.test(entry))
    .sort((a, b) => a.localeCompare(b))
    .map((entry) => ({
      dataset: "dataset01" as const,
      sampleName: entry.replace(/\.json$/, ""),
      samplePath: join(datasetDir, entry),
    }))
}

const getDataset02SamplePaths = (): SamplePathEntry[] => {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const datasetDirs = [
    join(currentDir, "../tests/assets"),
    join(currentDir, "../tests/repros/assets"),
  ]
  const fileRegex = /(circuit|bugreport|repro|repair-input)/i

  return datasetDirs.flatMap((datasetDir) =>
    readdirSync(datasetDir)
      .filter((entry) => entry.endsWith(".json") && fileRegex.test(entry))
      .sort((a, b) => a.localeCompare(b))
      .map((entry) => ({
        dataset: "dataset02" as const,
        sampleName: entry.replace(/\.json$/, ""),
        samplePath: join(datasetDir, entry),
      })),
  )
}

const getSelectedSamplePaths = (datasets: DatasetName[]) =>
  datasets.flatMap((dataset) =>
    dataset === "dataset01"
      ? getDataset01SamplePaths()
      : getDataset02SamplePaths(),
  )

const runWorker = async () => {
  const { dataset, sampleName, samplePath, margin, progressIntervalMs } =
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
          dataset,
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
        dataset,
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
      dataset,
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
      dataset,
      sampleName,
      iterations: solver.iterations,
      elapsedMs: performance.now() - startedAt,
      error: getErrorMessage(error),
    } satisfies WorkerErrorMessage)
  }
}

const runMain = async () => {
  const scenarioLimit = parseScenarioLimitArg(["--limit", "--scenario-limit"])
  const datasets = parseDatasetArg()
  const margin = parseNumberArg("--margin", 0.4)
  const progressIntervalMs = parseNumberArg("--progress-interval", 200)
  const concurrency = Math.floor(parseNumberArg("--concurrency", 1))

  const selectedSamplePaths = getSelectedSamplePaths(datasets)
  const samplePaths =
    scenarioLimit.mode === "limited"
      ? selectedSamplePaths.slice(0, scenarioLimit.limit)
      : selectedSamplePaths

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
      dataset: sampleInfo.dataset,
      sampleName: sampleInfo.sampleName,
      workerId,
    })

    const worker = new Worker(new URL(import.meta.url), {
      workerData: {
        dataset: sampleInfo.dataset,
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
          dataset: message.dataset,
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
            `[sample-hit] ${message.dataset}/${message.sampleName} worker=${workerId} iterations=${message.iterations} frames=${message.frameCount} traces=${message.totalTraceCount} ${hitParts.join(" ")} time=${formatMs(message.elapsedMs)}`,
          )
        }
      } else {
        results.push({
          dataset: message.dataset,
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
          `[sample-error] ${message.dataset}/${message.sampleName} worker=${workerId} iterations=${message.iterations} time=${formatMs(message.elapsedMs)} error=${message.error}`,
        )
      }

      void worker.terminate()

      if (completed >= samplePaths.length) {
        const report = buildBenchmarkReport({
          results,
          totalIterations,
          datasets,
          margin,
          concurrency,
          scenarioLimitUsed: samplePaths.length,
        })
        logBenchmarkSummary(report)
        writeBenchmarkReport(report)
        process.exitCode = report.failed > 0 ? 1 : 0
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
        dataset: sampleInfo.dataset,
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
        const report = buildBenchmarkReport({
          results,
          totalIterations,
          datasets,
          margin,
          concurrency,
          scenarioLimitUsed: samplePaths.length,
        })
        logBenchmarkSummary(report)
        writeBenchmarkReport(report)
        process.exitCode = 1
        return
      }

      launchWorker(workerId)
    })
  }

  console.log(
    `Starting benchmark: datasets=${datasets.join(",")} samples=${samplePaths.length} workers=${concurrency} margin=${margin} progressInterval=${progressIntervalMs}ms`,
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
