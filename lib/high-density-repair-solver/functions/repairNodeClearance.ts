import { DEFAULT_TRACE_THICKNESS, EPSILON } from "../shared/constants"
import type { BoundaryRect, HdRoute, Obstacle, XY } from "../shared/types"
import { findInteriorDiagonalSegmentsInBufferZone } from "./findInteriorDiagonalSegmentsInBufferZone"
import { cloneRoute } from "./cloneRoute"
import type { FixedCopperClearanceGuard } from "./FixedCopperClearanceGuard"
import { segmentDistance } from "./segmentDistance"

type Copper = {
  start: XY
  end: XY
  radius: number
  minZ: number
  maxZ: number
  indexes: number[]
  via: boolean
  viaIndex?: number
}

type Conflict = {
  key: string
  firstRoute: number
  secondRoute: number
  first: Copper
  second: Copper
  penetration: number
}

type Evaluation = { conflicts: Conflict[]; score: number }

export type NodeClearanceRepairResult = {
  routes: HdRoute[]
  initialConflictCount: number
  finalConflictCount: number
  candidateCount: number
}

const collectCopper = (route: HdRoute): Copper[] => {
  const points = route.route ?? []
  const copper: Copper[] = []
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1]!
    const end = points[index]!
    if ((start.z ?? 0) !== (end.z ?? 0)) continue
    copper.push({
      start,
      end,
      radius: (route.traceThickness ?? DEFAULT_TRACE_THICKNESS) / 2,
      minZ: start.z ?? 0,
      maxZ: start.z ?? 0,
      indexes: [index - 1, index],
      via: false,
    })
  }
  for (const [viaIndex, via] of (route.vias ?? []).entries()) {
    const indexes = points.flatMap((point, index) =>
      point.x === via.x && point.y === via.y ? [index] : [],
    )
    const layers = indexes.map((index) => points[index]!.z ?? 0)
    copper.push({
      start: via,
      end: via,
      radius: (via.diameter ?? route.viaDiameter ?? 0.3) / 2,
      minZ: layers.length ? Math.min(...layers) : 0,
      maxZ: layers.length ? Math.max(...layers) : 1,
      indexes,
      via: true,
      viaIndex,
    })
  }
  return copper
}

const evaluate = (
  routes: HdRoute[],
  clearance: number,
  obstacles: Obstacle[],
  fixedRoutes: HdRoute[] = [],
  previous?: { evaluation: Evaluation; changedRoute: number },
  geometryCache = new WeakMap<HdRoute, Copper[]>(),
  padClearance: { trace?: number; via?: number } = {},
): Evaluation => {
  const allRoutes = [...routes, ...fixedRoutes]
  const geometries = allRoutes.map((route) => {
    let copper = geometryCache.get(route)
    if (!copper) {
      copper = collectCopper(route)
      geometryCache.set(route, copper)
    }
    return copper
  })
  const conflicts: Conflict[] = previous
    ? previous.evaluation.conflicts.filter(
        (conflict) =>
          conflict.firstRoute !== previous.changedRoute &&
          conflict.secondRoute !== previous.changedRoute,
      )
    : []
  let score = conflicts.reduce(
    (sum, conflict) => sum + conflict.penetration ** 2,
    0,
  )
  for (let firstRoute = 0; firstRoute < routes.length; firstRoute++) {
    const a = routes[firstRoute]!
    const names = new Set(
      [a.connectionName, a.rootConnectionName].filter(Boolean),
    )
    if (!previous || firstRoute === previous.changedRoute) {
      const vias = geometries[firstRoute]!.filter((part) => part.via)
      for (let firstIndex = 0; firstIndex < vias.length; firstIndex++) {
        const first = vias[firstIndex]!
        for (
          let secondIndex = firstIndex + 1;
          secondIndex < vias.length;
          secondIndex++
        ) {
          const second = vias[secondIndex]!
          if (first.maxZ < second.minZ || second.maxZ < first.minZ) continue
          const distance = Math.hypot(
            first.start.x - second.start.x,
            first.start.y - second.start.y,
          )
          if (distance === 0) continue
          const penetration =
            clearance + first.radius + second.radius - distance
          if (penetration <= EPSILON) continue
          conflicts.push({
            key: `${firstRoute}:vias:${firstIndex}:${secondIndex}`,
            firstRoute,
            secondRoute: firstRoute,
            first,
            second,
            penetration,
          })
          score += penetration ** 2
        }
      }
      for (const [obstacleIndex, obstacle] of obstacles.entries()) {
        if (obstacle.connectedTo?.some((name) => names.has(name))) continue
        const worstByType = new Map<string, Conflict>()
        for (const copper of geometries[firstRoute]!) {
          if (
            obstacle.zLayers &&
            !obstacle.zLayers.some((z) => z >= copper.minZ && z <= copper.maxZ)
          )
            continue
          const requiredClearance =
            (copper.via ? padClearance.via : padClearance.trace) ?? clearance
          const penetration = requiredClearance - distanceToObstacle(copper, obstacle)
          // Keep explicit board via rules independent of trace clearance.
          // A worse trace contact must not hide a new via-to-pad violation.
          const partKey =
            padClearance.trace !== undefined || padClearance.via !== undefined
              ? copper.via ? `via:${copper.viaIndex}` : `trace:${copper.minZ}`
              : "copper"
          if (
            penetration <= EPSILON ||
            penetration <= (worstByType.get(partKey)?.penetration ?? 0)
          )
            continue
          worstByType.set(partKey, {
            key: `${firstRoute}:pad:${obstacleIndex}:${partKey}`,
            firstRoute,
            secondRoute: -1,
            first: copper,
            second: copper,
            penetration,
          })
        }
        for (const worst of worstByType.values()) {
          conflicts.push(worst)
          score += worst.penetration ** 2
        }
      }
    }
    for (
      let secondRoute = firstRoute + 1;
      secondRoute < allRoutes.length;
      secondRoute++
    ) {
      if (
        previous &&
        firstRoute !== previous.changedRoute &&
        secondRoute !== previous.changedRoute
      )
        continue
      const b = allRoutes[secondRoute]!
      const sameNet =
        names.has(b.connectionName) || names.has(b.rootConnectionName)
      // Track each via and trace layer independently. A less severe contact
      // must not hide a new violation at another via or on another layer.
      // Trace segments still share a key so splitting one does not change
      // the objective merely by changing its number of pieces.
      const worstByType = new Map<string, Conflict>()
      for (const first of geometries[firstRoute]!) {
        for (const second of geometries[secondRoute]!) {
          if (sameNet && !(first.via && second.via)) continue
          if (first.maxZ < second.minZ || second.maxZ < first.minZ) continue
          if (
            sameNet &&
            first.start.x === second.start.x &&
            first.start.y === second.start.y
          )
            continue
          const required = clearance + first.radius + second.radius
          if (
            Math.min(first.start.x, first.end.x) >
              Math.max(second.start.x, second.end.x) + required ||
            Math.min(second.start.x, second.end.x) >
              Math.max(first.start.x, first.end.x) + required ||
            Math.min(first.start.y, first.end.y) >
              Math.max(second.start.y, second.end.y) + required ||
            Math.min(second.start.y, second.end.y) >
              Math.max(first.start.y, first.end.y) + required
          )
            continue
          const penetration =
            required -
            segmentDistance(first.start, first.end, second.start, second.end)
          if (penetration <= EPSILON) continue
          const firstKey = first.via
            ? `via:${first.viaIndex}`
            : `trace:${first.minZ}`
          const secondKey = second.via
            ? `via:${second.viaIndex}`
            : `trace:${second.minZ}`
          const key = `${firstKey}:${secondKey}`
          if (penetration <= (worstByType.get(key)?.penetration ?? 0)) continue
          worstByType.set(key, {
            key: `${firstRoute}:${secondRoute}:${key}`,
            firstRoute,
            secondRoute,
            first,
            second,
            penetration,
          })
        }
      }
      for (const conflict of worstByType.values()) {
        conflicts.push(conflict)
        score += conflict.penetration ** 2
      }
    }
  }
  conflicts.sort((a, b) => b.penetration - a.penetration)
  return { conflicts, score }
}

export const hasNodeClearanceRegression = (
  before: HdRoute[],
  after: HdRoute[],
  clearance: number,
): boolean => {
  const previous = new Map(
    evaluate(before, clearance, []).conflicts.map((conflict) => [
      conflict.key,
      conflict.penetration,
    ]),
  )
  return evaluate(after, clearance, []).conflicts.some(
    (conflict) =>
      conflict.penetration > (previous.get(conflict.key) ?? 0) + EPSILON,
  )
}

const distanceToObstacle = (copper: Copper, obstacle: Obstacle): number => {
  if (
    !obstacle.center ||
    obstacle.width === undefined ||
    obstacle.height === undefined
  )
    return Infinity
  const left = obstacle.center.x - obstacle.width / 2
  const right = obstacle.center.x + obstacle.width / 2
  const bottom = obstacle.center.y - obstacle.height / 2
  const top = obstacle.center.y + obstacle.height / 2
  let interiorPenetration = 0
  for (const point of [copper.start, copper.end]) {
    if (
      point.x >= left &&
      point.x <= right &&
      point.y >= bottom &&
      point.y <= top
    ) {
      interiorPenetration = Math.max(
        interiorPenetration,
        copper.radius +
          Math.min(
            point.x - left,
            right - point.x,
            point.y - bottom,
            top - point.y,
          ),
      )
    }
  }
  if (interiorPenetration > 0) return -interiorPenetration
  const corners = [
    { x: left, y: bottom },
    { x: right, y: bottom },
    { x: right, y: top },
    { x: left, y: top },
  ]
  return (
    Math.min(
      ...corners.map((point, index) =>
        segmentDistance(
          copper.start,
          copper.end,
          point,
          corners[(index + 1) % 4]!,
        ),
      ),
    ) - copper.radius
  )
}

export const getRouteObstacleClearance = (
  route: HdRoute,
  obstacle: Obstacle,
): number => {
  const relevantCopper = collectCopper(route).filter(
    (part) =>
      !obstacle.zLayers ||
      obstacle.zLayers.some((z) => z >= part.minZ && z <= part.maxZ),
  )
  return Math.min(
    ...relevantCopper.map((part) => distanceToObstacle(part, obstacle)),
  )
}

const moveCopper = (
  route: HdRoute,
  copper: Copper,
  dx: number,
  dy: number,
  boundary: BoundaryRect,
): HdRoute | undefined => {
  const candidate = cloneRoute(route)
  const points = candidate.route ?? []
  const originalPoints = route.route ?? []
  const fixed = (index: number) => index === 0 || index === points.length - 1
  const moving = new Set<number>()
  // Preserve node ports while moving the free end of a port-adjacent segment.
  // Moving only a new dogleg leaves the original interior corner in collision.
  for (const index of copper.indexes) {
    if (fixed(index)) continue
    const anchor = originalPoints[index]!
    originalPoints.forEach((point, otherIndex) => {
      if (point.x === anchor.x && point.y === anchor.y) moving.add(otherIndex)
    })
  }
  if ([...moving].some(fixed)) return undefined
  if (copper.via && copper.indexes.some(fixed)) return undefined
  if (moving.size === 0) {
    if (copper.via || copper.indexes.length !== 2) return undefined
    // A segment between two fixed ports needs a bend instead.
    const [startIndex, endIndex] = copper.indexes as [number, number]
    const start = points[startIndex]!
    const end = points[endIndex]!
    const additions = [0.25, 0.75].map((t) => ({
      ...start,
      x: start.x + (end.x - start.x) * t + dx,
      y: start.y + (end.y - start.y) * t + dy,
    }))
    points.splice(endIndex, 0, ...additions)
  } else {
    for (const index of moving) {
      points[index]!.x += dx
      points[index]!.y += dy
    }
    for (const via of candidate.vias ?? []) {
      if (
        [...moving].some(
          (index) =>
            originalPoints[index]!.x === via.x &&
            originalPoints[index]!.y === via.y,
        )
      ) {
        via.x += dx
        via.y += dy
      }
    }
  }
  if (
    points.some(
      (point, index) =>
        index > 0 &&
        index < points.length - 1 &&
        (point.x < boundary.minX ||
          point.x > boundary.maxX ||
          point.y < boundary.minY ||
          point.y > boundary.maxY),
    )
  )
    return undefined
  return candidate
}

/** Repair native node copper directly; never crop, stitch, or reconstruct a board. */
export const repairNodeClearance = ({
  routes,
  fixedRoutes = [],
  boundary,
  fixedCopperGuard,
  adjacentObstacles = [],
  clearanceObstacles = adjacentObstacles,
  clearance = 0.1,
  traceToPadClearance,
  viaToPadClearance,
  boundaryMargin = 0.2,
  maxCandidates,
}: {
  routes: HdRoute[]
  fixedRoutes?: HdRoute[]
  boundary: BoundaryRect
  fixedCopperGuard: FixedCopperClearanceGuard
  adjacentObstacles?: Obstacle[]
  clearanceObstacles?: Obstacle[]
  clearance?: number
  traceToPadClearance?: number
  viaToPadClearance?: number
  boundaryMargin?: number
  maxCandidates?: number
}): NodeClearanceRepairResult => {
  const padClearance = { trace: traceToPadClearance, via: viaToPadClearance }
  let current = routes
  const geometryCache = new WeakMap<HdRoute, Copper[]>()
  let evaluation = evaluate(
    current,
    clearance,
    clearanceObstacles,
    fixedRoutes,
    undefined,
    geometryCache,
    padClearance,
  )
  // Give each initial conflict a full sweep of both copper parts, three
  // distances and eight directions, with room for a second improving move.
  const candidateLimit =
    maxCandidates ?? Math.max(256, evaluation.conflicts.length * 96)
  const result: NodeClearanceRepairResult = {
    routes,
    initialConflictCount: evaluation.conflicts.length,
    finalConflictCount: evaluation.conflicts.length,
    candidateCount: 0,
  }
  while (
    evaluation.conflicts.length &&
    result.candidateCount < candidateLimit
  ) {
    let improved = false
    const currentPenetrations = new Map(
      evaluation.conflicts.map((conflict) => [
        conflict.key,
        conflict.penetration,
      ]),
    )
    for (const conflict of evaluation.conflicts) {
      for (const [routeIndex, copper] of [
        [conflict.firstRoute, conflict.first],
        [conflict.secondRoute, conflict.second],
      ] as const) {
        if (routeIndex < 0 || routeIndex >= current.length) continue
        const before = current[routeIndex]!
        const names = new Set(
          [before.connectionName, before.rootConnectionName].filter(Boolean),
        )
        const foreignObstacles = clearanceObstacles.filter(
          (obstacle) => !obstacle.connectedTo?.some((name) => names.has(name)),
        )
        const beforeCopper = collectCopper(before)
        const boundaryViolations = findInteriorDiagonalSegmentsInBufferZone(
          [before],
          boundary,
          boundaryMargin,
        ).length
        const obstacleClearances = foreignObstacles.map((obstacle) =>
          Math.min(
            ...beforeCopper
              .filter(
                (part) =>
                  !obstacle.zLayers ||
                  obstacle.zLayers.some(
                    (z) => z >= part.minZ && z <= part.maxZ,
                  ),
              )
              .map((part) => distanceToObstacle(part, obstacle)),
          ),
        )
        for (const scale of [1.01, 2, 4]) {
          const amount = Math.max(0.01, conflict.penetration * scale)
          for (const [x, y] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [Math.SQRT1_2, Math.SQRT1_2],
            [-Math.SQRT1_2, Math.SQRT1_2],
            [Math.SQRT1_2, -Math.SQRT1_2],
            [-Math.SQRT1_2, -Math.SQRT1_2],
          ]) {
            if (result.candidateCount >= candidateLimit) break
            result.candidateCount++
            const moved = moveCopper(
              before,
              copper,
              x! * amount,
              y! * amount,
              boundary,
            )
            if (!moved) continue
            if (
              findInteriorDiagonalSegmentsInBufferZone(
                [moved],
                boundary,
                boundaryMargin,
              ).length > boundaryViolations
            )
              continue
            const candidate = [...current]
            candidate[routeIndex] = moved
            const next = evaluate(
              candidate,
              clearance,
              clearanceObstacles,
              fixedRoutes,
              { evaluation, changedRoute: routeIndex },
              geometryCache,
              padClearance,
            )
            if (
              next.conflicts.length > evaluation.conflicts.length ||
              next.score >= evaluation.score - EPSILON ** 2
            )
              continue
            if (
              next.conflicts.some(
                (contact) =>
                  contact.penetration >
                  (currentPenetrations.get(contact.key) ?? 0) + EPSILON,
              )
            )
              continue
            if (
              !fixedCopperGuard.allows(current, candidate, [routeIndex], false)
            )
              continue
            const afterCopper = collectCopper(moved)
            if (
              foreignObstacles.some(
                (obstacle, index) =>
                  Math.min(
                    ...afterCopper
                      .filter(
                        (part) =>
                          !obstacle.zLayers ||
                          obstacle.zLayers.some(
                            (z) => z >= part.minZ && z <= part.maxZ,
                          ),
                      )
                      .map((part) => distanceToObstacle(part, obstacle)),
                  ) <
                  Math.min(clearance, obstacleClearances[index]!) - EPSILON,
              )
            )
              continue
            current = candidate
            evaluation = next
            improved = true
            break
          }
          if (improved || result.candidateCount >= candidateLimit) break
        }
        if (improved || result.candidateCount >= candidateLimit) break
      }
      if (improved || result.candidateCount >= candidateLimit) break
    }
    if (!improved) break
  }
  return {
    ...result,
    routes: current,
    finalConflictCount: evaluation.conflicts.length,
  }
}
