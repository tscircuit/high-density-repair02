import { cloneRoutes } from "../functions/cloneRoutes"
import { createMovedRoute } from "../functions/createMovedRoute"
import { findConflictingRouteIndexes } from "../functions/findConflictingRouteIndexes"
import { getRouteMovableIndexes } from "../functions/getRouteMovableIndexes"
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

  const candidateRouteIndexes = new Set<number>([routeIndex])
  const candidateRoutes = cloneRoutes(currentRoutes)
  candidateRoutes[routeIndex] = createMovedRoute(
    candidateRoutes[routeIndex],
    movableIndexes,
    boundary,
    gridStep,
    side,
    moveAmount,
  )

  let rejected = false
  let rejectionReason = "overlap"

  if (!routeStaysInsideBoundary(candidateRoutes[routeIndex], boundary)) {
    rejected = true
    rejectionReason = "boundary"
  }

  const conflicts = rejected
    ? new Set<number>()
    : findConflictingRouteIndexes(candidateRoutes, candidateRouteIndexes)

  if (conflicts.size > 0) {
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
    candidateRoutes,
    rejected,
    rejectionReason,
  }
}
