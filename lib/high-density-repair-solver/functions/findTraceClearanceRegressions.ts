import { EPSILON } from "../shared/constants"
import type { HdRoute, RouteGeometryCache } from "../shared/types"
import { getRouteGeometry } from "./getRouteGeometry"
import { segmentDistance } from "./segmentDistance"

export type TraceClearanceRegression = {
  routeIndexes: [number, number]
  previousClearance: number
  nextClearance: number
}

const getPairMinimumEdgeClearance = (
  routes: HdRoute[],
  firstRouteIndex: number,
  secondRouteIndex: number,
  cache?: RouteGeometryCache,
) => {
  const firstGeometry = getRouteGeometry(
    routes[firstRouteIndex] as HdRoute,
    firstRouteIndex,
    cache,
  )
  const secondGeometry = getRouteGeometry(
    routes[secondRouteIndex] as HdRoute,
    secondRouteIndex,
    cache,
  )
  let minimumClearance = Number.POSITIVE_INFINITY

  for (const firstSegment of firstGeometry.segments) {
    for (const secondSegment of secondGeometry.segments) {
      if (firstSegment.layer !== secondSegment.layer) continue

      const edgeClearance =
        segmentDistance(
          firstSegment.start,
          firstSegment.end,
          secondSegment.start,
          secondSegment.end,
        ) -
        (firstSegment.thickness + secondSegment.thickness) / 2

      minimumClearance = Math.min(minimumClearance, edgeClearance)
    }
  }

  return minimumClearance
}

export const findTraceClearanceRegressions = ({
  currentRoutes,
  candidateRoutes,
  candidateRouteIndexes,
  maximumAllowedClearance,
}: {
  currentRoutes: HdRoute[]
  candidateRoutes: HdRoute[]
  candidateRouteIndexes: Set<number>
  maximumAllowedClearance: number
}) => {
  const currentCache = new WeakMap()
  const candidateCache = new WeakMap()
  const regressions: TraceClearanceRegression[] = []

  for (
    let firstRouteIndex = 0;
    firstRouteIndex < candidateRoutes.length;
    firstRouteIndex += 1
  ) {
    for (
      let secondRouteIndex = firstRouteIndex + 1;
      secondRouteIndex < candidateRoutes.length;
      secondRouteIndex += 1
    ) {
      if (
        !candidateRouteIndexes.has(firstRouteIndex) &&
        !candidateRouteIndexes.has(secondRouteIndex)
      ) {
        continue
      }

      const previousClearance = getPairMinimumEdgeClearance(
        currentRoutes,
        firstRouteIndex,
        secondRouteIndex,
        currentCache,
      )
      const nextClearance = getPairMinimumEdgeClearance(
        candidateRoutes,
        firstRouteIndex,
        secondRouteIndex,
        candidateCache,
      )

      if (
        !Number.isFinite(previousClearance) ||
        !Number.isFinite(nextClearance) ||
        nextClearance > maximumAllowedClearance + EPSILON ||
        nextClearance >= previousClearance - EPSILON
      ) {
        continue
      }

      regressions.push({
        routeIndexes: [firstRouteIndex, secondRouteIndex],
        previousClearance,
        nextClearance,
      })
    }
  }

  return regressions
}
