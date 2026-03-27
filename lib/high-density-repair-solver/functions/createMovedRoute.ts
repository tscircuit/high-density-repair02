import { BOUNDARY_SIDES } from "../shared/constants"
import type {
  BoundaryRect,
  BoundarySide,
  HdRoute,
  RoutePoint,
} from "../shared/types"
import { cloneRoute } from "./cloneRoute"
import { createGridBridge } from "./createGridBridge"
import { dedupeRoutePoints } from "./dedupeRoutePoints"
import { distanceToSide } from "./distanceToSide"
import { findBestGridBridgePath } from "./findBestGridBridgePath"
import { getPreferredAxisValue } from "./getPreferredAxisValue"
import { getRouteSideContactState } from "./getRouteSideContactState"
import { getRouteSideExposure } from "./getRouteSideExposure"
import { pointsCoincide } from "./pointsCoincide"
import { sideDirection } from "./sideDirection"

const createGridBridgeCandidates = ({
  start,
  end,
  delta,
  preferredAxisValue,
}: {
  start: RoutePoint
  end: RoutePoint
  delta: { x: number; y: number }
  preferredAxisValue: number
}) => {
  return Math.abs(delta.x) > 0
    ? [
        createGridBridge(start, end, delta, preferredAxisValue),
        dedupeRoutePoints([
          start,
          { x: preferredAxisValue, y: start.y, z: start.z },
          { x: end.x, y: start.y, z: end.z },
          end,
        ]),
        dedupeRoutePoints([
          start,
          { x: start.x, y: end.y, z: start.z },
          { x: preferredAxisValue, y: end.y, z: end.z },
          end,
        ]),
      ]
    : [createGridBridge(start, end, delta, preferredAxisValue)]
}

const getSaferPreferredAxisValue = ({
  side,
  moveAmount,
  boundary,
  gridStep,
  margin,
  targetAxisValue,
}: {
  side: BoundarySide
  moveAmount: number
  boundary: BoundaryRect
  gridStep: number
  margin: number
  targetAxisValue?: number
}) => {
  const preferredAxis =
    targetAxisValue ??
    getPreferredAxisValue(side, moveAmount, boundary, gridStep)

  const point =
    side === "left" || side === "right"
      ? { x: preferredAxis, y: boundary.center.y }
      : { x: boundary.center.x, y: preferredAxis }

  if (distanceToSide(point, boundary, side) > margin) {
    return preferredAxis
  }

  switch (side) {
    case "left":
      return Math.min(preferredAxis + gridStep, boundary.maxX)
    case "right":
      return Math.max(preferredAxis - gridStep, boundary.minX)
    case "top":
      return Math.max(preferredAxis - gridStep, boundary.minY)
    case "bottom":
      return Math.min(preferredAxis + gridStep, boundary.maxY)
  }
}

export const createMovedRoute = (
  route: HdRoute,
  movableIndexes: number[],
  boundary: BoundaryRect,
  gridStep: number,
  side: BoundarySide,
  moveAmount: number,
  margin: number,
  surroundingRoutes?: HdRoute[],
  activeRouteIndex?: number,
  targetAxisValue?: number,
  translateOnly = false,
): HdRoute => {
  const getContactRank = (
    contactState: ReturnType<typeof getRouteSideContactState>,
  ) => (contactState === "none" ? 0 : contactState === "endpoint" ? 1 : 2)

  const isScoreBetter = (
    score: {
      activeExposure: number
      worsenedOtherSideContacts: number
      otherExposureIncrease: number
      otherExposure: number
      minOtherSideClearance: number
      pointCount: number
    },
    bestScore: {
      activeExposure: number
      worsenedOtherSideContacts: number
      otherExposureIncrease: number
      otherExposure: number
      minOtherSideClearance: number
      pointCount: number
    },
  ) => {
    if (
      score.worsenedOtherSideContacts !== bestScore.worsenedOtherSideContacts
    ) {
      return (
        score.worsenedOtherSideContacts < bestScore.worsenedOtherSideContacts
      )
    }
    if (score.activeExposure !== bestScore.activeExposure) {
      return score.activeExposure < bestScore.activeExposure
    }
    if (score.minOtherSideClearance !== bestScore.minOtherSideClearance) {
      return score.minOtherSideClearance > bestScore.minOtherSideClearance
    }
    if (score.otherExposureIncrease !== bestScore.otherExposureIncrease) {
      return score.otherExposureIncrease < bestScore.otherExposureIncrease
    }
    if (score.otherExposure !== bestScore.otherExposure) {
      return score.otherExposure < bestScore.otherExposure
    }
    return score.pointCount < bestScore.pointCount
  }

  const getRouteSafetyScore = (candidateRoute: HdRoute) => {
    const otherSides = BOUNDARY_SIDES.filter(
      (candidateSide) => candidateSide !== side,
    )
    const originalTouchingSides = new Set(
      otherSides.filter(
        (candidateSide) =>
          getRouteSideContactState(route, boundary, candidateSide, margin) !==
          "none",
      ),
    )
    const activeExposure = getRouteSideExposure(
      candidateRoute,
      boundary,
      side,
      margin,
    )
    const worsenedOtherSideContacts = otherSides.reduce(
      (sum, candidateSide) => {
        const beforeContact = getRouteSideContactState(
          route,
          boundary,
          candidateSide,
          margin,
        )
        const afterContact = getRouteSideContactState(
          candidateRoute,
          boundary,
          candidateSide,
          margin,
        )
        return (
          sum +
          (getContactRank(afterContact) > getContactRank(beforeContact) ? 1 : 0)
        )
      },
      0,
    )
    const otherExposureIncrease = otherSides.reduce((sum, candidateSide) => {
      const beforeExposure = getRouteSideExposure(
        route,
        boundary,
        candidateSide,
        margin,
      )
      const afterExposure = getRouteSideExposure(
        candidateRoute,
        boundary,
        candidateSide,
        margin,
      )
      return sum + Math.max(0, afterExposure - beforeExposure)
    }, 0)
    const otherExposure = otherSides.reduce(
      (sum, candidateSide) =>
        sum +
        getRouteSideExposure(candidateRoute, boundary, candidateSide, margin),
      0,
    )
    const candidatePoints = candidateRoute.route ?? []
    const sampledPoints = candidatePoints.flatMap((point, index) => {
      const nextPoint = candidatePoints[index + 1]
      if (!nextPoint) return [point]
      return [
        point,
        { x: (point.x + nextPoint.x) / 2, y: (point.y + nextPoint.y) / 2 },
      ]
    })
    const minOtherSideClearance = sampledPoints.reduce(
      (minClearance, point) => {
        const pointClearance = otherSides.reduce((pointMin, candidateSide) => {
          const distance = distanceToSide(point, boundary, candidateSide)
          if (originalTouchingSides.has(candidateSide) && distance <= 1e-6) {
            return pointMin
          }

          return Math.min(pointMin, distance)
        }, Number.POSITIVE_INFINITY)

        if (!Number.isFinite(pointClearance)) {
          return minClearance
        }

        return Math.min(minClearance, pointClearance)
      },
      Number.POSITIVE_INFINITY,
    )

    return {
      activeExposure,
      worsenedOtherSideContacts,
      otherExposureIncrease,
      otherExposure,
      minOtherSideClearance,
      pointCount: candidatePoints.length,
    }
  }

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
    const preferredAxis = getSaferPreferredAxisValue({
      side,
      moveAmount,
      boundary,
      gridStep,
      margin,
      targetAxisValue,
    })
    const candidateRoutes = createGridBridgeCandidates({
      start,
      end,
      delta,
      preferredAxisValue: preferredAxis,
    }).map((candidateBridge) =>
      cloneRoute({ ...route, route: candidateBridge }),
    )
    const searchedPath = findBestGridBridgePath({
      start,
      end,
      boundary,
      activeSide: side,
      gridStep,
      margin,
      preferredAxisValue: preferredAxis,
      activeRouteIndex,
      surroundingRoutes,
      traceThickness: route.traceThickness,
    })

    if (searchedPath) {
      candidateRoutes.push(cloneRoute({ ...route, route: searchedPath }))
    }

    let bestRoute = candidateRoutes[0] as HdRoute
    let bestScore = getRouteSafetyScore(bestRoute)

    for (const candidateRoute of candidateRoutes.slice(1)) {
      const score = getRouteSafetyScore(candidateRoute)
      if (!isScoreBetter(score, bestScore)) continue

      bestRoute = candidateRoute
      bestScore = score
    }

    return bestRoute
  }

  const firstIndex = movableIndexes[0] as number
  const lastIndex = movableIndexes[movableIndexes.length - 1] as number
  const anchorStart = originalPoints[firstIndex - 1]
  const anchorEnd = originalPoints[lastIndex + 1]

  if (!anchorStart || !anchorEnd) {
    return nextRoute
  }

  const preferredAxis = getSaferPreferredAxisValue({
    side,
    moveAmount,
    boundary,
    gridStep,
    margin,
    targetAxisValue,
  })
  const candidateRoutes = createGridBridgeCandidates({
    start: anchorStart,
    end: anchorEnd,
    delta,
    preferredAxisValue: preferredAxis,
  }).map((candidateBridge) =>
    cloneRoute({
      ...route,
      route: dedupeRoutePoints([
        ...originalPoints.slice(0, firstIndex),
        ...candidateBridge.slice(1),
        ...originalPoints.slice(lastIndex + 2),
      ]),
    }),
  )
  const searchedPath = findBestGridBridgePath({
    start: anchorStart,
    end: anchorEnd,
    boundary,
    activeSide: side,
    gridStep,
    margin,
    preferredAxisValue: preferredAxis,
    activeRouteIndex,
    surroundingRoutes,
    traceThickness: route.traceThickness,
  })

  if (searchedPath) {
    candidateRoutes.push(
      cloneRoute({
        ...route,
        route: dedupeRoutePoints([
          ...originalPoints.slice(0, firstIndex),
          ...searchedPath.slice(1),
          ...originalPoints.slice(lastIndex + 2),
        ]),
      }),
    )
  }

  let bestRoute = candidateRoutes[0] as HdRoute
  let bestScore = getRouteSafetyScore(bestRoute)

  for (const candidateRoute of candidateRoutes.slice(1)) {
    const score = getRouteSafetyScore(candidateRoute)
    if (!isScoreBetter(score, bestScore)) continue

    bestRoute = candidateRoute
    bestScore = score
  }

  return bestRoute
}
