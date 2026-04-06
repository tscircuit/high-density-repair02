import type { HdRoute, RouteGeometryCache } from "../shared/types"
import { findClearanceConflicts } from "./findClearanceConflicts"
import { getRoutePushableIndexes } from "./getRoutePushableIndexes"

const getConflictKey = (
  routeIndexes: [number, number],
  layers: ["top" | "bottom" | "via", "top" | "bottom" | "via"],
) => `${routeIndexes[0]}:${layers[0]}:${routeIndexes[1]}:${layers[1]}`

export const findNewUnpushableZeroClearanceConflicts = ({
  currentRoutes,
  candidateRoutes,
  candidateRouteIndexes,
  geometryCache,
}: {
  currentRoutes: HdRoute[]
  candidateRoutes: HdRoute[]
  candidateRouteIndexes: Set<number>
  geometryCache?: RouteGeometryCache
}) => {
  const currentConflictKeys = new Set(
    findClearanceConflicts(
      currentRoutes,
      candidateRouteIndexes,
      0,
      geometryCache,
    ).map((conflict) => getConflictKey(conflict.routeIndexes, conflict.layers)),
  )

  return findClearanceConflicts(
    candidateRoutes,
    candidateRouteIndexes,
    0,
    geometryCache,
  ).filter((conflict) => {
    const conflictKey = getConflictKey(conflict.routeIndexes, conflict.layers)
    if (currentConflictKeys.has(conflictKey)) return false

    const [firstRouteIndex, secondRouteIndex] = conflict.routeIndexes
    const [firstLayer, secondLayer] = conflict.layers
    const firstMoved = candidateRouteIndexes.has(firstRouteIndex)
    const secondMoved = candidateRouteIndexes.has(secondRouteIndex)

    if (firstMoved && secondMoved) {
      return false
    }

    const fixedRouteIndex = firstMoved ? secondRouteIndex : firstRouteIndex
    const fixedLayer = firstMoved ? secondLayer : firstLayer
    const fixedRoute = candidateRoutes[fixedRouteIndex]
    if (!fixedRoute) return false

    return getRoutePushableIndexes(fixedRoute, [fixedLayer]).length === 0
  })
}
