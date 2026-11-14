import { expect, test } from "bun:test"
import type {
  HdRoute,
  Obstacle,
} from "../lib/high-density-repair-solver/shared/types"
import { FixedCopperClearanceGuard } from "../lib/high-density-repair-solver/functions/FixedCopperClearanceGuard"

test("round pads retain the conservative clearance constraint", (): void => {
  const obstacle: Obstacle = {
    type: "rect",
    shape: "circle",
    center: { x: 0, y: 0 },
    width: 1,
    height: 1,
    zLayers: [0],
  }
  const before: HdRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    route: [
      { x: 0.75, y: 0.4, z: 0 },
      { x: 0.75, y: 1, z: 0 },
    ],
  }
  const candidate: HdRoute = {
    ...before,
    route: [
      { x: 0.7, y: 0.55, z: 0 },
      { x: 0.7, y: 1, z: 0 },
    ],
  }
  const guard = new FixedCopperClearanceGuard([], 0.4, [obstacle])
  // The move clears the circle further but approaches its conservative bounds.
  expect(guard.allows([before], [candidate], [0], false)).toBe(false)
})
