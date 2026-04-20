import { BOUNDARY_SIDES, EPSILON } from "../shared/constants"
import { isPointInsideBoundary } from "./isPointInsideBoundary"
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

const getOutsideBoundarySides = (
  point: RoutePoint,
  boundary: BoundaryRect,
): BoundarySide[] => {
  const sides: BoundarySide[] = []

  if (point.x < boundary.minX - EPSILON) sides.push("left")
  if (point.x > boundary.maxX + EPSILON) sides.push("right")
  if (point.y > boundary.maxY + EPSILON) sides.push("top")
  if (point.y < boundary.minY - EPSILON) sides.push("bottom")

  return sides
}

const isSegmentParallelToSide = (
  start: RoutePoint,
  end: RoutePoint,
  side: BoundarySide,
) => {
  const dx = end.x - start.x
  const dy = end.y - start.y

  switch (side) {
    case "left":
    case "right":
      return (
        Math.abs(dx) <= EPSILON &&
        Math.abs(dy) > EPSILON
      )
    case "top":
    case "bottom":
      return (
        Math.abs(dy) <= EPSILON &&
        Math.abs(dx) > EPSILON
      )
  }
}

export const findInteriorDiagonalSegmentsInBufferZone = (
  routes: HdRoute[],
  boundary: BoundaryRect,
  margin: number,
): BufferZoneSegmentHit[] => {
  const hits: BufferZoneSegmentHit[] = []
  const effectiveMargin = Math.max(margin, EPSILON)
  const acceptedOverlap = Math.min(0.1, effectiveMargin / 4)

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

      const startOutsideSides = getOutsideBoundarySides(start, boundary)
      const endOutsideSides = getOutsideBoundarySides(end, boundary)
      const startSides = getBoundarySides(start, boundary)
      const endSides = getBoundarySides(end, boundary)
      const touchedSides = BOUNDARY_SIDES.filter((side) => {
        const overlapLength = getSegmentOverlapLengthWithRect(
          start,
          end,
          getSideStripBounds(boundary, side, effectiveMargin),
        )
        if (overlapLength <= acceptedOverlap) return false
        if (!isSegmentParallelToSide(start, end, side)) return false
        return true
      })
      const pointOutsideBoundary =
        !isPointInsideBoundary(start, boundary) ||
        !isPointInsideBoundary(end, boundary)
      const violationSides = Array.from(
        new Set([...touchedSides, ...startOutsideSides, ...endOutsideSides]),
      )
      if (!pointOutsideBoundary && violationSides.length === 0) continue

      hits.push({
        routeIndex,
        connectionName:
          route.connectionName ??
          route.rootConnectionName ??
          `route-${routeIndex}`,
        segmentIndex,
        touchedSides: violationSides,
        startSides,
        endSides,
        start,
        end,
      })
    }
  }

  return hits
}
