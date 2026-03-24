import type { RoutePoint } from "../shared/types"

export const clonePoint = (point: RoutePoint): RoutePoint => ({ ...point })
