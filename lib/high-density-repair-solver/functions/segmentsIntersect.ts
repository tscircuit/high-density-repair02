import { EPSILON } from "../shared/constants"
import type { XY } from "../shared/types"
import { onSegment } from "./onSegment"
import { orientation } from "./orientation"

export const segmentsIntersect = (a1: XY, a2: XY, b1: XY, b2: XY) => {
  const o1 = orientation(a1, a2, b1)
  const o2 = orientation(a1, a2, b2)
  const o3 = orientation(b1, b2, a1)
  const o4 = orientation(b1, b2, a2)

  if (Math.abs(o1) <= EPSILON && onSegment(a1, b1, a2)) return true
  if (Math.abs(o2) <= EPSILON && onSegment(a1, b2, a2)) return true
  if (Math.abs(o3) <= EPSILON && onSegment(b1, a1, b2)) return true
  if (Math.abs(o4) <= EPSILON && onSegment(b1, a2, b2)) return true

  return o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0
}
