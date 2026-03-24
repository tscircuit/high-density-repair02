import type { DatasetSample } from "lib/high-density-repair-solver"
import { HighDensityRepairSolver } from "lib/high-density-repair-solver"

export const renderInitialState = async (sampleName: string, margin = 0.4) => {
  const samplePath = new URL(
    `../../node_modules/dataset-hd08/samples/${sampleName}.json`,
    import.meta.url,
  )
  const sample = (await Bun.file(samplePath).json()) as DatasetSample
  const solver = new HighDensityRepairSolver({ sample, margin })
  solver.solve()
  return solver.visualize()
}
