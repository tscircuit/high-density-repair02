import type { ViaLayerPolicy } from "../shared/types"

/** Keep signal endpoints separate from the physical span of a drilled via. */
export const getViaLayerSpan = (
  minZ: number,
  maxZ: number,
  policy: ViaLayerPolicy,
): { minZ: number; maxZ: number } => {
  if (policy.layerCount !== undefined) {
    if (!Number.isInteger(policy.layerCount) || policy.layerCount < 1) {
      throw new Error("Via layer policy requires a positive integer layerCount")
    }
    if (policy.allowBlindAndBuriedVias !== true) {
      return { minZ: 0, maxZ: policy.layerCount - 1 }
    }
  }
  return { minZ, maxZ }
}
