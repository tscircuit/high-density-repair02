import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import {
  getHighDensityRepairViolationCounts,
  getHighDensityRepairWorkEstimate,
  HighDensityRepairSolver,
} from "../../lib"
import { loadAssetSolverInput } from "../fixtures/visualize-solver"

test("repro: srj18 sample15 cmn_5 has pathological repair work", async () => {
  const { sample, margin = 0.2 } = await loadAssetSolverInput(
    "../../datasets/dataset02/srj18-sample15-cmn5-repair-input.json",
  )
  const nodeHdRoutes = sample?.nodeHdRoutes ?? []
  const routePointCount = nodeHdRoutes.reduce(
    (total, route) => total + (route.route?.length ?? 0),
    0,
  )
  const violationCount = getHighDensityRepairViolationCounts({
    nodeWithPortPoints: sample?.nodeWithPortPoints,
    nodeHdRoutes,
    margin,
  }).totalViolationCount

  expect(routePointCount).toBe(761)
  expect(violationCount).toBe(6_496)
  expect(routePointCount * violationCount).toBe(4_943_456)

  expect(getHighDensityRepairWorkEstimate({ sample, margin })).toEqual({
    routePointCount: 761,
    violationCount: 6_496,
    estimatedRepairWork: 4_943_456,
  })

  const solver = new HighDensityRepairSolver({
    sample,
    margin,
    maxEstimatedRepairWork: 2_000_000,
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.getOutput()).toMatchObject({
    repairedRoutes: nodeHdRoutes,
    repairWasSkippedForComplexity: true,
    estimatedRepairWork: 4_943_456,
  })
  await expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path)
})
