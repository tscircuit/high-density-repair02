import { BOUNDARY_SIDES, EPSILON } from "../shared/constants"
import type {
  BoundaryRect,
  BoundarySide,
  HdRoute,
  RoutePoint,
} from "../shared/types"

export interface BufferZoneSegmentHit {
  routeIndex: number
  connectionName: string
  segmentIndex: number
  touchedSides: BoundarySide[]
  startSides: BoundarySide[]
  endSides: BoundarySide[]
  start: RoutePoint
  end: RoutePoint
}

const getBoundarySides = (
  point: RoutePoint,
  boundary: BoundaryRect,
): BoundarySide[] =>
  BOUNDARY_SIDES.filter((side) => {
    switch (side) {
      case "left":
        return Math.abs(point.x - boundary.minX) <= EPSILON
      case "right":
        return Math.abs(point.x - boundary.maxX) <= EPSILON
      case "top":
        return Math.abs(point.y - boundary.maxY) <= EPSILON
      case "bottom":
        return Math.abs(point.y - boundary.minY) <= EPSILON
    }

    return false
  })

const segmentOverlapsBoundarySide = (
  start: RoutePoint,
  end: RoutePoint,
  boundary: BoundaryRect,
  side: BoundarySide,
) => {
  switch (side) {
    case "left":
      return (
        Math.abs(start.x - boundary.minX) <= EPSILON &&
        Math.abs(end.x - boundary.minX) <= EPSILON &&
        Math.abs(end.y - start.y) > EPSILON
      )
    case "right":
      return (
        Math.abs(start.x - boundary.maxX) <= EPSILON &&
        Math.abs(end.x - boundary.maxX) <= EPSILON &&
        Math.abs(end.y - start.y) > EPSILON
      )
    case "top":
      return (
        Math.abs(start.y - boundary.maxY) <= EPSILON &&
        Math.abs(end.y - boundary.maxY) <= EPSILON &&
        Math.abs(end.x - start.x) > EPSILON
      )
    case "bottom":
      return (
        Math.abs(start.y - boundary.minY) <= EPSILON &&
        Math.abs(end.y - boundary.minY) <= EPSILON &&
        Math.abs(end.x - start.x) > EPSILON
      )
  }
}

export const findInteriorDiagonalSegmentsInBufferZone = (
  routes: HdRoute[],
  boundary: BoundaryRect,
  _margin: number,
): BufferZoneSegmentHit[] => {
  const hits: BufferZoneSegmentHit[] = []

  for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
    const route = routes[routeIndex]
    const points = route?.route ?? []

    for (
      let segmentIndex = 0;
      segmentIndex < points.length - 1;
      segmentIndex += 1
    ) {
      const start = points[segmentIndex]
      const end = points[segmentIndex + 1]
      if (!start || !end) continue

      const startSides = getBoundarySides(start, boundary)
      const endSides = getBoundarySides(end, boundary)
      const touchedSides = BOUNDARY_SIDES.filter((side) =>
        segmentOverlapsBoundarySide(start, end, boundary, side),
      )
      if (touchedSides.length === 0) continue

      hits.push({
        routeIndex,
        connectionName:
          route.connectionName ??
          route.rootConnectionName ??
          `route-${routeIndex}`,
        segmentIndex,
        touchedSides,
        startSides,
        endSides,
        start,
        end,
      })
    }
  }

  return hits
}
