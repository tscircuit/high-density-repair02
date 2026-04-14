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
  routePointIndexes: [number[], number[]]
}

const conflictKey = (
  firstRouteIndex: number,
  firstLayer: ConflictLayer,
  secondRouteIndex: number,
  secondLayer: ConflictLayer,
  firstRoutePointIndexes: number[],
  secondRoutePointIndexes: number[],
) =>
  firstRouteIndex < secondRouteIndex
    ? `${firstRouteIndex}:${firstLayer}:${firstRoutePointIndexes.join(",")}:${secondRouteIndex}:${secondLayer}:${secondRoutePointIndexes.join(",")}`
    : `${secondRouteIndex}:${secondLayer}:${secondRoutePointIndexes.join(",")}:${firstRouteIndex}:${firstLayer}:${firstRoutePointIndexes.join(",")}`

export const getClearanceConflictKey = ({
  routeIndexes,
  layers,
  routePointIndexes,
}: ClearanceConflict) =>
  `${routeIndexes[0]}:${layers[0]}:${routePointIndexes[0].join(",")}:${routeIndexes[1]}:${layers[1]}:${routePointIndexes[1].join(",")}`

const pushConflict = (
  conflicts: Map<string, ClearanceConflict>,
  firstRouteIndex: number,
  firstLayer: ConflictLayer,
  secondRouteIndex: number,
  secondLayer: ConflictLayer,
  firstRoutePointIndexes: number[],
  secondRoutePointIndexes: number[],
) => {
  const key = conflictKey(
    firstRouteIndex,
    firstLayer,
    secondRouteIndex,
    secondLayer,
    firstRoutePointIndexes,
    secondRoutePointIndexes,
  )

  const existingConflict = conflicts.get(key)
  if (existingConflict) {
    const [firstPointIndexes, secondPointIndexes] =
      firstRouteIndex < secondRouteIndex
        ? [firstRoutePointIndexes, secondRoutePointIndexes]
        : [secondRoutePointIndexes, firstRoutePointIndexes]

    for (const index of firstPointIndexes) {
      if (!existingConflict.routePointIndexes[0].includes(index)) {
        existingConflict.routePointIndexes[0].push(index)
      }
    }

    for (const index of secondPointIndexes) {
      if (!existingConflict.routePointIndexes[1].includes(index)) {
        existingConflict.routePointIndexes[1].push(index)
      }
    }

    existingConflict.routePointIndexes[0].sort((a, b) => a - b)
    existingConflict.routePointIndexes[1].sort((a, b) => a - b)
    return
  }

  if (firstRouteIndex < secondRouteIndex) {
    conflicts.set(key, {
      routeIndexes: [firstRouteIndex, secondRouteIndex],
      layers: [firstLayer, secondLayer],
      routePointIndexes: [
        [...new Set(firstRoutePointIndexes)].sort((a, b) => a - b),
        [...new Set(secondRoutePointIndexes)].sort((a, b) => a - b),
      ],
    })
    return
  }

  conflicts.set(key, {
    routeIndexes: [secondRouteIndex, firstRouteIndex],
    layers: [secondLayer, firstLayer],
    routePointIndexes: [
      [...new Set(secondRoutePointIndexes)].sort((a, b) => a - b),
      [...new Set(firstRoutePointIndexes)].sort((a, b) => a - b),
    ],
  })
}

const getSegmentRoutePointIndexes = (segment: Segment) => {
  const pointIndexes: number[] = []

  for (
    let pointIndex = segment.pointIndex;
    pointIndex <= segment.endPointIndex;
    pointIndex += 1
  ) {
    pointIndexes.push(pointIndex)
  }

  return pointIndexes
}

const pointIndexesIntersect = (
  firstPointIndexes: number[],
  secondPointIndexes: Set<number> | undefined,
) => {
  if (!secondPointIndexes) return true
  return firstPointIndexes.some((pointIndex) =>
    secondPointIndexes.has(pointIndex),
  )
}

const getViaRoutePointIndexes = (route: HdRoute, via: RouteVia) => {
  const points = route.route ?? []
  const pointIndexes: number[] = []

  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    const point = points[pointIndex]
    if (!point) continue
    if (
      Math.abs(point.x - via.center.x) <= EPSILON &&
      Math.abs(point.y - via.center.y) <= EPSILON
    ) {
      pointIndexes.push(pointIndex)
    }
  }

  return pointIndexes
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
  const firstHalfThickness = first.halfThickness
  const secondHalfThickness = second.halfThickness
  const minDistanceAllowed =
    margin + firstHalfThickness + secondHalfThickness - EPSILON

  return (
    first.minX - margin <= second.maxX &&
    first.maxX + margin >= second.minX &&
    first.minY - margin <= second.maxY &&
    first.maxY + margin >= second.minY &&
    minDistanceAllowed > 0
  )
}

const pointBoxOverlapsSegment = (
  point: XY,
  radius: number,
  segment: Segment,
  margin: number,
) => {
  const minDistanceAllowed = margin + segment.halfThickness + radius - EPSILON
  const pointMinX = point.x - minDistanceAllowed
  const pointMaxX = point.x + minDistanceAllowed
  const pointMinY = point.y - minDistanceAllowed
  const pointMaxY = point.y + minDistanceAllowed

  return (
    pointMinX <= segment.maxX &&
    pointMaxX >= segment.minX &&
    pointMinY <= segment.maxY &&
    pointMaxY >= segment.minY
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
  routePointIndexesByMovedRoute?: Map<number, Set<number>>,
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
    const movedRoutePointIndexes =
      routePointIndexesByMovedRoute?.get(movedRouteIndex)

    for (const first of movedGeometry.segments) {
      const firstRoutePointIndexes = getSegmentRoutePointIndexes(first)
      if (
        !pointIndexesIntersect(firstRoutePointIndexes, movedRoutePointIndexes)
      ) {
        continue
      }

      for (const otherRouteIndex of nearbyRouteIndexes) {
        if (
          movedRouteIndex > otherRouteIndex &&
          movedRouteIndexes.has(otherRouteIndex)
        ) {
          continue
        }

        const otherGeometry = routeGeometries[otherRouteIndex]
        if (!otherGeometry) continue
        const otherRoutePointIndexes =
          routePointIndexesByMovedRoute?.get(otherRouteIndex)

        const sameLayerSegments = otherGeometry.segmentsByLayer[first.layer]

        for (const second of sameLayerSegments) {
          const secondRoutePointIndexes = getSegmentRoutePointIndexes(second)
          if (
            !pointIndexesIntersect(
              secondRoutePointIndexes,
              otherRoutePointIndexes,
            )
          ) {
            continue
          }
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
              firstRoutePointIndexes,
              secondRoutePointIndexes,
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
    const movedRoutePointIndexes =
      routePointIndexesByMovedRoute?.get(movedRouteIndex)

    for (const via of movedGeometry.vias) {
      const viaRoutePointIndexes = getViaRoutePointIndexes(
        routes[via.routeIndex] as HdRoute,
        via,
      )
      if (
        !pointIndexesIntersect(viaRoutePointIndexes, movedRoutePointIndexes)
      ) {
        continue
      }

      for (const otherRouteIndex of nearbyRouteIndexes) {
        if (
          movedRouteIndex > otherRouteIndex &&
          movedRouteIndexes.has(otherRouteIndex)
        ) {
          continue
        }

        const otherGeometry = routeGeometries[otherRouteIndex]
        if (!otherGeometry) continue
        const otherRoutePointIndexes =
          routePointIndexesByMovedRoute?.get(otherRouteIndex)

        for (const segment of otherGeometry.segments) {
          const segmentRoutePointIndexes = getSegmentRoutePointIndexes(segment)
          if (
            !pointIndexesIntersect(
              segmentRoutePointIndexes,
              otherRoutePointIndexes,
            )
          ) {
            continue
          }
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
              segmentRoutePointIndexes,
              viaRoutePointIndexes,
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
    const movedRoutePointIndexes =
      routePointIndexesByMovedRoute?.get(movedRouteIndex)

    for (const segment of movedGeometry.segments) {
      const segmentRoutePointIndexes = getSegmentRoutePointIndexes(segment)
      if (
        !pointIndexesIntersect(segmentRoutePointIndexes, movedRoutePointIndexes)
      ) {
        continue
      }

      for (const otherRouteIndex of nearbyRouteIndexes) {
        const otherGeometry = routeGeometries[otherRouteIndex]
        if (!otherGeometry) continue
        const otherRoutePointIndexes =
          routePointIndexesByMovedRoute?.get(otherRouteIndex)

        for (const via of otherGeometry.vias) {
          const viaRoutePointIndexes = getViaRoutePointIndexes(
            routes[via.routeIndex] as HdRoute,
            via,
          )
          if (
            !pointIndexesIntersect(viaRoutePointIndexes, otherRoutePointIndexes)
          ) {
            continue
          }
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
              segmentRoutePointIndexes,
              viaRoutePointIndexes,
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
    const movedRoutePointIndexes =
      routePointIndexesByMovedRoute?.get(movedRouteIndex)

    for (const first of movedGeometry.vias) {
      const firstViaRoutePointIndexes = getViaRoutePointIndexes(
        routes[first.routeIndex] as HdRoute,
        first,
      )
      if (
        !pointIndexesIntersect(
          firstViaRoutePointIndexes,
          movedRoutePointIndexes,
        )
      ) {
        continue
      }

      for (const otherRouteIndex of nearbyRouteIndexes) {
        if (
          movedRouteIndex > otherRouteIndex &&
          movedRouteIndexes.has(otherRouteIndex)
        ) {
          continue
        }

        const otherGeometry = routeGeometries[otherRouteIndex]
        if (!otherGeometry) continue
        const otherRoutePointIndexes =
          routePointIndexesByMovedRoute?.get(otherRouteIndex)

        for (const second of otherGeometry.vias) {
          const secondViaRoutePointIndexes = getViaRoutePointIndexes(
            routes[second.routeIndex] as HdRoute,
            second,
          )
          if (
            !pointIndexesIntersect(
              secondViaRoutePointIndexes,
              otherRoutePointIndexes,
            )
          ) {
            continue
          }
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
              firstViaRoutePointIndexes,
              secondViaRoutePointIndexes,
            )
          }
        }
      }
    }
  }

  return Array.from(conflicts.values())
}
