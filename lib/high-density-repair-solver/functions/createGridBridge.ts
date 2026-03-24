import { EPSILON } from "../shared/constants"
import type { RoutePoint, XY } from "../shared/types"
import { dedupeRoutePoints } from "./dedupeRoutePoints"

export const createGridBridge = (
  start: RoutePoint,
  end: RoutePoint,
  delta: XY,
  preferredAxisValue: number,
) => {
  if (Math.abs(delta.x) > EPSILON) {
    return dedupeRoutePoints([
      start,
      { x: preferredAxisValue, y: start.y, z: start.z },
      { x: preferredAxisValue, y: end.y, z: end.z },
      end,
    ])
  }

  return dedupeRoutePoints([
    start,
    { x: start.x, y: preferredAxisValue, z: start.z },
    { x: end.x, y: preferredAxisValue, z: end.z },
    end,
  ])
}
