import { expect, test } from "bun:test"
import { repairNodeClearance } from "../lib/high-density-repair-solver/functions/repairNodeClearance"
import { FixedCopperClearanceGuard } from "../lib/high-density-repair-solver/functions/FixedCopperClearanceGuard"
import type { HdRoute } from "../lib"

test("node cleanup separates two physical vias on the same route", () => {
  const routes: HdRoute[] = [
    {
      connectionName: "net",
      viaDiameter: 0.3,
      route: [
        { x: -2, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0.35, z: 1 },
        { x: 0, y: 0.35, z: 0 },
        { x: 2, y: 0.35, z: 0 },
      ],
      vias: [
        { x: 0, y: 0 },
        { x: 0, y: 0.35 },
      ],
    },
  ]
  const result = repairNodeClearance({
    routes,
    boundary: {
      minX: -2,
      maxX: 2,
      minY: -2,
      maxY: 2,
      center: { x: 0, y: 0 },
      width: 4,
      height: 4,
    },
    fixedCopperGuard: new FixedCopperClearanceGuard([], 0.1),
  })
  expect(result.initialConflictCount).toBe(1)
  expect(result.finalConflictCount).toBe(0)
  const [a, b] = result.routes[0]!.vias!
  expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBeGreaterThanOrEqual(
    0.4 - 1e-6,
  )
  const points = result.routes[0]!.route!
  for (let i = 1; i < points.length; i++)
    if (points[i]!.z !== points[i - 1]!.z)
      expect({ x: points[i]!.x, y: points[i]!.y }).toEqual({
        x: points[i - 1]!.x,
        y: points[i - 1]!.y,
      })
})
