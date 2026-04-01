import { DEFAULT_TRACE_THICKNESS } from "../shared/constants"
import type {
  HdRoute,
  RouteGeometry,
  RouteGeometryCache,
} from "../shared/types"
import { getRoutePointLayer } from "./getRoutePointLayer"

export const getRouteGeometry = (
  route: HdRoute,
  routeIndex: number,
  cache?: RouteGeometryCache,
): RouteGeometry => {
  const cachedGeometry = cache?.get(route)
  if (cachedGeometry) {
    return cachedGeometry
  }

  const points = route.route ?? []
  const thickness = route.traceThickness ?? DEFAULT_TRACE_THICKNESS
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let hasBounds = false

  const extendBounds = (x: number, y: number, padding: number) => {
    minX = Math.min(minX, x - padding)
    minY = Math.min(minY, y - padding)
    maxX = Math.max(maxX, x + padding)
    maxY = Math.max(maxY, y + padding)
    hasBounds = true
  }

  const geometry: RouteGeometry = {
    segments: [],
    vias: (route.vias ?? []).map((via) => {
      const radius =
        (via.diameter ?? route.viaDiameter ?? DEFAULT_TRACE_THICKNESS * 2) / 2
      extendBounds(via.x, via.y, radius)

      return {
        center: { x: via.x, y: via.y },
        radius,
        routeIndex,
      }
    }),
    bounds: {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    },
  }

  for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
    const start = points[pointIndex]
    const end = points[pointIndex + 1]
    const padding = thickness / 2

    if (start) extendBounds(start.x, start.y, padding)
    if (end) extendBounds(end.x, end.y, padding)

    geometry.segments.push({
      start,
      end,
      routeIndex,
      pointIndex,
      thickness,
      layer: getRoutePointLayer(points[pointIndex]),
    })
  }

  if (!hasBounds) {
    for (const point of points) {
      extendBounds(point.x, point.y, thickness / 2)
    }
  }

  geometry.bounds = hasBounds
    ? { minX, minY, maxX, maxY }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0 }

  cache?.set(route, geometry)
  return geometry
}
