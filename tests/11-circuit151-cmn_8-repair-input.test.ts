import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "./fixtures/visualize-solver"

test("visual snapshot: 11-circuit151-cmn_8 repair input", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../../datasets/dataset02/11-circuit151-cmn_8-repair-input.json",
  )
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
