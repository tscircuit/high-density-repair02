import { expect, test } from "bun:test"
import { HighDensityRepairSolver, type DatasetSample } from "../lib"

test("node repair honors a board via-to-pad rule above the default clearance", (): void => {
  const sample: DatasetSample = {
    nodeWithPortPoints: { center: { x: 0, y: 0 }, width: 4, height: 4 },
    minViaEdgeToPadEdgeClearance: 0.25,
    minTraceToPadEdgeClearance: 0.16,
    nodeHdRoutes: [{
      connectionName: "signal",
      traceThickness: 0.1,
      viaDiameter: 0.45,
      route: [
        { x: 0.45, y: -1, z: 0 },
        { x: 0.45, y: 0, z: 0 },
        { x: 0.45, y: 0, z: 1 },
        { x: 0.45, y: 1, z: 1 },
      ],
      vias: [{ x: 0.45, y: 0 }],
    }],
    clearanceObstacles: [{
      type: "rect", center: { x: 0, y: 0 }, width: 0.2, height: 0.2,
      zLayers: [0], connectedTo: ["clock"],
    }],
  }
  const original = structuredClone(sample)
  const solver = new HighDensityRepairSolver({
    sample, margin: 0.2, repairBoundaryDiagonals: false,
  })
  solver.solve()
  const route = solver.getOutput().repairedRoutes[0]!
  const via = route.vias![0]!
  const gap = Math.hypot(
    Math.max(Math.abs(via.x) - 0.1, 0),
    Math.max(Math.abs(via.y) - 0.1, 0),
  ) - route.viaDiameter! / 2
  expect(solver.solved).toBe(true)
  expect(gap).toBeGreaterThanOrEqual(0.25 - 1e-6)
  expect(route.route![0]).toEqual(original.nodeHdRoutes![0]!.route![0])
  expect(route.route!.at(-1)).toEqual(original.nodeHdRoutes![0]!.route!.at(-1))
  expect(route.route!.filter((p) => p.x === via.x && p.y === via.y).map((p) => p.z)).toEqual([0, 1])
  expect(sample).toEqual(original)
})
