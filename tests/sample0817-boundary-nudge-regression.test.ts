import { expect, test } from "bun:test"
import type { HdRoute } from "../lib/high-density-repair-solver"
import { findClearanceConflicts } from "../lib/high-density-repair-solver/functions/findClearanceConflicts"
import { findTraceClearanceRegressions } from "../lib/high-density-repair-solver/functions/findTraceClearanceRegressions"
import { buildRepairFrames } from "../lib/high-density-repair-solver/steps/buildRepairFrames"

const toConflictKey = ({
  routeIndexes,
  layers,
}: {
  routeIndexes: [number, number]
  layers: ["top" | "bottom" | "via", "top" | "bottom" | "via"]
}) => `${routeIndexes[0]}:${layers[0]}:${routeIndexes[1]}:${layers[1]}`

const routeSignature = (route: HdRoute) =>
  JSON.stringify({
    route: route.route ?? [],
    vias: route.vias ?? [],
  })

test("sample0817 boundary nudge does not introduce zero conflicts or clearance regressions", async () => {
  const samplePath = new URL(
    "../datasets/dataset01/sample0817.json",
    import.meta.url,
  )
  const sample = await Bun.file(samplePath).json()
  const margin = 0.4

  const preNudgeResult = buildRepairFrames(sample, margin, false, {
    skipInteriorBoundaryNudge: true,
  })
  const postNudgeResult = buildRepairFrames(sample, margin)
  const preNudgeRoutes = preNudgeResult.repairedRoutes as HdRoute[]
  const postNudgeRoutes = postNudgeResult.repairedRoutes as HdRoute[]

  const movedRouteIndexes = new Set<number>()
  for (let index = 0; index < postNudgeRoutes.length; index += 1) {
    const beforeRoute = preNudgeRoutes[index] as HdRoute | undefined
    const afterRoute = postNudgeRoutes[index] as HdRoute | undefined
    if (!beforeRoute || !afterRoute) continue

    if (routeSignature(beforeRoute) !== routeSignature(afterRoute)) {
      movedRouteIndexes.add(index)
    }
  }

  expect(movedRouteIndexes.size).toBeGreaterThan(0)

  const currentZeroConflictKeys = new Set(
    findClearanceConflicts(preNudgeRoutes, movedRouteIndexes, 0).map(
      toConflictKey,
    ),
  )
  const candidateZeroConflictKeys = new Set(
    findClearanceConflicts(postNudgeRoutes, movedRouteIndexes, 0).map(
      toConflictKey,
    ),
  )

  for (const conflictKey of candidateZeroConflictKeys) {
    expect(currentZeroConflictKeys.has(conflictKey)).toBe(true)
  }

  const traceClearanceRegressions = findTraceClearanceRegressions({
    currentRoutes: preNudgeRoutes,
    candidateRoutes: postNudgeRoutes,
    candidateRouteIndexes: movedRouteIndexes,
    maximumAllowedClearance: margin,
  })

  expect(traceClearanceRegressions).toHaveLength(0)
})
