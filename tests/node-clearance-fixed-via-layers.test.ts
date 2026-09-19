import { expect, test } from "bun:test"
import { FixedCopperClearanceGuard } from "../lib/high-density-repair-solver/functions/FixedCopperClearanceGuard"
import type { HdRoute } from "../lib"

test("rounded fixed vias protect inner copper layers", () => {
  const fixed: HdRoute = {
    connectionName: "ground",
    viaDiameter: 0.3,
    route: [
      { x: 0.0002, y: 0.0002, z: 0 },
      { x: 0.0002, y: 0.0002, z: 3 },
    ],
    vias: [{ x: 0, y: 0 }],
  }
  const before: HdRoute[] = [
    {
      connectionName: "signal",
      traceThickness: 0.15,
      route: [
        { x: -1, y: 0.5, z: 2 },
        { x: 1, y: 0.5, z: 2 },
      ],
    },
  ]
  const after = structuredClone(before)
  after[0]!.route![0]!.y = 0.1
  after[0]!.route![1]!.y = 0.1
  const guard = new FixedCopperClearanceGuard([fixed], 0.1)
  expect(guard.allows(before, after, [0])).toBe(false)
  expect(guard.allows(after, before, [0])).toBe(true)
  expect(fixed.vias).toEqual([{ x: 0, y: 0 }])
})
