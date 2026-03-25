import type { BoundaryRect, HdRoute, VisualizationFrame } from "../shared/types"
import { createBoundaryGridLines } from "./createBoundaryGridLines"

export const createFinalFrame = (
  routes: HdRoute[],
  originalRoutes: HdRoute[],
  boundary: BoundaryRect,
  obstacleSideMargin: number,
  clearSideMargin: number,
  gridStep: number,
): VisualizationFrame => ({
  title: `HighDensityRepair02 Final State (obstacle=${obstacleSideMargin}, clear=${clearSideMargin})`,
  routes,
  originalRoutes,
  overlayLines: createBoundaryGridLines(boundary, gridStep),
})
