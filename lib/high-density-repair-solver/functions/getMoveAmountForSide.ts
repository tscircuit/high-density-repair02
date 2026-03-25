import type { BoundaryRect, BoundarySide, DatasetSample } from "../shared/types"
import { isObstacleNearSide } from "./isObstacleNearSide"

export const getMoveAmountForSide = (
  sample: DatasetSample | undefined,
  boundary: BoundaryRect,
  side: BoundarySide,
  obstacleSideMargin: number,
  clearSideMargin: number,
) => {
  const obstacles = sample?.adjacentObstacles ?? []
  const hasObstacle = obstacles.some((obstacle) =>
    isObstacleNearSide(obstacle, boundary, side, obstacleSideMargin),
  )
  const sideMargin = hasObstacle ? obstacleSideMargin : clearSideMargin

  return {
    hasObstacle,
    sideMargin,
    moveAmount: sideMargin,
  }
}
