import { expect, test } from "bun:test"
import { HighDensityRepairSolver } from "../lib"
import { findClearanceConflicts } from "../lib/high-density-repair-solver/functions/findClearanceConflicts"
import type { HdRoute } from "../lib"

const endpointRoute = (
  connectionName: string,
  startX: number,
  rootConnectionName?: string,
): HdRoute => ({
  connectionName,
  rootConnectionName,
  traceThickness: 0.1,
  route: [
    { x: startX, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
  ],
})

test("different-net traces sharing an endpoint are clearance conflicts", () => {
  const first = endpointRoute("net-a", -1)
  const second = endpointRoute("net-b", 1)

  expect(
    findClearanceConflicts([first, second], new Set([0, 1]), 0.1),
  ).toHaveLength(1)

  const solver = new HighDensityRepairSolver({
    sample: {
      nodeWithPortPoints: {
        center: { x: 0, y: 0 },
        width: 4,
        height: 4,
      },
      nodeHdRoutes: [structuredClone(first), structuredClone(second)],
    },
    margin: 0.2,
    repairBoundaryDiagonals: false,
  })
  solver.solve()
  expect(solver.getOutput().traceViolationCount).toBe(1)

  const sameNetFirst = endpointRoute("branch-a", -1, "shared-net")
  const sameNetSecond = endpointRoute("branch-b", 1, "shared-net")
  expect(
    findClearanceConflicts([sameNetFirst, sameNetSecond], new Set([0, 1]), 0.1),
  ).toHaveLength(0)
})
