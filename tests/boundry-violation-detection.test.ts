import { expect, test } from "bun:test"
import { findInteriorDiagonalSegmentsInBufferZone } from "../lib/high-density-repair-solver/functions/findInteriorDiagonalSegmentsInBufferZone"
import type {
  BoundaryRect,
  HdRoute,
} from "../lib/high-density-repair-solver/shared/types"

test("detects routes with points outside the boundary as boundry violations", () => {
  const boundary: BoundaryRect = {
    minX: 0,
    maxX: 10,
    minY: 0,
    maxY: 10,
    width: 10,
    height: 10,
    center: { x: 5, y: 5 },
  }

  const routes: HdRoute[] = [
    {
      connectionName: "outside-route",
      route: [
        { x: 5, y: 5 },
        { x: 12, y: 5 },
      ],
    },
  ]

  const violations = findInteriorDiagonalSegmentsInBufferZone(
    routes,
    boundary,
    0.4,
  )

  expect(violations).toHaveLength(1)
  expect(violations[0]?.connectionName).toBe("outside-route")
  expect(violations[0]?.touchedSides).toEqual(["right"])
})
