import { BOUNDARY_SIDES, EPSILON } from "../shared/constants"
import type { BoundaryRect, HdRoute } from "../shared/types"
import { distanceToSide } from "./distanceToSide"

const getEndpointBoundarySides = (
  route: HdRoute,
  boundary: BoundaryRect,
  endpointIndex: 0 | -1,
) => {
  const points = route.route ?? []
  const point = endpointIndex === 0 ? points[0] : points[points.length - 1]
  if (!point) return []

  return BOUNDARY_SIDES.filter(
    (side) => distanceToSide(point, boundary, side) <= EPSILON,
  )
}

export const routeEndpointsStayOnBoundarySides = (
  originalRoute: HdRoute,
  candidateRoute: HdRoute,
  boundary: BoundaryRect,
) => {
  const originalPoints = originalRoute.route ?? []
  const candidatePoints = candidateRoute.route ?? []
  if (originalPoints.length === 0 || candidatePoints.length === 0) return true

  for (const endpointIndex of [0, -1] as const) {
    const originalSides = getEndpointBoundarySides(
      originalRoute,
      boundary,
      endpointIndex,
    )
    if (originalSides.length === 0) continue

    const candidatePoint =
      endpointIndex === 0
        ? candidatePoints[0]
        : candidatePoints[candidatePoints.length - 1]
    if (!candidatePoint) return false

    for (const side of originalSides) {
      if (distanceToSide(candidatePoint, boundary, side) > EPSILON) {
        return false
      }
    }
  }

  return true
}
