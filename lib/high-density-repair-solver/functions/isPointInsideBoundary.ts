import { EPSILON } from "../shared/constants"
import type { BoundaryRect, XY } from "../shared/types"

export const isPointInsideBoundary = (point: XY, boundary: BoundaryRect) =>
  point.x >= boundary.minX - EPSILON &&
  point.x <= boundary.maxX + EPSILON &&
  point.y >= boundary.minY - EPSILON &&
  point.y <= boundary.maxY + EPSILON
