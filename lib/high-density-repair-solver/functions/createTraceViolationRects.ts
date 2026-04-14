import { EPSILON } from "../shared/constants"
import type { HdRoute, Segment, XY } from "../shared/types"
import { distancePointToSegment } from "./distancePointToSegment"
import { getRouteGeometry } from "./getRouteGeometry"
import { segmentDistance } from "./segmentDistance"
import { segmentsShareEndpoint } from "./segmentsShareEndpoint"

type TraceViolationRect = {
  center: XY
  width: number
  height: number
  stroke: string
  fill: string
  label: string
}

const MIN_MARKER_SIZE = 0.2

const getRouteNetNames = (route: HdRoute | undefined): string[] => {
  if (!route) return []
  const names = [route.connectionName, route.rootConnectionName].filter(
    (name): name is string => Boolean(name),
  )
  return Array.from(new Set(names))
}

const areRoutesSameNet = (
  firstRoute: HdRoute | undefined,
  secondRoute: HdRoute | undefined,
): boolean => {
  const firstNetNames = getRouteNetNames(firstRoute)
  const secondNetNames = getRouteNetNames(secondRoute)
  if (firstNetNames.length === 0 || secondNetNames.length === 0) return false
  return firstNetNames.some((name) => secondNetNames.includes(name))
}

const boundsOverlap = (
  first: { minX: number; maxX: number; minY: number; maxY: number },
  second: { minX: number; maxX: number; minY: number; maxY: number },
  margin: number,
) =>
  first.minX - margin <= second.maxX &&
  first.maxX + margin >= second.minX &&
  first.minY - margin <= second.maxY &&
  first.maxY + margin >= second.minY

const segmentBoxesOverlap = (
  first: Segment,
  second: Segment,
  minimumClearance: number,
) => {
  const minDistanceAllowed =
    minimumClearance + first.halfThickness + second.halfThickness - EPSILON

  return (
    first.minX - minimumClearance <= second.maxX &&
    first.maxX + minimumClearance >= second.minX &&
    first.minY - minimumClearance <= second.maxY &&
    first.maxY + minimumClearance >= second.minY &&
    minDistanceAllowed > 0
  )
}

const pointBoxOverlapsSegment = (
  point: XY,
  radius: number,
  segment: Segment,
  minimumClearance: number,
) => {
  const minDistanceAllowed =
    minimumClearance + segment.halfThickness + radius - EPSILON
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

export const createTraceViolationRects = (
  routes: HdRoute[],
  minimumClearance: number,
): TraceViolationRect[] => {
  const geometryCache = new WeakMap()
  const routeGeometries = routes.map((route, routeIndex) =>
    getRouteGeometry(route, routeIndex, geometryCache),
  )
  const markers: TraceViolationRect[] = []
  const markerLabels = new Set<string>()

  const pushMarker = (marker: TraceViolationRect) => {
    if (markerLabels.has(marker.label)) return
    markerLabels.add(marker.label)
    markers.push(marker)
  }

  for (
    let firstRouteIndex = 0;
    firstRouteIndex < routeGeometries.length;
    firstRouteIndex += 1
  ) {
    const firstGeometry = routeGeometries[firstRouteIndex]
    if (!firstGeometry) continue

    for (
      let secondRouteIndex = firstRouteIndex + 1;
      secondRouteIndex < routeGeometries.length;
      secondRouteIndex += 1
    ) {
      const secondGeometry = routeGeometries[secondRouteIndex]
      if (!secondGeometry) continue
      if (areRoutesSameNet(routes[firstRouteIndex], routes[secondRouteIndex])) {
        continue
      }
      if (
        !boundsOverlap(
          firstGeometry.bounds,
          secondGeometry.bounds,
          minimumClearance,
        )
      ) {
        continue
      }

      for (const layer of ["top", "bottom"] as const) {
        const firstSegments = firstGeometry.segmentsByLayer[layer]
        const secondSegments = secondGeometry.segmentsByLayer[layer]

        for (const firstSegment of firstSegments) {
          for (const secondSegment of secondSegments) {
            if (segmentsShareEndpoint(firstSegment, secondSegment)) continue
            if (
              !segmentBoxesOverlap(
                firstSegment,
                secondSegment,
                minimumClearance,
              )
            ) {
              continue
            }

            const minDistanceAllowed =
              minimumClearance +
              (firstSegment.thickness + secondSegment.thickness) / 2 -
              EPSILON
            const actualDistance = segmentDistance(
              firstSegment.start,
              firstSegment.end,
              secondSegment.start,
              secondSegment.end,
            )
            if (actualDistance >= minDistanceAllowed) continue

            const overlapMinX = Math.max(
              firstSegment.minX - minimumClearance,
              secondSegment.minX - minimumClearance,
            )
            const overlapMaxX = Math.min(
              firstSegment.maxX + minimumClearance,
              secondSegment.maxX + minimumClearance,
            )
            const overlapMinY = Math.max(
              firstSegment.minY - minimumClearance,
              secondSegment.minY - minimumClearance,
            )
            const overlapMaxY = Math.min(
              firstSegment.maxY + minimumClearance,
              secondSegment.maxY + minimumClearance,
            )

            pushMarker({
              center: {
                x: (overlapMinX + overlapMaxX) / 2,
                y: (overlapMinY + overlapMaxY) / 2,
              },
              width: Math.max(overlapMaxX - overlapMinX, MIN_MARKER_SIZE),
              height: Math.max(overlapMaxY - overlapMinY, MIN_MARKER_SIZE),
              stroke: "#059669",
              fill: "rgba(16, 185, 129, 0.32)",
              label: `trace-violation:${firstRouteIndex}:s${firstSegment.pointIndex}:${secondRouteIndex}:s${secondSegment.pointIndex}:${layer}`,
            })
          }
        }
      }

      for (const firstSegment of firstGeometry.segments) {
        for (const [
          secondViaIndex,
          secondVia,
        ] of secondGeometry.vias.entries()) {
          if (
            !pointBoxOverlapsSegment(
              secondVia.center,
              secondVia.radius,
              firstSegment,
              minimumClearance,
            )
          ) {
            continue
          }

          const minDistanceAllowed =
            minimumClearance +
            firstSegment.halfThickness +
            secondVia.radius -
            EPSILON
          const actualDistance = distancePointToSegment(
            secondVia.center,
            firstSegment.start,
            firstSegment.end,
          )
          if (actualDistance >= minDistanceAllowed) continue

          pushMarker({
            center: secondVia.center,
            width: Math.max(minDistanceAllowed * 2, MIN_MARKER_SIZE),
            height: Math.max(minDistanceAllowed * 2, MIN_MARKER_SIZE),
            stroke: "#059669",
            fill: "rgba(16, 185, 129, 0.32)",
            label: `trace-violation:${firstRouteIndex}:s${firstSegment.pointIndex}:${secondRouteIndex}:v${secondViaIndex}`,
          })
        }
      }

      for (const secondSegment of secondGeometry.segments) {
        for (const [firstViaIndex, firstVia] of firstGeometry.vias.entries()) {
          if (
            !pointBoxOverlapsSegment(
              firstVia.center,
              firstVia.radius,
              secondSegment,
              minimumClearance,
            )
          ) {
            continue
          }

          const minDistanceAllowed =
            minimumClearance +
            secondSegment.halfThickness +
            firstVia.radius -
            EPSILON
          const actualDistance = distancePointToSegment(
            firstVia.center,
            secondSegment.start,
            secondSegment.end,
          )
          if (actualDistance >= minDistanceAllowed) continue

          pushMarker({
            center: firstVia.center,
            width: Math.max(minDistanceAllowed * 2, MIN_MARKER_SIZE),
            height: Math.max(minDistanceAllowed * 2, MIN_MARKER_SIZE),
            stroke: "#059669",
            fill: "rgba(16, 185, 129, 0.32)",
            label: `trace-violation:${firstRouteIndex}:v${firstViaIndex}:${secondRouteIndex}:s${secondSegment.pointIndex}`,
          })
        }
      }
    }
  }

  return markers
}
