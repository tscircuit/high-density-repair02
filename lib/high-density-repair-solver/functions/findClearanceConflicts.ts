import { EPSILON } from "../shared/constants"
import type {
  HdRoute,
  RouteGeometry,
  RouteGeometryCache,
  RouteVia,
  Segment,
  XY,
} from "../shared/types"
import { distancePointToSegment } from "./distancePointToSegment"
import { getRouteGeometry } from "./getRouteGeometry"
import { segmentDistance } from "./segmentDistance"
import { segmentsShareEndpoint } from "./segmentsShareEndpoint"

type ConflictLayer = "top" | "bottom" | "via"

export type ClearanceConflict = {
  routeIndexes: [number, number]
  layers: [ConflictLayer, ConflictLayer]
}

const conflictKey = (
  firstRouteIndex: number,
  firstLayer: ConflictLayer,
  secondRouteIndex: number,
  secondLayer: ConflictLayer,
) =>
  firstRouteIndex < secondRouteIndex
    ? `${firstRouteIndex}:${firstLayer}:${secondRouteIndex}:${secondLayer}`
    : `${secondRouteIndex}:${secondLayer}:${firstRouteIndex}:${firstLayer}`

const pushConflict = (
  conflicts: Map<string, ClearanceConflict>,
  firstRouteIndex: number,
  firstLayer: ConflictLayer,
  secondRouteIndex: number,
  secondLayer: ConflictLayer,
) => {
  const key = conflictKey(
    firstRouteIndex,
    firstLayer,
    secondRouteIndex,
    secondLayer,
  )

  if (conflicts.has(key)) return

  if (firstRouteIndex < secondRouteIndex) {
    conflicts.set(key, {
      routeIndexes: [firstRouteIndex, secondRouteIndex],
      layers: [firstLayer, secondLayer],
    })
    return
  }

  conflicts.set(key, {
    routeIndexes: [secondRouteIndex, firstRouteIndex],
    layers: [secondLayer, firstLayer],
  })
}

const boundsOverlap = (
  first: RouteGeometry["bounds"],
  second: RouteGeometry["bounds"],
  margin: number,
) =>
  first.minX - margin <= second.maxX &&
  first.maxX + margin >= second.minX &&
  first.minY - margin <= second.maxY &&
  first.maxY + margin >= second.minY

const segmentBoxesOverlap = (
  first: Segment,
  second: Segment,
  margin: number,
) => {
  const firstHalfThickness = first.thickness / 2
  const secondHalfThickness = second.thickness / 2
  const minDistanceAllowed =
    margin + firstHalfThickness + secondHalfThickness - EPSILON

  const firstMinX =
    Math.min(first.start.x, first.end.x) - firstHalfThickness - margin
  const firstMaxX =
    Math.max(first.start.x, first.end.x) + firstHalfThickness + margin
  const firstMinY =
    Math.min(first.start.y, first.end.y) - firstHalfThickness - margin
  const firstMaxY =
    Math.max(first.start.y, first.end.y) + firstHalfThickness + margin
  const secondMinX =
    Math.min(second.start.x, second.end.x) - secondHalfThickness
  const secondMaxX =
    Math.max(second.start.x, second.end.x) + secondHalfThickness
  const secondMinY =
    Math.min(second.start.y, second.end.y) - secondHalfThickness
  const secondMaxY =
    Math.max(second.start.y, second.end.y) + secondHalfThickness

  return (
    firstMinX <= secondMaxX &&
    firstMaxX >= secondMinX &&
    firstMinY <= secondMaxY &&
    firstMaxY >= secondMinY &&
    minDistanceAllowed > 0
  )
}

const pointBoxOverlapsSegment = (
  point: XY,
  radius: number,
  segment: Segment,
  margin: number,
) => {
  const minDistanceAllowed = margin + segment.thickness / 2 + radius - EPSILON
  const pointMinX = point.x - minDistanceAllowed
  const pointMaxX = point.x + minDistanceAllowed
  const pointMinY = point.y - minDistanceAllowed
  const pointMaxY = point.y + minDistanceAllowed
  const segmentHalfThickness = segment.thickness / 2
  const segmentMinX =
    Math.min(segment.start.x, segment.end.x) - segmentHalfThickness
  const segmentMaxX =
    Math.max(segment.start.x, segment.end.x) + segmentHalfThickness
  const segmentMinY =
    Math.min(segment.start.y, segment.end.y) - segmentHalfThickness
  const segmentMaxY =
    Math.max(segment.start.y, segment.end.y) + segmentHalfThickness

  return (
    pointMinX <= segmentMaxX &&
    pointMaxX >= segmentMinX &&
    pointMinY <= segmentMaxY &&
    pointMaxY >= segmentMinY
  )
}

const viaBoxesOverlap = (first: RouteVia, second: RouteVia, margin: number) => {
  const minDistanceAllowed = margin + first.radius + second.radius - EPSILON

  return (
    Math.abs(first.center.x - second.center.x) <= minDistanceAllowed &&
    Math.abs(first.center.y - second.center.y) <= minDistanceAllowed
  )
}

export const findClearanceConflicts = (
  routes: HdRoute[],
  movedRouteIndexes: Set<number>,
  margin: number,
  geometryCache?: RouteGeometryCache,
): ClearanceConflict[] => {
  const routeGeometries = routes.map((route, routeIndex) =>
    getRouteGeometry(route, routeIndex, geometryCache),
  )
  const conflicts = new Map<string, ClearanceConflict>()

  if (movedRouteIndexes.size === 0) {
    return []
  }

  const movedIndexes = Array.from(movedRouteIndexes)

  const nearbyRouteIndexesByMovedRoute = new Map<number, number[]>()

  const getNearbyRouteIndexes = (movedRouteIndex: number) => {
    const cachedRouteIndexes =
      nearbyRouteIndexesByMovedRoute.get(movedRouteIndex)
    if (cachedRouteIndexes) {
      return cachedRouteIndexes
    }

    const movedGeometry = routeGeometries[movedRouteIndex]
    if (!movedGeometry) return []

    const nearbyRouteIndexes: number[] = []

    for (
      let otherRouteIndex = 0;
      otherRouteIndex < routeGeometries.length;
      otherRouteIndex += 1
    ) {
      if (otherRouteIndex === movedRouteIndex) continue
      const otherGeometry = routeGeometries[otherRouteIndex]
      if (!otherGeometry) continue
      if (!boundsOverlap(movedGeometry.bounds, otherGeometry.bounds, margin)) {
        continue
      }

      nearbyRouteIndexes.push(otherRouteIndex)
    }

    nearbyRouteIndexesByMovedRoute.set(movedRouteIndex, nearbyRouteIndexes)

    return nearbyRouteIndexes
  }

  for (const movedRouteIndex of movedIndexes) {
    const movedGeometry = routeGeometries[movedRouteIndex]
    if (!movedGeometry) continue
    const nearbyRouteIndexes = getNearbyRouteIndexes(movedRouteIndex)

    for (const first of movedGeometry.segments) {
      for (const otherRouteIndex of nearbyRouteIndexes) {
        if (
          movedRouteIndex > otherRouteIndex &&
          movedRouteIndexes.has(otherRouteIndex)
        ) {
          continue
        }

        const otherGeometry = routeGeometries[otherRouteIndex]
        if (!otherGeometry) continue

        for (const second of otherGeometry.segments) {
          if (first.layer !== second.layer) continue
          if (segmentsShareEndpoint(first, second)) continue
          if (!segmentBoxesOverlap(first, second, margin)) continue

          const minDistanceAllowed =
            margin + (first.thickness + second.thickness) / 2 - EPSILON
          const actualDistance = segmentDistance(
            first.start,
            first.end,
            second.start,
            second.end,
          )

          if (actualDistance < minDistanceAllowed) {
            pushConflict(
              conflicts,
              first.routeIndex,
              first.layer,
              second.routeIndex,
              second.layer,
            )
          }
        }
      }
    }
  }

  for (const movedRouteIndex of movedIndexes) {
    const movedGeometry = routeGeometries[movedRouteIndex]
    if (!movedGeometry) continue
    const nearbyRouteIndexes = getNearbyRouteIndexes(movedRouteIndex)

    for (const via of movedGeometry.vias) {
      for (const otherRouteIndex of nearbyRouteIndexes) {
        if (
          movedRouteIndex > otherRouteIndex &&
          movedRouteIndexes.has(otherRouteIndex)
        ) {
          continue
        }

        const otherGeometry = routeGeometries[otherRouteIndex]
        if (!otherGeometry) continue

        for (const segment of otherGeometry.segments) {
          if (
            !pointBoxOverlapsSegment(via.center, via.radius, segment, margin)
          ) {
            continue
          }

          const minDistanceAllowed =
            margin + segment.thickness / 2 + via.radius - EPSILON
          const actualDistance = distancePointToSegment(
            via.center,
            segment.start,
            segment.end,
          )

          if (actualDistance < minDistanceAllowed) {
            pushConflict(
              conflicts,
              segment.routeIndex,
              segment.layer,
              via.routeIndex,
              "via",
            )
          }
        }
      }
    }
  }

  for (const movedRouteIndex of movedIndexes) {
    const movedGeometry = routeGeometries[movedRouteIndex]
    if (!movedGeometry) continue
    const nearbyRouteIndexes = getNearbyRouteIndexes(movedRouteIndex)

    for (const segment of movedGeometry.segments) {
      for (const otherRouteIndex of nearbyRouteIndexes) {
        const otherGeometry = routeGeometries[otherRouteIndex]
        if (!otherGeometry) continue

        for (const via of otherGeometry.vias) {
          if (
            !pointBoxOverlapsSegment(via.center, via.radius, segment, margin)
          ) {
            continue
          }

          const minDistanceAllowed =
            margin + segment.thickness / 2 + via.radius - EPSILON
          const actualDistance = distancePointToSegment(
            via.center,
            segment.start,
            segment.end,
          )

          if (actualDistance < minDistanceAllowed) {
            pushConflict(
              conflicts,
              segment.routeIndex,
              segment.layer,
              via.routeIndex,
              "via",
            )
          }
        }
      }
    }
  }

  for (const movedRouteIndex of movedIndexes) {
    const movedGeometry = routeGeometries[movedRouteIndex]
    if (!movedGeometry) continue
    const nearbyRouteIndexes = getNearbyRouteIndexes(movedRouteIndex)

    for (const first of movedGeometry.vias) {
      for (const otherRouteIndex of nearbyRouteIndexes) {
        if (
          movedRouteIndex > otherRouteIndex &&
          movedRouteIndexes.has(otherRouteIndex)
        ) {
          continue
        }

        const otherGeometry = routeGeometries[otherRouteIndex]
        if (!otherGeometry) continue

        for (const second of otherGeometry.vias) {
          if (!viaBoxesOverlap(first, second, margin)) continue

          const minDistanceAllowed =
            margin + first.radius + second.radius - EPSILON
          const actualDistance = Math.hypot(
            first.center.x - second.center.x,
            first.center.y - second.center.y,
          )

          if (actualDistance < minDistanceAllowed) {
            pushConflict(
              conflicts,
              first.routeIndex,
              "via",
              second.routeIndex,
              "via",
            )
          }
        }
      }
    }
  }

  return Array.from(conflicts.values())
}
