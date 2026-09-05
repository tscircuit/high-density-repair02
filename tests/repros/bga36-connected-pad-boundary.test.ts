import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { HighDensityRepairSolver } from "../../lib/high-density-repair-solver"
import { loadAssetSolverInput } from "../fixtures/visualize-solver"

test("visual repro: BGA36 connected-pad approach after boundary repair", async () => {
  // C_BOTTOM approach after repair01. The connected pad is already filtered
  // from adjacentObstacles, but repair02 still pushes the path off the cell edge.
  const input = await loadAssetSolverInput(
    "../repros/assets/bga36-connected-pad-boundary.json",
  )
  const solver = new HighDensityRepairSolver(input)
  solver.solve()

  expect(solver.solved).toBe(true)
  await expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path)
})
