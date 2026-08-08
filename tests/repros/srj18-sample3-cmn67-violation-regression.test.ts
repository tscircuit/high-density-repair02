import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import {
  getHighDensityRepairViolationCounts,
  HighDensityRepairSolver,
} from "../../lib"
import { loadAssetSolverInput } from "../fixtures/visualize-solver"

test("rejects srj18 sample3 cmn_67 repair that increases violations", async () => {
  const { sample, margin = 0.2 } = await loadAssetSolverInput(
    "../../datasets/dataset02/srj18-sample3-cmn67-repair-input.json",
  )
  const solver = new HighDensityRepairSolver({ sample, margin })
  solver.solve()
  const output = solver.getOutput()
  const inputViolationCount = getHighDensityRepairViolationCounts({
    nodeWithPortPoints: sample?.nodeWithPortPoints,
    nodeHdRoutes: sample?.nodeHdRoutes ?? [],
    margin,
  }).totalViolationCount
  const outputViolationCount = getHighDensityRepairViolationCounts({
    nodeWithPortPoints: sample?.nodeWithPortPoints,
    nodeHdRoutes: output.repairedRoutes,
    margin,
  }).totalViolationCount

  expect(inputViolationCount).toBe(15)
  expect(outputViolationCount).toBe(15)
  expect(output.repairWasAccepted).toBe(false)
  await expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path)
})
