import { EPSILON } from "../shared/constants"
import type { HdRoute, RouteGeometryCache } from "../shared/types"
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

  for (const movedRouteIndex of movedIndexes) {
    const movedGeometry = routeGeometries[movedRouteIndex]
    if (!movedGeometry) continue

    for (const first of movedGeometry.segments) {
      for (
        let otherRouteIndex = 0;
        otherRouteIndex < routeGeometries.length;
        otherRouteIndex += 1
      ) {
        if (otherRouteIndex === movedRouteIndex) continue
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

    for (const via of movedGeometry.vias) {
      for (
        let otherRouteIndex = 0;
        otherRouteIndex < routeGeometries.length;
        otherRouteIndex += 1
      ) {
        if (otherRouteIndex === movedRouteIndex) continue
        if (
          movedRouteIndex > otherRouteIndex &&
          movedRouteIndexes.has(otherRouteIndex)
        ) {
          continue
        }

        const otherGeometry = routeGeometries[otherRouteIndex]
        if (!otherGeometry) continue

        for (const segment of otherGeometry.segments) {
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

    for (const segment of movedGeometry.segments) {
      for (
        let otherRouteIndex = 0;
        otherRouteIndex < routeGeometries.length;
        otherRouteIndex += 1
      ) {
        if (otherRouteIndex === movedRouteIndex) continue
        const otherGeometry = routeGeometries[otherRouteIndex]
        if (!otherGeometry) continue

        for (const via of otherGeometry.vias) {
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

    for (const first of movedGeometry.vias) {
      for (
        let otherRouteIndex = 0;
        otherRouteIndex < routeGeometries.length;
        otherRouteIndex += 1
      ) {
        if (otherRouteIndex === movedRouteIndex) continue
        if (
          movedRouteIndex > otherRouteIndex &&
          movedRouteIndexes.has(otherRouteIndex)
        ) {
          continue
        }

        const otherGeometry = routeGeometries[otherRouteIndex]
        if (!otherGeometry) continue

        for (const second of otherGeometry.vias) {
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
