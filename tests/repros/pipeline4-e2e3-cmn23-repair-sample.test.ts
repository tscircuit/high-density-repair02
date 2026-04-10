import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialStateFromAsset } from "../fixtures/visualize-solver"

test("repro: pipeline4 e2e3 cmn23 repair sample", async () => {
  const graphics = await renderInitialStateFromAsset(
    "../repros/assets/pipeline4-e2e3-cmn23-repair-sample.json",
  )

  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
