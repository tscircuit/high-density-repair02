import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "./fixtures/visualize-solver"

test("visual snapshot: 12-circuit123-cmn_9__sub_0_1 repair input", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../assets/12-circuit123-cmn_9__sub_0_1-repair-input.json",
  )
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
