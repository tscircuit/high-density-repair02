import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { HighDensityRepairSolver } from "../../lib"
import { loadAssetSolverInput } from "../fixtures/visualize-solver"

test("repro: srj18 sample3 cmn_67 repair increases violations", async () => {
  const { sample, margin = 0.2 } = await loadAssetSolverInput(
    "../../datasets/dataset02/srj18-sample3-cmn67-repair-input.json",
  )
  const solver = new HighDensityRepairSolver({ sample, margin })
  solver.solve()

  expect(solver.stats.boundryViolationCount).toBe(5)
  expect(solver.stats.traceViolationCount).toBe(15)
  await expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path)
})
