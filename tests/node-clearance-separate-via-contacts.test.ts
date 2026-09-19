import { expect, test } from "bun:test"
import type { HdRoute } from "../lib"
import { hasNodeClearanceRegression } from "../lib/high-density-repair-solver/functions/repairNodeClearance"

test("improving one via contact cannot hide a new contact with another via", () => {
  const trace: HdRoute = {
    connectionName: "trace",
    traceThickness: 0.15,
    route: [
      { x: -2, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
  }
  const vias: HdRoute = {
    connectionName: "vias",
    viaDiameter: 0.3,
    route: [],
    vias: [
      { x: -1, y: 0.2 },
      { x: 1, y: 0.78 },
    ],
  }
  const moved: HdRoute = {
    ...trace,
    route: [
      { x: -2, y: -0.4, z: 0 },
      { x: 2, y: 0.8, z: 0 },
    ],
  }
  expect(hasNodeClearanceRegression([trace, vias], [moved, vias], 0.1)).toBe(
    true,
  )
})
