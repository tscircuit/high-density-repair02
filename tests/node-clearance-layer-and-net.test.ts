import { expect, test } from "bun:test"
import { repairNodeClearance } from "../lib/high-density-repair-solver/functions/repairNodeClearance"
import { FixedCopperClearanceGuard } from "../lib/high-density-repair-solver/functions/FixedCopperClearanceGuard"
import type { HdRoute } from "../lib"

test("node cleanup preserves clean copper on distinct inner layers and same-net branches", () => {
  const routes: HdRoute[] = [
    {
      connectionName: "a",
      rootConnectionName: "net",
      route: [
        { x: -1, y: 0, z: 1 },
        { x: 1, y: 0, z: 1 },
      ],
    },
    {
      connectionName: "b",
      rootConnectionName: "net",
      route: [
        { x: 0, y: -1, z: 1 },
        { x: 0, y: 1, z: 1 },
      ],
    },
    {
      connectionName: "foreign",
      route: [
        { x: -1, y: 0, z: 2 },
        { x: 1, y: 0, z: 2 },
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
  expect(result.initialConflictCount).toBe(0)
  expect(result.candidateCount).toBe(0)
  expect(result.routes).toBe(routes)
})
