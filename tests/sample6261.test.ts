import { expect, test } from "bun:test"
import "graphics-debug/matcher"
import { renderInitialState } from "./fixtures/visualize-solver"

test("visual snapshot: sample6261 initial state", async () => {
  const graphics = await renderInitialState("sample6261")
  await expect(graphics).toMatchGraphicsSvg(import.meta.path)
})
