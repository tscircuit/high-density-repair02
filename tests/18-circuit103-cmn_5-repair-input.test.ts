import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "./fixtures/visualize-solver"

test("visual snapshot: 18-circuit103-cmn_5 repair input", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../../datasets/dataset02/18-circuit103-cmn_5-repair-input.json",
  )
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
