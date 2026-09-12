import { expect, test } from "bun:test"
import { HighDensityRepairSolver } from "../lib"
import type { DatasetSample } from "../lib"
import sample from "./pedometer-via-boundary-input.json"

test("boundary cleanup keeps pedometer via endpoints together", (): void => {
  const solver = new HighDensityRepairSolver({
    sample: sample as DatasetSample,
    margin: 0.15,
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  let transitionCount = 0
  for (const route of solver.getOutput().repairedRoutes) {
    const points = route.route ?? []
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1]!
      const end = points[i]!
      if (start.z === end.z) continue
      transitionCount++
      expect(end.x).toBe(start.x)
      expect(end.y).toBe(start.y)
    }
  }
  expect(transitionCount).toBe(2)
})
