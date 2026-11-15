import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { HighDensityRepairSolver } from "../../lib/high-density-repair-solver"
import type { DatasetSample } from "../../lib/high-density-repair-solver/shared/types"

const sample: DatasetSample = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./input.json.gz", import.meta.url)),
  ).toString(),
)
const started = performance.now()
const solver = new HighDensityRepairSolver({
  sample,
  margin: 0.2,
  captureProgressFrames: false,
  repairBoundaryDiagonals: false,
})
solver.solve()
const seconds = (performance.now() - started) / 1000
const output = JSON.stringify(solver.getOutput())
solver.setShowBoundryViolationMarkers(false)
writeFileSync(
  new URL("./board.svg", import.meta.url),
  getSvgFromGraphicsObject(solver.visualize(), { backgroundColor: "white" }),
)
console.log({
  seconds,
  sha256: createHash("sha256").update(output).digest("hex"),
  ...solver.stats,
})
