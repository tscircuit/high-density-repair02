import { CANDIDATE_STROKE } from "../shared/constants"
import type { HdRoute } from "../shared/types"
import { splitRouteIntoLayerSegments } from "./splitRouteIntoLayerSegments"

export const createOverlayLinesForRoutes = (
  routes: HdRoute[],
  routeIndexes: Iterable<number>,
) =>
  Array.from(routeIndexes).flatMap((routeIndex) =>
    splitRouteIntoLayerSegments(routes[routeIndex]).map((line) => ({
      ...line,
      strokeColor: CANDIDATE_STROKE,
      strokeWidth: line.strokeWidth,
      label: `candidate:${line.label}`,
    })),
  )
