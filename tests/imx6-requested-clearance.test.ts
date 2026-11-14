import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import {
  checkDifferentNetViaSpacing,
  checkEachPcbTraceNonOverlapping,
  checkHoleTraceClearance,
  checkPadTraceClearance,
  checkTracesAreContiguous,
  checkViaPadClearance,
  checkViaTraceClearance,
  checkViasInPads,
} from "@tscircuit/checks"
import "bun-match-svg"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { HighDensityRepairSolver } from "../lib"
import {
  applyNativeRepair,
  type NativeRepairFixture,
} from "./fixtures/apply-native-repair"

test("iMX6 DDR repair uses the requested copper clearance", async (): Promise<void> => {
  const fixture = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "./fixtures/imx6-ddr-repair-clearance.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  ) as NativeRepairFixture
  const original = structuredClone(fixture.sample)
  const solver = new HighDensityRepairSolver({
    sample: fixture.sample,
    margin: fixture.sample.minClearance,
    repairBoundaryDiagonals: false,
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(fixture.sample).toEqual(original)
  const repaired = solver.getOutput().repairedRoutes
  for (const [index, route] of repaired.entries()) {
    expect(route.route?.[0]).toEqual(original.nodeHdRoutes[index]!.route[0])
    expect(route.route?.at(-1)).toEqual(
      original.nodeHdRoutes[index]!.route.at(-1),
    )
  }
  const circuit = applyNativeRepair(fixture, repaired)
  expect(
    circuit.filter((element) => element.type === "source_component"),
  ).toHaveLength(498)
  expect(
    circuit.filter((element) => element.type === "source_trace"),
  ).toHaveLength(588)
  const options = { minClearance: fixture.sample.minClearance }
  expect(checkViaTraceClearance(circuit, options)).toHaveLength(3)
  expect(checkViasInPads(circuit)).toHaveLength(0)
  for (const check of [
    checkEachPcbTraceNonOverlapping,
    checkPadTraceClearance,
    checkViaPadClearance,
    checkDifferentNetViaSpacing,
    checkTracesAreContiguous,
    checkHoleTraceClearance,
  ]) {
    expect(check(circuit, options)).toHaveLength(0)
  }
  const renderOptions = {
    width: 1400,
    height: 1000,
    backgroundColor: "white",
    showSolderMask: false,
    shouldDrawErrors: false,
    shouldDrawRatsNest: false,
    includeVersion: false,
  }
  await expect(
    convertCircuitJsonToPcbSvg(circuit, renderOptions),
  ).toMatchSvgSnapshot(import.meta.path)
  await expect(
    convertCircuitJsonToPcbSvg(circuit, {
      ...renderOptions,
      viewport: { minX: -5.6, maxX: -3.8, minY: -13.05, maxY: -11.7 },
    }),
  ).toMatchSvgSnapshot(import.meta.path, "ba2-address")
})
