import {
  SolverRuntime,
  type SolverRuntimeExecutor,
} from "@tscircuit/solver-utils"
import { EPSILON } from "../shared/constants"
import type { HdRoute, Obstacle } from "../shared/types"
import { FixedCopperClearanceGuard } from "./FixedCopperClearanceGuard"
import { findInteriorDiagonalSegmentsInBufferZone } from "./findInteriorDiagonalSegmentsInBufferZone"
import {
  evaluate,
  collectCopper,
  moveCopper,
  distanceToObstacle,
  RouteCopperScenePatternCache,
  type Copper,
  type ObstacleBounds,
  type Evaluation,
  type NodeClearanceRepairResult,
  type NodeClearanceRepairParams,
} from "./repairNodeClearance"

type RepairTraversalResult = NodeClearanceRepairResult & {
  evaluation: Evaluation
  improved: boolean
}

type CandidateCaches = {
  geometryCache: WeakMap<HdRoute, Copper[]>
  spatialPatternCache: RouteCopperScenePatternCache
  obstacleClearanceCache: WeakMap<HdRoute, Map<Obstacle, number>>
  obstacleBoundsCache: WeakMap<Obstacle, ObstacleBounds>
  boundaryViolationCache: WeakMap<HdRoute, number>
  routeNetCache: WeakMap<HdRoute, Set<string | undefined>>
}

function createCandidateCaches(): CandidateCaches {
  return {
    geometryCache: new WeakMap(),
    spatialPatternCache: new RouteCopperScenePatternCache(),
    obstacleClearanceCache: new WeakMap(),
    obstacleBoundsCache: new WeakMap(),
    boundaryViolationCache: new WeakMap(),
    routeNetCache: new WeakMap(),
  }
}

type NodeClearanceCandidateRangeInput = {
  cancellation?: Int32Array
  params: Omit<NodeClearanceRepairParams, "fixedCopperGuard">
  fixedGuardParams: ReturnType<
    FixedCopperClearanceGuard["getConstructorParams"]
  >
  evaluation: Evaluation
  start: number
  end: number
}

/** Disjoint ranges inspect the same state and stop at their first improvement. */
export class NodeClearanceCandidateSolver {
  static readonly solverName: string = "NodeClearanceCandidateSolver"
  private output?: RepairTraversalResult
  constructor(private readonly input: NodeClearanceCandidateRangeInput) {}
  solve(): void {
    this.output = scanFirstImprovement(
      {
        ...this.input.params,
        fixedCopperGuard: new FixedCopperClearanceGuard(
          ...this.input.fixedGuardParams,
        ),
      },
      {
        evaluation: this.input.evaluation,
        start: this.input.start,
        end: this.input.end,
        cancellation: this.input.cancellation,
      },
      createCandidateCaches(),
    )
  }
  getOutput(): RepairTraversalResult {
    if (!this.output)
      throw new Error("Clearance candidate range has not completed")
    return this.output
  }
}
SolverRuntime.registerSolver(NodeClearanceCandidateSolver)

export async function repairNodeClearanceAsync(
  params: NodeClearanceRepairParams,
  runtime: SolverRuntimeExecutor,
): Promise<NodeClearanceRepairResult> {
  const caches = createCandidateCaches()
  const initialized = scanFirstImprovement(params, { start: 0, end: 0 }, caches)
  let evaluation = initialized.evaluation
  const initialConflictCount = evaluation.conflicts.length
  const candidateLimit =
    params.maxCandidates ?? Math.max(256, initialConflictCount * 96)
  let candidateCount = 0
  let routes = params.routes
  const { fixedCopperGuard, ...plainParams } = params
  while (evaluation.conflicts.length && candidateCount < candidateLimit) {
    // Every valid copper owner has three distances and eight directions.
    const sweepCount = evaluation.conflicts.reduce(
      (count, conflict) =>
        count +
        [conflict.firstRoute, conflict.secondRoute].filter(
          (index) => index >= 0 && index < routes.length,
        ).length *
          24,
      0,
    )
    const count = Math.min(sweepCount, candidateLimit - candidateCount)
    if (count === 0) break
    const common = {
      params: { ...plainParams, routes },
      fixedGuardParams: fixedCopperGuard.getConstructorParams(),
      evaluation,
    }
    // Most productive moves are near the start. Keep that small prefix local;
    // use workers for the long rejected suffix without changing its order.
    const prefix = Math.min(48, count)
    let selected: RepairTraversalResult | undefined = scanFirstImprovement(
      { ...params, routes },
      { start: 0, end: prefix, evaluation },
      caches,
    )
    if (!selected.improved) {
      selected = undefined
      for (let cursor = prefix; cursor < count; cursor += 1024) {
        const end = Math.min(count, cursor + 1024)
        const chunkSize = Math.ceil((end - cursor) / 4)
        const cancellation =
          typeof SharedArrayBuffer === "undefined"
            ? undefined
            : new Int32Array(new SharedArrayBuffer(4))
        const pending = []
        for (let start = cursor; start < end; start += chunkSize) {
          pending.push(
            runtime
              .executeAsync(NodeClearanceCandidateSolver, {
                ...common,
                start,
                end: Math.min(end, start + chunkSize),
                cancellation,
              })
              .then(
                (result) => ({ type: "result" as const, result }),
                (error: unknown) => ({ type: "error" as const, error }),
              ),
          )
        }
        let failure: unknown
        for (const promise of pending) {
          const outcome = await promise
          if (outcome.type === "error") {
            failure = outcome.error
            break
          }
          if (outcome.result.improved) {
            selected = outcome.result
            break
          }
        }
        if ((selected || failure !== undefined) && cancellation)
          Atomics.store(cancellation, 0, 1)
        const outcomes = await Promise.all(pending)
        const rejected = outcomes.find((outcome) => outcome.type === "error")
        if (rejected?.type === "error") throw rejected.error
        if (selected) break
      }
    }
    if (!selected) {
      candidateCount += count
      break
    }
    candidateCount += selected.candidateCount
    routes = selected.routes
    evaluation = selected.evaluation
  }
  return {
    routes,
    initialConflictCount,
    finalConflictCount: evaluation.conflicts.length,
    candidateCount,
  }
}

function scanFirstImprovement(
  {
    routes,
    fixedRoutes = [],
    boundary,
    fixedCopperGuard,
    adjacentObstacles = [],
    clearanceObstacles = adjacentObstacles,
    clearance = 0.1,
    boundaryMargin = 0.2,
  }: NodeClearanceRepairParams,
  probe: {
    start: number
    end: number
    evaluation?: Evaluation
    cancellation?: Int32Array
  },
  caches: CandidateCaches,
): RepairTraversalResult {
  let current = routes
  const {
    geometryCache,
    spatialPatternCache,
    obstacleClearanceCache,
    obstacleBoundsCache,
    boundaryViolationCache,
    routeNetCache,
  } = caches
  if (probe.evaluation) {
    for (const route of [...routes, ...fixedRoutes]) {
      if (!geometryCache.has(route))
        geometryCache.set(route, collectCopper(route))
    }
  }
  let evaluation =
    probe.evaluation ??
    evaluate(
      current,
      clearance,
      clearanceObstacles,
      fixedRoutes,
      undefined,
      geometryCache,
      spatialPatternCache,
      obstacleBoundsCache,
      routeNetCache,
    )
  // Give each initial conflict a full sweep of both copper parts, three
  // distances and eight directions, with room for a second improving move.
  const candidateLimit = probe.end
  const result: NodeClearanceRepairResult = {
    routes,
    initialConflictCount: evaluation.conflicts.length,
    finalConflictCount: evaluation.conflicts.length,
    candidateCount: 0,
  }
  while (
    evaluation.conflicts.length &&
    result.candidateCount < candidateLimit
  ) {
    let improved = false
    const currentPenetrations = new Map(
      evaluation.conflicts.map((conflict) => [
        conflict.key,
        conflict.penetration,
      ]),
    )
    for (const conflict of evaluation.conflicts) {
      for (const [routeIndex, copper] of [
        [conflict.firstRoute, conflict.first],
        [conflict.secondRoute, conflict.second],
      ] as const) {
        if (routeIndex < 0 || routeIndex >= current.length) continue
        if (result.candidateCount + 24 <= probe.start) {
          result.candidateCount += 24
          continue
        }
        const before = current[routeIndex]!
        const names = new Set(
          [before.connectionName, before.rootConnectionName].filter(Boolean),
        )
        const foreignObstacles = clearanceObstacles.filter(
          (obstacle) => !obstacle.connectedTo?.some((name) => names.has(name)),
        )
        // evaluate() has already cached every route in the current state.
        const beforeCopper = geometryCache.get(before)!
        let boundaryViolations = boundaryViolationCache.get(before)
        if (boundaryViolations === undefined) {
          boundaryViolations = findInteriorDiagonalSegmentsInBufferZone(
            [before],
            boundary,
            boundaryMargin,
          ).length
          boundaryViolationCache.set(before, boundaryViolations)
        }
        let cachedObstacleClearances = obstacleClearanceCache.get(before)
        if (!cachedObstacleClearances) {
          cachedObstacleClearances = new Map()
          obstacleClearanceCache.set(before, cachedObstacleClearances)
        }
        const obstacleClearances = foreignObstacles.map((obstacle) => {
          const cached = cachedObstacleClearances.get(obstacle)
          if (cached !== undefined) return cached
          const value = Math.min(
            ...beforeCopper
              .filter(
                (part) =>
                  !obstacle.zLayers ||
                  obstacle.zLayers.some(
                    (z) => z >= part.minZ && z <= part.maxZ,
                  ),
              )
              .map((part) => distanceToObstacle(part, obstacle)),
          )
          cachedObstacleClearances.set(obstacle, value)
          return value
        })
        for (const scale of [1.01, 2, 4]) {
          const amount = Math.max(0.01, conflict.penetration * scale)
          for (const [x, y] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [Math.SQRT1_2, Math.SQRT1_2],
            [-Math.SQRT1_2, Math.SQRT1_2],
            [Math.SQRT1_2, -Math.SQRT1_2],
            [-Math.SQRT1_2, -Math.SQRT1_2],
          ]) {
            if (result.candidateCount >= candidateLimit) break
            if (
              probe.cancellation &&
              Atomics.load(probe.cancellation, 0) !== 0
            ) {
              return {
                ...result,
                routes: current,
                finalConflictCount: evaluation.conflicts.length,
                evaluation,
                improved: false,
              }
            }
            result.candidateCount++
            if (result.candidateCount <= probe.start) continue
            const moved = moveCopper(
              before,
              copper,
              x! * amount,
              y! * amount,
              boundary,
            )
            if (!moved) continue
            if (
              findInteriorDiagonalSegmentsInBufferZone(
                [moved],
                boundary,
                boundaryMargin,
              ).length > boundaryViolations
            )
              continue
            const candidate = [...current]
            candidate[routeIndex] = moved
            const next = evaluate(
              candidate,
              clearance,
              clearanceObstacles,
              fixedRoutes,
              { evaluation, changedRoute: routeIndex, routes: current },
              geometryCache,
              spatialPatternCache,
              obstacleBoundsCache,
              routeNetCache,
            )
            if (
              next.conflicts.length > evaluation.conflicts.length ||
              next.score >= evaluation.score - EPSILON ** 2
            )
              continue
            if (
              next.conflicts.some(
                (contact) =>
                  contact.penetration >
                  (currentPenetrations.get(contact.key) ?? 0) + EPSILON,
              )
            )
              continue
            if (
              !fixedCopperGuard.allows(current, candidate, [routeIndex], false)
            )
              continue
            const afterCopper = geometryCache.get(moved)!
            if (
              foreignObstacles.some(
                (obstacle, index) =>
                  Math.min(
                    ...afterCopper
                      .filter(
                        (part) =>
                          !obstacle.zLayers ||
                          obstacle.zLayers.some(
                            (z) => z >= part.minZ && z <= part.maxZ,
                          ),
                      )
                      .map((part) => distanceToObstacle(part, obstacle)),
                  ) <
                  Math.min(clearance, obstacleClearances[index]!) - EPSILON,
              )
            )
              continue
            current = candidate
            evaluation = next
            return {
              ...result,
              routes: current,
              finalConflictCount: evaluation.conflicts.length,
              evaluation,
              improved: true,
            }
          }
          if (improved || result.candidateCount >= candidateLimit) break
        }
        if (improved || result.candidateCount >= candidateLimit) break
      }
      if (improved || result.candidateCount >= candidateLimit) break
    }
    if (!improved) break
  }
  return {
    ...result,
    routes: current,
    finalConflictCount: evaluation.conflicts.length,
    evaluation,
    improved: false,
  }
}
