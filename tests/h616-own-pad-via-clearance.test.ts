import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { HighDensityRepairSolver, type DatasetSample } from "../lib"
import sample from "./fixtures/h616-own-pad-via-clearance.json"

test("H616 node repair preserves via separation from its own native pad", async (): Promise<void> => {
  const original = structuredClone(sample)
  const solver = new HighDensityRepairSolver({
    sample: sample as DatasetSample,
    margin: 0.1,
    repairBoundaryDiagonals: false,
  })
  solver.solve()
  const route = solver.getOutput().repairedRoutes[0]!
  const via = route.vias![0]!
  const pad = sample.clearanceObstacles.find((obstacle) =>
    obstacle.connectedTo.includes(route.rootConnectionName!),
  )!
  const separation = Math.hypot(via.x - pad.center.x, via.y - pad.center.y) -
    pad.width / 2 - via.diameter! / 2
  const graphics = solver.visualize()
  graphics.circles = [...(graphics.circles ?? []), {
    center: pad.center, radius: pad.width / 2,
    fill: "rgba(0,90,160,0.3)", label: "Connected pad",
  }]
  graphics.texts = [...(graphics.texts ?? []), {
    x: 6.4, y: 16.6, text: `Same-net via/pad separation: ${separation.toFixed(3)} mm`,
    fontSize: 0.05, anchorSide: "bottom_left",
  }]
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
  expect(solver.solved).toBeTrue()
  expect(sample).toEqual(original)
  expect(separation).toBeGreaterThanOrEqual(0)
  expect(route.route![0]).toEqual(sample.nodeHdRoutes[0]!.route[0])
  expect(route.route!.at(-1)).toEqual(sample.nodeHdRoutes[0]!.route.at(-1))
})
