import { HIGHLIGHT_COLOR } from "../shared/constants"
import type {
  BoundaryRect,
  BoundarySide,
  HdRoute,
  VisualizationFrame,
} from "../shared/types"
import { createBoundaryGridLines } from "./createBoundaryGridLines"
import { createSideStripRect } from "./createSideStripRect"

export const createSideAnalysisFrame = (
  routes: HdRoute[],
  boundary: BoundaryRect,
  side: BoundarySide,
  margin: number,
  moveAmount: number,
  hasObstacle: boolean,
  gridStep: number,
): VisualizationFrame => ({
  title: `${side} boundary analysis: move=${moveAmount.toFixed(3)} (${hasObstacle ? "obstacle-side" : "clear-side"})`,
  routes,
  activeSide: side,
  overlayLines: createBoundaryGridLines(boundary, gridStep, side),
  overlayRects: [
    createSideStripRect(
      boundary,
      side,
      margin,
      HIGHLIGHT_COLOR,
      `strip:${side}`,
    ),
  ],
})
