import { expect, test } from "bun:test"
import { HighDensityRepairSolver } from "../lib"

test("node clearance respects the pad's net and layer while clearing a foreign trace", () => {
  const sample = {
    nodeWithPortPoints: { center: { x: 0, y: 0 }, width: 4, height: 4 },
    nodeHdRoutes: [
      {
        connectionName: "signal",
        traceThickness: 0.15,
        route: [
          { x: -2, y: 0.25, z: 0 },
          { x: 2, y: 0.25, z: 0 },
        ],
      },
    ],
    clearanceObstacles: [
      {
        center: { x: 0, y: 0 },
        width: 0.5,
        height: 0.5,
        zLayers: [0],
        connectedTo: ["ground"],
      },
    ],
  }
  const solver = new HighDensityRepairSolver({ sample, margin: 0.2 })
  solver.solve()
  expect(solver.stats.nodeClearanceInitialConflictCount).toBe(1)
  expect(solver.stats.nodeClearanceFinalConflictCount).toBe(0)
  const points = solver.getOutput().repairedRoutes[0]!.route!
  expect(points.at(0)).toEqual(sample.nodeHdRoutes[0]!.route.at(0))
  expect(points.at(-1)).toEqual(sample.nodeHdRoutes[0]!.route.at(-1))
  expect(points.slice(1, -1).every((p) => p.y >= 0.425)).toBe(true)
  for (const obstacle of [
    { ...sample.clearanceObstacles[0]!, connectedTo: ["signal"] },
    { ...sample.clearanceObstacles[0]!, zLayers: [1] },
  ]) {
    const clean = new HighDensityRepairSolver({
      sample: { ...sample, clearanceObstacles: [obstacle] },
      margin: 0.2,
    })
    clean.solve()
    expect(clean.stats.nodeClearanceInitialConflictCount).toBe(0)
    expect(clean.getOutput().repairedRoutes).toEqual(sample.nodeHdRoutes)
  }
})
