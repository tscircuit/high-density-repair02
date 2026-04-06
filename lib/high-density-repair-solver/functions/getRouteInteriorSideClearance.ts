import type { BoundaryRect, BoundarySide, HdRoute } from "../shared/types"
import { distanceToSide } from "./distanceToSide"
import { getRouteInteriorSamplePoints } from "./getRouteInteriorSamplePoints"

export const getRouteInteriorSideClearance = (
  route: HdRoute,
  boundary: BoundaryRect,
  side: BoundarySide,
) => {
  const samples = getRouteInteriorSamplePoints(route)
  if (samples.length === 0) {
    return Number.POSITIVE_INFINITY
  }

  return samples.reduce(
    (minimum, point) =>
      Math.min(minimum, distanceToSide(point, boundary, side)),
    Number.POSITIVE_INFINITY,
  )
}
