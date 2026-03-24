import { EPSILON } from "../shared/constants"
import type { HdRoute } from "../shared/types"
import { getRouteSegments } from "./getRouteSegments"
import { segmentDistance } from "./segmentDistance"
import { segmentsShareEndpoint } from "./segmentsShareEndpoint"

export const findConflictingRouteIndexes = (
  routes: HdRoute[],
  movedRouteIndexes: Set<number>,
) => {
  const allSegments = routes.flatMap((route, routeIndex) =>
    getRouteSegments(route, routeIndex),
  )
  const conflicts = new Set<number>()

  for (let index = 0; index < allSegments.length; index += 1) {
    const first = allSegments[index]

    for (
      let otherIndex = index + 1;
      otherIndex < allSegments.length;
      otherIndex += 1
    ) {
      const second = allSegments[otherIndex]

      if (first.routeIndex === second.routeIndex) continue
      if (first.layer !== second.layer) continue

      const firstMoved = movedRouteIndexes.has(first.routeIndex)
      const secondMoved = movedRouteIndexes.has(second.routeIndex)
      if (!firstMoved && !secondMoved) continue
      if (segmentsShareEndpoint(first, second)) continue

      const minDistanceAllowed =
        (first.thickness + second.thickness) / 2 - EPSILON
      const actualDistance = segmentDistance(
        first.start,
        first.end,
        second.start,
        second.end,
      )

      if (actualDistance < minDistanceAllowed) {
        conflicts.add(first.routeIndex)
        conflicts.add(second.routeIndex)
      }
    }
  }

  return conflicts
}
