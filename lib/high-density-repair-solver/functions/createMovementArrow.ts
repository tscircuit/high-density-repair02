import { CANDIDATE_STROKE } from "../shared/constants"
import type { BoundaryRect, BoundarySide } from "../shared/types"
import { sideDirection } from "./sideDirection"

export const createMovementArrow = (
  boundary: BoundaryRect,
  side: BoundarySide,
  amount: number,
) => {
  const direction = sideDirection(side, amount)
  switch (side) {
    case "left":
      return {
        start: { x: boundary.minX + amount / 4, y: boundary.center.y },
        end: {
          x: boundary.minX + amount / 4 + direction.x,
          y: boundary.center.y,
        },
        color: CANDIDATE_STROKE,
      }
    case "right":
      return {
        start: { x: boundary.maxX - amount / 4, y: boundary.center.y },
        end: {
          x: boundary.maxX - amount / 4 + direction.x,
          y: boundary.center.y,
        },
        color: CANDIDATE_STROKE,
      }
    case "top":
      return {
        start: { x: boundary.center.x, y: boundary.maxY - amount / 4 },
        end: {
          x: boundary.center.x,
          y: boundary.maxY - amount / 4 + direction.y,
        },
        color: CANDIDATE_STROKE,
      }
    case "bottom":
      return {
        start: { x: boundary.center.x, y: boundary.minY + amount / 4 },
        end: {
          x: boundary.center.x,
          y: boundary.minY + amount / 4 + direction.y,
        },
        color: CANDIDATE_STROKE,
      }
  }
}
