import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "./fixtures/visualize-solver"

test("visual snapshot: 08-circuit103-cmn_3 repair input", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../../datasets/dataset02/08-circuit103-cmn_3-repair-input.json",
  )
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
