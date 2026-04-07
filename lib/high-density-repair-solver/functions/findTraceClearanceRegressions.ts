import { EPSILON } from "../shared/constants"
import type {
  HdRoute,
  RouteGeometry,
  RouteGeometryCache,
} from "../shared/types"
import { getRouteGeometry } from "./getRouteGeometry"
import { segmentDistance } from "./segmentDistance"

export type TraceClearanceRegression = {
  routeIndexes: [number, number]
  previousClearance: number
  nextClearance: number
}

const boundsMayHaveClearanceAtMost = (
  firstBounds: RouteGeometry["bounds"],
  secondBounds: RouteGeometry["bounds"],
  maximumAllowedClearance: number,
) => {
  const dx = Math.max(
    0,
    firstBounds.minX - secondBounds.maxX,
    secondBounds.minX - firstBounds.maxX,
  )
  const dy = Math.max(
    0,
    firstBounds.minY - secondBounds.maxY,
    secondBounds.minY - firstBounds.maxY,
  )

  return Math.hypot(dx, dy) <= maximumAllowedClearance + EPSILON
}

const getPairMinimumEdgeClearance = (
  firstGeometry: RouteGeometry,
  secondGeometry: RouteGeometry,
) => {
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
  const movedRouteIndexes = Array.from(candidateRouteIndexes).sort(
    (a, b) => a - b,
  )
  const currentGeometries = currentRoutes.map((route, routeIndex) =>
    getRouteGeometry(route as HdRoute, routeIndex, currentCache),
  )
  const candidateGeometries = candidateRoutes.map((route, routeIndex) =>
    getRouteGeometry(route as HdRoute, routeIndex, candidateCache),
  )
  const visitedPairKeys = new Set<string>()

  for (const movedRouteIndex of movedRouteIndexes) {
    for (
      let otherRouteIndex = 0;
      otherRouteIndex < candidateRoutes.length;
      otherRouteIndex += 1
    ) {
      if (otherRouteIndex === movedRouteIndex) {
        continue
      }

      const firstRouteIndex = Math.min(movedRouteIndex, otherRouteIndex)
      const secondRouteIndex = Math.max(movedRouteIndex, otherRouteIndex)
      const pairKey = `${firstRouteIndex}:${secondRouteIndex}`

      if (visitedPairKeys.has(pairKey)) {
        continue
      }
      visitedPairKeys.add(pairKey)

      const candidateFirstGeometry = candidateGeometries[firstRouteIndex]
      const candidateSecondGeometry = candidateGeometries[secondRouteIndex]

      if (
        !candidateFirstGeometry ||
        !candidateSecondGeometry ||
        !boundsMayHaveClearanceAtMost(
          candidateFirstGeometry.bounds,
          candidateSecondGeometry.bounds,
          maximumAllowedClearance,
        )
      ) {
        continue
      }

      const nextClearance = getPairMinimumEdgeClearance(
        candidateFirstGeometry,
        candidateSecondGeometry,
      )

      if (
        !Number.isFinite(nextClearance) ||
        nextClearance > maximumAllowedClearance + EPSILON ||
        !currentGeometries[firstRouteIndex] ||
        !currentGeometries[secondRouteIndex]
      ) {
        continue
      }

      const previousClearance = getPairMinimumEdgeClearance(
        currentGeometries[firstRouteIndex] as RouteGeometry,
        currentGeometries[secondRouteIndex] as RouteGeometry,
      )

      if (
        !Number.isFinite(previousClearance) ||
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
