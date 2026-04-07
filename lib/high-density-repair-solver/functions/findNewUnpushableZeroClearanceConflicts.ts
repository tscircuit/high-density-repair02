import type { HdRoute, RouteGeometryCache } from "../shared/types"
import {
  findClearanceConflicts,
  type ClearanceConflict,
} from "./findClearanceConflicts"
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
  currentConflicts,
  candidateConflicts,
}: {
  currentRoutes: HdRoute[]
  candidateRoutes: HdRoute[]
  candidateRouteIndexes: Set<number>
  geometryCache?: RouteGeometryCache
  currentConflicts?: ClearanceConflict[]
  candidateConflicts?: ClearanceConflict[]
}) => {
  const currentZeroConflicts =
    currentConflicts ??
    findClearanceConflicts(
      currentRoutes,
      candidateRouteIndexes,
      0,
      geometryCache,
    )

  const candidateZeroConflicts =
    candidateConflicts ??
    findClearanceConflicts(
      candidateRoutes,
      candidateRouteIndexes,
      0,
      geometryCache,
    )

  const currentConflictKeys = new Set(
    currentZeroConflicts.map((conflict) =>
      getConflictKey(conflict.routeIndexes, conflict.layers),
    ),
  )

  return candidateZeroConflicts.filter((conflict) => {
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
