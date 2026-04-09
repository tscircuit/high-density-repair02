import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "./fixtures/visualize-solver"

test("visual snapshot: 19-circuit158-cmn_4 repair input", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../../datasets/dataset02/19-circuit158-cmn_4-repair-input.json",
  )
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
