import type { XY } from "../shared/types"

export const getSegmentLength = (start: XY, end: XY) =>
  Math.hypot(end.x - start.x, end.y - start.y)
