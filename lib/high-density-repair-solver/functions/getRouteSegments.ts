import { DEFAULT_TRACE_THICKNESS } from "../shared/constants"
import type { HdRoute, Segment } from "../shared/types"
import { getRoutePointLayer } from "./getRoutePointLayer"

export const getRouteSegments = (
  route: HdRoute,
  routeIndex: number,
): Segment[] => {
  const points = route.route ?? []
  const segments: Segment[] = []

  for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
    segments.push({
      start: points[pointIndex],
      end: points[pointIndex + 1],
      routeIndex,
      pointIndex,
      thickness: route.traceThickness ?? DEFAULT_TRACE_THICKNESS,
      layer: getRoutePointLayer(points[pointIndex]),
    })
  }

  return segments
}
