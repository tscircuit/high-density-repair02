import type { DatasetSample } from "lib/high-density-repair-solver"
import { HighDensityRepairSolver } from "lib/high-density-repair-solver"

export const renderInitialState = async (sampleName: string, margin = 0.4) => {
  const samplePath = new URL(
    `../../datasets/dataset01/${sampleName}.json`,
    import.meta.url,
  )
  const sample = (await Bun.file(samplePath).json()) as DatasetSample
  const solver = new HighDensityRepairSolver({ sample, margin })
  solver.solve()
  return solver.visualize()
}

export const renderInitialStateFromAsset = async (assetPath: string) => {
  const input = await loadAssetSolverInput(assetPath)
  const solver = new HighDensityRepairSolver({
    sample: input.sample,
    margin: input.margin ?? 0.4,
  })
  solver.solve()
  return solver.visualize()
}

export const loadAssetSolverInput = async (assetPath: string) =>
  (await Bun.file(new URL(assetPath, import.meta.url)).json()) as {
    margin?: number
    sample?: DatasetSample
  }
