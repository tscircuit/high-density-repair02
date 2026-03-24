import type { XY } from "../shared/types"

export const lengthSquared = (point: XY) =>
  point.x * point.x + point.y * point.y
