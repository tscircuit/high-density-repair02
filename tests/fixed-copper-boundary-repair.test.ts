import { expect, test } from "bun:test"
import { HighDensityRepairSolver, type HdRoute } from "../lib"
import { segmentDistance } from "../lib/high-density-repair-solver/functions/segmentDistance"

test("boundary repair preserves clearance to immutable foreign copper", () => {
  const route: HdRoute = {
    connectionName: "signal",
    rootConnectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: -0.4, y: -0.7, z: 0 },
      { x: -0.3, y: -0.5, z: 0 },
      { x: -0.1, y: -0.45, z: 0 },
      { x: -0.1, y: -0.45, z: 1 },
      { x: 0.2, y: -0.4, z: 1 },
      { x: 0.35, y: -0.2, z: 1 },
      { x: 0.4, y: 0, z: 1 },
      { x: 0.35, y: 0.2, z: 1 },
      { x: 0.2, y: 0.3, z: 1 },
      { x: 0.03, y: 0.36, z: 1 },
    ],
    vias: [{ x: -0.1, y: -0.45 }],
  }
  const fixed: HdRoute = {
    connectionName: "fixed",
    rootConnectionName: "fixed",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
    ],
    vias: [{ x: 0, y: 0 }],
  }
  const input = structuredClone([route, fixed])
  const solver = new HighDensityRepairSolver({
    margin: 0.2,
    sample: {
      nodeWithPortPoints: {
        center: { x: 0.8, y: -3.24 },
        width: 2.4,
        height: 7.2,
      },
      nodeHdRoutes: [route],
      fixedHdRoutes: [fixed],
    },
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect([route, fixed]).toEqual(input)
  expect(solver.repairedRoutes).toHaveLength(1)
  const points = solver.repairedRoutes[0].route!
  let distance = Infinity
  for (let index = 1; index < points.length; index++) {
    if (points[index - 1].z !== points[index].z) continue
    distance = Math.min(
      distance,
      segmentDistance(
        points[index - 1],
        points[index],
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ),
    )
  }
  expect(distance - 0.15 - 0.05).toBeGreaterThanOrEqual(0.1 - 1e-6)
  // A legal move away from the left boundary is still accepted.
  expect(points[1].x).toBeGreaterThan(route.route![1].x)
})
