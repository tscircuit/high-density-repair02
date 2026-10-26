import { expect, spyOn, test } from "bun:test"
import Flatbush from "flatbush"
import { RouteCopperScenePatternCache } from "../lib/high-density-repair-solver/functions/repairNodeClearance"
import type { HdRoute, XY } from "../lib/high-density-repair-solver/shared/types"

type Geometry = { start: XY; end: XY; radius: number }

test("unchanged candidate query boxes reuse hits while changed boxes and clearance are searched exactly", (): void => {
  const routes: HdRoute[] = [{ route: [] }, { route: [] }]
  const fixed: HdRoute[] = []
  const unchanged: Geometry[] = Array.from({ length: 40 }, (_, index) => ({ start: { x: index / 10, y: 0 }, end: { x: index / 10, y: 1 }, radius: 0.1 }))
  const moving: Geometry[] = [
    { start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, radius: 0.1 },
    { start: { x: 1, y: 0 }, end: { x: 2, y: 0 }, radius: 0.1 },
  ]
  const cache = new RouteCopperScenePatternCache()
  const search = spyOn(Flatbush.prototype, "search")
  try {
    const initial = cache.getCandidatePairs(routes, fixed, 0, [moving, unchanged], 0.1)
    expect(search.mock.calls.length).toBe(2)
    expect(cache.getCandidatePairs(routes, fixed, 0, [structuredClone(moving), unchanged], 0.1)).toEqual(initial)
    expect(search.mock.calls.length).toBe(2)
    const changed = [moving[0]!, { ...moving[1]!, start: { x: 20, y: 0 }, end: { x: 21, y: 0 } }]
    const result = cache.getCandidatePairs(routes, fixed, 0, [changed, unchanged], 0.1)
    expect(search.mock.calls.length).toBe(3)
    const expanded = cache.getCandidatePairs(routes, fixed, 0, [changed, unchanged], 0.3)
    expect(search.mock.calls.length).toBe(5)
    expect(result).toEqual(new RouteCopperScenePatternCache().getCandidatePairs(routes, fixed, 0, [changed, unchanged], 0.1))
    expect(expanded).toEqual(new RouteCopperScenePatternCache().getCandidatePairs(routes, fixed, 0, [changed, unchanged], 0.3))
  } finally {
    search.mockRestore()
  }
})
