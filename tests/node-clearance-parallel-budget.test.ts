import { expect, test } from "bun:test"
import { SolverRuntime } from "@tscircuit/solver-utils"
import { FixedCopperClearanceGuard } from "../lib/high-density-repair-solver/functions/FixedCopperClearanceGuard"
import { repairNodeClearance } from "../lib/high-density-repair-solver/functions/repairNodeClearance"
import { repairNodeClearanceAsync } from "../lib/high-density-repair-solver/functions/repairNodeClearanceAsync"
import { getBoundaryRect } from "../lib/high-density-repair-solver/functions/getBoundaryRect"
import sample from "./fixtures/srj20-sample169-node216.json"

test("parallel candidate suffixes preserve serial budgets and exact geometry", async (): Promise<void> => {
  const runtime = new SolverRuntime()
  try {
    for (const maxCandidates of [
      0, 1, 2, 3, 7, 8, 23, 24, 25, 48, 95, 96, 97, 256, 733, 734,
    ]) {
      const input = structuredClone(sample)
      const params = {
        routes: input.nodeHdRoutes,
        fixedRoutes: input.fixedHdRoutes,
        boundary: getBoundaryRect(input.nodeWithPortPoints)!,
        fixedCopperGuard: new FixedCopperClearanceGuard(
          input.fixedHdRoutes ?? [],
          0.1,
          input.clearanceObstacles,
        ),
        clearanceObstacles: input.clearanceObstacles,
        adjacentObstacles: input.adjacentObstacles,
        boundaryMargin: 0.2,
        maxCandidates,
      }
      const before = structuredClone(input)
      const expected = repairNodeClearance(params)
      const output = await repairNodeClearanceAsync(params, runtime)
      expect(output).toEqual(expected)
      expect(output.candidateCount).toBeLessThanOrEqual(maxCandidates)
      expect(input).toEqual(before)
    }
  } finally {
    await runtime.dispose()
  }
})
