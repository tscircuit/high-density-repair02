import type { XY } from "../shared/types"

export const subtract = (a: XY, b: XY): XY => ({ x: a.x - b.x, y: a.y - b.y })
