import type { HdRoute } from "../shared/types"
import { cloneRoute } from "./cloneRoute"

/** Layer transitions own via positions; incoming cached records may be rounded. */
export const synchronizeRouteVias = (route: HdRoute): HdRoute => {
  const result = cloneRoute(route)
  const points = result.route ?? []
  const vias = result.vias ?? []
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1]!
    const end = points[index]!
    if ((start.z ?? 0) === (end.z ?? 0)) continue
    if (start.x !== end.x || start.y !== end.y) {
      throw new Error(
        "Node repair requires coincident via transition endpoints",
      )
    }
    let nearestIndex = -1
    let nearestDistance = 0.001
    for (let viaIndex = 0; viaIndex < vias.length; viaIndex++) {
      const via = vias[viaIndex]!
      const distance = Math.hypot(via.x - start.x, via.y - start.y)
      if (distance <= nearestDistance) {
        nearestIndex = viaIndex
        nearestDistance = distance
      }
    }
    if (nearestIndex === -1) {
      vias.push({ x: start.x, y: start.y, diameter: result.viaDiameter })
    } else {
      vias[nearestIndex] = { ...vias[nearestIndex]!, x: start.x, y: start.y }
    }
  }
  if (vias.length || result.vias) result.vias = vias
  return result
}
