import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialState } from "./fixtures/visualize-solver"

test("visual snapshot: sample1069 initial state", async () => {
  const graphics = await renderInitialState("sample1069")
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
