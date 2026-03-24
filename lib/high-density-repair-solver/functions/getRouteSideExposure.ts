import type { BoundaryRect, BoundarySide, HdRoute } from "../shared/types"
import { getSegmentLength } from "./getSegmentLength"
import { isPointNearSide } from "./isPointNearSide"

export const getRouteSideExposure = (
  route: HdRoute,
  boundary: BoundaryRect,
  side: BoundarySide,
  margin: number,
) => {
  const points = route.route ?? []
  let exposure = 0

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    if (!start || !end) continue
    if (
      isPointNearSide(start, boundary, side, margin) &&
      isPointNearSide(end, boundary, side, margin)
    ) {
      exposure += getSegmentLength(start, end)
    }
  }

  return exposure
}
