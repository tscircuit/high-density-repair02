import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { gunzipSync } from "node:zlib"
import { HighDensityRepairSolver, type DatasetSample } from "../lib"

type OriginalResult = {
  sample: DatasetSample
  margin: number
  iterations: number
  hash: string
  stats: Record<string, unknown>
}

test("obstacle broadphase and clearance caching preserve the original 7296-candidate repair exactly", async (): Promise<void> => {
  const bytes = await Bun.file(new URL("./fixtures/repair02-obstacle-original-result.json.gz", import.meta.url)).arrayBuffer()
  const original: OriginalResult = JSON.parse(gunzipSync(bytes).toString())
  const solver = new HighDensityRepairSolver({ sample: original.sample, margin: original.margin, repairBoundaryDiagonals: false })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.iterations).toBe(original.iterations)
  expect(solver.stats).toEqual(original.stats)
  expect(createHash("sha256").update(JSON.stringify(solver.getOutput())).digest("hex")).toBe(original.hash)
})
