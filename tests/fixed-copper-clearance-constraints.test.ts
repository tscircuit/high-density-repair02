import { expect, test } from "bun:test"
import { FixedCopperClearanceGuard } from "../lib/high-density-repair-solver/functions/FixedCopperClearanceGuard"
import type { HdRoute } from "../lib"

test("fixed copper uses physical width, net identity, and the complete via span", () => {
  const wire = (y: number, z = 2, root = "signal"): HdRoute => ({
    connectionName: `branch-${root}`,
    rootConnectionName: root,
    traceThickness: 0.1,
    route: [
      { x: -1, y, z },
      { x: 1, y, z },
    ],
  })
  const fixed: HdRoute = {
    connectionName: "ground-via",
    rootConnectionName: "ground",
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 3 },
      { x: 0, y: 0, z: 1 },
    ],
    vias: [{ x: 0, y: 0 }],
  }
  const guard = new FixedCopperClearanceGuard([fixed], 0.1)
  expect(guard.allows([wire(0.4)], [wire(0.2)], [0])).toBe(false)
  expect(guard.allows([wire(0.4)], [wire(0.3)], [0])).toBe(true)
  expect(guard.allows([wire(0.2)], [wire(0.25)], [0])).toBe(true)
  expect(guard.allows([wire(0.2)], [wire(0.19)], [0])).toBe(false)
  expect(guard.allows([wire(0.4, 0)], [wire(0, 0)], [0])).toBe(true)
  expect(
    guard.allows([wire(0.4, 2, "ground")], [wire(0, 2, "ground")], [0]),
  ).toBe(true)
  const fixedWire = wire(0, 2, "ground")
  const wireGuard = new FixedCopperClearanceGuard([fixedWire], 0.1)
  expect(wireGuard.allows([wire(0.3)], [wire(0.15)], [0])).toBe(false)
  expect(wireGuard.allows([wire(0.3)], [wire(0.2)], [0])).toBe(true)
  const movingVia = (y: number): HdRoute => ({
    ...fixed,
    connectionName: "signal",
    rootConnectionName: "signal",
    route: [
      { x: 0, y, z: 1 },
      { x: 0, y, z: 3 },
    ],
    vias: [{ x: 0, y }],
  })
  expect(wireGuard.allows([movingVia(0.4)], [movingVia(0.2)], [0])).toBe(false)
  expect(guard.allows([movingVia(0.5)], [movingVia(0.39)], [0])).toBe(false)
  expect(guard.allows([movingVia(0.5)], [movingVia(0.4)], [0])).toBe(true)
})
