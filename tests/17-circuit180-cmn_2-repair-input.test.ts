import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "./fixtures/visualize-solver"

test("visual snapshot: 17-circuit180-cmn_2 repair input", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../../datasets/dataset02/17-circuit180-cmn_2-repair-input.json",
  )
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
