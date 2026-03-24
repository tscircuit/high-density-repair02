import type { HdRoute } from "../shared/types"
import { cloneRoute } from "./cloneRoute"

export const cloneRoutes = (routes: HdRoute[]) => routes.map(cloneRoute)
