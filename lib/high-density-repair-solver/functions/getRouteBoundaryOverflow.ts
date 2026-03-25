import type { BoundaryRect, HdRoute } from "../shared/types"

export const getRouteBoundaryOverflow = (
  route: HdRoute,
  boundary: BoundaryRect,
) =>
  Math.max(
    0,
    ...(route.route ?? []).map((point) =>
      Math.max(
        boundary.minX - point.x,
        point.x - boundary.maxX,
        boundary.minY - point.y,
        point.y - boundary.maxY,
        0,
      ),
    ),
  )
