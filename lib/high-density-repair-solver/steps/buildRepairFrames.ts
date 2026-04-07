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
  const margin = Math.max(requestedMargin ?? 0.4, 0.05)
  const repairedRoutes = cloneRoutes(baseRoutes)

  if (!boundary) {
    return {
      boundary: null,
      baseRoutes,
      repairedRoutes,
      margin,
      frames: [
        {
          title: "HighDensityRepair02 Missing Boundary",
          routes: repairedRoutes,
        },
      ],
    }
  }

  const frames: VisualizationFrame[] = captureProgressFrames
    ? [createInitialFrame(cloneRoutes(repairedRoutes), margin)]
    : []
  const lockedTwoPointRoutes = new Set<number>()
  const geometryCache: RouteGeometryCache = new WeakMap()

  for (const side of BOUNDARY_SIDES) {
    processBoundarySide({
      side,
      sample,
      boundary,
      margin,
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
      margin,
    ),
  )

  return {
    boundary,
    baseRoutes,
    repairedRoutes,
    frames,
    margin,
  }
}
