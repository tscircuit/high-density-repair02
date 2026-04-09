import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import type { DatasetSample } from "../../lib/high-density-repair-solver"
import { HighDensityRepairSolver } from "../../lib/high-density-repair-solver"

test("repro: circuit019 cmn_0 repair input at margin 0.1", async () => {
  const input = (await Bun.file(
    new URL(
      "../../datasets/dataset02/circuit019-cmn_0-repair-input.json",
      import.meta.url,
    ),
  ).json()) as { margin?: number; sample?: DatasetSample }

  const solver = new HighDensityRepairSolver({
    sample: input.sample,
    margin: 0.2,
  })
  solver.solve()

  await expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path)
})
