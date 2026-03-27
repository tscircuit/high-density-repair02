import { cloneRoute } from "../functions/cloneRoute"
import { cloneRoutes } from "../functions/cloneRoutes"
import { createCandidateFrame } from "../functions/createCandidateFrame"
import { createSideAnalysisFrame } from "../functions/createSideAnalysisFrame"
import { getMoveAmountForSide } from "../functions/getMoveAmountForSide"
import type {
  BoundaryRect,
  BoundarySide,
  DatasetSample,
  HdRoute,
  RouteGeometryCache,
  VisualizationFrame,
} from "../shared/types"
import { evaluateRouteMove } from "./evaluateRouteMove"

export const processBoundarySide = ({
  side,
  sample,
  boundary,
  margin,
  gridStep,
  repairedRoutes,
  frames,
  lockedTwoPointRoutes,
  geometryCache,
}: {
  side: BoundarySide
  sample: DatasetSample | undefined
  boundary: BoundaryRect
  margin: number
  gridStep: number
  repairedRoutes: HdRoute[]
  frames: VisualizationFrame[]
  lockedTwoPointRoutes: Set<number>
  geometryCache: RouteGeometryCache
}) => {
  const { hasObstacle, moveAmount } = getMoveAmountForSide(
    sample,
    boundary,
    side,
    margin,
  )

  frames.push(
    createSideAnalysisFrame(
      cloneRoutes(repairedRoutes),
      boundary,
      side,
      margin,
      moveAmount,
      hasObstacle,
      gridStep,
    ),
  )

  const attemptedRoutes = new Set<number>()

  for (
    let routeIndex = 0;
    routeIndex < repairedRoutes.length;
    routeIndex += 1
  ) {
    if (attemptedRoutes.has(routeIndex)) continue
    if (lockedTwoPointRoutes.has(routeIndex)) continue

    const route = repairedRoutes[routeIndex]
    const isTwoPointRoute = (route.route?.length ?? 0) === 2
    if (isTwoPointRoute && !hasObstacle) continue

    const evaluation = evaluateRouteMove({
      currentRoutes: repairedRoutes,
      routeIndex,
      side,
      boundary,
      margin,
      gridStep,
      moveAmount,
      geometryCache,
    })
    if (!evaluation) continue

    frames.push(
      createCandidateFrame({
        routes: cloneRoutes(repairedRoutes),
        candidateRoutes: evaluation.candidateRoutes,
        candidateRouteIndexes: evaluation.candidateRouteIndexes,
        originalRoutes: evaluation.rejected
          ? undefined
          : Array.from(evaluation.candidateRouteIndexes).map((index) =>
              cloneRoute(repairedRoutes[index] as HdRoute),
            ),
        boundary,
        side,
        margin,
        moveAmount,
        gridStep,
        rejected: evaluation.rejected,
        rejectionReason: evaluation.rejectionReason,
      }),
    )

    if (!evaluation.rejected) {
      repairedRoutes.splice(
        0,
        repairedRoutes.length,
        ...evaluation.candidateRoutes,
      )
      for (const movedTwoPointRouteIndex of evaluation.movedTwoPointRouteIndexes) {
        lockedTwoPointRoutes.add(movedTwoPointRouteIndex)
      }
    }

    for (const candidateRouteIndex of evaluation.candidateRouteIndexes) {
      attemptedRoutes.add(candidateRouteIndex)
    }
  }
}
