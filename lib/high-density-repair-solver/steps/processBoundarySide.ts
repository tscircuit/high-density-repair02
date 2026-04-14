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

const getTangentialMoveSide = (
  route: HdRoute,
  movableIndexes: number[],
  boundary: BoundaryRect,
  side: BoundarySide,
  margin: number,
): BoundarySide | null => {
  const points = route.route ?? []
  if (movableIndexes.length === 0) return null

  if (side === "top" || side === "bottom") {
    const averageX =
      movableIndexes.reduce(
        (sum, index) => sum + (points[index]?.x ?? boundary.center.x),
        0,
      ) / movableIndexes.length

    if (averageX < boundary.center.x - margin / 2) return "right"
    if (averageX > boundary.center.x + margin / 2) return "left"
    return null
  }

  const averageY =
    movableIndexes.reduce(
      (sum, index) => sum + (points[index]?.y ?? boundary.center.y),
      0,
    ) / movableIndexes.length

  if (averageY > boundary.center.y + margin / 2) return "bottom"
  if (averageY < boundary.center.y - margin / 2) return "top"
  return null
}

export const processBoundarySide = ({
  side,
  sample,
  boundary,
  margin,
  repairedRoutes,
  frames,
  captureProgressFrames,
  lockedTwoPointRoutes,
  geometryCache,
}: {
  side: BoundarySide
  sample: DatasetSample | undefined
  boundary: BoundaryRect
  margin: number
  repairedRoutes: HdRoute[]
  frames: VisualizationFrame[]
  captureProgressFrames: boolean
  lockedTwoPointRoutes: Set<number>
  geometryCache: RouteGeometryCache
}) => {
  const { hasObstacle, moveAmount } = getMoveAmountForSide(
    sample,
    boundary,
    side,
    margin,
  )

  if (captureProgressFrames) {
    frames.push(
      createSideAnalysisFrame(
        cloneRoutes(repairedRoutes),
        boundary,
        side,
        margin,
        moveAmount,
        hasObstacle,
      ),
    )
  }

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

    let evaluation = evaluateRouteMove({
      currentRoutes: repairedRoutes,
      routeIndex,
      side,
      boundary,
      margin,
      moveAmount,
      geometryCache,
    })
    if (!evaluation) continue

    if (evaluation.rejected) {
      const tangentialMoveSide = getTangentialMoveSide(
        route,
        evaluation.movableIndexes,
        boundary,
        side,
        margin,
      )

      if (tangentialMoveSide) {
        const tangentialEvaluation = evaluateRouteMove({
          currentRoutes: repairedRoutes,
          routeIndex,
          side,
          moveSide: tangentialMoveSide,
          boundary,
          margin,
          moveAmount,
          geometryCache,
        })

        if (tangentialEvaluation && !tangentialEvaluation.rejected) {
          evaluation = tangentialEvaluation
        }
      }
    }

    if (captureProgressFrames) {
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
          rejected: evaluation.rejected,
          rejectionReason: evaluation.rejectionReason,
        }),
      )
    }

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

    attemptedRoutes.add(routeIndex)
  }
}
