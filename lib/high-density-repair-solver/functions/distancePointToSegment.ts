import { EPSILON } from "../shared/constants"
import type { XY } from "../shared/types"
import { clamp01 } from "./clamp01"
import { dot } from "./dot"
import { lengthSquared } from "./lengthSquared"
import { subtract } from "./subtract"

export const distancePointToSegment = (point: XY, start: XY, end: XY) => {
  const segment = subtract(end, start)
  const denom = lengthSquared(segment)
  if (denom <= EPSILON) {
    return Math.sqrt(lengthSquared(subtract(point, start)))
  }

  const t = clamp01(dot(subtract(point, start), segment) / denom)
  const projection = {
    x: start.x + segment.x * t,
    y: start.y + segment.y * t,
  }
  return Math.sqrt(lengthSquared(subtract(point, projection)))
}
