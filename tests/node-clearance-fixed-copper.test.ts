import { expect, test } from "bun:test"
import { repairNodeClearance } from "../lib/high-density-repair-solver/functions/repairNodeClearance"
import { FixedCopperClearanceGuard } from "../lib/high-density-repair-solver/functions/FixedCopperClearanceGuard"
import type { HdRoute } from "../lib"

test("node cleanup cannot trade a via conflict for a conflict with another node", () => {
  const routes: HdRoute[] = [
    {
      connectionName: "trace",
      traceThickness: 0.15,
      route: [
        { x: -2, y: 0.15, z: 0 },
        { x: 2, y: 0.15, z: 0 },
      ],
    },
    {
      connectionName: "via",
      viaDiameter: 0.3,
      route: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
      ],
      vias: [{ x: 0, y: 0 }],
    },
  ]
  const fixed: HdRoute[] = [
    {
      connectionName: "neighbor",
      traceThickness: 0.15,
      route: [
        { x: -2, y: 0.5, z: 0 },
        { x: 2, y: 0.5, z: 0 },
      ],
    },
  ]
  const originalFixed = structuredClone(fixed)
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
    fixedCopperGuard: new FixedCopperClearanceGuard(fixed, 0.1),
  })
  expect(result.finalConflictCount).toBe(0)
  expect(result.routes[0]!.route!.slice(1, -1).every((p) => p.y < 0)).toBe(true)
  expect(fixed).toEqual(originalFixed)
})
