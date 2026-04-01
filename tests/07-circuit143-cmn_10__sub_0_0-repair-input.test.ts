import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "./fixtures/visualize-solver"

test("visual snapshot: 07-circuit143-cmn_10__sub_0_0 repair input", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../assets/07-circuit143-cmn_10__sub_0_0-repair-input.json",
  )
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
