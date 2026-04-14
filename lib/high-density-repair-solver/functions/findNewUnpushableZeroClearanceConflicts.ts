import type { HdRoute, RouteGeometryCache } from "../shared/types"
import {
  findClearanceConflicts,
  getClearanceConflictKey,
  type ClearanceConflict,
} from "./findClearanceConflicts"
import { getRoutePushableIndexes } from "./getRoutePushableIndexes"

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
    currentZeroConflicts.map((conflict) => getClearanceConflictKey(conflict)),
  )

  return candidateZeroConflicts.filter((conflict) => {
    const conflictKey = getClearanceConflictKey(conflict)
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
