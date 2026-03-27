import type { HdRoute, RouteGeometryCache, Segment } from "../shared/types"
import { getRouteGeometry } from "./getRouteGeometry"

export const getRouteSegments = (
  route: HdRoute,
  routeIndex: number,
  cache?: RouteGeometryCache,
): Segment[] => {
  return getRouteGeometry(route, routeIndex, cache).segments
}
