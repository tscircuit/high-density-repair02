import { BOUNDARY_SIDES, EPSILON } from "../shared/constants"
import type { BoundaryRect, BoundarySide, HdRoute } from "../shared/types"
import { getRouteInteriorSideClearance } from "./getRouteInteriorSideClearance"

export type BoundaryTouchRegression = {
  routeIndex: number
  side: BoundarySide
  previousClearance: number
  nextClearance: number
}

export const findBoundaryTouchRegressions = ({
  currentRoutes,
  candidateRoutes,
  candidateRouteIndexes,
  boundary,
  activeSide,
}: {
  currentRoutes: HdRoute[]
  candidateRoutes: HdRoute[]
  candidateRouteIndexes: Set<number>
  boundary: BoundaryRect
  activeSide: BoundarySide
}): BoundaryTouchRegression[] => {
  const otherSides = BOUNDARY_SIDES.filter((side) => side !== activeSide)
  const regressions: BoundaryTouchRegression[] = []

  for (const routeIndex of candidateRouteIndexes) {
    const previousRoute = currentRoutes[routeIndex]
    const nextRoute = candidateRoutes[routeIndex]
    if (!previousRoute || !nextRoute) continue

    for (const side of otherSides) {
      const previousClearance = getRouteInteriorSideClearance(
        previousRoute,
        boundary,
        side,
      )
      const nextClearance = getRouteInteriorSideClearance(
        nextRoute,
        boundary,
        side,
      )

      if (previousClearance > EPSILON && nextClearance <= EPSILON) {
        regressions.push({
          routeIndex,
          side,
          previousClearance,
          nextClearance,
        })
      }
    }
  }

  return regressions
}
