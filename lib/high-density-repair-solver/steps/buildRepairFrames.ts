import { cloneRoutes } from "../functions/cloneRoutes"
import { createFinalFrame } from "../functions/createFinalFrame"
import { createInitialFrame } from "../functions/createInitialFrame"
import { getBoundaryRect } from "../functions/getBoundaryRect"
import { BOUNDARY_SIDES } from "../shared/constants"
import type {
  BuildRepairFramesResult,
  DatasetSample,
  RouteGeometryCache,
  VisualizationFrame,
} from "../shared/types"
import { processBoundarySide } from "./processBoundarySide"

export const buildRepairFrames = (
  sample: DatasetSample | undefined,
  requestedMargin: number | undefined,
  captureProgressFrames = false,
): BuildRepairFramesResult => {
  const boundary = getBoundaryRect(sample?.nodeWithPortPoints)
  const baseRoutes = cloneRoutes(sample?.nodeHdRoutes ?? [])
  const repairedRoutes = cloneRoutes(baseRoutes)
  const margin = Math.max(requestedMargin ?? 0.4, 0.05)

  if (!boundary) {
    return {
      boundary: null,
      baseRoutes,
      repairedRoutes,
      margin,
      gridStep: Math.max(margin / 2, 0.05),
      frames: [
        {
          title: "HighDensityRepair02 Missing Boundary",
          routes: repairedRoutes,
        },
      ],
    }
  }

  const gridStep = Math.max(margin / 2, 0.05)
  const frames: VisualizationFrame[] = captureProgressFrames
    ? [
        createInitialFrame(
          cloneRoutes(repairedRoutes),
          boundary,
          margin,
          gridStep,
        ),
      ]
    : []
  const lockedTwoPointRoutes = new Set<number>()
  const geometryCache: RouteGeometryCache = new WeakMap()

  for (const side of BOUNDARY_SIDES) {
    processBoundarySide({
      side,
      sample,
      boundary,
      margin,
      gridStep,
      repairedRoutes,
      frames,
      captureProgressFrames,
      lockedTwoPointRoutes,
      geometryCache,
    })
  }

  frames.push(
    createFinalFrame(
      cloneRoutes(repairedRoutes),
      cloneRoutes(baseRoutes),
      boundary,
      margin,
      gridStep,
    ),
  )

  return {
    boundary,
    baseRoutes,
    repairedRoutes,
    frames,
    margin,
    gridStep,
  }
}
