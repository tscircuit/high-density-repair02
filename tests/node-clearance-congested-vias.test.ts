import { expect, test } from "bun:test"
import { HighDensityRepairSolver } from "../lib"
import sample from "./fixtures/srj20-sample169-node216.json"

test("a congested node gets enough search to separate both vias", () => {
  const input = structuredClone(sample)
  const solver = new HighDensityRepairSolver({
    sample: input,
    margin: 0.2,
    repairBoundaryDiagonals: false,
  })
  solver.solve()
  const routes = solver.getOutput().repairedRoutes
  const first = routes[0]!.vias![0]!
  const second = routes[1]!.vias![0]!
  expect(
    Math.hypot(first.x - second.x, first.y - second.y),
  ).toBeGreaterThanOrEqual(0.4 - 1e-6)
  for (const [index, route] of routes.entries()) {
    expect(route.route![0]).toEqual(sample.nodeHdRoutes[index]!.route[0])
    expect(route.route!.at(-1)).toEqual(
      sample.nodeHdRoutes[index]!.route.at(-1),
    )
    for (const via of route.vias!) {
      const layers = route
        .route!.filter((point) => point.x === via.x && point.y === via.y)
        .map((point) => point.z)
      expect(new Set(layers)).toEqual(new Set([0, 1]))
    }
  }
  expect(input.fixedHdRoutes).toEqual(sample.fixedHdRoutes)
})
