import type { HdRoute, RoutePoint } from "../shared/types"
import { getRoutePointLayer } from "./getRoutePointLayer"
import { pointsCoincide } from "./pointsCoincide"

export const getRoutePushableIndexes = (
  route: HdRoute,
  preferredLayers: Array<"top" | "bottom" | "via">,
) => {
  const points = route.route ?? []
  const pushableIndexes: number[] = []
  const pushableIndexSet = new Set<number>()
  const wantsAllLayers =
    preferredLayers.length === 0 || preferredLayers.includes("via")

  if (points.length === 2) {
    return [0, 1]
  }

  for (let index = 1; index < points.length - 1; index += 1) {
    if (wantsAllLayers) {
      pushableIndexSet.add(index)
      pushableIndexes.push(index)
      continue
    }

    if (preferredLayers.includes(getRoutePointLayer(points[index]))) {
      pushableIndexSet.add(index)
      pushableIndexes.push(index)
    }
  }

  for (
    let queueIndex = 0;
    queueIndex < pushableIndexes.length;
    queueIndex += 1
  ) {
    const activeIndex = pushableIndexes[queueIndex] as number
    const activePoint = points[activeIndex]
    if (!activePoint) continue

    for (let index = 1; index < points.length - 1; index += 1) {
      if (pushableIndexSet.has(index)) continue
      const point = points[index]
      if (!point) continue
      if (point.z === activePoint.z) continue
      if (!pointsCoincide(point, activePoint as RoutePoint)) continue

      pushableIndexSet.add(index)
      pushableIndexes.push(index)
    }
  }

  pushableIndexes.sort((a, b) => a - b)
  return pushableIndexes
}
