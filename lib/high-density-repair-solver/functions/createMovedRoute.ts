import type {
  BoundaryRect,
  BoundarySide,
  HdRoute,
  RoutePoint,
} from "../shared/types"
import { cloneRoute } from "./cloneRoute"
import { createGridBridge } from "./createGridBridge"
import { dedupeRoutePoints } from "./dedupeRoutePoints"
import { getPreferredAxisValue } from "./getPreferredAxisValue"
import { pointsCoincide } from "./pointsCoincide"
import { sideDirection } from "./sideDirection"

export const createMovedRoute = (
  route: HdRoute,
  movableIndexes: number[],
  boundary: BoundaryRect,
  gridStep: number,
  side: BoundarySide,
  moveAmount: number,
  targetAxisValue?: number,
  translateOnly = false,
): HdRoute => {
  const delta = sideDirection(side, moveAmount)
  const originalPoints = route.route ?? []
  if (originalPoints.length < 2 || movableIndexes.length === 0) {
    return cloneRoute(route)
  }

  if (translateOnly || (route.vias?.length ?? 0) > 0) {
    const translatedRoute = cloneRoute(route)
    const translatedPoints = translatedRoute.route ?? []

    for (const index of movableIndexes) {
      const originalPoint = translatedPoints[index]
      if (!originalPoint) continue
      translatedPoints[index] = {
        ...originalPoint,
        x: originalPoint.x + delta.x,
        y: originalPoint.y + delta.y,
      }
    }

    for (const via of translatedRoute.vias ?? []) {
      const connectedPointWasMoved = movableIndexes.some((index) => {
        const point = route.route?.[index]
        return point ? pointsCoincide(point, via) : false
      })

      if (!connectedPointWasMoved) continue
      via.x += delta.x
      via.y += delta.y
    }

    return translatedRoute
  }

  const nextRoute = cloneRoute(route)
  const isTwoPointRedraw =
    originalPoints.length === 2 &&
    movableIndexes.length === 2 &&
    movableIndexes[0] === 0 &&
    movableIndexes[1] === 1

  if (isTwoPointRedraw) {
    const start = originalPoints[0] as RoutePoint
    const end = originalPoints[1] as RoutePoint
    const preferredAxis =
      targetAxisValue ??
      getPreferredAxisValue(side, moveAmount, boundary, gridStep)
    nextRoute.route = createGridBridge(start, end, delta, preferredAxis)
    return nextRoute
  }

  const firstIndex = movableIndexes[0] as number
  const lastIndex = movableIndexes[movableIndexes.length - 1] as number
  const anchorStart = originalPoints[firstIndex - 1]
  const anchorEnd = originalPoints[lastIndex + 1]

  if (!anchorStart || !anchorEnd) {
    return nextRoute
  }

  const preferredAxis =
    targetAxisValue ??
    getPreferredAxisValue(side, moveAmount, boundary, gridStep)
  const replacementBridge = createGridBridge(
    anchorStart,
    anchorEnd,
    delta,
    preferredAxis,
  )

  nextRoute.route = dedupeRoutePoints([
    ...originalPoints.slice(0, firstIndex),
    ...replacementBridge.slice(1),
    ...originalPoints.slice(lastIndex + 2),
  ])

  return nextRoute
}
