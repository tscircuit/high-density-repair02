import type { HdRoute, VisualizationFrame } from "../shared/types"

export const createInitialFrame = (
  routes: HdRoute[],
  margin: number,
): VisualizationFrame => ({
  title: `HighDensityRepair02 Initial State (margin=${margin})`,
  routes,
})
