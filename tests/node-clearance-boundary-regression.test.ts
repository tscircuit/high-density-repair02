import { expect, test } from "bun:test"
import { FixedCopperClearanceGuard } from "../lib/high-density-repair-solver/functions/FixedCopperClearanceGuard"
import type { HdRoute } from "../lib"

test("boundary cleanup cannot introduce a trace-via contact inside the node", () => {
  const routes: HdRoute[] = [
    {
      connectionName: "trace",
      traceThickness: 0.15,
      route: [
        { x: -1, y: 0.5, z: 0 },
        { x: 1, y: 0.5, z: 0 },
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
  const candidate = structuredClone(routes)
  candidate[0]!.route![0]!.y = 0.2
  candidate[0]!.route![1]!.y = 0.2
  const guard = new FixedCopperClearanceGuard([], 0.1)
  expect(guard.allows(routes, candidate, [0])).toBe(false)
  expect(guard.allows(candidate, routes, [0])).toBe(true)
})
