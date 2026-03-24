import { DEFAULT_TRACE_THICKNESS } from "../shared/constants"
import type { HdRoute, XY } from "../shared/types"
import { getRoutePointLayer } from "./getRoutePointLayer"
import { getRouteStrokeColor } from "./getRouteStrokeColor"

export const splitRouteIntoLayerSegments = (route: HdRoute) => {
  const routePoints = route.route ?? []
  const lines: Array<{
    points: XY[]
    strokeColor: string
    strokeWidth: number
    label: string
  }> = []

  if (routePoints.length < 2) return lines

  let currentLayer = getRoutePointLayer(routePoints[0])
  let currentSegment: XY[] = [routePoints[0]]

  for (let index = 1; index < routePoints.length; index += 1) {
    const point = routePoints[index]
    const pointLayer = getRoutePointLayer(point)

    if (pointLayer !== currentLayer) {
      if (currentSegment.length >= 2) {
        lines.push({
          points: currentSegment,
          strokeColor: getRouteStrokeColor(currentLayer),
          strokeWidth: route.traceThickness ?? DEFAULT_TRACE_THICKNESS,
          label: route.connectionName ?? "route",
        })
      }
      currentLayer = pointLayer
      currentSegment = [routePoints[index - 1], point]
      continue
    }

    currentSegment.push(point)
  }

  if (currentSegment.length >= 2) {
    lines.push({
      points: currentSegment,
      strokeColor: getRouteStrokeColor(currentLayer),
      strokeWidth: route.traceThickness ?? DEFAULT_TRACE_THICKNESS,
      label: route.connectionName ?? "route",
    })
  }

  return lines
}
