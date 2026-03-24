import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialState } from "./fixtures/visualize-solver"

test("visual snapshot: sample3118 initial state", async () => {
  const graphics = await renderInitialState("sample3118")
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
