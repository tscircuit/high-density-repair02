import type { HdRoute, RouteGeometryCache } from "../shared/types"
import { findClearanceConflicts } from "./findClearanceConflicts"

export const findClearanceConflictPairs = (
  routes: HdRoute[],
  movedRouteIndexes: Set<number>,
  margin: number,
  geometryCache?: RouteGeometryCache,
): Array<[number, number]> =>
  findClearanceConflicts(routes, movedRouteIndexes, margin, geometryCache).map(
    ({ routeIndexes }) => routeIndexes,
  )
