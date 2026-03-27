import { BOUNDARY_SIDES } from "../shared/constants"
import type { BoundaryRect, BoundarySide, HdRoute } from "../shared/types"
import { getRouteSideContactState } from "./getRouteSideContactState"

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
      const previousContactState = getRouteSideContactState(
        previousRoute,
        boundary,
        otherSide,
        margin,
      )
      const nextContactState = getRouteSideContactState(
        nextRoute,
        boundary,
        otherSide,
        margin,
      )

      return previousContactState === "none" && nextContactState !== "none"
    })
  })
