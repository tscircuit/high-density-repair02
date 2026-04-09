import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { dataset01Problems } from "fixtures/dataset01"
import type { GraphicsObject } from "graphics-debug"
import { HighDensityRepairSolver } from "lib/high-density-repair-solver"
import { createSideStripRect } from "lib/high-density-repair-solver/functions/createSideStripRect"
import { getBoundaryRect } from "lib/high-density-repair-solver/functions/getBoundaryRect"
import { BOUNDARY_SIDES } from "lib/high-density-repair-solver/shared/constants"
import type { DatasetSample } from "lib/high-density-repair-solver/shared/types"
import { useEffect, useMemo, useState } from "react"

class FixtureDebugHighDensityRepairSolver extends HighDensityRepairSolver {
  override visualize(): GraphicsObject {
    const graphics = super.visualize()
    const node = this.params.sample?.nodeWithPortPoints
    const boundary = getBoundaryRect(node)

    if (!boundary) return graphics

    const nodeRect = {
      center: boundary.center,
      width: boundary.width,
      height: boundary.height,
      stroke: "#1d4ed8",
      fill: "rgba(29, 78, 216, 0.08)",
      label: node?.capacityMeshNodeId ?? "capacity-node",
    }

    const boundaryZoneRects = BOUNDARY_SIDES.map((side) =>
      createSideStripRect(
        boundary,
        side,
        this.params.margin ?? 0.4,
        "rgba(29, 78, 216, 0.12)",
        `boundary-zone:${side}`,
      ),
    )

    return {
      ...graphics,
      rects: [nodeRect, ...boundaryZoneRects, ...(graphics.rects ?? [])],
    }
  }
}

export default function Dataset01ProblemsFixture() {
  const [sampleNumberInput, setSampleNumberInput] = useState("1")
  const [sample, setSample] = useState<DatasetSample | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const margin = 0.4

  const maxSampleNumber = dataset01Problems.length
  const parsedSampleNumber = Number.parseInt(sampleNumberInput, 10)
  const safeSampleNumber = Number.isFinite(parsedSampleNumber)
    ? Math.min(Math.max(parsedSampleNumber, 1), maxSampleNumber)
    : 1
  const selectedProblem =
    dataset01Problems[safeSampleNumber - 1] ?? dataset01Problems[0]

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

  const solver = useMemo(
    () =>
      sample
        ? new FixtureDebugHighDensityRepairSolver({ sample, margin })
        : null,
    [margin, sample],
  )

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
              captureProgressFrames: true,
            })
          }
        />
      ) : loadError ? null : (
        <div>Loading {selectedProblem.sampleName}...</div>
      )}
    </div>
  )
}
