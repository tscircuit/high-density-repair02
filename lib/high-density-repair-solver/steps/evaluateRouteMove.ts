import { cloneRoutes } from "../functions/cloneRoutes"
import { createMovedRoute } from "../functions/createMovedRoute"
import { findBoundaryTouchRegressions } from "../functions/findBoundaryTouchRegressions"
import {
  findClearanceConflicts,
  getClearanceConflictKey,
  type ClearanceConflict,
} from "../functions/findClearanceConflicts"
import { findNewUnpushableZeroClearanceConflicts } from "../functions/findNewUnpushableZeroClearanceConflicts"
import { findTraceClearanceRegressions } from "../functions/findTraceClearanceRegressions"
import { getRouteBoundaryOverflow } from "../functions/getRouteBoundaryOverflow"
import { getRouteMovableIndexes } from "../functions/getRouteMovableIndexes"
import { getRoutePushableIndexes } from "../functions/getRoutePushableIndexes"
import { routeEndpointsStayOnBoundarySides } from "../functions/routeEndpointsStayOnBoundarySides"
import { wouldIncreaseExposureOnOtherSides } from "../functions/wouldIncreaseExposureOnOtherSides"
import type {
  BoundaryRect,
  BoundarySide,
  EvaluateRouteMoveResult,
  HdRoute,
  RouteGeometryCache,
} from "../shared/types"

export const evaluateRouteMove = ({
  currentRoutes,
  routeIndex,
  side,
  moveSide = side,
  boundary,
  margin,
  moveAmount,
  geometryCache,
}: {
  currentRoutes: HdRoute[]
  routeIndex: number
  side: BoundarySide
  moveSide?: BoundarySide
  boundary: BoundaryRect
  margin: number
  moveAmount: number
  geometryCache: RouteGeometryCache
}): EvaluateRouteMoveResult | null => {
  const route = currentRoutes[routeIndex]
  const isTwoPointRoute = (route.route?.length ?? 0) === 2
  const movableIndexes = getRouteMovableIndexes(route, boundary, side, margin)

  if (movableIndexes.length === 0) {
    return null
  }

  const candidateRouteIndexes = new Set<number>()
  const candidateRoutePointIndexes = new Map<number, Set<number>>()
  const movedTwoPointRouteIndexes = new Set<number>()
  const candidateRoutes = cloneRoutes(currentRoutes)
  let rejected = false
  let rejectionReason = "overlap"
  const queuedRouteIndexes = new Set<number>([routeIndex])
  const queuedRouteLayers = new Map<number, Set<"top" | "bottom" | "via">>([
    [routeIndex, new Set()],
  ])
  const queuedRoutePointIndexes = new Map<number, Set<number>>([
    [routeIndex, new Set()],
  ])
  const routeQueue = [routeIndex]
  let routeQueueIndex = 0
  let currentMarginConflicts: ClearanceConflict[] | null = null
  let candidateMarginConflicts: ClearanceConflict[] | null = null
  let currentZeroConflicts: ClearanceConflict[] | null = null
  let candidateZeroConflicts: ClearanceConflict[] | null = null
  const debugMoves = process.env.HD_REPAIR_DEBUG === "1"

  const getRouteLabel = (index: number) =>
    currentRoutes[index]?.connectionName ??
    currentRoutes[index]?.rootConnectionName ??
    `route-${index}`

  const debugLog = (message: string, payload?: Record<string, unknown>) => {
    if (!debugMoves) return
    console.error(
      `[high-density-repair] ${message}`,
      payload ? JSON.stringify(payload) : "",
    )
  }

  const getConflictKeys = (conflicts: ClearanceConflict[]) =>
    new Set(conflicts.map((conflict) => getClearanceConflictKey(conflict)))

  const getCurrentMarginConflicts = () => {
    if (currentMarginConflicts) return currentMarginConflicts
    currentMarginConflicts = findClearanceConflicts(
      currentRoutes,
      candidateRouteIndexes,
      margin,
      geometryCache,
      candidateRoutePointIndexes,
    )
    return currentMarginConflicts
  }

  const getCandidateMarginConflicts = () => {
    if (candidateMarginConflicts) return candidateMarginConflicts
    candidateMarginConflicts = findClearanceConflicts(
      candidateRoutes,
      candidateRouteIndexes,
      margin,
      geometryCache,
      candidateRoutePointIndexes,
    )
    return candidateMarginConflicts
  }

  const getCurrentZeroConflicts = () => {
    if (currentZeroConflicts) return currentZeroConflicts
    currentZeroConflicts = findClearanceConflicts(
      currentRoutes,
      candidateRouteIndexes,
      0,
      geometryCache,
      candidateRoutePointIndexes,
    )
    return currentZeroConflicts
  }

  const getCandidateZeroConflicts = () => {
    if (candidateZeroConflicts) return candidateZeroConflicts
    candidateZeroConflicts = findClearanceConflicts(
      candidateRoutes,
      candidateRouteIndexes,
      0,
      geometryCache,
      candidateRoutePointIndexes,
    )
    return candidateZeroConflicts
  }

  while (routeQueueIndex < routeQueue.length && !rejected) {
    const activeRouteIndex = routeQueue[routeQueueIndex] as number
    routeQueueIndex += 1
    queuedRouteIndexes.delete(activeRouteIndex)
    if (candidateRouteIndexes.has(activeRouteIndex)) continue

    const activeRoute = candidateRoutes[activeRouteIndex]
    const activePreferredLayers = Array.from(
      queuedRouteLayers.get(activeRouteIndex) ?? [],
    )
    const activePreferredPointIndexes = Array.from(
      queuedRoutePointIndexes.get(activeRouteIndex) ?? [],
    )
    queuedRouteLayers.delete(activeRouteIndex)
    queuedRoutePointIndexes.delete(activeRouteIndex)
    const activeMovableIndexes =
      activeRouteIndex === routeIndex
        ? getRouteMovableIndexes(activeRoute, boundary, side, margin)
        : getRoutePushableIndexes(
            activeRoute,
            activePreferredLayers,
            activePreferredPointIndexes,
          )

    if (activeMovableIndexes.length === 0) {
      if (activeRouteIndex === routeIndex) {
        return null
      }
      debugLog("rejecting push with no local movable points", {
        side,
        moveSide,
        routeIndex,
        activeRouteIndex,
        activeRoute: getRouteLabel(activeRouteIndex),
        activePreferredLayers,
        activePreferredPointIndexes,
      })
      rejected = true
      rejectionReason = "eventual-overlap"
      break
    }

    debugLog("moving route", {
      side,
      moveSide,
      routeIndex,
      route: getRouteLabel(routeIndex),
      activeRouteIndex,
      activeRoute: getRouteLabel(activeRouteIndex),
      activePreferredLayers,
      activePreferredPointIndexes,
      activeMovableIndexes,
    })

    const activePoints = activeRoute.route ?? []
    const targetAxisValue =
      activeRouteIndex === routeIndex
        ? undefined
        : moveSide === "left" || moveSide === "right"
          ? (activePoints[activeMovableIndexes[0]]?.x ?? 0) +
            (moveSide === "left" ? moveAmount : -moveAmount)
          : (activePoints[activeMovableIndexes[0]]?.y ?? 0) +
            (moveSide === "top" ? -moveAmount : moveAmount)

    candidateRoutes[activeRouteIndex] = createMovedRoute(
      activeRoute,
      activeMovableIndexes,
      boundary,
      moveSide,
      moveAmount,
      margin,
      targetAxisValue,
      activeRouteIndex !== routeIndex,
    )
    candidateRouteIndexes.add(activeRouteIndex)
    candidateRoutePointIndexes.set(
      activeRouteIndex,
      new Set(activeMovableIndexes),
    )
    currentMarginConflicts = null
    candidateMarginConflicts = null
    currentZeroConflicts = null
    candidateZeroConflicts = null

    if ((activeRoute.route?.length ?? 0) === 2) {
      movedTwoPointRouteIndexes.add(activeRouteIndex)
    }

    const originalBoundaryOverflow = getRouteBoundaryOverflow(
      currentRoutes[activeRouteIndex],
      boundary,
    )
    const candidateBoundaryOverflow = getRouteBoundaryOverflow(
      candidateRoutes[activeRouteIndex],
      boundary,
    )

    if (candidateBoundaryOverflow > originalBoundaryOverflow + 1e-6) {
      debugLog("rejecting move with increased boundary overflow", {
        side,
        moveSide,
        routeIndex,
        activeRouteIndex,
        activeRoute: getRouteLabel(activeRouteIndex),
        activeMovableIndexes,
        originalBoundaryOverflow,
        candidateBoundaryOverflow,
      })
      rejected = true
      rejectionReason = "boundary"
      break
    }

    if (
      !routeEndpointsStayOnBoundarySides(
        currentRoutes[activeRouteIndex],
        candidateRoutes[activeRouteIndex],
        boundary,
      )
    ) {
      debugLog("rejecting move with endpoint boundary regression", {
        side,
        moveSide,
        routeIndex,
        activeRouteIndex,
        activeRoute: getRouteLabel(activeRouteIndex),
        activeMovableIndexes,
      })
      rejected = true
      rejectionReason = "endpoint-boundary"
      break
    }

    const adjacencyConflicts = findClearanceConflicts(
      candidateRoutes,
      new Set([activeRouteIndex]),
      margin,
      geometryCache,
      new Map([[activeRouteIndex, new Set(activeMovableIndexes)]]),
    )

    for (const conflict of adjacencyConflicts) {
      if (
        getConflictKeys(getCurrentMarginConflicts()).has(
          getClearanceConflictKey(conflict),
        )
      ) {
        continue
      }

      const [firstRouteIndex, secondRouteIndex] = conflict.routeIndexes
      const firstMoved = candidateRouteIndexes.has(firstRouteIndex)
      const secondMoved = candidateRouteIndexes.has(secondRouteIndex)
      if (firstMoved && secondMoved) continue

      const nextRouteIndex = firstMoved ? secondRouteIndex : firstRouteIndex
      const nextRouteLayer = firstMoved
        ? conflict.layers[1]
        : conflict.layers[0]
      const nextRoutePointIndexes = firstMoved
        ? conflict.routePointIndexes[1]
        : conflict.routePointIndexes[0]

      if (
        !candidateRouteIndexes.has(nextRouteIndex) &&
        !queuedRouteIndexes.has(nextRouteIndex)
      ) {
        queuedRouteIndexes.add(nextRouteIndex)
        routeQueue.push(nextRouteIndex)
        queuedRouteLayers.set(nextRouteIndex, new Set([nextRouteLayer]))
        queuedRoutePointIndexes.set(
          nextRouteIndex,
          new Set(nextRoutePointIndexes),
        )
        debugLog("queueing local push", {
          side,
          moveSide,
          movedRouteIndex: activeRouteIndex,
          movedRoute: getRouteLabel(activeRouteIndex),
          nextRouteIndex,
          nextRoute: getRouteLabel(nextRouteIndex),
          nextRouteLayer,
          nextRoutePointIndexes,
        })
        continue
      }

      if (queuedRouteIndexes.has(nextRouteIndex)) {
        const existingLayers =
          queuedRouteLayers.get(nextRouteIndex) ??
          new Set<"top" | "bottom" | "via">()
        existingLayers.add(nextRouteLayer)
        queuedRouteLayers.set(nextRouteIndex, existingLayers)

        const existingPointIndexes =
          queuedRoutePointIndexes.get(nextRouteIndex) ?? new Set<number>()
        for (const index of nextRoutePointIndexes) {
          existingPointIndexes.add(index)
        }
        queuedRoutePointIndexes.set(nextRouteIndex, existingPointIndexes)
      }
    }
  }

  if (!rejected && candidateRouteIndexes.size > 1) {
    const currentConflictKeys = getConflictKeys(getCurrentMarginConflicts())
    const candidateConflictKeys = getConflictKeys(getCandidateMarginConflicts())

    for (const conflictKey of candidateConflictKeys) {
      if (currentConflictKeys.has(conflictKey)) continue
      debugLog("rejecting move with new margin conflict", {
        side,
        moveSide,
        routeIndex,
        conflictKey,
      })
      rejected = true
      rejectionReason = "eventual-overlap"
      break
    }
  }

  if (!rejected && candidateRouteIndexes.size > 1) {
    const currentZeroConflictKeys = getConflictKeys(getCurrentZeroConflicts())
    const candidateZeroConflictKeys = getConflictKeys(
      getCandidateZeroConflicts(),
    )

    for (const conflictKey of candidateZeroConflictKeys) {
      if (currentZeroConflictKeys.has(conflictKey)) continue
      debugLog("rejecting move with new zero-clearance conflict", {
        side,
        moveSide,
        routeIndex,
        conflictKey,
      })
      rejected = true
      rejectionReason = "eventual-overlap"
      break
    }
  }

  if (!rejected) {
    const currentFullZeroConflictKeys = new Set(
      findClearanceConflicts(
        currentRoutes,
        candidateRouteIndexes,
        0,
        geometryCache,
      ).map((conflict) => getClearanceConflictKey(conflict)),
    )
    const candidateFullZeroConflicts = findClearanceConflicts(
      candidateRoutes,
      candidateRouteIndexes,
      0,
      geometryCache,
    )

    for (const conflict of candidateFullZeroConflicts) {
      const conflictKey = getClearanceConflictKey(conflict)
      if (currentFullZeroConflictKeys.has(conflictKey)) continue
      debugLog("rejecting move with full-route zero-clearance conflict", {
        side,
        moveSide,
        routeIndex,
        conflictKey,
      })
      rejected = true
      rejectionReason = "eventual-overlap"
      break
    }
  }

  if (!rejected) {
    const boundaryTouchRegressions = findBoundaryTouchRegressions({
      currentRoutes,
      candidateRoutes,
      candidateRouteIndexes,
      boundary,
      activeSide: side,
    })

    if (boundaryTouchRegressions.length > 0) {
      debugLog("rejecting move with boundary touch regression", {
        side,
        moveSide,
        routeIndex,
        boundaryTouchRegressions,
      })
      rejected = true
      rejectionReason = "boundary-touch"
    }
  }

  if (!rejected) {
    const fixedTraceTouches = findNewUnpushableZeroClearanceConflicts({
      currentRoutes,
      candidateRoutes,
      candidateRouteIndexes,
      geometryCache,
      currentConflicts: getCurrentZeroConflicts(),
      candidateConflicts: getCandidateZeroConflicts(),
    })

    if (fixedTraceTouches.length > 0) {
      debugLog("rejecting move with fixed trace touch", {
        side,
        moveSide,
        routeIndex,
        fixedTraceTouches,
      })
      rejected = true
      rejectionReason = "fixed-trace-touch"
    }
  }

  if (!rejected) {
    const traceClearanceRegressions = findTraceClearanceRegressions({
      currentRoutes,
      candidateRoutes,
      candidateRouteIndexes,
      maximumAllowedClearance: Math.min(margin / 2, 0.1),
    })

    if (traceClearanceRegressions.length > 0) {
      debugLog("rejecting move with trace clearance regression", {
        side,
        moveSide,
        routeIndex,
        traceClearanceRegressions,
      })
      rejected = true
      rejectionReason = "trace-clearance"
    }
  }

  if (
    !rejected &&
    wouldIncreaseExposureOnOtherSides(
      currentRoutes,
      candidateRoutes,
      candidateRouteIndexes,
      boundary,
      side,
      margin,
    )
  ) {
    debugLog("rejecting move with side exposure regression", {
      side,
      moveSide,
      routeIndex,
    })
    rejected = true
    rejectionReason = "side-regression"
  }

  debugLog(rejected ? "move rejected" : "move accepted", {
    side,
    moveSide,
    routeIndex,
    route: getRouteLabel(routeIndex),
    candidateRouteIndexes: Array.from(candidateRouteIndexes),
    candidateRoutes: Array.from(candidateRouteIndexes).map((index) =>
      getRouteLabel(index),
    ),
    rejectionReason: rejected ? rejectionReason : undefined,
  })

  return {
    isTwoPointRoute,
    movableIndexes,
    candidateRouteIndexes,
    movedTwoPointRouteIndexes,
    candidateRoutes,
    rejected,
    rejectionReason,
  }
}
