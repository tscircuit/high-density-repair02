import type { HdRoute, RoutePoint } from "../shared/types"
import { getRoutePointLayer } from "./getRoutePointLayer"
import { pointsCoincide } from "./pointsCoincide"

export const getRoutePushableIndexes = (
  route: HdRoute,
  preferredLayers: Array<"top" | "bottom" | "via">,
  preferredPointIndexes: number[] = [],
) => {
  const points = route.route ?? []
  const pushableIndexes: number[] = []
  const pushableIndexSet = new Set<number>()
  const wantsAllLayers =
    preferredLayers.length === 0 || preferredLayers.includes("via")

  if (points.length === 2) {
    return [0, 1]
  }

  const addPushableIndex = (index: number) => {
    if (index <= 0 || index >= points.length - 1) return
    if (pushableIndexSet.has(index)) return
    const point = points[index]
    if (!point) return
    if (
      !wantsAllLayers &&
      !preferredLayers.includes(getRoutePointLayer(point))
    ) {
      return
    }

    pushableIndexSet.add(index)
    pushableIndexes.push(index)
  }

  if (preferredPointIndexes.length > 0) {
    for (const index of preferredPointIndexes) {
      addPushableIndex(index)
    }
  } else {
    for (let index = 1; index < points.length - 1; index += 1) {
      addPushableIndex(index)
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
