import type { BoundaryRect, HdRoute, VisualizationFrame } from "../shared/types"
import { createBoundaryGridLines } from "./createBoundaryGridLines"

export const createInitialFrame = (
  routes: HdRoute[],
  boundary: BoundaryRect,
  obstacleSideMargin: number,
  clearSideMargin: number,
  gridStep: number,
): VisualizationFrame => ({
  title: `HighDensityRepair02 Initial State (obstacle=${obstacleSideMargin}, clear=${clearSideMargin})`,
  routes,
  overlayLines: createBoundaryGridLines(boundary, gridStep),
})
