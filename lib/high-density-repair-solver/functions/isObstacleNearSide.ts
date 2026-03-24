import { EPSILON } from "../shared/constants"
import type { BoundaryRect, BoundarySide, Obstacle } from "../shared/types"
import { getObstacleBounds } from "./getObstacleBounds"

export const isObstacleNearSide = (
  obstacle: Obstacle,
  boundary: BoundaryRect,
  side: BoundarySide,
  margin: number,
) => {
  const bounds = getObstacleBounds(obstacle)
  if (!bounds) return false

  switch (side) {
    case "left":
      return (
        bounds.maxX >= boundary.minX - EPSILON &&
        bounds.minX <= boundary.minX + margin + EPSILON
      )
    case "right":
      return (
        bounds.minX <= boundary.maxX + EPSILON &&
        bounds.maxX >= boundary.maxX - margin - EPSILON
      )
    case "top":
      return (
        bounds.minY <= boundary.maxY + EPSILON &&
        bounds.maxY >= boundary.maxY - margin - EPSILON
      )
    case "bottom":
      return (
        bounds.maxY >= boundary.minY - EPSILON &&
        bounds.minY <= boundary.minY + margin + EPSILON
      )
  }
}
