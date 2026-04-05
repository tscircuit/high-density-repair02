import type { BufferZoneSegmentHit } from "./findInteriorDiagonalSegmentsInBufferZone"
import type { XY } from "../shared/types"

type BoundaryHitRect = {
  center: XY
  width: number
  height: number
  stroke: string
  fill: string
  label: string
}

const MIN_HIT_MARKER_LENGTH = 0.2
const HIT_MARKER_THICKNESS = 0.18

export const createBoundaryHitRects = (
  boundaryHits: BufferZoneSegmentHit[],
): BoundaryHitRect[] =>
  boundaryHits.map((hit) => {
    const dx = hit.end.x - hit.start.x
    const dy = hit.end.y - hit.start.y
    const segmentLength = Math.max(Math.hypot(dx, dy), MIN_HIT_MARKER_LENGTH)
    const isHorizontal = Math.abs(dx) >= Math.abs(dy)

    return {
      center: {
        x: (hit.start.x + hit.end.x) / 2,
        y: (hit.start.y + hit.end.y) / 2,
      },
      width: isHorizontal ? segmentLength : HIT_MARKER_THICKNESS,
      height: isHorizontal ? HIT_MARKER_THICKNESS : segmentLength,
      stroke: "#b45309",
      fill: "rgba(250, 204, 21, 0.45)",
      label: `boundary-hit:${hit.routeIndex}:${hit.segmentIndex}`,
    }
  })
