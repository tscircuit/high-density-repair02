import { expect, spyOn, test } from "bun:test"
import { SolverRuntime } from "@tscircuit/solver-utils/runtime/bun"
import {
  buildRepairFrames,
  buildRepairFramesAsync,
} from "../lib/high-density-repair-solver/steps/buildRepairFrames"
import sample from "./fixtures/srj20-sample169-node216.json"

test("four workers preserve the first improving candidate and shared cancellation", async (): Promise<void> => {
  const input = structuredClone(sample)
  const before = structuredClone(input)
  const expected = buildRepairFrames(input, 0.2, false, false)
  const runtime = new SolverRuntime({
    workerCount: 4,
    workerUrl: new URL(
      "./fixtures/node-clearance-parallel.worker.ts",
      import.meta.url,
    ),
    requireWorker: true,
  })
  const dispatch = spyOn(runtime, "executeAsync")
  try {
    for (let repeat = 0; repeat < 2; repeat++) {
      expect(
        await buildRepairFramesAsync(input, 0.2, runtime, false, false),
      ).toEqual(expected)
    }
    expect(dispatch).toHaveBeenCalled()
    expect(input).toEqual(before)
  } finally {
    dispatch.mockRestore()
    await runtime.dispose()
  }
})
