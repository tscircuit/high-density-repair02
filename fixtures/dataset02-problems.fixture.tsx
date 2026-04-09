import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { HighDensityRepairSolver } from "lib/high-density-repair-solver"
import type { DatasetSample } from "lib/high-density-repair-solver/shared/types"
import { useEffect, useMemo, useState } from "react"

type AssetSolverInput = {
  sample?: DatasetSample
  margin?: number
}

type AssetProblem = {
  caseName: string
  sourcePath: string
  loadInput: () => Promise<AssetSolverInput>
}

const assetModules = {
  ...import.meta.glob<AssetSolverInput>("../datasets/dataset02/*.json"),
}

const isRelevantCaseName = (caseName: string) =>
  /(circuit|bugreport|repro|repair-input)/i.test(caseName) &&
  !/^sample\d{4}$/i.test(caseName)

const assetProblems: AssetProblem[] = Object.entries(assetModules)
  .map(([sourcePath, loadInput]) => {
    const fileName = sourcePath.split("/").at(-1) ?? sourcePath
    const caseName = fileName.replace(/\.json$/, "")
    return { caseName, sourcePath, loadInput }
  })
  .filter((entry) => isRelevantCaseName(entry.caseName))
  .sort(
    (a, b) =>
      a.caseName.localeCompare(b.caseName) ||
      a.sourcePath.localeCompare(b.sourcePath),
  )

export default function Dataset02ProblemsFixture() {
  const [caseNumberInput, setCaseNumberInput] = useState("1")
  const [input, setInput] = useState<AssetSolverInput | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const maxCaseNumber = assetProblems.length
  const parsedCaseNumber = Number.parseInt(caseNumberInput, 10)
  const safeCaseNumber = Number.isFinite(parsedCaseNumber)
    ? Math.min(Math.max(parsedCaseNumber, 1), maxCaseNumber)
    : 1
  const selectedProblem = assetProblems[safeCaseNumber - 1] ?? assetProblems[0]

  useEffect(() => {
    if (!selectedProblem) {
      setInput(null)
      setLoadError(null)
      return
    }

    let cancelled = false

    setInput(null)
    setLoadError(null)

    void selectedProblem
      .loadInput()
      .then((nextInput) => {
        if (!cancelled) {
          setInput(nextInput)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load input.",
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedProblem])

  const sample = input?.sample
  const margin = input?.margin ?? 0.4

  const solver = useMemo(
    () =>
      sample
        ? new HighDensityRepairSolver({
            sample,
            margin,
            captureProgressFrames: true,
          })
        : null,
    [margin, sample],
  )

  if (!selectedProblem) {
    return <div>No circuit/bugreport/repro assets found.</div>
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label htmlFor="asset-problem-number">Asset case #</label>
        <input
          id="asset-problem-number"
          type="number"
          min={1}
          max={maxCaseNumber}
          value={caseNumberInput}
          onChange={(event) => setCaseNumberInput(event.currentTarget.value)}
          style={{ width: 96 }}
        />
        <button
          type="button"
          onClick={() =>
            setCaseNumberInput(String(Math.max(1, safeCaseNumber - 1)))
          }
        >
          Prev
        </button>
        <button
          type="button"
          onClick={() =>
            setCaseNumberInput(
              String(Math.min(maxCaseNumber, safeCaseNumber + 1)),
            )
          }
        >
          Next
        </button>
        <span>
          Showing {selectedProblem.caseName} ({safeCaseNumber} / {maxCaseNumber}
          )
        </span>
      </div>

      <div style={{ fontFamily: "monospace", fontSize: 12 }}>
        Source: {selectedProblem.sourcePath}
      </div>

      {loadError ? <div>Failed to load input: {loadError}</div> : null}
      {!loadError && input && !sample ? (
        <div>Loaded input has no `sample` field.</div>
      ) : null}

      {solver ? (
        <GenericSolverDebugger
          key={selectedProblem.caseName}
          createSolver={() =>
            new HighDensityRepairSolver({
              sample,
              margin,
              captureProgressFrames: true,
            })
          }
        />
      ) : loadError || (input && !sample) ? null : (
        <div>Loading {selectedProblem.caseName}...</div>
      )}
    </div>
  )
}
