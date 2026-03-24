import type { RoutePoint } from "../shared/types"

export const getRoutePointLayer = (point?: RoutePoint): "top" | "bottom" =>
  point?.z === 1 ? "bottom" : "top"
