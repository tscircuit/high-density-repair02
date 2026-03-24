import type { BoundaryRect, BoundarySide, DatasetSample } from "../shared/types"
import { isObstacleNearSide } from "./isObstacleNearSide"

export const getMoveAmountForSide = (
  sample: DatasetSample | undefined,
  boundary: BoundaryRect,
  side: BoundarySide,
  margin: number,
) => {
  const obstacles = sample?.adjacentObstacles ?? []
  const hasObstacle = obstacles.some((obstacle) =>
    isObstacleNearSide(obstacle, boundary, side, margin),
  )

  return {
    hasObstacle,
    moveAmount: hasObstacle ? margin : margin / 2,
  }
}
