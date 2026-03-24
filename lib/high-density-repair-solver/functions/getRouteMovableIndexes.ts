import type {
  BoundaryRect,
  BoundarySide,
  HdRoute,
  RoutePoint,
} from "../shared/types"
import { isPointNearSide } from "./isPointNearSide"
import { pointsCoincide } from "./pointsCoincide"

export const getRouteMovableIndexes = (
  route: HdRoute,
  boundary: BoundaryRect,
  side: BoundarySide,
  margin: number,
) => {
  const points = route.route ?? []
  const movableIndexes = new Set<number>()
  let firstMovableIndex = 1
  let lastMovableIndex = points.length - 2

  while (
    firstMovableIndex < points.length - 1 &&
    pointsCoincide(
      points[firstMovableIndex] as RoutePoint,
      points[0] as RoutePoint,
    )
  ) {
    firstMovableIndex += 1
  }

  while (
    lastMovableIndex > 0 &&
    pointsCoincide(
      points[lastMovableIndex] as RoutePoint,
      points[points.length - 1] as RoutePoint,
    )
  ) {
    lastMovableIndex -= 1
  }

  for (let index = firstMovableIndex; index <= lastMovableIndex; index += 1) {
    if (isPointNearSide(points[index], boundary, side, margin)) {
      movableIndexes.add(index)
    }
  }

  const queue = Array.from(movableIndexes)
  while (queue.length > 0) {
    const activeIndex = queue.shift() as number
    const activePoint = points[activeIndex]
    if (!activePoint) continue

    for (let index = firstMovableIndex; index <= lastMovableIndex; index += 1) {
      if (movableIndexes.has(index)) continue
      const point = points[index]
      if (!point) continue
      if (point.z === activePoint.z) continue
      if (!pointsCoincide(point, activePoint)) continue

      movableIndexes.add(index)
      queue.push(index)
    }
  }

  if (
    movableIndexes.size === 0 &&
    points.length === 2 &&
    points.some((point) => isPointNearSide(point, boundary, side, margin))
  ) {
    movableIndexes.add(0)
    movableIndexes.add(1)
  }

  return Array.from(movableIndexes).sort((a, b) => a - b)
}
