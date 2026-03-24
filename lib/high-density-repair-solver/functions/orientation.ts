import type { XY } from "../shared/types"

export const orientation = (a: XY, b: XY, c: XY) =>
  (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)
