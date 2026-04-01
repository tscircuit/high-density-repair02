import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "./fixtures/visualize-solver"

test("visual snapshot: 13-circuit120-cmn_0__sub_1_0 repair input", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../assets/13-circuit120-cmn_0__sub_1_0-repair-input.json",
  )
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
