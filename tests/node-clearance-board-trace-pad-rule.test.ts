import { expect, test } from "bun:test"
import { HighDensityRepairSolver, type DatasetSample } from "../lib"
import { getRouteObstacleClearance } from "../lib/high-density-repair-solver/functions/repairNodeClearance"

test("node repair honors the trace-to-pad rule without applying the via rule to traces", (): void => {
  const sample: DatasetSample = {
    nodeWithPortPoints: { center: { x: 0, y: 0 }, width: 4, height: 4 },
    minViaEdgeToPadEdgeClearance: 0.4,
    minTraceToPadEdgeClearance: 0.2,
    nodeHdRoutes: [{
      connectionName: "signal", traceThickness: 0.1,
      route: [
        { x: -1, y: 0.3, z: 0 },
        { x: 0, y: 0.3, z: 0 },
        { x: 1, y: 0.3, z: 0 },
      ],
    }],
    clearanceObstacles: [{
      type: "rect", center: { x: 0, y: 0 }, width: 0.2, height: 0.2,
      zLayers: [0], connectedTo: ["clock"],
    }],
  }
  const solver = new HighDensityRepairSolver({
    sample, margin: 0.2, repairBoundaryDiagonals: false,
  })
  solver.solve()
  const gap = getRouteObstacleClearance(
    solver.getOutput().repairedRoutes[0]!, sample.clearanceObstacles![0]!,
  )
  expect(gap).toBeGreaterThanOrEqual(0.2 - 1e-6)
  expect(gap).toBeLessThan(0.4)
})
