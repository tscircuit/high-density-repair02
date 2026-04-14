import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "../fixtures/visualize-solver"

test("repro: cmn_3 high density repair input", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../repros/assets/cmn_3-high-density-repair-input.json",
  )

  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
