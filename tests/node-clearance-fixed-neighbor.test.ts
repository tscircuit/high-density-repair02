import { expect, test } from "bun:test"
import { HighDensityRepairSolver, type HdRoute } from "../lib"
import { segmentDistance } from "../lib/high-density-repair-solver/functions/segmentDistance"

test("node DRC repair fixes clearance to immutable neighboring copper", () => {
  const route: HdRoute = {
    connectionName: "moving",
    traceThickness: 0.1,
    route: [
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ],
  }
  const fixed: HdRoute = {
    connectionName: "fixed",
    traceThickness: 0.1,
    route: [
      { x: -0.3, y: 0.15, z: 0 },
      { x: 0.3, y: 0.15, z: 0 },
    ],
  }
  const original = structuredClone(fixed)
  const solver = new HighDensityRepairSolver({
    repairBoundaryDiagonals: false,
    margin: 0.2,
    sample: {
      nodeWithPortPoints: { center: { x: 0, y: 0 }, width: 2, height: 2 },
      nodeHdRoutes: [route],
      fixedHdRoutes: [fixed],
    },
  })
  solver.solve()
  const repaired = solver.getOutput().repairedRoutes[0]!.route!
  const gap = Math.min(
    ...repaired
      .slice(1)
      .map(
        (point, index) =>
          segmentDistance(
            repaired[index]!,
            point,
            fixed.route![0]!,
            fixed.route![1]!,
          ) - 0.1,
      ),
  )
  expect(gap).toBeGreaterThanOrEqual(0.1 - 1e-6)
  expect(repaired[0]).toEqual(route.route![0])
  expect(repaired.at(-1)).toEqual(route.route!.at(-1))
  expect(fixed).toEqual(original)
})
