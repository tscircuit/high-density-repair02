import type {
  BoundaryRect,
  BoundarySide,
  HdRoute,
  RoutePoint,
} from "../shared/types"
import { cloneRoute } from "./cloneRoute"
import { dedupeRoutePoints } from "./dedupeRoutePoints"
import { pointsCoincide } from "./pointsCoincide"
import { sideDirection } from "./sideDirection"

const getShiftAxisValue = ({
  side,
  boundary,
  amount,
  targetAxisValue,
}: {
  side: BoundarySide
  boundary: BoundaryRect
  amount: number
  targetAxisValue?: number
}) => {
  const preferredAxisValue =
    targetAxisValue ??
    (() => {
      switch (side) {
        case "left":
          return boundary.minX + amount
        case "right":
          return boundary.maxX - amount
        case "top":
          return boundary.maxY - amount
        case "bottom":
          return boundary.minY + amount
      }
    })()

  switch (side) {
    case "left":
    case "right":
      return Math.min(
        Math.max(preferredAxisValue, boundary.minX),
        boundary.maxX,
      )
    case "top":
    case "bottom":
      return Math.min(
        Math.max(preferredAxisValue, boundary.minY),
        boundary.maxY,
      )
  }
}

const createShiftedBridge = ({
  start,
  end,
  side,
  boundary,
  amount,
  targetAxisValue,
}: {
  start: RoutePoint
  end: RoutePoint
  side: BoundarySide
  boundary: BoundaryRect
  amount: number
  targetAxisValue?: number
}) => {
  const shiftedAxisValue = getShiftAxisValue({
    side,
    boundary,
    amount,
    targetAxisValue,
  })

  switch (side) {
    case "left":
    case "right":
      return dedupeRoutePoints([
        start,
        { x: shiftedAxisValue, y: start.y, z: start.z },
        { x: shiftedAxisValue, y: end.y, z: end.z },
        end,
      ])
    case "top":
    case "bottom":
      return dedupeRoutePoints([
        start,
        { x: start.x, y: shiftedAxisValue, z: start.z },
        { x: end.x, y: shiftedAxisValue, z: end.z },
        end,
      ])
  }
}

export const createMovedRoute = (
  route: HdRoute,
  movableIndexes: number[],
  boundary: BoundaryRect,
  side: BoundarySide,
  moveAmount: number,
  margin: number,
  targetAxisValue?: number,
  translateOnly = false,
): HdRoute => {
  const originalPoints = route.route ?? []
  if (originalPoints.length < 2 || movableIndexes.length === 0) {
    return cloneRoute(route)
  }

  const translationAmount = translateOnly
    ? moveAmount
    : Math.max(moveAmount, margin)
  const delta = sideDirection(side, translationAmount)

  if (
    translateOnly ||
    (route.vias?.length ?? 0) > 0 ||
    originalPoints.length > 2
  ) {
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
    return cloneRoute({
      ...route,
      route: createShiftedBridge({
        start,
        end,
        side,
        boundary,
        amount: translationAmount,
        targetAxisValue,
      }),
    })
  }

  return nextRoute
}
