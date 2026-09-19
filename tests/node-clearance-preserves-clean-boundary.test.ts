import { expect, test } from "bun:test"
import { HighDensityRepairSolver, type HdRoute } from "../lib"

test("DRC repair leaves a clear route near the node boundary unchanged", () => {
  const route: HdRoute = {
    connectionName: "clean",
    traceThickness: 0.12,
    route: [
      { x: -1, y: 0.98, z: 0 },
      { x: 0, y: 0.99, z: 0 },
      { x: 1, y: 0.98, z: 0 },
    ],
    vias: [],
  }
  const solver = new HighDensityRepairSolver({
    repairBoundaryDiagonals: false,
    sample: {
      nodeWithPortPoints: { center: { x: 0, y: 0 }, width: 2, height: 2 },
      nodeHdRoutes: [route],
    },
  })
  solver.solve()
  expect(solver.getOutput().repairedRoutes).toEqual([route])
  expect(solver.stats.nodeClearanceCandidateCount).toBe(0)
})
