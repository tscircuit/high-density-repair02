import type { BoundaryRect, BoundarySide, XY } from "../shared/types"

export const distanceToSide = (
  point: XY,
  boundary: BoundaryRect,
  side: BoundarySide,
) => {
  switch (side) {
    case "left":
      return point.x - boundary.minX
    case "right":
      return boundary.maxX - point.x
    case "top":
      return boundary.maxY - point.y
    case "bottom":
      return point.y - boundary.minY
  }
}
