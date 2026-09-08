import { DEFAULT_TRACE_THICKNESS, EPSILON } from "../shared/constants"
import type { HdRoute, XY } from "../shared/types"
import { segmentDistance } from "./segmentDistance"

type Copper = {
  start: XY
  end: XY
  radius: number
  minZ: number
  maxZ: number
}

const getCopper = (route: HdRoute): Copper[] => {
  const copper: Copper[] = []
  const points = route.route ?? []
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1]
    const end = points[index]
    if ((start.z ?? 0) !== (end.z ?? 0)) continue
    copper.push({
      start,
      end,
      radius: (route.traceThickness ?? DEFAULT_TRACE_THICKNESS) / 2,
      minZ: start.z ?? 0,
      maxZ: start.z ?? 0,
    })
  }
  for (const via of route.vias ?? []) {
    let minZ = Infinity
    let maxZ = -Infinity
    for (let index = 1; index < points.length; index++) {
      const start = points[index - 1]
      const end = points[index]
      if (
        start.x !== via.x ||
        start.y !== via.y ||
        end.x !== via.x ||
        end.y !== via.y ||
        start.z === end.z
      )
        continue
      minZ = Math.min(minZ, start.z ?? 0, end.z ?? 0)
      maxZ = Math.max(maxZ, start.z ?? 0, end.z ?? 0)
    }
    // Legacy standalone via records have no layer span and occupy both layers.
    copper.push({
      start: via,
      end: via,
      radius:
        (via.diameter ?? route.viaDiameter ?? DEFAULT_TRACE_THICKNESS * 2) / 2,
      minZ: minZ === Infinity ? 0 : minZ,
      maxZ: maxZ === -Infinity ? 1 : maxZ,
    })
  }
  return copper
}

const clearanceToCopper = (geometry: Copper[], obstacle: Copper): number => {
  let clearance = Infinity
  for (const copper of geometry) {
    if (copper.maxZ < obstacle.minZ || obstacle.maxZ < copper.minZ) continue
    clearance = Math.min(
      clearance,
      segmentDistance(copper.start, copper.end, obstacle.start, obstacle.end) -
        copper.radius -
        obstacle.radius,
    )
  }
  return clearance
}

/** Preserve each foreign fixed-copper constraint while repairing a node. */
export class FixedCopperClearanceGuard {
  private readonly fixedCopper: Array<{ route: HdRoute; copper: Copper[] }>
  private readonly cache = new WeakMap<HdRoute, Copper[]>()

  constructor(
    fixedRoutes: HdRoute[],
    private readonly minimumClearance: number,
  ) {
    this.fixedCopper = fixedRoutes.map((route) => ({
      route,
      copper: getCopper(route),
    }))
  }

  allows(
    currentRoutes: HdRoute[],
    candidateRoutes: HdRoute[],
    indexes: Iterable<number>,
  ): boolean {
    if (this.fixedCopper.length === 0) return true
    for (const index of indexes) {
      const before = currentRoutes[index]
      const after = candidateRoutes[index]
      if (before === after) continue
      const beforeCopper = this.cache.get(before) ?? getCopper(before)
      const afterCopper = this.cache.get(after) ?? getCopper(after)
      this.cache.set(before, beforeCopper)
      this.cache.set(after, afterCopper)
      const names = new Set(
        [before.connectionName, before.rootConnectionName].filter(Boolean),
      )
      for (const fixed of this.fixedCopper) {
        if (
          names.has(fixed.route.connectionName) ||
          names.has(fixed.route.rootConnectionName)
        )
          continue
        for (const obstacle of fixed.copper) {
          const next = clearanceToCopper(afterCopper, obstacle)
          if (next >= this.minimumClearance - EPSILON) continue
          const previous = clearanceToCopper(beforeCopper, obstacle)
          if (next < Math.min(previous, this.minimumClearance) - EPSILON) {
            return false
          }
        }
      }
    }
    return true
  }
}
