import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import {
  getHighDensityRepairViolationCounts,
  HighDensityRepairSolver,
} from "../../lib"
import { loadAssetSolverInput } from "../fixtures/visualize-solver"

test("repro: srj24 sample2 cmn_96 accepts a non-improving repair", async () => {
  const { sample, margin = 0.2 } = await loadAssetSolverInput(
    "../../datasets/dataset02/srj24-sample2-cmn96-non-improving-repair.json",
  )
  const inputRoutes = sample?.nodeHdRoutes ?? []
  const solver = new HighDensityRepairSolver({ sample, margin })
  solver.solve()
  const output = solver.getOutput()
  const getViolationCount = (nodeHdRoutes: typeof inputRoutes) =>
    getHighDensityRepairViolationCounts({
      nodeWithPortPoints: sample?.nodeWithPortPoints,
      nodeHdRoutes,
      margin,
    }).totalViolationCount

  expect(getViolationCount(inputRoutes)).toBe(453)
  expect(getViolationCount(output.repairedRoutes)).toBe(453)
  expect(output.repairWasAccepted).toBe(true)
  expect(output.repairedRoutes).not.toEqual(inputRoutes)
  await expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path)
})
