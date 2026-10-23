import {
  SolverRuntime,
  type SolverRuntimeExecutor,
} from "@tscircuit/solver-utils"
import { FixedCopperClearanceGuard } from "./FixedCopperClearanceGuard"
import {
  createNodeClearanceCandidateProbe,
  type Evaluation,
  type NodeClearanceCandidateProbeResult,
  type NodeClearanceRepairResult,
  type NodeClearanceRepairParams,
} from "./repairNodeClearance"

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
  private output?: NodeClearanceCandidateProbeResult
  constructor(private readonly input: NodeClearanceCandidateRangeInput) {}
  solve(): void {
    const probe = createNodeClearanceCandidateProbe(
      {
        ...this.input.params,
        fixedCopperGuard: new FixedCopperClearanceGuard(
          ...this.input.fixedGuardParams,
        ),
      },
      this.input.evaluation,
    )
    this.output = probe.scan(
      this.input.start,
      this.input.end,
      this.input.cancellation,
    )
  }
  getOutput(): NodeClearanceCandidateProbeResult {
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
  let probe = createNodeClearanceCandidateProbe(params)
  let evaluation = probe.evaluation
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
    let selected: NodeClearanceCandidateProbeResult | undefined = probe.scan(
      0,
      prefix,
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
    probe = createNodeClearanceCandidateProbe({ ...params, routes }, evaluation)
  }
  return {
    routes,
    initialConflictCount,
    finalConflictCount: evaluation.conflicts.length,
    candidateCount,
  }
}
