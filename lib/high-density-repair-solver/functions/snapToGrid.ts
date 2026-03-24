import { EPSILON } from "../shared/constants"

export const snapToGrid = (
  value: number,
  step: number,
  origin: number,
  direction: "nearest" | "inward-positive" | "inward-negative" = "nearest",
) => {
  const offset = (value - origin) / step
  const snappedOffset =
    direction === "inward-positive"
      ? Math.ceil(offset - EPSILON)
      : direction === "inward-negative"
        ? Math.floor(offset + EPSILON)
        : Math.round(offset)

  return origin + snappedOffset * step
}
