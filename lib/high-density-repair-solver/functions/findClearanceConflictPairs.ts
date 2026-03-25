import type { HdRoute } from "../shared/types"
import { findClearanceConflicts } from "./findClearanceConflicts"

export const findClearanceConflictPairs = (
  routes: HdRoute[],
  movedRouteIndexes: Set<number>,
  margin: number,
): Array<[number, number]> =>
  findClearanceConflicts(routes, movedRouteIndexes, margin).map(
    ({ routeIndexes }) => routeIndexes,
  )
