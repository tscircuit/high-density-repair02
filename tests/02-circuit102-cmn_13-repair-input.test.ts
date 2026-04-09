import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "./fixtures/visualize-solver"

test("visual snapshot: 02-circuit102-cmn_13 repair input", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../../datasets/dataset02/02-circuit102-cmn_13-repair-input.json",
  )
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
