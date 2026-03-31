import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import { cloneRoutes } from "./high-density-repair-solver/functions/cloneRoutes"
import { getBoundaryRect } from "./high-density-repair-solver/functions/getBoundaryRect"
import { getRoutePointLayer } from "./high-density-repair-solver/functions/getRoutePointLayer"
import { splitRouteIntoLayerSegments } from "./high-density-repair-solver/functions/splitRouteIntoLayerSegments"
import { BOTTOM_LAYER_COLOR } from "./high-density-repair-solver/shared/constants"
import type {
  HdRoute,
  HighDensityRepairSolverParams,
  VisualizationFrame,
  XY,
} from "./high-density-repair-solver/shared/types"
import { buildRepairFrames } from "./high-density-repair-solver/steps/buildRepairFrames"

export type {
  DatasetSample,
  HdRoute,
  HighDensityRepairSolverParams,
} from "./high-density-repair-solver/shared/types"

export class HighDensityRepairSolver extends BaseSolver {
  private frames: VisualizationFrame[] = []
  private currentFrameIndex = 0
  public repairedRoutes: HdRoute[] = []

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
    const result = buildRepairFrames(
      this.params.sample,
      this.params.margin,
      this.params.captureProgressFrames ?? false,
    )
    this.frames = result.frames
    this.repairedRoutes = result.repairedRoutes
  }

  override visualize(): GraphicsObject {
    const sample = this.params.sample
    const node = sample?.nodeWithPortPoints
    const obstacles = sample?.adjacentObstacles ?? []
    const frame = this.frames[this.currentFrameIndex] ?? {
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
