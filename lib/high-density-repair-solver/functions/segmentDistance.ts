import type { XY } from "../shared/types"
import { distancePointToSegment } from "./distancePointToSegment"
import { segmentsIntersect } from "./segmentsIntersect"

export const segmentDistance = (a1: XY, a2: XY, b1: XY, b2: XY) => {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0

  return Math.min(
    distancePointToSegment(a1, b1, b2),
    distancePointToSegment(a2, b1, b2),
    distancePointToSegment(b1, a1, a2),
    distancePointToSegment(b2, a1, a2),
  )
}
