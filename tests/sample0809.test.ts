import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { HighDensityRepairSolver } from "../lib/high-density-repair-solver"
import { renderInitialState } from "./fixtures/visualize-solver"

test("visual snapshot: sample0809 initial state", async () => {
  const graphics = await renderInitialState("sample0809")
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})

test("sample0809 keeps vias aligned with layer transitions after repair", async () => {
  const samplePath = new URL(
    "../node_modules/dataset-hd08/samples/sample0809.json",
    import.meta.url,
  )
  const sample = await Bun.file(samplePath).json()
  const solver = new HighDensityRepairSolver({ sample, margin: 0.4 })

  solver.solve()

  const repairedRoutes = (solver as HighDensityRepairSolver & {
    repairedRoutes: Array<{
      route?: Array<{ x: number; y: number; z?: number }>
      vias?: Array<{ x: number; y: number }>
    }>
  }).repairedRoutes

  for (const route of repairedRoutes) {
    for (const via of route.vias ?? []) {
      const coincidentRoutePoints =
        route.route?.filter((point) => point.x === via.x && point.y === via.y) ?? []

      expect(coincidentRoutePoints.length).toBeGreaterThanOrEqual(2)
      expect(new Set(coincidentRoutePoints.map((point) => point.z ?? 0))).toEqual(
        new Set([0, 1]),
      )
    }
  }
})
