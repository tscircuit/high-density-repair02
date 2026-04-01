import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "./fixtures/visualize-solver"

test("visual snapshot: 20-circuit155-cmn_2__sub_0_1 repair input", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../assets/20-circuit155-cmn_2__sub_0_1-repair-input.json",
  )
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
