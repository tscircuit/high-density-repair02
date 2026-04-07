import { ACCEPT_COLOR, REJECT_COLOR } from "../shared/constants"
import type {
  BoundaryRect,
  BoundarySide,
  HdRoute,
  VisualizationFrame,
} from "../shared/types"
import { createOverlayLinesForRoutes } from "./createOverlayLinesForRoutes"
import { createSideStripRect } from "./createSideStripRect"

export const createCandidateFrame = ({
  routes,
  candidateRoutes,
  candidateRouteIndexes,
  originalRoutes,
  boundary,
  side,
  margin,
  rejected,
  rejectionReason,
}: {
  routes: HdRoute[]
  candidateRoutes: HdRoute[]
  candidateRouteIndexes: Set<number>
  originalRoutes?: HdRoute[]
  boundary: BoundaryRect
  side: BoundarySide
  margin: number
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
    routes: rejected ? routes : candidateRoutes,
    originalRoutes,
    activeSide: side,
    candidateRouteNames: routeNames,
    overlayLines: rejected
      ? createOverlayLinesForRoutes(candidateRoutes, candidateRouteIndexes)
      : [],
    overlayRects: [
      createSideStripRect(
        boundary,
        side,
        margin,
        rejected ? REJECT_COLOR : ACCEPT_COLOR,
        rejected ? `rejected:${side}` : `accepted:${side}`,
      ),
    ],
  }
}
