import { expect, test } from "bun:test"
import { repairNodeClearance } from "../lib/high-density-repair-solver/functions/repairNodeClearance"
import { FixedCopperClearanceGuard } from "../lib/high-density-repair-solver/functions/FixedCopperClearanceGuard"
import type { HdRoute } from "../lib"

test("node cleanup moves every layer endpoint with the via", () => {
  const routes: HdRoute[] = [
    {
      connectionName: "a",
      viaDiameter: 0.3,
      traceThickness: 0.15,
      route: [
        { x: -2, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 2 },
        { x: 2, y: 0, z: 2 },
      ],
      vias: [{ x: 0, y: 0 }],
    },
    {
      connectionName: "b",
      viaDiameter: 0.3,
      route: [
        { x: 0.25, y: 0.25, z: 0 },
        { x: 0.25, y: 0.25, z: 2 },
      ],
      vias: [{ x: 0.25, y: 0.25 }],
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
  expect(result.initialConflictCount).toBeGreaterThan(0)
  expect(result.finalConflictCount).toBe(0)
  const repaired = result.routes[0]!
  expect(repaired.route![1]).toMatchObject(repaired.vias![0]!)
  expect(repaired.route![2]).toMatchObject(repaired.vias![0]!)
  expect(
    repaired
      .route!.map((p) => p.z)
      .filter((z, index, layers) => index === 0 || z !== layers[index - 1]),
  ).toEqual([0, 2])
  expect(repaired.route!.at(0)).toEqual(routes[0]!.route!.at(0))
  expect(repaired.route!.at(-1)).toEqual(routes[0]!.route!.at(-1))
})
