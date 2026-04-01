import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "./fixtures/visualize-solver"

test("visual snapshot: 10-circuit152-cmn_4 repair input", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../assets/10-circuit152-cmn_4-repair-input.json",
  )
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
