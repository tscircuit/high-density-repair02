import type { BoundaryRect, BoundarySide } from "../shared/types"

export const createSideStripRect = (
  boundary: BoundaryRect,
  side: BoundarySide,
  depth: number,
  fill: string,
  label: string,
) => {
  switch (side) {
    case "left":
      return {
        center: { x: boundary.minX + depth / 2, y: boundary.center.y },
        width: depth,
        height: boundary.height,
        stroke: "#f59e0b",
        fill,
        label,
      }
    case "right":
      return {
        center: { x: boundary.maxX - depth / 2, y: boundary.center.y },
        width: depth,
        height: boundary.height,
        stroke: "#f59e0b",
        fill,
        label,
      }
    case "top":
      return {
        center: { x: boundary.center.x, y: boundary.maxY - depth / 2 },
        width: boundary.width,
        height: depth,
        stroke: "#f59e0b",
        fill,
        label,
      }
    case "bottom":
      return {
        center: { x: boundary.center.x, y: boundary.minY + depth / 2 },
        width: boundary.width,
        height: depth,
        stroke: "#f59e0b",
        fill,
        label,
      }
  }
}
