import type { HdRoute } from "../shared/types"
import { clonePoint } from "./clonePoint"

export const cloneRoute = (route: HdRoute): HdRoute => ({
  ...route,
  route: route.route?.map(clonePoint),
  vias: route.vias?.map((via) => ({ ...via })),
})
