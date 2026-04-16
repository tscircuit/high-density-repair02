import { EPSILON } from "../shared/constants"
import type { HdRoute, Segment, XY } from "../shared/types"
import { distancePointToSegment } from "./distancePointToSegment"
import { getRouteGeometry } from "./getRouteGeometry"
import { segmentDistance } from "./segmentDistance"
import { segmentsShareEndpoint } from "./segmentsShareEndpoint"

type TraceViolationCircle = {
  center: XY
  radius: number
  stroke: string
  fill: string
  label: string
}

type TraceViolationCandidate = {
  center: XY
  label: string
}

const MARKER_CLUSTER_DISTANCE = 0.28
const MIN_MARKER_RADIUS = 0.2
const MAX_MARKER_RADIUS = 0.3
const MARKER_STROKE = "#f59e0b"
const MARKER_FILL = "rgba(245, 158, 11, 0.46)"

const distance = (first: XY, second: XY) =>
  Math.hypot(first.x - second.x, first.y - second.y)

const createClusteredViolationCircles = (
  candidates: TraceViolationCandidate[],
): TraceViolationCircle[] => {
  const clusters: Array<{
    center: XY
    labels: string[]
    count: number
  }> = []

  for (const candidate of candidates) {
    const cluster = clusters.find(
      (currentCluster) =>
        distance(currentCluster.center, candidate.center) <=
        MARKER_CLUSTER_DISTANCE,
    )

    if (!cluster) {
      clusters.push({
        center: candidate.center,
        labels: [candidate.label],
        count: 1,
      })
      continue
    }

    cluster.center = {
      x:
        (cluster.center.x * cluster.count + candidate.center.x) /
        (cluster.count + 1),
      y:
        (cluster.center.y * cluster.count + candidate.center.y) /
        (cluster.count + 1),
    }
    cluster.labels.push(candidate.label)
    cluster.count += 1
  }

  return clusters.map((cluster, clusterIndex) => ({
    center: cluster.center,
    radius: Math.min(
      MAX_MARKER_RADIUS,
      MIN_MARKER_RADIUS + Math.sqrt(cluster.count - 1) * 0.035,
    ),
    stroke: MARKER_STROKE,
    fill: MARKER_FILL,
    label:
      cluster.count === 1
        ? cluster.labels[0]
        : `trace-violations:${clusterIndex}:count-${cluster.count}`,
  }))
}

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

export const createTraceViolationCircles = (
  routes: HdRoute[],
  minimumClearance: number,
): TraceViolationCircle[] => {
  const geometryCache = new WeakMap()
  const routeGeometries = routes.map((route, routeIndex) =>
    getRouteGeometry(route, routeIndex, geometryCache),
  )
  const markers: TraceViolationCandidate[] = []
  const markerLabels = new Set<string>()

  const pushMarker = (marker: TraceViolationCandidate) => {
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
            label: `trace-violation:${firstRouteIndex}:v${firstViaIndex}:${secondRouteIndex}:s${secondSegment.pointIndex}`,
          })
        }
      }
    }
  }

  return createClusteredViolationCircles(markers)
}
