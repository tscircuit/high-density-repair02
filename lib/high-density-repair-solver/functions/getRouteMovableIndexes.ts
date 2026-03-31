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
  const movableIndexes: number[] = []
  const movableIndexSet = new Set<number>()
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
      movableIndexSet.add(index)
      movableIndexes.push(index)
    }
  }

  for (
    let queueIndex = 0;
    queueIndex < movableIndexes.length;
    queueIndex += 1
  ) {
    const activeIndex = movableIndexes[queueIndex] as number
    const activePoint = points[activeIndex]
    if (!activePoint) continue

    for (let index = firstMovableIndex; index <= lastMovableIndex; index += 1) {
      if (movableIndexSet.has(index)) continue
      const point = points[index]
      if (!point) continue
      if (point.z === activePoint.z) continue
      if (!pointsCoincide(point, activePoint)) continue

      movableIndexSet.add(index)
      movableIndexes.push(index)
    }
  }

  if (
    movableIndexes.length === 0 &&
    points.length === 2 &&
    points.some((point) => isPointNearSide(point, boundary, side, margin))
  ) {
    return [0, 1]
  }

  movableIndexes.sort((a, b) => a - b)
  return movableIndexes
}
