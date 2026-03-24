import { EPSILON } from "../shared/constants"
import type { BoundaryRect, BoundarySide, XY } from "../shared/types"
import { distanceToSide } from "./distanceToSide"

export const isPointNearSide = (
  point: XY,
  boundary: BoundaryRect,
  side: BoundarySide,
  margin: number,
) => distanceToSide(point, boundary, side) <= margin + EPSILON
