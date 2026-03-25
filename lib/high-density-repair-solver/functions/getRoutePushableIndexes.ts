import type { HdRoute, RoutePoint } from "../shared/types"
import { getRoutePointLayer } from "./getRoutePointLayer"
import { pointsCoincide } from "./pointsCoincide"

export const getRoutePushableIndexes = (
  route: HdRoute,
  preferredLayers: Array<"top" | "bottom" | "via">,
) => {
  const points = route.route ?? []
  const pushableIndexes = new Set<number>()
  const wantsAllLayers =
    preferredLayers.length === 0 || preferredLayers.includes("via")

  if (points.length === 2) {
    return [0, 1]
  }

  for (let index = 1; index < points.length - 1; index += 1) {
    if (wantsAllLayers) {
      pushableIndexes.add(index)
      continue
    }

    if (preferredLayers.includes(getRoutePointLayer(points[index]))) {
      pushableIndexes.add(index)
    }
  }

  const queue = Array.from(pushableIndexes)
  while (queue.length > 0) {
    const activeIndex = queue.shift() as number
    const activePoint = points[activeIndex]
    if (!activePoint) continue

    for (let index = 1; index < points.length - 1; index += 1) {
      if (pushableIndexes.has(index)) continue
      const point = points[index]
      if (!point) continue
      if (point.z === activePoint.z) continue
      if (!pointsCoincide(point, activePoint as RoutePoint)) continue

      pushableIndexes.add(index)
      queue.push(index)
    }
  }

  return Array.from(pushableIndexes).sort((a, b) => a - b)
}
