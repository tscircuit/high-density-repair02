import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialState } from "./fixtures/visualize-solver"

test("visual snapshot: sample0825 initial state", async () => {
  const graphics = await renderInitialState("sample0825")
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
