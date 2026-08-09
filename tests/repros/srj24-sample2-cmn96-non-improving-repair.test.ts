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
  const fixedHdRoutes = [
    {
      capacityMeshNodeId: "cmn_489__sub_0_0",
      connectionName: "source_trace_14__source_net_14",
      rootConnectionName: "source_trace_14",
      route: [
        { x: -9.9, y: -0.062, z: 2 },
        { x: -9.5, y: 1.86, z: 2 },
      ],
      traceThickness: 0.1,
      vias: [],
      viaDiameter: 0.3,
    },
  ]
  const solver = new HighDensityRepairSolver({ sample, margin })
  solver.solve()
  const output = solver.getOutput()
  const getViolationCount = (
    nodeHdRoutes: typeof inputRoutes,
    fixedRoutes: typeof inputRoutes = [],
  ) =>
    getHighDensityRepairViolationCounts({
      nodeWithPortPoints: sample?.nodeWithPortPoints,
      nodeHdRoutes,
      fixedHdRoutes: fixedRoutes,
      margin,
    }).totalViolationCount

  expect(getViolationCount(inputRoutes)).toBe(453)
  expect(getViolationCount(output.repairedRoutes)).toBe(453)
  expect(getViolationCount(inputRoutes, fixedHdRoutes)).toBe(453)
  expect(getViolationCount(output.repairedRoutes, fixedHdRoutes)).toBe(458)
  expect(output.repairWasAccepted).toBe(true)
  expect(output.repairedRoutes).not.toEqual(inputRoutes)
  await expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path)
})
