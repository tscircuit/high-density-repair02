import type { BoundaryRect, HdRoute, VisualizationFrame } from "../shared/types"
import { createBoundaryGridLines } from "./createBoundaryGridLines"

export const createFinalFrame = (
  routes: HdRoute[],
  originalRoutes: HdRoute[],
  boundary: BoundaryRect,
  margin: number,
  gridStep: number,
): VisualizationFrame => ({
  title: `HighDensityRepair02 Final State (margin=${margin})`,
  routes,
  originalRoutes,
  overlayLines: createBoundaryGridLines(boundary, gridStep),
})
