import { expect, test } from "bun:test"
import { HighDensityRepairSolver } from "../lib/high-density-repair-solver"
import type { DatasetSample } from "../lib/high-density-repair-solver/shared/types"

test("preserves a connected-pad approach instead of nudging it backwards", () => {
  // C_BOTTOM approach from the Pipeline9 BGA36 breakout, after repair01.
  const sample: DatasetSample = {
    nodeWithPortPoints: {
      center: { x: 0.15, y: -2.95 },
      width: 4.65,
      height: 1.55,
    },
    nodeHdRoutes: [
      {
        connectionName: "source_trace_4",
        connectedPadSides: ["bottom"],
        traceThickness: 0.1,
        route: [
          { x: -0.825, y: -3.175, z: 0 },
          { x: -0.854, y: -3.305, z: 0 },
          { x: -0.839, y: -3.4, z: 0 },
          { x: -0.82, y: -3.484, z: 0 },
          { x: -0.785, y: -3.539, z: 0 },
          { x: -0.767, y: -3.618, z: 0 },
          { x: -0.752, y: -3.725, z: 0 },
          { x: -0.612, y: -3.725, z: 0 },
        ],
      },
    ],
  }
  const solver = new HighDensityRepairSolver({ sample, margin: 0.2 })
  solver.solve()
  const points = solver.getOutput().repairedRoutes[0]!.route!
  expect(solver.solved).toBe(true)
  expect(solver.stats.boundryViolationCount).toBe(0)
  expect(points).toHaveLength(sample.nodeHdRoutes![0]!.route!.length)
  for (let i = 0; i < points.length; i++) {
    expect(points[i]!.x).toBeCloseTo(sample.nodeHdRoutes![0]!.route![i]!.x, 10)
    expect(points[i]!.y).toBeCloseTo(sample.nodeHdRoutes![0]!.route![i]!.y, 10)
    if (i > 0) expect(points[i]!.y).toBeLessThanOrEqual(points[i - 1]!.y)
  }
})
