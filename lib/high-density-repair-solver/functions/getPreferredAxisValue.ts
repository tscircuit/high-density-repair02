import type { BoundaryRect, BoundarySide } from "../shared/types"
import { clamp } from "./clamp"
import { snapToGrid } from "./snapToGrid"

export const getPreferredAxisValue = (
  side: BoundarySide,
  moveAmount: number,
  boundary: BoundaryRect,
  gridStep: number,
) => {
  switch (side) {
    case "left":
      return clamp(
        snapToGrid(
          boundary.minX + moveAmount,
          gridStep,
          boundary.minX,
          "inward-positive",
        ),
        boundary.minX,
        boundary.maxX,
      )
    case "right":
      return clamp(
        snapToGrid(
          boundary.maxX - moveAmount,
          gridStep,
          boundary.minX,
          "inward-negative",
        ),
        boundary.minX,
        boundary.maxX,
      )
    case "top":
      return clamp(
        snapToGrid(
          boundary.maxY - moveAmount,
          gridStep,
          boundary.minY,
          "inward-negative",
        ),
        boundary.minY,
        boundary.maxY,
      )
    case "bottom":
      return clamp(
        snapToGrid(
          boundary.minY + moveAmount,
          gridStep,
          boundary.minY,
          "inward-positive",
        ),
        boundary.minY,
        boundary.maxY,
      )
  }
}
