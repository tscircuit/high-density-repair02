export type XY = { x: number; y: number }

export type RoutePoint = XY & { z?: number }

export type PortPoint = XY & {
  connectionName?: string
  portPointId?: string
  z?: number
}

export type HdRoute = {
  capacityMeshNodeId?: string
  connectionName?: string
  rootConnectionName?: string
  route?: RoutePoint[]
  traceThickness?: number
  vias?: Array<{ x: number; y: number; diameter?: number }>
  viaDiameter?: number
}

export type Obstacle = {
  type?: string
  center?: XY
  width?: number
  height?: number
}

export type BoundarySide = "left" | "right" | "top" | "bottom"

export type BoundaryRect = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
  center: XY
}

export type Segment = {
  start: RoutePoint
  end: RoutePoint
  routeIndex: number
  pointIndex: number
  endPointIndex: number
  thickness: number
  halfThickness: number
  layer: "top" | "bottom"
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type RouteVia = {
  center: XY
  radius: number
  routeIndex: number
}

export type RouteGeometry = {
  segments: Segment[]
  segmentsByLayer: {
    top: Segment[]
    bottom: Segment[]
  }
  vias: RouteVia[]
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
}

export type RouteGeometryCache = WeakMap<HdRoute, RouteGeometry>

export type VisualizationFrame = {
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
  captureProgressFrames?: boolean
  showBoundryViolationMarkers?: boolean
}

export type BuildRepairFramesResult = {
  boundary: BoundaryRect | null
  baseRoutes: HdRoute[]
  repairedRoutes: HdRoute[]
  frames: VisualizationFrame[]
  margin: number
}

export type EvaluateRouteMoveResult = {
  isTwoPointRoute: boolean
  movableIndexes: number[]
  candidateRouteIndexes: Set<number>
  movedTwoPointRouteIndexes: Set<number>
  candidateRoutes: HdRoute[]
  rejected: boolean
  rejectionReason: string
}
