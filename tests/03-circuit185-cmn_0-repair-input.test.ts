import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "./fixtures/visualize-solver"

test("visual snapshot: 03-circuit185-cmn_0 repair input", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../../datasets/dataset02/03-circuit185-cmn_0-repair-input.json",
  )
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
