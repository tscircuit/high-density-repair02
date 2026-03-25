import type { DatasetSample } from "lib/high-density-repair-solver"
import { HighDensityRepairSolver } from "lib/high-density-repair-solver"

export const renderInitialState = async (
  sampleName: string,
  obstacleSideMargin = 0.4,
  clearSideMargin = 0.2,
) => {
  const samplePath = new URL(
    `../../node_modules/dataset-hd08/samples/${sampleName}.json`,
    import.meta.url,
  )
  const sample = (await Bun.file(samplePath).json()) as DatasetSample
  const solver = new HighDensityRepairSolver({
    sample,
    obstacleSideMargin,
    clearSideMargin,
  })
  solver.solve()
  return solver.visualize()
}
