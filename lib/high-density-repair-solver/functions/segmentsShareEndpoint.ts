import type { Segment } from "../shared/types"
import { pointsCoincide } from "./pointsCoincide"

export const segmentsShareEndpoint = (a: Segment, b: Segment) =>
  pointsCoincide(a.start, b.start) ||
  pointsCoincide(a.start, b.end) ||
  pointsCoincide(a.end, b.start) ||
  pointsCoincide(a.end, b.end)
