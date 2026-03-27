import { DEFAULT_TRACE_THICKNESS, EPSILON } from "../shared/constants"
import type {
  BoundaryRect,
  BoundarySide,
  HdRoute,
  RoutePoint,
  XY,
} from "../shared/types"
import { dedupeRoutePoints } from "./dedupeRoutePoints"
import { distancePointToSegment } from "./distancePointToSegment"
import { distanceToSide } from "./distanceToSide"
import { getRoutePointLayer } from "./getRoutePointLayer"
import { getRouteSegments } from "./getRouteSegments"
import { segmentDistance } from "./segmentDistance"

type BridgeContext = {
  start: RoutePoint
  end: RoutePoint
  boundary: BoundaryRect
  activeSide: BoundarySide
  gridStep: number
  margin: number
  preferredAxisValue: number
  activeRouteIndex?: number
  surroundingRoutes?: HdRoute[]
  traceThickness?: number
}

const getAxisValues = (
  startValue: number,
  endValue: number,
  minValue: number,
  maxValue: number,
  gridStep: number,
) => {
  const values = new Set<number>([startValue, endValue])
  const steps = Math.round((maxValue - minValue) / gridStep)
  for (let step = 0; step <= steps; step += 1) {
    values.add(Number((minValue + step * gridStep).toFixed(12)))
  }
  return Array.from(values).sort((a, b) => a - b)
}

const compressPath = (points: RoutePoint[]) => {
  if (points.length <= 2) return dedupeRoutePoints(points)

  const compressed: RoutePoint[] = [points[0] as RoutePoint]
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = compressed[compressed.length - 1] as RoutePoint
    const current = points[index] as RoutePoint
    const next = points[index + 1] as RoutePoint
    const sameX =
      Math.abs(previous.x - current.x) <= EPSILON &&
      Math.abs(current.x - next.x) <= EPSILON
    const sameY =
      Math.abs(previous.y - current.y) <= EPSILON &&
      Math.abs(current.y - next.y) <= EPSILON

    if (sameX || sameY) continue
    compressed.push(current)
  }

  compressed.push(points[points.length - 1] as RoutePoint)
  return dedupeRoutePoints(compressed)
}

const getRouteObstacleData = (
  surroundingRoutes: HdRoute[] | undefined,
  activeRouteIndex: number | undefined,
) => {
  const routes = surroundingRoutes ?? []
  const segments = routes.flatMap((route, routeIndex) =>
    routeIndex === activeRouteIndex ? [] : getRouteSegments(route, routeIndex),
  )
  const vias = routes.flatMap((route, routeIndex) =>
    routeIndex === activeRouteIndex
      ? []
      : (route.vias ?? []).map((via) => ({
          center: { x: via.x, y: via.y },
          radius:
            (via.diameter ??
              route.viaDiameter ??
              (route.traceThickness ?? DEFAULT_TRACE_THICKNESS) * 2) / 2,
          routeIndex,
        })),
  )

  return { segments, vias }
}

const getSegmentTravelScore = ({
  from,
  to,
  boundary,
  activeSide,
  margin,
  obstacleSegments,
  obstacleVias,
  traceThickness,
}: {
  from: XY
  to: XY
  boundary: BoundaryRect
  activeSide: BoundarySide
  margin: number
  obstacleSegments: ReturnType<typeof getRouteObstacleData>["segments"]
  obstacleVias: ReturnType<typeof getRouteObstacleData>["vias"]
  traceThickness: number
}) => {
  const midPoint = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  }
  const segmentLength = Math.hypot(to.x - from.x, to.y - from.y)
  const activeBoundaryDistance = distanceToSide(midPoint, boundary, activeSide)
  const otherSides = ["left", "right", "top", "bottom"].filter(
    (side) => side !== activeSide,
  ) as BoundarySide[]

  let score = segmentLength
  score += Math.max(0, margin * 2 - activeBoundaryDistance) * 8

  for (const side of otherSides) {
    const distance = distanceToSide(midPoint, boundary, side)
    if (distance < margin) {
      score += 500 + (margin - distance) * 200
      continue
    }

    score += Math.max(0, margin * 2 - distance) * 20
  }

  for (const segment of obstacleSegments) {
    if (
      segment.layer !==
      getRoutePointLayer({ ...from, z: (from as RoutePoint).z })
    ) {
      continue
    }

    const clearance =
      segmentDistance(from, to, segment.start, segment.end) -
      (traceThickness + segment.thickness) / 2

    if (clearance < -EPSILON) {
      return Number.POSITIVE_INFINITY
    }

    score += Math.max(0, margin - clearance) * 50
  }

  for (const via of obstacleVias) {
    const clearance =
      distancePointToSegment(via.center, from, to) -
      via.radius -
      traceThickness / 2

    if (clearance < -EPSILON) {
      return Number.POSITIVE_INFINITY
    }

    score += Math.max(0, margin - clearance) * 40
  }

  return score
}

export const findBestGridBridgePath = ({
  start,
  end,
  boundary,
  activeSide,
  gridStep,
  margin,
  preferredAxisValue,
  activeRouteIndex,
  surroundingRoutes,
  traceThickness = DEFAULT_TRACE_THICKNESS,
}: BridgeContext) => {
  if ((start.z ?? 0) !== (end.z ?? 0)) {
    return null
  }

  const xValues = getAxisValues(
    start.x,
    end.x,
    boundary.minX,
    boundary.maxX,
    gridStep,
  )
  const yValues = getAxisValues(
    start.y,
    end.y,
    boundary.minY,
    boundary.maxY,
    gridStep,
  )
  const startXIndex = xValues.findIndex(
    (value) => Math.abs(value - start.x) <= EPSILON,
  )
  const startYIndex = yValues.findIndex(
    (value) => Math.abs(value - start.y) <= EPSILON,
  )
  const endXIndex = xValues.findIndex(
    (value) => Math.abs(value - end.x) <= EPSILON,
  )
  const endYIndex = yValues.findIndex(
    (value) => Math.abs(value - end.y) <= EPSILON,
  )

  if (
    startXIndex === -1 ||
    startYIndex === -1 ||
    endXIndex === -1 ||
    endYIndex === -1
  ) {
    return null
  }

  const { segments, vias } = getRouteObstacleData(
    surroundingRoutes,
    activeRouteIndex,
  )
  const startKey = `${startXIndex}:${startYIndex}`
  const targetKey = `${endXIndex}:${endYIndex}`
  const openSet = [{ key: startKey, score: 0 }]
  const bestCosts = new Map<string, number>([[startKey, 0]])
  const previous = new Map<string, string>()

  const getPoint = (xIndex: number, yIndex: number): RoutePoint => ({
    x: xValues[xIndex] as number,
    y: yValues[yIndex] as number,
    z: start.z,
  })

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.score - b.score)
    const current = openSet.shift() as { key: string; score: number }
    if (current.key === targetKey) break

    const [xIndexText, yIndexText] = current.key.split(":")
    const xIndex = Number(xIndexText)
    const yIndex = Number(yIndexText)
    const currentPoint = getPoint(xIndex, yIndex)
    const neighbors = [
      [xIndex - 1, yIndex],
      [xIndex + 1, yIndex],
      [xIndex, yIndex - 1],
      [xIndex, yIndex + 1],
    ].filter(
      ([candidateXIndex, candidateYIndex]) =>
        candidateXIndex >= 0 &&
        candidateYIndex >= 0 &&
        candidateXIndex < xValues.length &&
        candidateYIndex < yValues.length,
    ) as Array<[number, number]>

    for (const [nextXIndex, nextYIndex] of neighbors) {
      const nextPoint = getPoint(nextXIndex, nextYIndex)
      const travelScore = getSegmentTravelScore({
        from: currentPoint,
        to: nextPoint,
        boundary,
        activeSide,
        margin,
        obstacleSegments: segments,
        obstacleVias: vias,
        traceThickness,
      })

      if (!Number.isFinite(travelScore)) continue

      const nextKey = `${nextXIndex}:${nextYIndex}`
      const axisBias =
        activeSide === "left" || activeSide === "right"
          ? Math.abs(nextPoint.x - preferredAxisValue)
          : Math.abs(nextPoint.y - preferredAxisValue)
      const nextCost = current.score + travelScore + axisBias * 0.2

      if (nextCost >= (bestCosts.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        continue
      }

      bestCosts.set(nextKey, nextCost)
      previous.set(nextKey, current.key)
      openSet.push({ key: nextKey, score: nextCost })
    }
  }

  if (!bestCosts.has(targetKey)) {
    return null
  }

  const pathKeys = [targetKey]
  while (pathKeys[0] !== startKey) {
    const priorKey = previous.get(pathKeys[0] as string)
    if (!priorKey) return null
    pathKeys.unshift(priorKey)
  }

  return compressPath(
    pathKeys.map((key) => {
      const [xIndexText, yIndexText] = key.split(":")
      return getPoint(Number(xIndexText), Number(yIndexText))
    }),
  )
}
