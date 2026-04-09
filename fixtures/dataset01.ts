import type { DatasetSample } from "../lib/high-density-repair-solver"

const datasetModules = import.meta.glob<DatasetSample>(
  "../node_modules/dataset-hd08/samples/*.json",
)

const sampleEntries = Object.entries(datasetModules)
  .map(([path, load]) => {
    const match = path.match(/\/(sample\d{4})\.json$/)
    return match ? ([match[1], load] as const) : null
  })
  .filter(
    (entry): entry is readonly [string, () => Promise<DatasetSample>] =>
      entry !== null,
  )
  .sort(([a], [b]) => a.localeCompare(b))

export interface Dataset01Problem {
  sampleName: string
  loadSample: () => Promise<DatasetSample>
}

export const dataset01Problems: Dataset01Problem[] = sampleEntries.map(
  ([sampleName, loadSample]) => ({
    sampleName,
    loadSample,
  }),
)

export const fullDataset01Fixture = {
  sampleCount: sampleEntries.length,
  sampleNames: sampleEntries.map(([name]) => name),
  problems: dataset01Problems,
}

export const getDataset01Sample = async (
  sampleName: string,
): Promise<DatasetSample> => {
  const problem = dataset01Problems.find(
    (entry) => entry.sampleName === sampleName,
  )

  if (!problem) {
    throw new Error(`Unknown dataset sample: ${sampleName}`)
  }

  return problem.loadSample()
}
