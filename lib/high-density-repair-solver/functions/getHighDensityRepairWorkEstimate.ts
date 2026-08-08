import type { DatasetSample } from "../shared/types"
import { getHighDensityRepairViolationCounts } from "./getHighDensityRepairViolationCounts"

export type HighDensityRepairWorkEstimate = {
  routePointCount: number
  violationCount: number
  estimatedRepairWork: number
}

export const getHighDensityRepairWorkEstimate = ({
  sample,
  margin,
}: {
  sample: DatasetSample | undefined
  margin: number | undefined
}): HighDensityRepairWorkEstimate => {
  const nodeHdRoutes = sample?.nodeHdRoutes ?? []
  const routePointCount = nodeHdRoutes.reduce(
    (total, route) => total + (route.route?.length ?? 0),
    0,
  )
  const violationCount = getHighDensityRepairViolationCounts({
    nodeWithPortPoints: sample?.nodeWithPortPoints,
    nodeHdRoutes,
    margin: Math.max(margin ?? 0.4, 0.05),
  }).totalViolationCount

  return {
    routePointCount,
    violationCount,
    estimatedRepairWork: routePointCount * violationCount,
  }
}
