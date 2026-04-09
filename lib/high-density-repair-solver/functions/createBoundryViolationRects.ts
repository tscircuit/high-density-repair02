import type { BufferZoneSegmentHit } from "./findInteriorDiagonalSegmentsInBufferZone"
import type { XY } from "../shared/types"

type BoundryViolationRect = {
  center: XY
  width: number
  height: number
  stroke: string
  fill: string
  label: string
}

const MIN_HIT_MARKER_LENGTH = 0.2
const HIT_MARKER_THICKNESS = 0.18

export const createBoundryViolationRects = (
  boundryViolations: BufferZoneSegmentHit[],
): BoundryViolationRect[] =>
  boundryViolations.map((violation) => {
    const dx = violation.end.x - violation.start.x
    const dy = violation.end.y - violation.start.y
    const segmentLength = Math.max(Math.hypot(dx, dy), MIN_HIT_MARKER_LENGTH)
    const isHorizontal = Math.abs(dx) >= Math.abs(dy)

    return {
      center: {
        x: (violation.start.x + violation.end.x) / 2,
        y: (violation.start.y + violation.end.y) / 2,
      },
      width: isHorizontal ? segmentLength : HIT_MARKER_THICKNESS,
      height: isHorizontal ? HIT_MARKER_THICKNESS : segmentLength,
      stroke: "#b45309",
      fill: "rgba(250, 204, 21, 0.45)",
      label: `boundry-violation:${violation.routeIndex}:${violation.segmentIndex}`,
    }
  })
