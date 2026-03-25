import { DEFAULT_TRACE_THICKNESS, EPSILON } from "../shared/constants"
import type { HdRoute } from "../shared/types"
import { distancePointToSegment } from "./distancePointToSegment"
import { getRouteSegments } from "./getRouteSegments"
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
): ClearanceConflict[] => {
  const segments = routes.flatMap((route, routeIndex) =>
    getRouteSegments(route, routeIndex),
  )
  const vias = routes.flatMap((route, routeIndex) =>
    (route.vias ?? []).map((via) => ({
      center: { x: via.x, y: via.y },
      radius:
        (via.diameter ?? route.viaDiameter ?? DEFAULT_TRACE_THICKNESS * 2) / 2,
      routeIndex,
    })),
  )
  const conflicts = new Map<string, ClearanceConflict>()

  for (let index = 0; index < segments.length; index += 1) {
    const first = segments[index]

    for (
      let otherIndex = index + 1;
      otherIndex < segments.length;
      otherIndex += 1
    ) {
      const second = segments[otherIndex]

      if (first.routeIndex === second.routeIndex) continue
      if (first.layer !== second.layer) continue
      if (
        !movedRouteIndexes.has(first.routeIndex) &&
        !movedRouteIndexes.has(second.routeIndex)
      ) {
        continue
      }
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

  for (const segment of segments) {
    for (const via of vias) {
      if (segment.routeIndex === via.routeIndex) continue
      if (
        !movedRouteIndexes.has(segment.routeIndex) &&
        !movedRouteIndexes.has(via.routeIndex)
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

  for (let index = 0; index < vias.length; index += 1) {
    const first = vias[index]

    for (
      let otherIndex = index + 1;
      otherIndex < vias.length;
      otherIndex += 1
    ) {
      const second = vias[otherIndex]

      if (first.routeIndex === second.routeIndex) continue
      if (
        !movedRouteIndexes.has(first.routeIndex) &&
        !movedRouteIndexes.has(second.routeIndex)
      ) {
        continue
      }

      const minDistanceAllowed = margin + first.radius + second.radius - EPSILON
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

  return Array.from(conflicts.values())
}
