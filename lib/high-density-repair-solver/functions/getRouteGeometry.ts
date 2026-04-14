import { DEFAULT_TRACE_THICKNESS } from "../shared/constants"
import type {
  HdRoute,
  RouteGeometry,
  RouteGeometryCache,
  RoutePoint,
} from "../shared/types"
import { getRoutePointLayer } from "./getRoutePointLayer"

const isCollinearSameLayerChain = (
  start: RoutePoint,
  middle: RoutePoint,
  end: RoutePoint,
) => {
  if ((start.z ?? 0) !== (middle.z ?? 0)) return false
  if ((middle.z ?? 0) !== (end.z ?? 0)) return false

  return (
    (start.x === middle.x && middle.x === end.x) ||
    (start.y === middle.y && middle.y === end.y)
  )
}

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
    segmentsByLayer: {
      top: [],
      bottom: [],
    },
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

  for (let pointIndex = 0; pointIndex < points.length - 1; ) {
    const start = points[pointIndex]
    let endIndex = pointIndex + 1
    let end = points[endIndex]
    const padding = thickness / 2

    if (start) extendBounds(start.x, start.y, padding)
    if (end) extendBounds(end.x, end.y, padding)

    while (endIndex < points.length - 1) {
      const middle = points[endIndex]
      const next = points[endIndex + 1]
      if (!start || !middle || !next) break
      if (getRoutePointLayer(start) !== getRoutePointLayer(middle)) break
      if (getRoutePointLayer(middle) !== getRoutePointLayer(next)) break
      if (!isCollinearSameLayerChain(start, middle, next)) break

      endIndex += 1
      end = next
      extendBounds(next.x, next.y, padding)
    }

    if (!start || !end) {
      pointIndex += 1
      continue
    }

    const layer = getRoutePointLayer(start)
    const segment = {
      start,
      end,
      routeIndex,
      pointIndex,
      endPointIndex: endIndex,
      thickness,
      halfThickness: padding,
      layer,
      minX: Math.min(start.x, end.x) - padding,
      maxX: Math.max(start.x, end.x) + padding,
      minY: Math.min(start.y, end.y) - padding,
      maxY: Math.max(start.y, end.y) + padding,
    } satisfies RouteGeometry["segments"][number]

    geometry.segments.push(segment)
    geometry.segmentsByLayer[layer].push(segment)

    pointIndex = endIndex
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
