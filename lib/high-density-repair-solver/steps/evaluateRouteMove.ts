import { cloneRoutes } from "../functions/cloneRoutes"
import { createMovedRoute } from "../functions/createMovedRoute"
import { findClearanceConflictPairs } from "../functions/findClearanceConflictPairs"
import { findClearanceConflicts } from "../functions/findClearanceConflicts"
import { getRouteBoundaryOverflow } from "../functions/getRouteBoundaryOverflow"
import { getRouteMovableIndexes } from "../functions/getRouteMovableIndexes"
import { getRoutePushableIndexes } from "../functions/getRoutePushableIndexes"
import { routeStaysInsideBoundary } from "../functions/routeStaysInsideBoundary"
import { wouldIncreaseExposureOnOtherSides } from "../functions/wouldIncreaseExposureOnOtherSides"
import type {
  BoundaryRect,
  BoundarySide,
  EvaluateRouteMoveResult,
  HdRoute,
} from "../shared/types"

export const evaluateRouteMove = ({
  currentRoutes,
  routeIndex,
  side,
  boundary,
  margin,
  gridStep,
  moveAmount,
}: {
  currentRoutes: HdRoute[]
  routeIndex: number
  side: BoundarySide
  boundary: BoundaryRect
  margin: number
  gridStep: number
  moveAmount: number
}): EvaluateRouteMoveResult | null => {
  const route = currentRoutes[routeIndex]
  const isTwoPointRoute = (route.route?.length ?? 0) === 2
  const movableIndexes = getRouteMovableIndexes(route, boundary, side, margin)

  if (movableIndexes.length === 0) {
    return null
  }

  const candidateRouteIndexes = new Set<number>()
  const movedTwoPointRouteIndexes = new Set<number>()
  const candidateRoutes = cloneRoutes(currentRoutes)
  let rejected = false
  let rejectionReason = "overlap"
  const queuedRouteIndexes = new Set<number>([routeIndex])
  const queuedRouteLayers = new Map<number, Set<"top" | "bottom" | "via">>([
    [routeIndex, new Set()],
  ])
  const routeQueue = [routeIndex]

  while (routeQueue.length > 0 && !rejected) {
    const activeRouteIndex = routeQueue.shift() as number
    queuedRouteIndexes.delete(activeRouteIndex)
    if (candidateRouteIndexes.has(activeRouteIndex)) continue

    const activeRoute = candidateRoutes[activeRouteIndex]
    const activePreferredLayers = Array.from(
      queuedRouteLayers.get(activeRouteIndex) ?? [],
    )
    queuedRouteLayers.delete(activeRouteIndex)
    const activeMovableIndexes =
      activeRouteIndex === routeIndex
        ? getRouteMovableIndexes(activeRoute, boundary, side, margin)
        : getRoutePushableIndexes(activeRoute, activePreferredLayers)

    if (activeMovableIndexes.length === 0) {
      if (activeRouteIndex === routeIndex) {
        return null
      }
      rejected = true
      rejectionReason = "eventual-overlap"
      break
    }

    const activePoints = activeRoute.route ?? []
    const targetAxisValue =
      activeRouteIndex === routeIndex
        ? undefined
        : side === "left" || side === "right"
          ? (activePoints[activeMovableIndexes[0]]?.x ?? 0) +
            (side === "left" ? moveAmount : -moveAmount)
          : (activePoints[activeMovableIndexes[0]]?.y ?? 0) +
            (side === "top" ? -moveAmount : moveAmount)

    candidateRoutes[activeRouteIndex] = createMovedRoute(
      activeRoute,
      activeMovableIndexes,
      boundary,
      gridStep,
      side,
      moveAmount,
      targetAxisValue,
      activeRouteIndex !== routeIndex,
    )
    candidateRouteIndexes.add(activeRouteIndex)

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
      rejected = true
      rejectionReason = "boundary"
      break
    }

    const adjacencyConflicts = findClearanceConflicts(
      candidateRoutes,
      candidateRouteIndexes,
      margin,
    )

    for (const conflict of adjacencyConflicts) {
      const [firstRouteIndex, secondRouteIndex] = conflict.routeIndexes
      const firstMoved = candidateRouteIndexes.has(firstRouteIndex)
      const secondMoved = candidateRouteIndexes.has(secondRouteIndex)
      if (firstMoved && secondMoved) continue

      const nextRouteIndex = firstMoved ? secondRouteIndex : firstRouteIndex
      const nextRouteLayer = firstMoved
        ? conflict.layers[1]
        : conflict.layers[0]

      if (
        !candidateRouteIndexes.has(nextRouteIndex) &&
        !queuedRouteIndexes.has(nextRouteIndex)
      ) {
        queuedRouteIndexes.add(nextRouteIndex)
        routeQueue.push(nextRouteIndex)
        queuedRouteLayers.set(nextRouteIndex, new Set([nextRouteLayer]))
        continue
      }

      if (queuedRouteIndexes.has(nextRouteIndex)) {
        const existingLayers =
          queuedRouteLayers.get(nextRouteIndex) ??
          new Set<"top" | "bottom" | "via">()
        existingLayers.add(nextRouteLayer)
        queuedRouteLayers.set(nextRouteIndex, existingLayers)
      }
    }
  }

  if (
    !rejected &&
    findClearanceConflictPairs(candidateRoutes, candidateRouteIndexes, 0)
      .length > 0
  ) {
    rejected = true
    rejectionReason = "eventual-overlap"
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
    rejected = true
    rejectionReason = "side-regression"
  }

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
