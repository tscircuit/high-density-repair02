import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import {
  HighDensityRepairSolver,
  type DatasetSample,
} from "lib/high-density-repair-solver"

test("repro: PMP22650 cmn_421 clearance repair input", async () => {
  const sample = (await Bun.file(
    new URL(
      "./assets/pmp22650-cmn421-repair-input.json",
      import.meta.url,
    ),
  ).json()) as DatasetSample
  const solver = new HighDensityRepairSolver({
    sample,
    margin: 0.2,
    repairBoundaryDiagonals: false,
  })

  await expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path)
})
