import type { DatasetSample } from "lib/high-density-repair-solver"
import { HighDensityRepairSolver } from "lib/high-density-repair-solver"

type SolverInputAsset = {
  margin?: number
  sample?: DatasetSample
}

const isSolverInputAsset = (
  asset: DatasetSample | SolverInputAsset,
): asset is SolverInputAsset => "margin" in asset || "sample" in asset

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

export const loadAssetSolverInput = async (
  assetPath: string,
): Promise<SolverInputAsset> => {
  const asset = (await Bun.file(new URL(assetPath, import.meta.url)).json()) as
    | DatasetSample
    | SolverInputAsset

  if (isSolverInputAsset(asset)) {
    return {
      sample: asset.sample,
      margin: asset.margin,
    }
  }

  return { sample: asset }
}
