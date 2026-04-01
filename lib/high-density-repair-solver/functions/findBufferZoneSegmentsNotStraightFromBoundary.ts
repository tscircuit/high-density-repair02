import { BOUNDARY_SIDES, EPSILON } from "../shared/constants"
import type {
  BoundaryRect,
  BoundarySide,
  HdRoute,
  RoutePoint,
} from "../shared/types"

export interface BufferZoneDirectionHit {
  routeIndex: number
  connectionName: string
  segmentIndex: number
  touchedSides: BoundarySide[]
  overlapLength: number
  start: RoutePoint
  end: RoutePoint
}

const getSideStripBounds = (
  boundary: BoundaryRect,
  side: BoundarySide,
  margin: number,
) => {
  switch (side) {
    case "left":
      return {
        minX: boundary.minX,
        maxX: boundary.minX + margin,
        minY: boundary.minY,
        maxY: boundary.maxY,
      }
    case "right":
      return {
        minX: boundary.maxX - margin,
        maxX: boundary.maxX,
        minY: boundary.minY,
        maxY: boundary.maxY,
      }
    case "top":
      return {
        minX: boundary.minX,
        maxX: boundary.maxX,
        minY: boundary.maxY - margin,
        maxY: boundary.maxY,
      }
    case "bottom":
      return {
        minX: boundary.minX,
        maxX: boundary.maxX,
        minY: boundary.minY,
        maxY: boundary.minY + margin,
      }
  }
}

const getSegmentOverlapLengthWithRect = (
  start: RoutePoint,
  end: RoutePoint,
  rect: { minX: number; maxX: number; minY: number; maxY: number },
) => {
  const dx = end.x - start.x
  const dy = end.y - start.y

  let tMin = 0
  let tMax = 1

  const clip = (p: number, q: number) => {
    if (Math.abs(p) <= EPSILON) {
      return q >= -EPSILON
    }

    const r = q / p

    if (p < 0) {
      if (r > tMax) return false
      if (r > tMin) tMin = r
      return true
    }

    if (r < tMin) return false
    if (r < tMax) tMax = r
    return true
  }

  if (
    !clip(-dx, start.x - rect.minX) ||
    !clip(dx, rect.maxX - start.x) ||
    !clip(-dy, start.y - rect.minY) ||
    !clip(dy, rect.maxY - start.y)
  ) {
    return 0
  }

  const segmentLength = Math.hypot(dx, dy)
  return Math.max(0, tMax - tMin) * segmentLength
}

const isStraightFromSide = (
  start: RoutePoint,
  end: RoutePoint,
  side: BoundarySide,
) => {
  const dx = end.x - start.x
  const dy = end.y - start.y

  switch (side) {
    case "left":
    case "right":
      return Math.abs(dy) <= EPSILON && Math.abs(dx) > EPSILON
    case "top":
    case "bottom":
      return Math.abs(dx) <= EPSILON && Math.abs(dy) > EPSILON
  }
}

export const findBufferZoneSegmentsNotStraightFromBoundary = (
  routes: HdRoute[],
  boundary: BoundaryRect,
  margin: number,
): BufferZoneDirectionHit[] => {
  const hits: BufferZoneDirectionHit[] = []
  const acceptedOverlap = Math.min(0.1, margin / 4)

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

      const sideOverlaps = BOUNDARY_SIDES.map((side) => ({
        side,
        overlapLength: getSegmentOverlapLengthWithRect(
          start,
          end,
          getSideStripBounds(boundary, side, margin),
        ),
      })).filter(({ overlapLength }) => overlapLength > acceptedOverlap)

      if (sideOverlaps.length === 0) continue

      const touchedSides = sideOverlaps
        .filter(({ side }) => !isStraightFromSide(start, end, side))
        .map(({ side }) => side)

      if (touchedSides.length === 0) continue

      hits.push({
        routeIndex,
        connectionName:
          route.connectionName ??
          route.rootConnectionName ??
          `route-${routeIndex}`,
        segmentIndex,
        touchedSides,
        overlapLength: Math.max(
          ...sideOverlaps
            .filter(({ side }) => touchedSides.includes(side))
            .map(({ overlapLength }) => overlapLength),
        ),
        start,
        end,
      })
    }
  }

  return hits
}
