import type { HdRoute, VisualizationFrame } from "../shared/types"

export const createFinalFrame = (
  routes: HdRoute[],
  originalRoutes: HdRoute[],
  margin: number,
): VisualizationFrame => ({
  title: `HighDensityRepair02 Final State (margin=${margin})`,
  routes,
  originalRoutes,
})
