import { expect, test } from "bun:test"
import { repairNodeClearance } from "../lib/high-density-repair-solver/functions/repairNodeClearance"
import { FixedCopperClearanceGuard } from "../lib/high-density-repair-solver/functions/FixedCopperClearanceGuard"
import type { HdRoute } from "../lib"

test("node cleanup bends a fixed-ended trace around a fixed via without moving ports", () => {
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
  const original = structuredClone(routes)
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
  expect(result.initialConflictCount).toBeGreaterThan(0)
  expect(result.finalConflictCount).toBe(0)
  expect(result.routes[0]!.route!.at(0)).toEqual(original[0]!.route!.at(0))
  expect(result.routes[0]!.route!.at(-1)).toEqual(original[0]!.route!.at(-1))
  expect(result.routes[1]).toEqual(original[1])
  expect(routes).toEqual(original)
})
