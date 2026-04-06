import type { HdRoute, RoutePoint, XY } from "../shared/types"

export const getRouteInteriorSamplePoints = (
  route: HdRoute,
): Array<RoutePoint | XY> => {
  const points = route.route ?? []
  if (points.length === 0) return []

  const samples: Array<RoutePoint | XY> = []

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (!point) continue

    const isEndpoint = index === 0 || index === points.length - 1
    if (!isEndpoint) {
      samples.push(point)
    }

    const nextPoint = points[index + 1]
    if (!nextPoint) continue

    samples.push({
      x: (point.x + nextPoint.x) / 2,
      y: (point.y + nextPoint.y) / 2,
    })
  }

  return samples
}
