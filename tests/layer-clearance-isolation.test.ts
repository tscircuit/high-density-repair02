import { expect, test } from "bun:test"
import type { HdRoute } from "../lib/high-density-repair-solver"
import { findClearanceConflicts } from "../lib/high-density-repair-solver/functions/findClearanceConflicts"
import { findTraceClearanceRegressions } from "../lib/high-density-repair-solver/functions/findTraceClearanceRegressions"

test("clearance checks are layer-aware: top does not conflict with bottom", () => {
  const topRoute: HdRoute = {
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
    traceThickness: 0.2,
  }
  const bottomOverlappingRoute: HdRoute = {
    route: [
      { x: 0, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
    ],
    traceThickness: 0.2,
  }
  const topNearbyRoute: HdRoute = {
    route: [
      { x: 0, y: 0.1, z: 0 },
      { x: 2, y: 0.1, z: 0 },
    ],
    traceThickness: 0.2,
  }

  const routes = [topRoute, bottomOverlappingRoute, topNearbyRoute]
  const conflicts = findClearanceConflicts(routes, new Set([0]), 0.05)

  expect(
    conflicts.some(
      ({ routeIndexes }) => routeIndexes[0] === 0 && routeIndexes[1] === 1,
    ),
  ).toBe(false)

  expect(
    conflicts.some(
      ({ routeIndexes, layers }) =>
        routeIndexes[0] === 0 &&
        routeIndexes[1] === 2 &&
        layers[0] === "top" &&
        layers[1] === "top",
    ),
  ).toBe(true)
})

test("trace clearance regressions are layer-aware: bottom route does not affect top regression checks", () => {
  const currentRoutes: HdRoute[] = [
    {
      route: [
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
      ],
      traceThickness: 0.2,
    },
    {
      route: [
        { x: 0, y: 0, z: 1 },
        { x: 2, y: 0, z: 1 },
      ],
      traceThickness: 0.2,
    },
    {
      route: [
        { x: 0, y: 1, z: 0 },
        { x: 2, y: 1, z: 0 },
      ],
      traceThickness: 0.2,
    },
  ]

  const candidateRoutes: HdRoute[] = [
    {
      route: [
        { x: 0, y: 0.95, z: 0 },
        { x: 2, y: 0.95, z: 0 },
      ],
      traceThickness: 0.2,
    },
    currentRoutes[1] as HdRoute,
    currentRoutes[2] as HdRoute,
  ]

  const regressions = findTraceClearanceRegressions({
    currentRoutes,
    candidateRoutes,
    candidateRouteIndexes: new Set([0]),
    maximumAllowedClearance: 0.2,
  })

  expect(
    regressions.some(
      ({ routeIndexes }) => routeIndexes[0] === 0 && routeIndexes[1] === 1,
    ),
  ).toBe(false)

  expect(
    regressions.some(
      ({ routeIndexes }) => routeIndexes[0] === 0 && routeIndexes[1] === 2,
    ),
  ).toBe(true)
})
