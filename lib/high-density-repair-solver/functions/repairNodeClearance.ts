import Flatbush from "flatbush"
import { DEFAULT_TRACE_THICKNESS, EPSILON } from "../shared/constants"
import type { BoundaryRect, HdRoute, Obstacle, XY } from "../shared/types"
import { cloneRoute } from "./cloneRoute"
import type { FixedCopperClearanceGuard } from "./FixedCopperClearanceGuard"
import { findInteriorDiagonalSegmentsInBufferZone } from "./findInteriorDiagonalSegmentsInBufferZone"
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

type OrderedConflict = Conflict & {
  firstCopperIndex: number
  secondCopperIndex: number
}

type Evaluation = { conflicts: Conflict[]; score: number }

type CopperSpatialIndex = {
  index?: Flatbush
  linearCandidateIndexes?: number[]
  maxRadius: number
}

type CopperSpatialIndexCache = WeakMap<HdRoute, CopperSpatialIndex>

type RouteCandidateContext = {
  foreignObstacles: Obstacle[]
  boundaryViolationCount: number
  obstacleClearances: number[]
}

type RoutePairEvaluation = {
  firstRoute: number
  secondRoute: number
  firstCopper: Copper[]
  secondCopper: Copper[]
  firstCopperSpatialIndex: CopperSpatialIndex
  secondCopperSpatialIndex: CopperSpatialIndex
  firstConnectionNames: Set<string | undefined>
  secondRouteConnectionName?: string
  secondRouteRootConnectionName?: string
  clearance: number
  firstCopperIndexes?: Set<number>
  secondCopperIndexes?: Set<number>
  retainedConflicts?: OrderedConflict[]
}

const MINIMUM_COPPER_COUNT_FOR_SPATIAL_INDEX = 16

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

const getCopperSpatialIndex = (
  route: HdRoute,
  copper: Copper[],
  cache: CopperSpatialIndexCache,
): CopperSpatialIndex => {
  const cached = cache.get(route)
  if (cached) return cached

  const result: CopperSpatialIndex = {
    maxRadius: Math.max(0, ...copper.map((part) => part.radius)),
  }
  if (copper.length >= MINIMUM_COPPER_COUNT_FOR_SPATIAL_INDEX) {
    const index = new Flatbush(copper.length)
    for (const part of copper) {
      index.add(
        Math.min(part.start.x, part.end.x),
        Math.min(part.start.y, part.end.y),
        Math.max(part.start.x, part.end.x),
        Math.max(part.start.y, part.end.y),
      )
    }
    index.finish()
    result.index = index
  } else {
    result.linearCandidateIndexes = copper.map((_, index) => index)
  }
  cache.set(route, result)
  return result
}

const getNearbyCopperIndexes = ({
  copper,
  clearance,
  spatialIndex,
}: {
  copper: Copper
  clearance: number
  spatialIndex: CopperSpatialIndex
}): number[] => {
  const searchExpansion = clearance + copper.radius + spatialIndex.maxRadius
  return (
    spatialIndex.index?.search(
      Math.min(copper.start.x, copper.end.x) - searchExpansion,
      Math.min(copper.start.y, copper.end.y) - searchExpansion,
      Math.max(copper.start.x, copper.end.x) + searchExpansion,
      Math.max(copper.start.y, copper.end.y) + searchExpansion,
    ) ??
    spatialIndex.linearCandidateIndexes ??
    []
  )
}

const evaluateRoutePair = ({
  firstRoute,
  secondRoute,
  firstCopper,
  secondCopper,
  firstCopperSpatialIndex,
  secondCopperSpatialIndex,
  firstConnectionNames,
  secondRouteConnectionName,
  secondRouteRootConnectionName,
  clearance,
  firstCopperIndexes,
  secondCopperIndexes,
  retainedConflicts = [],
}: RoutePairEvaluation): OrderedConflict[] => {
  const sameNet =
    firstConnectionNames.has(secondRouteConnectionName) ||
    firstConnectionNames.has(secondRouteRootConnectionName)
  const worstByType = new Map<string, OrderedConflict>()
  for (const conflict of retainedConflicts) {
    worstByType.set(
      conflict.key.slice(`${firstRoute}:${secondRoute}:`.length),
      conflict,
    )
  }

  const candidateSecondIndexesByFirst = new Map<number, number[]>()
  if (secondCopperIndexes) {
    for (const secondCopperIndex of secondCopperIndexes) {
      const second = secondCopper[secondCopperIndex]!
      for (const firstCopperIndex of getNearbyCopperIndexes({
        copper: second,
        clearance,
        spatialIndex: firstCopperSpatialIndex,
      })) {
        const candidateSecondIndexes =
          candidateSecondIndexesByFirst.get(firstCopperIndex) ?? []
        candidateSecondIndexes.push(secondCopperIndex)
        candidateSecondIndexesByFirst.set(
          firstCopperIndex,
          candidateSecondIndexes,
        )
      }
    }
  } else {
    const candidateFirstIndexes = firstCopperIndexes ?? firstCopper.keys()
    for (const firstCopperIndex of candidateFirstIndexes) {
      candidateSecondIndexesByFirst.set(
        firstCopperIndex,
        getNearbyCopperIndexes({
          copper: firstCopper[firstCopperIndex]!,
          clearance,
          spatialIndex: secondCopperSpatialIndex,
        }),
      )
    }
  }

  for (const [firstCopperIndex, candidateSecondIndexes] of [
    ...candidateSecondIndexesByFirst,
  ].sort(([firstIndex], [secondIndex]) => firstIndex - secondIndex)) {
    const first = firstCopper[firstCopperIndex]!
    for (const secondCopperIndex of candidateSecondIndexes.sort(
      (firstIndex, secondIndex) => firstIndex - secondIndex,
    )) {
      const second = secondCopper[secondCopperIndex]!
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
      const worst = worstByType.get(key)
      if (
        worst &&
        (penetration < worst.penetration ||
          (penetration === worst.penetration &&
            (firstCopperIndex > worst.firstCopperIndex ||
              (firstCopperIndex === worst.firstCopperIndex &&
                secondCopperIndex >= worst.secondCopperIndex))))
      )
        continue
      worstByType.set(key, {
        key: `${firstRoute}:${secondRoute}:${key}`,
        firstRoute,
        secondRoute,
        first,
        second,
        penetration,
        firstCopperIndex,
        secondCopperIndex,
      })
    }
  }
  return [...worstByType.values()]
}

const isSameCopperGeometry = (first: Copper, second: Copper): boolean =>
  first.start.x === second.start.x &&
  first.start.y === second.start.y &&
  first.end.x === second.end.x &&
  first.end.y === second.end.y &&
  first.radius === second.radius &&
  first.minZ === second.minZ &&
  first.maxZ === second.maxZ &&
  first.via === second.via &&
  first.viaIndex === second.viaIndex

const isOrderedConflict = (conflict: Conflict): conflict is OrderedConflict =>
  "firstCopperIndex" in conflict && "secondCopperIndex" in conflict

const evaluate = (
  routes: HdRoute[],
  clearance: number,
  obstacles: Obstacle[],
  fixedRoutes: HdRoute[] = [],
  previous?: {
    evaluation: Evaluation
    changedRoute: number
    routes: HdRoute[]
  },
  geometryCache = new WeakMap<HdRoute, Copper[]>(),
  copperSpatialIndexCache: CopperSpatialIndexCache = new WeakMap(),
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
  const changedCopperIndexes = new Set<number>()
  let canIncrementallyEvaluateRoutePairs = false
  if (previous) {
    const previousRoute = previous.routes[previous.changedRoute]!
    const previousCopper =
      geometryCache.get(previousRoute) ?? collectCopper(previousRoute)
    const nextCopper = geometries[previous.changedRoute]!
    if (previousCopper.length === nextCopper.length) {
      canIncrementallyEvaluateRoutePairs = true
      for (
        let copperIndex = 0;
        copperIndex < nextCopper.length;
        copperIndex++
      ) {
        if (
          !isSameCopperGeometry(
            previousCopper[copperIndex]!,
            nextCopper[copperIndex]!,
          )
        ) {
          changedCopperIndexes.add(copperIndex)
        }
      }
    }
  }

  const routePairsNeedingFullEvaluation = new Set<string>()
  if (previous && canIncrementallyEvaluateRoutePairs) {
    // A moved point changes only its adjacent copper. Retain every unaffected
    // pair result, but fully rescan a pair when its previous worst contact
    // moved so the next-worst contact can take its place.
    for (const conflict of previous.evaluation.conflicts) {
      if (
        conflict.secondRoute < 0 ||
        conflict.firstRoute === conflict.secondRoute ||
        (conflict.firstRoute !== previous.changedRoute &&
          conflict.secondRoute !== previous.changedRoute)
      )
        continue
      const pairKey = `${conflict.firstRoute}:${conflict.secondRoute}`
      if (!isOrderedConflict(conflict)) {
        routePairsNeedingFullEvaluation.add(pairKey)
        continue
      }
      const changedCopperIndex =
        conflict.firstRoute === previous.changedRoute
          ? conflict.firstCopperIndex
          : conflict.secondCopperIndex
      if (changedCopperIndexes.has(changedCopperIndex)) {
        routePairsNeedingFullEvaluation.add(pairKey)
      }
    }
  }

  const retainedPairConflicts = new Map<string, OrderedConflict[]>()
  const conflicts: Conflict[] = []
  if (previous) {
    for (const conflict of previous.evaluation.conflicts) {
      if (
        conflict.firstRoute !== previous.changedRoute &&
        conflict.secondRoute !== previous.changedRoute
      ) {
        conflicts.push(conflict)
        continue
      }
      if (
        !canIncrementallyEvaluateRoutePairs ||
        conflict.secondRoute < 0 ||
        conflict.firstRoute === conflict.secondRoute ||
        !isOrderedConflict(conflict)
      )
        continue
      const pairKey = `${conflict.firstRoute}:${conflict.secondRoute}`
      if (routePairsNeedingFullEvaluation.has(pairKey)) continue
      const retained = retainedPairConflicts.get(pairKey) ?? []
      retained.push(conflict)
      retainedPairConflicts.set(pairKey, retained)
    }
  }
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
        }
      }
      for (const [obstacleIndex, obstacle] of obstacles.entries()) {
        if (obstacle.connectedTo?.some((name) => names.has(name))) continue
        let worst: Conflict | undefined
        for (const copper of geometries[firstRoute]!) {
          if (
            obstacle.zLayers &&
            !obstacle.zLayers.some((z) => z >= copper.minZ && z <= copper.maxZ)
          )
            continue
          const penetration = clearance - distanceToObstacle(copper, obstacle)
          if (
            penetration <= EPSILON ||
            penetration <= (worst?.penetration ?? 0)
          )
            continue
          worst = {
            key: `${firstRoute}:pad:${obstacleIndex}`,
            firstRoute,
            secondRoute: -1,
            first: copper,
            second: copper,
            penetration,
          }
        }
        if (worst) {
          conflicts.push(worst)
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
      const firstCopper = geometries[firstRoute]!
      const secondCopper = geometries[secondRoute]!
      const firstCopperSpatialIndex = getCopperSpatialIndex(
        a,
        firstCopper,
        copperSpatialIndexCache,
      )
      const secondCopperSpatialIndex = getCopperSpatialIndex(
        b,
        secondCopper,
        copperSpatialIndexCache,
      )
      const pairKey = `${firstRoute}:${secondRoute}`
      const needsFullEvaluation =
        !previous ||
        !canIncrementallyEvaluateRoutePairs ||
        routePairsNeedingFullEvaluation.has(pairKey)
      conflicts.push(
        ...evaluateRoutePair({
          firstRoute,
          secondRoute,
          firstCopper,
          secondCopper,
          firstCopperSpatialIndex,
          secondCopperSpatialIndex,
          firstConnectionNames: names,
          secondRouteConnectionName: b.connectionName,
          secondRouteRootConnectionName: b.rootConnectionName,
          clearance,
          firstCopperIndexes:
            !needsFullEvaluation && firstRoute === previous?.changedRoute
              ? changedCopperIndexes
              : undefined,
          secondCopperIndexes:
            !needsFullEvaluation && secondRoute === previous?.changedRoute
              ? changedCopperIndexes
              : undefined,
          retainedConflicts: needsFullEvaluation
            ? undefined
            : retainedPairConflicts.get(pairKey),
        }),
      )
    }
  }
  conflicts.sort((a, b) => b.penetration - a.penetration)
  return {
    conflicts,
    score: conflicts.reduce(
      (sum, conflict) => sum + conflict.penetration ** 2,
      0,
    ),
  }
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
  boundaryMargin?: number
  maxCandidates?: number
}): NodeClearanceRepairResult => {
  let current = routes
  const geometryCache = new WeakMap<HdRoute, Copper[]>()
  const copperSpatialIndexCache: CopperSpatialIndexCache = new WeakMap()
  const routeCandidateContextCache = new WeakMap<
    HdRoute,
    RouteCandidateContext
  >()
  let evaluation = evaluate(
    current,
    clearance,
    clearanceObstacles,
    fixedRoutes,
    undefined,
    geometryCache,
    copperSpatialIndexCache,
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
        let routeCandidateContext = routeCandidateContextCache.get(before)
        if (!routeCandidateContext) {
          const names = new Set(
            [before.connectionName, before.rootConnectionName].filter(Boolean),
          )
          const foreignObstacles = clearanceObstacles.filter(
            (obstacle) =>
              !obstacle.connectedTo?.some((name) => names.has(name)),
          )
          const beforeCopper =
            geometryCache.get(before) ?? collectCopper(before)
          routeCandidateContext = {
            foreignObstacles,
            boundaryViolationCount: findInteriorDiagonalSegmentsInBufferZone(
              [before],
              boundary,
              boundaryMargin,
            ).length,
            obstacleClearances: foreignObstacles.map((obstacle) =>
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
            ),
          }
          routeCandidateContextCache.set(before, routeCandidateContext)
        }
        const { foreignObstacles, boundaryViolationCount, obstacleClearances } =
          routeCandidateContext
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
              ).length > boundaryViolationCount
            )
              continue
            const candidate = [...current]
            candidate[routeIndex] = moved
            const next = evaluate(
              candidate,
              clearance,
              clearanceObstacles,
              fixedRoutes,
              { evaluation, changedRoute: routeIndex, routes: current },
              geometryCache,
              copperSpatialIndexCache,
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
            const afterCopper = geometryCache.get(moved) ?? collectCopper(moved)
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
