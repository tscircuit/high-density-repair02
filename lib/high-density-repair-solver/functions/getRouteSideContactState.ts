import { EPSILON } from "../shared/constants"
import type { BoundaryRect, BoundarySide, HdRoute } from "../shared/types"
import { getSegmentLength } from "./getSegmentLength"
import { isPointNearSide } from "./isPointNearSide"

export type RouteSideContactState = "none" | "endpoint" | "interior"

export const getRouteSideContactState = (
  route: HdRoute,
  boundary: BoundaryRect,
  side: BoundarySide,
  margin: number,
): RouteSideContactState => {
  const points = route.route ?? []
  if (points.length === 0) return "none"

  let touchesAtEndpoint = false

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (!point) continue
    if (!isPointNearSide(point, boundary, side, margin)) continue

    if (index === 0 || index === points.length - 1) {
      touchesAtEndpoint = true
      continue
    }

    return "interior"
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    if (!start || !end) continue
    if (!isPointNearSide(start, boundary, side, margin)) continue
    if (!isPointNearSide(end, boundary, side, margin)) continue
    if (getSegmentLength(start, end) <= EPSILON) continue

    return "interior"
  }

  return touchesAtEndpoint ? "endpoint" : "none"
}
