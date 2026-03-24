import type { BoundaryRect, HdRoute, VisualizationFrame } from "../shared/types"
import { createBoundaryGridLines } from "./createBoundaryGridLines"

export const createInitialFrame = (
  routes: HdRoute[],
  boundary: BoundaryRect,
  margin: number,
  gridStep: number,
): VisualizationFrame => ({
  title: `HighDensityRepair02 Initial State (margin=${margin})`,
  routes,
  overlayLines: createBoundaryGridLines(boundary, gridStep),
})
