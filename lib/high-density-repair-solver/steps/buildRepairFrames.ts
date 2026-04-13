import { cloneRoute } from "../functions/cloneRoute"
import { cloneRoutes } from "../functions/cloneRoutes"
import { createFinalFrame } from "../functions/createFinalFrame"
import { createInitialFrame } from "../functions/createInitialFrame"
import { dedupeRoutePoints } from "../functions/dedupeRoutePoints"
import { findClearanceConflicts } from "../functions/findClearanceConflicts"
import { findTraceClearanceRegressions } from "../functions/findTraceClearanceRegressions"
import { getBoundaryRect } from "../functions/getBoundaryRect"
import { normalizeBoundaryAnchoredRoutes } from "../functions/normalizeBoundaryAnchoredRoutes"
import {
  BOUNDARY_SIDES,
  DEFAULT_TRACE_THICKNESS,
  EPSILON,
  TRACE_CLEARANCE_REGRESSION_MAX,
} from "../shared/constants"
import type {
  BuildRepairFramesResult,
  DatasetSample,
  HdRoute,
  RouteGeometryCache,
  VisualizationFrame,
} from "../shared/types"
import { processBoundarySide } from "./processBoundarySide"

const toConflictKey = ({
  routeIndexes,
  layers,
}: {
  routeIndexes: [number, number]
  layers: ["top" | "bottom" | "via", "top" | "bottom" | "via"]
}) => `${routeIndexes[0]}:${layers[0]}:${routeIndexes[1]}:${layers[1]}`

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
    ).map(toConflictKey),
  )
  const candidateConflicts = findClearanceConflicts(
    candidateRoutes,
    new Set([routeIndex]),
    minimumClearance,
  )

  return candidateConflicts.some(
    (candidateConflict) =>
      !currentConflicts.has(toConflictKey(candidateConflict)),
  )
}

const introducesTraceClearanceRegression = (
  currentRoutes: HdRoute[],
  candidateRoutes: HdRoute[],
  routeIndex: number,
  maximumAllowedClearance: number,
) =>
  findTraceClearanceRegressions({
    currentRoutes,
    candidateRoutes,
    candidateRouteIndexes: new Set([routeIndex]),
    maximumAllowedClearance,
  }).length > 0

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

    const rawNudge = Math.min(
      clearanceMargin,
      Math.max((route.traceThickness ?? DEFAULT_TRACE_THICKNESS) / 2, 1e-3),
    )
    const maxXInteriorNudge = Math.max(boundary.width / 2 - EPSILON, 0)
    const maxYInteriorNudge = Math.max(boundary.height / 2 - EPSILON, 0)
    const xNudge = Math.min(rawNudge, maxXInteriorNudge)
    const yNudge = Math.min(rawNudge, maxYInteriorNudge)
    const traceClearanceRegressionThreshold = Math.min(
      Math.max(xNudge, yNudge) / 2,
      TRACE_CLEARANCE_REGRESSION_MAX,
    )
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
    const introducesTraceRegressions = introducesTraceClearanceRegression(
      routes,
      candidateRoutes,
      routeIndex,
      traceClearanceRegressionThreshold,
    )

    if (
      introducesNewTouches ||
      introducesNewDrcClearanceConflicts ||
      introducesTraceRegressions
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
  options?: {
    skipInteriorBoundaryNudge?: boolean
  },
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

  if (!options?.skipInteriorBoundaryNudge) {
    nudgeInteriorPointsInsideBoundary({
      routes: repairedRoutes,
      boundary,
      clearanceMargin: margin,
    })
  }

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
