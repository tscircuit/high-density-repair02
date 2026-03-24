import { ACCEPT_COLOR, REJECT_COLOR } from "../shared/constants"
import type {
  BoundaryRect,
  BoundarySide,
  HdRoute,
  VisualizationFrame,
} from "../shared/types"
import { createBoundaryGridLines } from "./createBoundaryGridLines"
import { createMovementArrow } from "./createMovementArrow"
import { createOverlayLinesForRoutes } from "./createOverlayLinesForRoutes"
import { createSideStripRect } from "./createSideStripRect"

export const createCandidateFrame = ({
  routes,
  candidateRoutes,
  candidateRouteIndexes,
  boundary,
  side,
  margin,
  moveAmount,
  gridStep,
  rejected,
  rejectionReason,
}: {
  routes: HdRoute[]
  candidateRoutes: HdRoute[]
  candidateRouteIndexes: Set<number>
  boundary: BoundaryRect
  side: BoundarySide
  margin: number
  moveAmount: number
  gridStep: number
  rejected: boolean
  rejectionReason: string
}): VisualizationFrame => {
  const routeNames = Array.from(candidateRouteIndexes).map(
    (index) => candidateRoutes[index].connectionName ?? `route-${index}`,
  )

  return {
    title: rejected
      ? `${side} move rejected (${rejectionReason})`
      : `${side} move accepted`,
    routes,
    activeSide: side,
    candidateRouteNames: routeNames,
    overlayLines: [
      ...createBoundaryGridLines(boundary, gridStep, side),
      ...createOverlayLinesForRoutes(candidateRoutes, candidateRouteIndexes),
    ],
    overlayRects: [
      createSideStripRect(
        boundary,
        side,
        margin,
        rejected ? REJECT_COLOR : ACCEPT_COLOR,
        rejected ? `rejected:${side}` : `accepted:${side}`,
      ),
    ],
    overlayArrows: [createMovementArrow(boundary, side, moveAmount)],
  }
}
