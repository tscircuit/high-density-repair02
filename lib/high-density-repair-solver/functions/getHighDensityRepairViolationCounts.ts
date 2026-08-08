import { TRACE_CLEARANCE_REGRESSION_MAX } from "../shared/constants"
import type { DatasetSample, HdRoute } from "../shared/types"
import { findClearanceConflicts } from "./findClearanceConflicts"
import { findInteriorDiagonalSegmentsInBufferZone } from "./findInteriorDiagonalSegmentsInBufferZone"
import { getBoundaryRect } from "./getBoundaryRect"

export interface HighDensityRepairViolationCounts {
  boundaryViolationCount: number
  traceViolationCount: number
  totalViolationCount: number
}

const getRouteNetNames = (route: HdRoute | undefined): string[] => {
  if (!route) return []
  const routeNetNames = [route.connectionName, route.rootConnectionName].filter(
    (routeNetName): routeNetName is string => Boolean(routeNetName),
  )
  return Array.from(new Set(routeNetNames))
}

const areRoutesSameNet = (
  firstRoute: HdRoute | undefined,
  secondRoute: HdRoute | undefined,
): boolean => {
  const firstRouteNetNames = getRouteNetNames(firstRoute)
  const secondRouteNetNames = getRouteNetNames(secondRoute)
  if (firstRouteNetNames.length === 0 || secondRouteNetNames.length === 0) {
    return false
  }
  return firstRouteNetNames.some((routeNetName) =>
    secondRouteNetNames.includes(routeNetName),
  )
}

export const getHighDensityRepairViolationCounts = ({
  nodeWithPortPoints,
  nodeHdRoutes,
  margin = 0.4,
  routeIndexesToCheck,
  includeViaViaViolations = false,
}: {
  nodeWithPortPoints: DatasetSample["nodeWithPortPoints"]
  nodeHdRoutes: HdRoute[]
  margin?: number
  routeIndexesToCheck?: number[]
  includeViaViaViolations?: boolean
}): HighDensityRepairViolationCounts => {
  const boundary = getBoundaryRect(nodeWithPortPoints)
  const boundaryViolationCount = boundary
    ? findInteriorDiagonalSegmentsInBufferZone(nodeHdRoutes, boundary, margin)
        .length
    : 0
  const movedRouteIndexes = new Set(
    routeIndexesToCheck ?? nodeHdRoutes.map((_, routeIndex) => routeIndex),
  )
  const traceViolationCount = findClearanceConflicts(
    nodeHdRoutes,
    movedRouteIndexes,
    TRACE_CLEARANCE_REGRESSION_MAX,
  ).filter(
    (conflict) =>
      (includeViaViaViolations ||
        !(conflict.layers[0] === "via" && conflict.layers[1] === "via")) &&
      !areRoutesSameNet(
        nodeHdRoutes[conflict.routeIndexes[0]],
        nodeHdRoutes[conflict.routeIndexes[1]],
      ),
  ).length

  return {
    boundaryViolationCount,
    traceViolationCount,
    totalViolationCount: boundaryViolationCount + traceViolationCount,
  }
}
