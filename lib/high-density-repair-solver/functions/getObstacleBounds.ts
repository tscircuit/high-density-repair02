import type { Obstacle } from "../shared/types"

export const getObstacleBounds = (obstacle: Obstacle) => {
  if (!obstacle.center || !obstacle.width || !obstacle.height) return null
  return {
    minX: obstacle.center.x - obstacle.width / 2,
    maxX: obstacle.center.x + obstacle.width / 2,
    minY: obstacle.center.y - obstacle.height / 2,
    maxY: obstacle.center.y + obstacle.height / 2,
  }
}
