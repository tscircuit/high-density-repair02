import { BOUNDARY_SIDES, EPSILON } from "../shared/constants"
import type { BoundaryRect, BoundarySide, HdRoute } from "../shared/types"
import { getRouteSideExposure } from "./getRouteSideExposure"

export const wouldIncreaseExposureOnOtherSides = (
  currentRoutes: HdRoute[],
  candidateRoutes: HdRoute[],
  candidateRouteIndexes: Set<number>,
  boundary: BoundaryRect,
  activeSide: BoundarySide,
  margin: number,
) =>
  Array.from(candidateRouteIndexes).some((index) => {
    const previousRoute = currentRoutes[index]
    const nextRoute = candidateRoutes[index]
    const otherSides = BOUNDARY_SIDES.filter((side) => side !== activeSide)

    return otherSides.some((otherSide) => {
      const previousExposure = getRouteSideExposure(
        previousRoute,
        boundary,
        otherSide,
        margin,
      )
      const nextExposure = getRouteSideExposure(
        nextRoute,
        boundary,
        otherSide,
        margin,
      )

      return nextExposure > previousExposure + EPSILON
    })
  })
