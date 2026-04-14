import { cloneRoute } from "../functions/cloneRoute"
import { cloneRoutes } from "../functions/cloneRoutes"
import { createFinalFrame } from "../functions/createFinalFrame"
import { createInitialFrame } from "../functions/createInitialFrame"
import { dedupeRoutePoints } from "../functions/dedupeRoutePoints"
import {
  findClearanceConflicts,
  getClearanceConflictKey,
} from "../functions/findClearanceConflicts"
import { findTraceClearanceRegressions } from "../functions/findTraceClearanceRegressions"
import { getBoundaryRect } from "../functions/getBoundaryRect"
import { normalizeBoundaryAnchoredRoutes } from "../functions/normalizeBoundaryAnchoredRoutes"
import { BOUNDARY_SIDES, EPSILON } from "../shared/constants"
import type {
  BuildRepairFramesResult,
  DatasetSample,
  HdRoute,
  RouteGeometryCache,
  VisualizationFrame,
} from "../shared/types"
import { processBoundarySide } from "./processBoundarySide"

const introducesNewClearanceConflicts = (
  currentRoutes: HdRoute[],
  candidateRoutes: HdRoute[],
  routeIndex: number,
  minimumClearance: number,
) => {
  const currentConflicts = new Set(
    findClearanceConflicts(
      currentRoutes,
      new Set([routeIndex]),
      minimumClearance,
    ).map(getClearanceConflictKey),
  )
  const candidateConflicts = findClearanceConflicts(
    candidateRoutes,
    new Set([routeIndex]),
    minimumClearance,
  )

  return candidateConflicts.some(
    (candidateConflict) =>
      !currentConflicts.has(getClearanceConflictKey(candidateConflict)),
  )
}

const nudgeInteriorPointsInsideBoundary = ({
  routes,
  boundary,
  clearanceMargin,
}: {
  routes: BuildRepairFramesResult["repairedRoutes"]
  boundary: NonNullable<BuildRepairFramesResult["boundary"]>
  clearanceMargin: number
}) => {
  for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
    const route = routes[routeIndex] as HdRoute
    const points = route.route ?? []
    if (points.length <= 2) continue

    const rawNudge = clearanceMargin
    const maxXInteriorNudge = Math.max(boundary.width / 2 - EPSILON, 0)
    const maxYInteriorNudge = Math.max(boundary.height / 2 - EPSILON, 0)
    const xNudge = Math.min(rawNudge, maxXInteriorNudge)
    const yNudge = Math.min(rawNudge, maxYInteriorNudge)
    const candidateRoute = cloneRoute(route)
    const candidatePoints = candidateRoute.route ?? []
    let changed = false

    for (
      let pointIndex = 1;
      pointIndex < candidatePoints.length - 1;
      pointIndex += 1
    ) {
      const point = candidatePoints[pointIndex]
      if (!point) continue

      const nextX = Math.min(
        Math.max(point.x, boundary.minX + xNudge),
        boundary.maxX - xNudge,
      )
      const nextY = Math.min(
        Math.max(point.y, boundary.minY + yNudge),
        boundary.maxY - yNudge,
      )

      if (
        Math.abs(nextX - point.x) > EPSILON ||
        Math.abs(nextY - point.y) > EPSILON
      ) {
        point.x = nextX
        point.y = nextY
        changed = true
      }
    }

    if (!changed) continue

    candidateRoute.route = dedupeRoutePoints(candidatePoints)
    if ((candidateRoute.route?.length ?? 0) < 2) continue

    const candidateRoutes = cloneRoutes(routes)
    candidateRoutes[routeIndex] = candidateRoute

    const introducesNewTouches = introducesNewClearanceConflicts(
      routes,
      candidateRoutes,
      routeIndex,
      0,
    )
    const introducesNewDrcClearanceConflicts = introducesNewClearanceConflicts(
      routes,
      candidateRoutes,
      routeIndex,
      clearanceMargin,
    )
    const introducesTraceClearanceRegressions =
      findTraceClearanceRegressions({
        currentRoutes: routes,
        candidateRoutes,
        candidateRouteIndexes: new Set([routeIndex]),
        maximumAllowedClearance: clearanceMargin,
      }).length > 0

    if (
      introducesNewTouches ||
      introducesNewDrcClearanceConflicts ||
      introducesTraceClearanceRegressions
    ) {
      continue
    }

    routes[routeIndex] = candidateRoute
  }
}

export const buildRepairFrames = (
  sample: DatasetSample | undefined,
  requestedMargin: number | undefined,
  captureProgressFrames = false,
): BuildRepairFramesResult => {
  const boundary = getBoundaryRect(sample?.nodeWithPortPoints)
  const baseRoutes = boundary
    ? normalizeBoundaryAnchoredRoutes(
        cloneRoutes(sample?.nodeHdRoutes ?? []),
        boundary,
      )
    : cloneRoutes(sample?.nodeHdRoutes ?? [])
  const margin = Math.max(requestedMargin ?? 0.4, 0.05)
  const repairedRoutes = cloneRoutes(baseRoutes)

  if (!boundary) {
    return {
      boundary: null,
      baseRoutes,
      repairedRoutes,
      margin,
      frames: [
        {
          title: "HighDensityRepair02 Missing Boundary",
          routes: repairedRoutes,
        },
      ],
    }
  }

  const frames: VisualizationFrame[] = captureProgressFrames
    ? [createInitialFrame(cloneRoutes(repairedRoutes), margin)]
    : []
  const lockedTwoPointRoutes = new Set<number>()
  const geometryCache: RouteGeometryCache = new WeakMap()

  for (const side of BOUNDARY_SIDES) {
    processBoundarySide({
      side,
      sample,
      boundary,
      frames,
      margin,
      repairedRoutes,
      captureProgressFrames,
      lockedTwoPointRoutes,
      geometryCache,
    })
  }

  nudgeInteriorPointsInsideBoundary({
    routes: repairedRoutes,
    boundary,
    clearanceMargin: margin,
  })

  frames.push(
    createFinalFrame(
      cloneRoutes(repairedRoutes),
      cloneRoutes(baseRoutes),
      margin,
    ),
  )

  return {
    boundary,
    baseRoutes,
    repairedRoutes,
    frames,
    margin,
  }
}
