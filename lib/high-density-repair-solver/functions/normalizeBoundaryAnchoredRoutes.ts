import type { BoundaryRect, HdRoute, RoutePoint } from "../shared/types"

const BOUNDARY_ENDPOINT_SNAP_TOLERANCE = 1e-3

const snapPointToBoundary = (
  point: RoutePoint,
  boundary: BoundaryRect,
): RoutePoint => {
  const nextPoint = { ...point }

  if (
    Math.abs(nextPoint.x - boundary.minX) <= BOUNDARY_ENDPOINT_SNAP_TOLERANCE
  ) {
    nextPoint.x = boundary.minX
  } else if (
    Math.abs(nextPoint.x - boundary.maxX) <= BOUNDARY_ENDPOINT_SNAP_TOLERANCE
  ) {
    nextPoint.x = boundary.maxX
  }

  if (
    Math.abs(nextPoint.y - boundary.minY) <= BOUNDARY_ENDPOINT_SNAP_TOLERANCE
  ) {
    nextPoint.y = boundary.minY
  } else if (
    Math.abs(nextPoint.y - boundary.maxY) <= BOUNDARY_ENDPOINT_SNAP_TOLERANCE
  ) {
    nextPoint.y = boundary.maxY
  }

  return nextPoint
}

export const normalizeBoundaryAnchoredRoutes = (
  routes: HdRoute[],
  boundary: BoundaryRect,
): HdRoute[] =>
  routes.map((route) => {
    const points = route.route ?? []
    if (points.length === 0) return route

    return {
      ...route,
      route: points.map((point, index) =>
        index === 0 || index === points.length - 1
          ? snapPointToBoundary(point, boundary)
          : point,
      ),
    }
  })
