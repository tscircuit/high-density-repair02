import type { RoutePoint } from "../shared/types"
import { pointsCoincide } from "./pointsCoincide"

export const dedupeRoutePoints = (points: RoutePoint[]) => {
  const result: RoutePoint[] = []

  for (const point of points) {
    const previous = result[result.length - 1]
    if (previous && previous.z === point.z && pointsCoincide(previous, point)) {
      continue
    }
    result.push(point)
  }

  return result
}
