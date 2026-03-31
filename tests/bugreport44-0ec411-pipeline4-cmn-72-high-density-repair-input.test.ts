import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "./fixtures/visualize-solver"

test("visual snapshot: bugreport44 0ec411 pipeline4 cmn_72 repair input", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../assets/bugreport44-0ec411-pipeline4-cmn_72-high-density-repair-input.json",
  )
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
