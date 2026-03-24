import { BOTTOM_LAYER_COLOR, TOP_LAYER_COLOR } from "../shared/constants"

export const getRouteStrokeColor = (layer: "top" | "bottom") =>
  layer === "bottom" ? BOTTOM_LAYER_COLOR : TOP_LAYER_COLOR
