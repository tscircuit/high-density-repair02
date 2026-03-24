import { EPSILON } from "../shared/constants"
import type { XY } from "../shared/types"

export const onSegment = (a: XY, b: XY, c: XY) =>
  b.x <= Math.max(a.x, c.x) + EPSILON &&
  b.x >= Math.min(a.x, c.x) - EPSILON &&
  b.y <= Math.max(a.y, c.y) + EPSILON &&
  b.y >= Math.min(a.y, c.y) - EPSILON
