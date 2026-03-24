import type { BoundarySide, XY } from "../shared/types"

export const sideDirection = (side: BoundarySide, amount: number): XY => {
  switch (side) {
    case "left":
      return { x: amount, y: 0 }
    case "right":
      return { x: -amount, y: 0 }
    case "top":
      return { x: 0, y: -amount }
    case "bottom":
      return { x: 0, y: amount }
  }
}
