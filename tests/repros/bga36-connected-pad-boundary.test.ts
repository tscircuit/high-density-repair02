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
  // The autorouter resolves this terminal-to-pad side using its connMap.
  input.sample!.nodeHdRoutes![0]!.connectedPadSides = ["bottom"]
  const solver = new HighDensityRepairSolver(input)
  solver.solve()

  expect(solver.solved).toBe(true)
  const points = solver.getOutput().repairedRoutes[0]!.route!
  for (let i = 1; i < points.length; i++) {
    expect(points[i]!.y).toBeLessThanOrEqual(points[i - 1]!.y)
  }
  await expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path)
})
