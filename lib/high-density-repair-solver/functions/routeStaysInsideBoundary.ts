import type { BoundaryRect, HdRoute } from "../shared/types"
import { isPointInsideBoundary } from "./isPointInsideBoundary"

export const routeStaysInsideBoundary = (
  route: HdRoute,
  boundary: BoundaryRect,
) =>
  (route.route ?? []).every((point) => isPointInsideBoundary(point, boundary))
