import { cloneRoutes } from "../functions/cloneRoutes"
import { createFinalFrame } from "../functions/createFinalFrame"
import { createInitialFrame } from "../functions/createInitialFrame"
import { getBoundaryRect } from "../functions/getBoundaryRect"
import { BOUNDARY_SIDES } from "../shared/constants"
import type {
  BuildRepairFramesResult,
  DatasetSample,
  HighDensityRepairSolverParams,
  VisualizationFrame,
} from "../shared/types"
import { processBoundarySide } from "./processBoundarySide"

export const buildRepairFrames = (
  sample: DatasetSample | undefined,
  params: Pick<
    HighDensityRepairSolverParams,
    "margin" | "obstacleSideMargin" | "clearSideMargin"
  >,
): BuildRepairFramesResult => {
  const boundary = getBoundaryRect(sample?.nodeWithPortPoints)
  const baseRoutes = cloneRoutes(sample?.nodeHdRoutes ?? [])
  const repairedRoutes = cloneRoutes(baseRoutes)
  const obstacleSideMargin = Math.max(
    params.obstacleSideMargin ?? params.margin ?? 0.4,
    0.05,
  )
  const clearSideMargin = Math.max(
    params.clearSideMargin ?? params.margin ?? 0.4,
    0.05,
  )
  const maxMargin = Math.max(obstacleSideMargin, clearSideMargin)

  if (!boundary) {
    return {
      boundary: null,
      baseRoutes,
      repairedRoutes,
      obstacleSideMargin,
      clearSideMargin,
      gridStep: Math.max(maxMargin / 2, 0.05),
      frames: [
        {
          title: "HighDensityRepair02 Missing Boundary",
          routes: repairedRoutes,
        },
      ],
    }
  }

  const gridStep = Math.max(maxMargin / 2, 0.05)
  const frames: VisualizationFrame[] = [
    createInitialFrame(
      cloneRoutes(repairedRoutes),
      boundary,
      obstacleSideMargin,
      clearSideMargin,
      gridStep,
    ),
  ]
  const lockedTwoPointRoutes = new Set<number>()

  for (const side of BOUNDARY_SIDES) {
    processBoundarySide({
      side,
      sample,
      boundary,
      obstacleSideMargin,
      clearSideMargin,
      gridStep,
      repairedRoutes,
      frames,
      lockedTwoPointRoutes,
    })
  }

  frames.push(
    createFinalFrame(
      cloneRoutes(repairedRoutes),
      cloneRoutes(baseRoutes),
      boundary,
      obstacleSideMargin,
      clearSideMargin,
      gridStep,
    ),
  )

  return {
    boundary,
    baseRoutes,
    repairedRoutes,
    frames,
    obstacleSideMargin,
    clearSideMargin,
    gridStep,
  }
}
