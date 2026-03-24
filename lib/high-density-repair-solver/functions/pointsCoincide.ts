import { EPSILON } from "../shared/constants"
import type { XY } from "../shared/types"

export const pointsCoincide = (a: XY, b: XY) =>
  Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON
