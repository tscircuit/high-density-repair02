import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"

type XY = { x: number; y: number }
type RoutePoint = XY & { z?: number }
type PortPoint = XY & { connectionName?: string; portPointId?: string; z?: number }
type HdRoute = {
  capacityMeshNodeId?: string
  connectionName?: string
  rootConnectionName?: string
  route?: RoutePoint[]
  traceThickness?: number
  vias?: Array<{ x: number; y: number; diameter?: number }>
  viaDiameter?: number
}
type Obstacle = {
  type?: string
  center?: XY
  width?: number
  height?: number
}
type BoundarySide = "left" | "right" | "top" | "bottom"
type BoundaryRect = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
  center: XY
}
type Segment = {
  start: RoutePoint
  end: RoutePoint
  routeIndex: number
  pointIndex: number
  thickness: number
  layer: "top" | "bottom"
}
type VisualizationFrame = {
  title: string
  routes: HdRoute[]
  originalRoutes?: HdRoute[]
  activeSide?: BoundarySide
  candidateRouteNames?: string[]
  overlayLines?: Array<{
    points: XY[]
    strokeColor: string
    strokeWidth: number
    label: string
  }>
  overlayRects?: Array<{
    center: XY
    width: number
    height: number
    stroke: string
    fill: string
    label: string
  }>
  overlayPoints?: Array<{ x: number; y: number; color: string; label: string }>
  overlayArrows?: Array<{
    start: XY
    end: XY
    color: string
    doubleSided?: boolean
  }>
}

export type DatasetSample = {
  nodeWithPortPoints?: {
    capacityMeshNodeId?: string
    center?: XY
    width?: number
    height?: number
    portPoints?: PortPoint[]
  }
  nodeHdRoutes?: HdRoute[]
  adjacentObstacles?: Obstacle[]
}

export interface HighDensityRepairSolverParams {
  sample?: DatasetSample
  margin?: number
}

const TOP_LAYER_COLOR = "#FF0000"
const BOTTOM_LAYER_COLOR = "#0000FF"
const DEFAULT_TRACE_THICKNESS = 0.15
const GRID_COLOR = "rgba(15, 23, 42, 0.14)"
const HIGHLIGHT_COLOR = "rgba(245, 158, 11, 0.16)"
const ACCEPT_COLOR = "rgba(16, 185, 129, 0.14)"
const REJECT_COLOR = "rgba(220, 38, 38, 0.14)"
const CANDIDATE_STROKE = "#000000"
const EPSILON = 1e-6

const getRoutePointLayer = (point?: RoutePoint): "top" | "bottom" =>
  point?.z === 1 ? "bottom" : "top"

const getRouteStrokeColor = (layer: "top" | "bottom") =>
  layer === "bottom" ? BOTTOM_LAYER_COLOR : TOP_LAYER_COLOR

const clonePoint = (point: RoutePoint): RoutePoint => ({ ...point })

const cloneRoute = (route: HdRoute): HdRoute => ({
  ...route,
  route: route.route?.map(clonePoint),
  vias: route.vias?.map((via) => ({ ...via })),
})

const cloneRoutes = (routes: HdRoute[]) => routes.map(cloneRoute)

const getBoundaryRect = (
  node?: DatasetSample["nodeWithPortPoints"],
): BoundaryRect | null => {
  if (!node?.center || !node.width || !node.height) return null

  return {
    minX: node.center.x - node.width / 2,
    maxX: node.center.x + node.width / 2,
    minY: node.center.y - node.height / 2,
    maxY: node.center.y + node.height / 2,
    width: node.width,
    height: node.height,
    center: node.center,
  }
}

const splitRouteIntoLayerSegments = (route: HdRoute) => {
  const routePoints = route.route ?? []
  const lines: Array<{
    points: XY[]
    strokeColor: string
    strokeWidth: number
    label: string
  }> = []

  if (routePoints.length < 2) return lines

  let currentLayer = getRoutePointLayer(routePoints[0])
  let currentSegment: XY[] = [routePoints[0]]

  for (let index = 1; index < routePoints.length; index += 1) {
    const point = routePoints[index]
    const pointLayer = getRoutePointLayer(point)

    if (pointLayer !== currentLayer) {
      if (currentSegment.length >= 2) {
        lines.push({
          points: currentSegment,
          strokeColor: getRouteStrokeColor(currentLayer),
          strokeWidth: route.traceThickness ?? DEFAULT_TRACE_THICKNESS,
          label: route.connectionName ?? "route",
        })
      }
      currentLayer = pointLayer
      currentSegment = [routePoints[index - 1], point]
      continue
    }

    currentSegment.push(point)
  }

  if (currentSegment.length >= 2) {
    lines.push({
      points: currentSegment,
      strokeColor: getRouteStrokeColor(currentLayer),
      strokeWidth: route.traceThickness ?? DEFAULT_TRACE_THICKNESS,
      label: route.connectionName ?? "route",
    })
  }

  return lines
}

const sideDirection = (side: BoundarySide, amount: number): XY => {
  switch (side) {
    case "left":
      return { x: amount, y: 0 }
    case "right":
      return { x: -amount, y: 0 }
    case "top":
      return { x: 0, y: -amount }
    case "bottom":
      return { x: 0, y: amount }
  }
}

const sideBoundaryValue = (boundary: BoundaryRect, side: BoundarySide) => {
  switch (side) {
    case "left":
      return boundary.minX
    case "right":
      return boundary.maxX
    case "top":
      return boundary.maxY
    case "bottom":
      return boundary.minY
  }
}

const distanceToSide = (
  point: XY,
  boundary: BoundaryRect,
  side: BoundarySide,
) => {
  switch (side) {
    case "left":
      return point.x - boundary.minX
    case "right":
      return boundary.maxX - point.x
    case "top":
      return boundary.maxY - point.y
    case "bottom":
      return point.y - boundary.minY
  }
}

const isPointNearSide = (
  point: XY,
  boundary: BoundaryRect,
  side: BoundarySide,
  margin: number,
) => distanceToSide(point, boundary, side) <= margin + EPSILON

const isPointInsideBoundary = (point: XY, boundary: BoundaryRect) =>
  point.x >= boundary.minX - EPSILON &&
  point.x <= boundary.maxX + EPSILON &&
  point.y >= boundary.minY - EPSILON &&
  point.y <= boundary.maxY + EPSILON

const getObstacleBounds = (obstacle: Obstacle) => {
  if (!obstacle.center || !obstacle.width || !obstacle.height) return null
  return {
    minX: obstacle.center.x - obstacle.width / 2,
    maxX: obstacle.center.x + obstacle.width / 2,
    minY: obstacle.center.y - obstacle.height / 2,
    maxY: obstacle.center.y + obstacle.height / 2,
  }
}

const isObstacleNearSide = (
  obstacle: Obstacle,
  boundary: BoundaryRect,
  side: BoundarySide,
  margin: number,
) => {
  const bounds = getObstacleBounds(obstacle)
  if (!bounds) return false

  switch (side) {
    case "left":
      return bounds.maxX >= boundary.minX - EPSILON &&
        bounds.minX <= boundary.minX + margin + EPSILON
    case "right":
      return bounds.minX <= boundary.maxX + EPSILON &&
        bounds.maxX >= boundary.maxX - margin - EPSILON
    case "top":
      return bounds.minY <= boundary.maxY + EPSILON &&
        bounds.maxY >= boundary.maxY - margin - EPSILON
    case "bottom":
      return bounds.maxY >= boundary.minY - EPSILON &&
        bounds.minY <= boundary.minY + margin + EPSILON
  }
}

const getRouteMovableIndexes = (
  route: HdRoute,
  boundary: BoundaryRect,
  side: BoundarySide,
  margin: number,
) => {
  const points = route.route ?? []
  const movableIndexes = new Set<number>()

  for (let index = 1; index < points.length - 1; index += 1) {
    if (isPointNearSide(points[index], boundary, side, margin)) {
      movableIndexes.add(index)
    }
  }

  // Treat coincident cross-layer points as a single connected transition so
  // any move keeps the via anchor aligned on both layers.
  const queue = Array.from(movableIndexes)
  while (queue.length > 0) {
    const activeIndex = queue.shift() as number
    const activePoint = points[activeIndex]
    if (!activePoint) continue

    for (let index = 1; index < points.length - 1; index += 1) {
      if (movableIndexes.has(index)) continue
      const point = points[index]
      if (!point) continue
      if (point.z === activePoint.z) continue
      if (!pointsCoincide(point, activePoint)) continue

      movableIndexes.add(index)
      queue.push(index)
    }
  }

  return Array.from(movableIndexes).sort((a, b) => a - b)
}

const createMovedRoute = (
  route: HdRoute,
  movableIndexes: number[],
  delta: XY,
): HdRoute => {
  const nextRoute = cloneRoute(route)
  const nextPoints = nextRoute.route ?? []
  const movedViaKeys = new Set<string>()

  for (const index of movableIndexes) {
    const originalPoint = nextPoints[index]
    if (!originalPoint) continue

    const nextPoint = {
      ...originalPoint,
      x: originalPoint.x + delta.x,
      y: originalPoint.y + delta.y,
    }

    nextPoints[index] = {
      ...nextPoint,
    }

    for (const via of nextRoute.vias ?? []) {
      if (!pointsCoincide(via, originalPoint)) continue
      via.x += delta.x
      via.y += delta.y
      movedViaKeys.add(`${via.x},${via.y}`)
    }
  }

  for (const via of nextRoute.vias ?? []) {
    const viaKey = `${via.x},${via.y}`
    if (movedViaKeys.has(viaKey)) continue

    const connectedPointWasMoved = movableIndexes.some((index) => {
      const point = route.route?.[index]
      return point ? pointsCoincide(point, via) : false
    })

    if (!connectedPointWasMoved) continue

    via.x += delta.x
    via.y += delta.y
  }

  return nextRoute
}

const routeStaysInsideBoundary = (route: HdRoute, boundary: BoundaryRect) =>
  (route.route ?? []).every((point) => isPointInsideBoundary(point, boundary))

const getRouteSegments = (route: HdRoute, routeIndex: number): Segment[] => {
  const points = route.route ?? []
  const segments: Segment[] = []

  for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
    segments.push({
      start: points[pointIndex],
      end: points[pointIndex + 1],
      routeIndex,
      pointIndex,
      thickness: route.traceThickness ?? DEFAULT_TRACE_THICKNESS,
      layer: getRoutePointLayer(points[pointIndex]),
    })
  }

  return segments
}

const lengthSquared = (point: XY) => point.x * point.x + point.y * point.y

const subtract = (a: XY, b: XY): XY => ({ x: a.x - b.x, y: a.y - b.y })

const dot = (a: XY, b: XY) => a.x * b.x + a.y * b.y

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const distancePointToSegment = (point: XY, start: XY, end: XY) => {
  const segment = subtract(end, start)
  const denom = lengthSquared(segment)
  if (denom <= EPSILON) {
    return Math.sqrt(lengthSquared(subtract(point, start)))
  }

  const t = clamp01(dot(subtract(point, start), segment) / denom)
  const projection = {
    x: start.x + segment.x * t,
    y: start.y + segment.y * t,
  }
  return Math.sqrt(lengthSquared(subtract(point, projection)))
}

const orientation = (a: XY, b: XY, c: XY) =>
  (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)

const onSegment = (a: XY, b: XY, c: XY) =>
  b.x <= Math.max(a.x, c.x) + EPSILON &&
  b.x >= Math.min(a.x, c.x) - EPSILON &&
  b.y <= Math.max(a.y, c.y) + EPSILON &&
  b.y >= Math.min(a.y, c.y) - EPSILON

const segmentsIntersect = (a1: XY, a2: XY, b1: XY, b2: XY) => {
  const o1 = orientation(a1, a2, b1)
  const o2 = orientation(a1, a2, b2)
  const o3 = orientation(b1, b2, a1)
  const o4 = orientation(b1, b2, a2)

  if (Math.abs(o1) <= EPSILON && onSegment(a1, b1, a2)) return true
  if (Math.abs(o2) <= EPSILON && onSegment(a1, b2, a2)) return true
  if (Math.abs(o3) <= EPSILON && onSegment(b1, a1, b2)) return true
  if (Math.abs(o4) <= EPSILON && onSegment(b1, a2, b2)) return true

  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)
}

const segmentDistance = (a1: XY, a2: XY, b1: XY, b2: XY) => {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0

  return Math.min(
    distancePointToSegment(a1, b1, b2),
    distancePointToSegment(a2, b1, b2),
    distancePointToSegment(b1, a1, a2),
    distancePointToSegment(b2, a1, a2),
  )
}

const pointsCoincide = (a: XY, b: XY) =>
  Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON

const segmentsShareEndpoint = (a: Segment, b: Segment) =>
  pointsCoincide(a.start, b.start) ||
  pointsCoincide(a.start, b.end) ||
  pointsCoincide(a.end, b.start) ||
  pointsCoincide(a.end, b.end)

const findConflictingRouteIndexes = (
  routes: HdRoute[],
  movedRouteIndexes: Set<number>,
) => {
  const allSegments = routes.flatMap((route, routeIndex) =>
    getRouteSegments(route, routeIndex),
  )
  const conflicts = new Set<number>()

  for (let index = 0; index < allSegments.length; index += 1) {
    const first = allSegments[index]

    for (let otherIndex = index + 1; otherIndex < allSegments.length; otherIndex += 1) {
      const second = allSegments[otherIndex]

      if (first.routeIndex === second.routeIndex) continue
      if (first.layer !== second.layer) continue

      const firstMoved = movedRouteIndexes.has(first.routeIndex)
      const secondMoved = movedRouteIndexes.has(second.routeIndex)
      if (!firstMoved && !secondMoved) continue
      if (segmentsShareEndpoint(first, second)) continue

      const minDistanceAllowed =
        (first.thickness + second.thickness) / 2 - EPSILON
      const actualDistance = segmentDistance(
        first.start,
        first.end,
        second.start,
        second.end,
      )

      if (actualDistance < minDistanceAllowed) {
        conflicts.add(first.routeIndex)
        conflicts.add(second.routeIndex)
      }
    }
  }

  return conflicts
}

const createBoundaryGridLines = (
  boundary: BoundaryRect,
  step: number,
  side?: BoundarySide,
) => {
  const lines: Array<{
    points: XY[]
    strokeColor: string
    strokeWidth: number
    label: string
  }> = []

  const clampedStep = Math.max(step, 0.05)

  for (
    let x = boundary.minX + clampedStep;
    x < boundary.maxX - EPSILON;
    x += clampedStep
  ) {
    lines.push({
      points: [
        { x, y: boundary.minY },
        { x, y: boundary.maxY },
      ],
      strokeColor: GRID_COLOR,
      strokeWidth: 0.02,
      label: side ? `grid:${side}:v` : "grid:v",
    })
  }

  for (
    let y = boundary.minY + clampedStep;
    y < boundary.maxY - EPSILON;
    y += clampedStep
  ) {
    lines.push({
      points: [
        { x: boundary.minX, y },
        { x: boundary.maxX, y },
      ],
      strokeColor: GRID_COLOR,
      strokeWidth: 0.02,
      label: side ? `grid:${side}:h` : "grid:h",
    })
  }

  return lines
}

const createSideStripRect = (
  boundary: BoundaryRect,
  side: BoundarySide,
  depth: number,
  fill: string,
  label: string,
) => {
  switch (side) {
    case "left":
      return {
        center: {
          x: boundary.minX + depth / 2,
          y: boundary.center.y,
        },
        width: depth,
        height: boundary.height,
        stroke: "#f59e0b",
        fill,
        label,
      }
    case "right":
      return {
        center: {
          x: boundary.maxX - depth / 2,
          y: boundary.center.y,
        },
        width: depth,
        height: boundary.height,
        stroke: "#f59e0b",
        fill,
        label,
      }
    case "top":
      return {
        center: {
          x: boundary.center.x,
          y: boundary.maxY - depth / 2,
        },
        width: boundary.width,
        height: depth,
        stroke: "#f59e0b",
        fill,
        label,
      }
    case "bottom":
      return {
        center: {
          x: boundary.center.x,
          y: boundary.minY + depth / 2,
        },
        width: boundary.width,
        height: depth,
        stroke: "#f59e0b",
        fill,
        label,
      }
  }
}

const createMovementArrow = (
  boundary: BoundaryRect,
  side: BoundarySide,
  amount: number,
) => {
  const direction = sideDirection(side, amount)
  switch (side) {
    case "left":
      return {
        start: { x: boundary.minX + amount / 4, y: boundary.center.y },
        end: { x: boundary.minX + amount / 4 + direction.x, y: boundary.center.y },
        color: CANDIDATE_STROKE,
      }
    case "right":
      return {
        start: { x: boundary.maxX - amount / 4, y: boundary.center.y },
        end: { x: boundary.maxX - amount / 4 + direction.x, y: boundary.center.y },
        color: CANDIDATE_STROKE,
      }
    case "top":
      return {
        start: { x: boundary.center.x, y: boundary.maxY - amount / 4 },
        end: { x: boundary.center.x, y: boundary.maxY - amount / 4 + direction.y },
        color: CANDIDATE_STROKE,
      }
    case "bottom":
      return {
        start: { x: boundary.center.x, y: boundary.minY + amount / 4 },
        end: { x: boundary.center.x, y: boundary.minY + amount / 4 + direction.y },
        color: CANDIDATE_STROKE,
      }
  }
}

const createOverlayLinesForRoutes = (
  routes: HdRoute[],
  routeIndexes: Iterable<number>,
) =>
  Array.from(routeIndexes).flatMap((routeIndex) =>
    splitRouteIntoLayerSegments(routes[routeIndex]).map((line) => ({
      ...line,
      strokeColor: CANDIDATE_STROKE,
      strokeWidth: line.strokeWidth,
      label: `candidate:${line.label}`,
    })),
  )

export class HighDensityRepairSolver extends BaseSolver {
  private frames: VisualizationFrame[] = []
  private currentFrameIndex = 0
  private repairedRoutes: HdRoute[] = []

  constructor(public readonly params: HighDensityRepairSolverParams = {}) {
    super()
  }

  override _setup(): void {
    this.buildFrames()
    this.stats = {
      margin: this.params.margin ?? 0.4,
      frames: this.frames.length,
      currentFrame: this.currentFrameIndex,
    }
  }

  override _step(): void {
    if (this.frames.length <= 1) {
      this.solved = true
      return
    }

    if (this.currentFrameIndex < this.frames.length - 1) {
      this.currentFrameIndex += 1
    }

    this.stats = {
      ...this.stats,
      currentFrame: this.currentFrameIndex,
      title: this.frames[this.currentFrameIndex]?.title,
    }

    if (this.currentFrameIndex >= this.frames.length - 1) {
      this.solved = true
    }
  }

  override getConstructorParams() {
    return [this.params]
  }

  override getOutput() {
    return {
      margin: this.params.margin ?? 0.4,
      repairedRoutes: this.repairedRoutes,
      frameCount: this.frames.length,
    }
  }

  private buildFrames() {
    const sample = this.params.sample
    const node = sample?.nodeWithPortPoints
    const boundary = getBoundaryRect(node)
    const baseRoutes = cloneRoutes(sample?.nodeHdRoutes ?? [])
    const obstacles = sample?.adjacentObstacles ?? []
    const margin = Math.max(this.params.margin ?? 0.4, 0.05)

    this.repairedRoutes = cloneRoutes(baseRoutes)

    if (!boundary) {
      this.frames = [
        {
          title: "HighDensityRepair02 Missing Boundary",
          routes: this.repairedRoutes,
        },
      ]
      return
    }

    const gridStep = Math.max(margin / 2, 0.05)
    this.frames = [
      {
        title: `HighDensityRepair02 Initial State (margin=${margin})`,
        routes: cloneRoutes(this.repairedRoutes),
        overlayLines: createBoundaryGridLines(boundary, gridStep),
      },
    ]

    const sides: BoundarySide[] = ["left", "right", "top", "bottom"]

    for (const side of sides) {
      const hasObstacle = obstacles.some((obstacle) =>
        isObstacleNearSide(obstacle, boundary, side, margin),
      )
      const moveAmount = hasObstacle ? margin : margin / 2

      this.frames.push({
        title: `${side} boundary analysis: move=${moveAmount.toFixed(3)} (${hasObstacle ? "obstacle-side" : "clear-side"})`,
        routes: cloneRoutes(this.repairedRoutes),
        activeSide: side,
        overlayLines: createBoundaryGridLines(boundary, gridStep, side),
        overlayRects: [
          createSideStripRect(boundary, side, margin, HIGHLIGHT_COLOR, `strip:${side}`),
        ],
        overlayArrows: [createMovementArrow(boundary, side, moveAmount)],
      })

      const routeCount = this.repairedRoutes.length
      const attemptedRoutes = new Set<number>()

      for (let routeIndex = 0; routeIndex < routeCount; routeIndex += 1) {
        if (attemptedRoutes.has(routeIndex)) continue

        const movableIndexes = getRouteMovableIndexes(
          this.repairedRoutes[routeIndex],
          boundary,
          side,
          margin,
        )
        if (movableIndexes.length === 0) continue

        const delta = sideDirection(side, moveAmount)
        const candidateRouteIndexes = new Set<number>([routeIndex])
        const candidateRoutes = cloneRoutes(this.repairedRoutes)
        const movableByRoute = new Map<number, number[]>()
        movableByRoute.set(routeIndex, movableIndexes)
        const queue = [routeIndex]
        let rejected = false
        let rejectionReason = "overlap"

        while (queue.length > 0 && !rejected) {
          const activeRouteIndex = queue.shift() as number
          const activeMovableIndexes = movableByRoute.get(activeRouteIndex) ?? []
          candidateRoutes[activeRouteIndex] = createMovedRoute(
            candidateRoutes[activeRouteIndex],
            activeMovableIndexes,
            delta,
          )

          if (!routeStaysInsideBoundary(candidateRoutes[activeRouteIndex], boundary)) {
            rejected = true
            rejectionReason = "boundary"
            break
          }

          const conflicts = findConflictingRouteIndexes(
            candidateRoutes,
            candidateRouteIndexes,
          )

          for (const conflictRouteIndex of conflicts) {
            if (candidateRouteIndexes.has(conflictRouteIndex)) {
              continue
            }

            const conflictMovableIndexes = getRouteMovableIndexes(
              this.repairedRoutes[conflictRouteIndex],
              boundary,
              side,
              margin,
            )

            if (conflictMovableIndexes.length === 0) {
              rejected = true
              rejectionReason = "unmovable-adjacent"
              break
            }

            candidateRouteIndexes.add(conflictRouteIndex)
            movableByRoute.set(conflictRouteIndex, conflictMovableIndexes)
            queue.push(conflictRouteIndex)
          }
        }

        const finalConflicts = rejected
          ? new Set<number>()
          : findConflictingRouteIndexes(candidateRoutes, candidateRouteIndexes)

        if (finalConflicts.size > 0) {
          rejected = true
          rejectionReason = "eventual-overlap"
        }

        const routeNames = Array.from(candidateRouteIndexes).map(
          (index) =>
            candidateRoutes[index].connectionName ??
            `route-${index}`,
        )

        this.frames.push({
          title: rejected
            ? `${side} move rejected (${rejectionReason})`
            : `${side} move accepted`,
          routes: cloneRoutes(this.repairedRoutes),
          activeSide: side,
          candidateRouteNames: routeNames,
          overlayLines: [
            ...createBoundaryGridLines(boundary, gridStep, side),
            ...createOverlayLinesForRoutes(candidateRoutes, candidateRouteIndexes),
          ],
          overlayRects: [
            createSideStripRect(
              boundary,
              side,
              margin,
              rejected ? REJECT_COLOR : ACCEPT_COLOR,
              rejected ? `rejected:${side}` : `accepted:${side}`,
            ),
          ],
          overlayArrows: [createMovementArrow(boundary, side, moveAmount)],
        })

        if (!rejected) {
          this.repairedRoutes = candidateRoutes
        }

        for (const candidateRouteIndex of candidateRouteIndexes) {
          attemptedRoutes.add(candidateRouteIndex)
        }
      }
    }

    this.frames.push({
      title: `HighDensityRepair02 Final State (margin=${margin})`,
      routes: cloneRoutes(this.repairedRoutes),
      originalRoutes: cloneRoutes(baseRoutes),
      overlayLines: createBoundaryGridLines(boundary, gridStep),
    })
  }

  override visualize(): GraphicsObject {
    const sample = this.params.sample
    const node = sample?.nodeWithPortPoints
    const obstacles = sample?.adjacentObstacles ?? []
    const frame =
      this.frames[this.currentFrameIndex] ?? {
        title: "HighDensityRepair02",
        routes: cloneRoutes(sample?.nodeHdRoutes ?? []),
      }
    const boundary = getBoundaryRect(node)

    const nodeRect =
      boundary && node?.capacityMeshNodeId
        ? [
            {
              center: boundary.center,
              width: boundary.width,
              height: boundary.height,
              stroke: "#1d4ed8",
              fill: "rgba(29, 78, 216, 0.08)",
              label: node.capacityMeshNodeId,
            },
          ]
        : boundary
          ? [
              {
                center: boundary.center,
                width: boundary.width,
                height: boundary.height,
                stroke: "#1d4ed8",
                fill: "rgba(29, 78, 216, 0.08)",
                label: "capacity-node",
              },
            ]
          : []

    const obstacleRects = obstacles
      .filter(
        (obstacle) => obstacle.center && obstacle.width && obstacle.height,
      )
      .map((obstacle, idx) => ({
        center: obstacle.center as XY,
        width: obstacle.width as number,
        height: obstacle.height as number,
        stroke: obstacle.type === "oval" ? "#a855f7" : "#dc2626",
        fill:
          obstacle.type === "oval"
            ? "rgba(168, 85, 247, 0.12)"
            : "rgba(220, 38, 38, 0.08)",
        label: obstacle.type
          ? `obstacle:${obstacle.type}:${idx}`
          : `obstacle:${idx}`,
      }))

    const points = [
      ...(node?.portPoints ?? []).map((portPoint) => ({
        x: portPoint.x,
        y: portPoint.y,
        color: "#0f766e",
        label:
          portPoint.connectionName ?? portPoint.portPointId ?? "port-point",
      })),
      ...frame.routes
        .flatMap((route) => route.route ?? [])
        .map((routePoint) => ({
          x: routePoint.x,
          y: routePoint.y,
          color:
            getRoutePointLayer(routePoint) === "bottom"
              ? BOTTOM_LAYER_COLOR
              : "#0ea5e9",
          label: "",
        })),
      ...(frame.overlayPoints ?? []),
    ]

    const lines = [
      ...(frame.originalRoutes ?? []).flatMap((route) =>
        splitRouteIntoLayerSegments(route).map((line) => ({
          ...line,
          strokeColor: "#111111",
          strokeWidth: Math.max(line.strokeWidth * 0.6, 0.05),
          label: `original:${line.label}`,
        })),
      ),
      ...frame.routes
        .filter((route) => (route.route?.length ?? 0) >= 2)
        .flatMap((route) => splitRouteIntoLayerSegments(route)),
      ...(frame.overlayLines ?? []),
    ]

    const circles = frame.routes.flatMap((route) =>
      (route.vias ?? []).map((via) => ({
        center: { x: via.x, y: via.y },
        radius: (via.diameter ?? route.viaDiameter ?? 0.3) / 2,
        stroke: "#7c3aed",
        fill: "rgba(124, 58, 237, 0.2)",
        label: route.connectionName ? `via:${route.connectionName}` : "via",
      })),
    )

    return {
      coordinateSystem: "cartesian",
      title: frame.title,
      rects: [...nodeRect, ...obstacleRects, ...(frame.overlayRects ?? [])],
      points,
      lines,
      circles,
      arrows: frame.overlayArrows,
    }
  }
}
