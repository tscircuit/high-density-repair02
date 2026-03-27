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
  const geometry: RouteGeometry = {
    segments: [],
    vias: (route.vias ?? []).map((via) => ({
      center: { x: via.x, y: via.y },
      radius:
        (via.diameter ?? route.viaDiameter ?? DEFAULT_TRACE_THICKNESS * 2) / 2,
      routeIndex,
    })),
  }

  for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
    geometry.segments.push({
      start: points[pointIndex],
      end: points[pointIndex + 1],
      routeIndex,
      pointIndex,
      thickness,
      layer: getRoutePointLayer(points[pointIndex]),
    })
  }

  cache?.set(route, geometry)
  return geometry
}
