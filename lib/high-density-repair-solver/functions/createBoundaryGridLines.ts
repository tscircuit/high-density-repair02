import { EPSILON, GRID_COLOR } from "../shared/constants"
import type { BoundaryRect, BoundarySide, XY } from "../shared/types"

export const createBoundaryGridLines = (
  boundary: BoundaryRect,
  step: number,
  side?: BoundarySide,
) => {
  const lines: Array<{
    points: XY[]
    strokeColor: string
    strokeWidth: number
    label: string
  }> = []

  const clampedStep = Math.max(step, 0.05)

  for (
    let x = boundary.minX + clampedStep;
    x < boundary.maxX - EPSILON;
    x += clampedStep
  ) {
    lines.push({
      points: [
        { x, y: boundary.minY },
        { x, y: boundary.maxY },
      ],
      strokeColor: GRID_COLOR,
      strokeWidth: 0.02,
      label: side ? `grid:${side}:v` : "grid:v",
    })
  }

  for (
    let y = boundary.minY + clampedStep;
    y < boundary.maxY - EPSILON;
    y += clampedStep
  ) {
    lines.push({
      points: [
        { x: boundary.minX, y },
        { x: boundary.maxX, y },
      ],
      strokeColor: GRID_COLOR,
      strokeWidth: 0.02,
      label: side ? `grid:${side}:h` : "grid:h",
    })
  }

  return lines
}
