import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { datasetProblems } from "fixtures/dataset"
import { HighDensityRepairSolver } from "lib/high-density-repair-solver"
import { useEffect, useState } from "react"

export default function AllDatasetProblemsFixture() {
  const [sampleNumberInput, setSampleNumberInput] = useState("1")
  const [sample, setSample] = useState<unknown>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const maxSampleNumber = datasetProblems.length
  const parsedSampleNumber = Number.parseInt(sampleNumberInput, 10)
  const safeSampleNumber = Number.isFinite(parsedSampleNumber)
    ? Math.min(Math.max(parsedSampleNumber, 1), maxSampleNumber)
    : 1
  const selectedProblem =
    datasetProblems[safeSampleNumber - 1] ?? datasetProblems[0]

  useEffect(() => {
    if (!selectedProblem) {
      setSample(null)
      setLoadError(null)
      return
    }

    let cancelled = false

    setSample(null)
    setLoadError(null)

    void selectedProblem
      .loadSample()
      .then((nextSample) => {
        if (!cancelled) {
          setSample(nextSample)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load dataset sample.",
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedProblem])

  if (!selectedProblem) {
    return <div>Dataset is empty.</div>
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label htmlFor="dataset-problem-number">Dataset problem #</label>
        <input
          id="dataset-problem-number"
          type="number"
          min={1}
          max={maxSampleNumber}
          value={sampleNumberInput}
          onChange={(event) => setSampleNumberInput(event.currentTarget.value)}
          style={{ width: 96 }}
        />
        <button
          type="button"
          onClick={() =>
            setSampleNumberInput(String(Math.max(1, safeSampleNumber - 1)))
          }
        >
          Prev
        </button>
        <button
          type="button"
          onClick={() =>
            setSampleNumberInput(
              String(Math.min(maxSampleNumber, safeSampleNumber + 1)),
            )
          }
        >
          Next
        </button>
        <span>
          Showing {selectedProblem.sampleName} ({safeSampleNumber} /{" "}
          {maxSampleNumber})
        </span>
      </div>

      {loadError ? <div>Failed to load sample: {loadError}</div> : null}

      {sample ? (
        <GenericSolverDebugger
          key={selectedProblem.sampleName}
          createSolver={() =>
            new HighDensityRepairSolver({
              sample,
              obstacleSideMargin: 0.4,
              clearSideMargin: 0.2,
            })
          }
        />
      ) : loadError ? null : (
        <div>Loading {selectedProblem.sampleName}...</div>
      )}
    </div>
  )
}
