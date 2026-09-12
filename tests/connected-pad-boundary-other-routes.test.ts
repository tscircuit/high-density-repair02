import { expect, test } from "bun:test"
import { HighDensityRepairSolver } from "../lib/high-density-repair-solver"
import type { DatasetSample } from "../lib/high-density-repair-solver/shared/types"

test("pad-side exemption does not disable other routes or other sides", () => {
  const sample: DatasetSample = {
    nodeWithPortPoints: { center: { x: 0, y: 0 }, width: 10, height: 10 },
    nodeHdRoutes: [
      {
        connectionName: "pad-net",
        connectedPadSides: ["bottom"],
        route: [
          { x: -4, y: -5 },
          { x: -3, y: -5 },
          { x: -2, y: -5 },
        ],
      },
      {
        connectionName: "other-net",
        route: [
          { x: 2, y: -5 },
          { x: 3, y: -5 },
          { x: 4, y: -5 },
        ],
      },
      {
        connectionName: "top-net",
        connectedPadSides: ["bottom"],
        route: [
          { x: -1, y: 5 },
          { x: 0, y: 5 },
          { x: 1, y: 5 },
        ],
      },
    ],
  }
  const solver = new HighDensityRepairSolver({ sample, margin: 0.2 })
  solver.solve()
  const routes = solver.getOutput().repairedRoutes
  expect(routes[0]!.route).toEqual(sample.nodeHdRoutes![0]!.route)
  expect(routes[1]!.route!.slice(1, -1).some((point) => point.y > -5)).toBe(
    true,
  )
  expect(routes[2]!.route!.slice(1, -1).some((point) => point.y < 5)).toBe(true)
  expect(solver.getOutput().traceViolationCount).toBe(0)
})
