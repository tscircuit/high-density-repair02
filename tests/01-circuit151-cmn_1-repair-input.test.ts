import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "./fixtures/visualize-solver"

test("visual snapshot: 01-circuit151-cmn_1 repair input", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../assets/01-circuit151-cmn_1-repair-input.json",
  )
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
