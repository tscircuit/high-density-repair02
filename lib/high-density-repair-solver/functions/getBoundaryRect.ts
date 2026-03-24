import type { BoundaryRect, XY } from "../shared/types"

export const getBoundaryRect = (node?: {
  center?: XY
  width?: number
  height?: number
}): BoundaryRect | null => {
  if (!node?.center || !node.width || !node.height) return null

  return {
    minX: node.center.x - node.width / 2,
    maxX: node.center.x + node.width / 2,
    minY: node.center.y - node.height / 2,
    maxY: node.center.y + node.height / 2,
    width: node.width,
    height: node.height,
    center: node.center,
  }
}
