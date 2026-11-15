import { expect, test } from "bun:test"
import type { HdRoute } from "../lib"
import { FixedCopperClearanceGuard } from "../lib/high-density-repair-solver/functions/FixedCopperClearanceGuard"

test("an inner-layer signal via can protect the full physical stack", (): void => {
  const fixed: HdRoute = {
    connectionName: "ground",
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 2 },
      { x: 0, y: 0, z: 3 },
    ],
    vias: [{ x: 0, y: 0, minZ: 0, maxZ: 5 }],
  }
  const before: HdRoute[] = [
    {
      connectionName: "signal",
      traceThickness: 0.15,
      route: [
        { x: -1, y: 0.5, z: 0 },
        { x: 1, y: 0.5, z: 0 },
      ],
    },
  ]
  const after = structuredClone(before)
  for (const point of after[0]!.route!) point.y = 0.1

  const throughViaGuard = new FixedCopperClearanceGuard([fixed], 0.1)
  expect(throughViaGuard.allows(before, after, [0])).toBe(false)
  expect(throughViaGuard.allows(after, before, [0])).toBe(true)

  const blindVia = structuredClone(fixed)
  blindVia.vias = [{ x: 0, y: 0, minZ: 2, maxZ: 3 }]
  const blindViaGuard = new FixedCopperClearanceGuard([blindVia], 0.1)
  expect(blindViaGuard.allows(before, after, [0])).toBe(true)

  const inferredVia = structuredClone(fixed)
  inferredVia.vias = [{ x: 0, y: 0 }]
  const inferredViaGuard = new FixedCopperClearanceGuard([inferredVia], 0.1)
  expect(inferredViaGuard.allows(before, after, [0])).toBe(true)
})
