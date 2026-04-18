import { cloneRoute } from "../functions/cloneRoute"
import { cloneRoutes } from "../functions/cloneRoutes"
import { dedupeRoutePoints } from "../functions/dedupeRoutePoints"
import {
  findClearanceConflicts,
  type ClearanceConflict,
} from "../functions/findClearanceConflicts"
import { findBufferZoneSegmentsNotStraightFromBoundary } from "../functions/findBufferZoneSegmentsNotStraightFromBoundary"
import { findInteriorDiagonalSegmentsInBufferZone } from "../functions/findInteriorDiagonalSegmentsInBufferZone"
import {
  areRoutesSameNet,
  findTraceViolations,
  getTraceViolationTraceCount,
} from "../functions/findTraceViolations"
import { pointsCoincide } from "../functions/pointsCoincide"
import { routeEndpointsStayOnBoundarySides } from "../functions/routeEndpointsStayOnBoundarySides"
import type {
  BoundaryRect,
  BoundarySide,
  HdRoute,
  RoutePoint,
  RouteGeometryCache,
  XY,
} from "../shared/types"

type CleanupScore = {
  traceViolationCount: number
  traceViolationTraceCount: number
  boundryViolationCount: number
  bufferHitCount: number
  traceViolations: ClearanceConflict[]
}

const MAX_CLEANUP_PASSES = 2
const MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT = 8
const MAX_ACCEPTED_MOVES = 48
const CLEANUP_STEPS = [0.05, 0.1] as const
const CLEANUP_ESCAPE_STEPS = [0.2, 0.3] as const
const CLEANUP_DIRECTIONS: XY[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

type RouteMove = {
  routeIndex: number
  pointIndexes: number[]
  delta: XY
}

type CandidateRoutes = {
  candidateRoutes: HdRoute[]
  movedRouteIndexes: Set<number>
}

const getCleanupScore = (
  routes: HdRoute[],
  boundary: BoundaryRect,
  margin: number,
  geometryCache?: RouteGeometryCache,
): CleanupScore => {
  const traceViolations = findTraceViolations(routes, undefined, geometryCache)

  return {
    traceViolationCount: traceViolations.length,
    traceViolationTraceCount: getTraceViolationTraceCount(traceViolations),
    boundryViolationCount: findInteriorDiagonalSegmentsInBufferZone(
      routes,
      boundary,
      margin,
    ).length,
    bufferHitCount: findBufferZoneSegmentsNotStraightFromBoundary(
      routes,
      boundary,
      margin,
    ).length,
    traceViolations,
  }
}

const scoreImproved = (candidate: CleanupScore, current: CleanupScore) => {
  const candidateTuple = [
    candidate.traceViolationCount,
    candidate.traceViolationTraceCount,
    candidate.boundryViolationCount,
    candidate.bufferHitCount,
  ]
  const currentTuple = [
    current.traceViolationCount,
    current.traceViolationTraceCount,
    current.boundryViolationCount,
    current.bufferHitCount,
  ]

  for (let index = 0; index < candidateTuple.length; index += 1) {
    const candidateValue = candidateTuple[index] as number
    const currentValue = currentTuple[index] as number
    if (candidateValue < currentValue) return true
    if (candidateValue > currentValue) return false
  }

  return false
}

const getExpandedInteriorPointIndexes = (
  route: HdRoute,
  routePointIndexes: number[],
) => {
  const points = route.route ?? []
  const expandedIndexes = new Set<number>()

  for (const pointIndex of routePointIndexes) {
    const movablePointIndex =
      pointIndex <= 0
        ? 1
        : pointIndex >= points.length - 1
          ? points.length - 2
          : pointIndex
    if (movablePointIndex <= 0 || movablePointIndex >= points.length - 1) {
      continue
    }

    const point = points[movablePointIndex]
    if (!point) continue
    expandedIndexes.add(movablePointIndex)

    for (let index = 1; index < points.length - 1; index += 1) {
      if (expandedIndexes.has(index)) continue
      const candidatePoint = points[index]
      if (!candidatePoint) continue
      if (candidatePoint.z === point.z) continue
      if (!pointsCoincide(candidatePoint, point)) continue
      expandedIndexes.add(index)
    }
  }

  return Array.from(expandedIndexes).sort((a, b) => a - b)
}

const getConflictRouteMove = (
  routes: HdRoute[],
  conflict: ClearanceConflict,
  conflictSideIndex: number,
  direction: XY,
  step: number,
): RouteMove | null => {
  const routeIndex = conflict.routeIndexes[conflictSideIndex]
  if (routeIndex === undefined) return null
  const route = routes[routeIndex]
  if (!route) return null

  const pointIndexes = getExpandedInteriorPointIndexes(
    route,
    conflict.routePointIndexes[conflictSideIndex] ?? [],
  )
  if (pointIndexes.length === 0) return null

  const sign = conflictSideIndex === 0 ? 1 : -1
  return {
    routeIndex,
    pointIndexes,
    delta: {
      x: direction.x * step * sign,
      y: direction.y * step * sign,
    },
  }
}

const getPointBoundarySide = (
  point: RoutePoint,
  boundary: BoundaryRect,
): BoundarySide | null => {
  if (Math.abs(point.x - boundary.minX) <= 1e-6) return "left"
  if (Math.abs(point.x - boundary.maxX) <= 1e-6) return "right"
  if (Math.abs(point.y - boundary.minY) <= 1e-6) return "bottom"
  if (Math.abs(point.y - boundary.maxY) <= 1e-6) return "top"
  return null
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const createBoundaryDoglegRoute = ({
  route,
  endpointIndex,
  boundary,
  margin,
  detourCoordinate,
}: {
  route: HdRoute
  endpointIndex: 0 | -1
  boundary: BoundaryRect
  margin: number
  detourCoordinate: number
}): HdRoute | null => {
  const points = route.route ?? []
  if (points.length < 2) return null

  const endpointPointIndex = endpointIndex === 0 ? 0 : points.length - 1
  const neighborPointIndex = endpointIndex === 0 ? 1 : points.length - 2
  const endpoint = points[endpointPointIndex]
  const neighbor = points[neighborPointIndex]
  if (!endpoint || !neighbor) return null
  if (endpoint.z !== neighbor.z) return null

  const side = getPointBoundarySide(endpoint, boundary)
  if (!side) return null

  const bufferExitPadding = 0.05
  const z = endpoint.z
  let entry: RoutePoint
  let detour: RoutePoint
  let exit: RoutePoint

  if (side === "left" || side === "right") {
    const entryX =
      side === "left"
        ? clamp(
            boundary.minX + margin + bufferExitPadding,
            boundary.minX,
            boundary.maxX,
          )
        : clamp(
            boundary.maxX - margin - bufferExitPadding,
            boundary.minX,
            boundary.maxX,
          )
    const detourY = clamp(
      detourCoordinate,
      boundary.minY + margin + bufferExitPadding,
      boundary.maxY - margin - bufferExitPadding,
    )

    entry = { x: entryX, y: endpoint.y, z }
    detour = { x: entryX, y: detourY, z }
    exit = { x: neighbor.x, y: detourY, z }
  } else {
    const entryY =
      side === "bottom"
        ? clamp(
            boundary.minY + margin + bufferExitPadding,
            boundary.minY,
            boundary.maxY,
          )
        : clamp(
            boundary.maxY - margin - bufferExitPadding,
            boundary.minY,
            boundary.maxY,
          )
    const detourX = clamp(
      detourCoordinate,
      boundary.minX + margin + bufferExitPadding,
      boundary.maxX - margin - bufferExitPadding,
    )

    entry = { x: endpoint.x, y: entryY, z }
    detour = { x: detourX, y: entryY, z }
    exit = { x: detourX, y: neighbor.y, z }
  }

  const nextRoute = cloneRoute(route)
  nextRoute.route =
    endpointIndex === 0
      ? dedupeRoutePoints([endpoint, entry, detour, exit, ...points.slice(1)])
      : dedupeRoutePoints([
          ...points.slice(0, points.length - 1),
          exit,
          detour,
          entry,
          endpoint,
        ])

  return nextRoute
}

const createDoglegCandidates = ({
  routes,
  conflict,
  boundary,
  margin,
}: {
  routes: HdRoute[]
  conflict: ClearanceConflict
  boundary: BoundaryRect
  margin: number
}): CandidateRoutes[] => {
  const candidates: CandidateRoutes[] = []

  for (
    let conflictSideIndex = 0;
    conflictSideIndex < 2;
    conflictSideIndex += 1
  ) {
    const routeIndex = conflict.routeIndexes[conflictSideIndex]
    const route = routes[routeIndex]
    if (!route) continue

    const points = route.route ?? []
    const endpointIndexes = new Set(
      (conflict.routePointIndexes[conflictSideIndex] ?? []).filter(
        (pointIndex) => pointIndex === 0 || pointIndex === points.length - 1,
      ),
    )
    if (endpointIndexes.size === 0) continue

    const otherRoute =
      routes[conflict.routeIndexes[conflictSideIndex === 0 ? 1 : 0]]
    const otherPoints = otherRoute?.route ?? []
    const otherConflictPoints = (
      conflict.routePointIndexes[conflictSideIndex === 0 ? 1 : 0] ?? []
    )
      .map((pointIndex) => otherPoints[pointIndex])
      .filter((point): point is RoutePoint => Boolean(point))
    if (otherConflictPoints.length === 0) continue

    const minOtherX = Math.min(...otherConflictPoints.map((point) => point.x))
    const maxOtherX = Math.max(...otherConflictPoints.map((point) => point.x))
    const minOtherY = Math.min(...otherConflictPoints.map((point) => point.y))
    const maxOtherY = Math.max(...otherConflictPoints.map((point) => point.y))

    for (const pointIndex of endpointIndexes) {
      const endpoint = points[pointIndex]
      if (!endpoint) continue
      const side = getPointBoundarySide(endpoint, boundary)
      if (!side) continue
      const doglegEndpointIndex = pointIndex === 0 ? 0 : -1
      const detourCoordinates =
        side === "left" || side === "right"
          ? [minOtherY - margin, maxOtherY + margin]
          : [minOtherX - margin, maxOtherX + margin]

      for (const detourCoordinate of detourCoordinates) {
        const candidateRoute = createBoundaryDoglegRoute({
          route,
          endpointIndex: doglegEndpointIndex,
          boundary,
          margin,
          detourCoordinate,
        })
        if (!candidateRoute) continue

        const candidateRoutes = cloneRoutes(routes)
        candidateRoutes[routeIndex] = candidateRoute
        candidates.push({
          candidateRoutes,
          movedRouteIndexes: new Set([routeIndex]),
        })
      }
    }
  }

  return candidates
}

const createSegmentDoglegRoute = ({
  route,
  startIndex,
  endIndex,
  detour,
}: {
  route: HdRoute
  startIndex: number
  endIndex: number
  detour: { axis: "x" | "y"; coordinate: number }
}): HdRoute | null => {
  const points = route.route ?? []
  const start = points[startIndex]
  const end = points[endIndex]
  if (!start || !end || startIndex >= endIndex) return null
  if (start.z !== end.z) return null

  const firstCorner =
    detour.axis === "y"
      ? { x: start.x, y: detour.coordinate, z: start.z }
      : { x: detour.coordinate, y: start.y, z: start.z }
  const secondCorner =
    detour.axis === "y"
      ? { x: end.x, y: detour.coordinate, z: end.z }
      : { x: detour.coordinate, y: end.y, z: end.z }
  const nextRoute = cloneRoute(route)

  nextRoute.route = dedupeRoutePoints([
    ...points.slice(0, startIndex + 1),
    firstCorner,
    secondCorner,
    ...points.slice(endIndex),
  ])

  return nextRoute
}

const createSegmentDoglegCandidates = ({
  routes,
  conflict,
  boundary,
  margin,
}: {
  routes: HdRoute[]
  conflict: ClearanceConflict
  boundary: BoundaryRect
  margin: number
}): CandidateRoutes[] => {
  const candidates: CandidateRoutes[] = []

  for (
    let conflictSideIndex = 0;
    conflictSideIndex < 2;
    conflictSideIndex += 1
  ) {
    const routeIndex = conflict.routeIndexes[conflictSideIndex]
    const route = routes[routeIndex]
    const points = route?.route ?? []
    const routePointIndexes =
      conflict.routePointIndexes[conflictSideIndex] ?? []
    if (!route || routePointIndexes.length < 2) continue

    const startIndex = Math.min(...routePointIndexes)
    const endIndex = Math.max(...routePointIndexes)
    if (startIndex < 0 || endIndex >= points.length || startIndex >= endIndex) {
      continue
    }

    const otherRoute =
      routes[conflict.routeIndexes[conflictSideIndex === 0 ? 1 : 0]]
    const otherPoints = otherRoute?.route ?? []
    const otherConflictPoints = (
      conflict.routePointIndexes[conflictSideIndex === 0 ? 1 : 0] ?? []
    )
      .map((pointIndex) => otherPoints[pointIndex])
      .filter((point): point is RoutePoint => Boolean(point))
    if (otherConflictPoints.length === 0) continue

    const minOtherX = Math.min(...otherConflictPoints.map((point) => point.x))
    const maxOtherX = Math.max(...otherConflictPoints.map((point) => point.x))
    const minOtherY = Math.min(...otherConflictPoints.map((point) => point.y))
    const maxOtherY = Math.max(...otherConflictPoints.map((point) => point.y))
    const detours = [
      {
        axis: "y" as const,
        coordinate: clamp(
          minOtherY - margin,
          boundary.minY + margin,
          boundary.maxY - margin,
        ),
      },
      {
        axis: "y" as const,
        coordinate: clamp(
          maxOtherY + margin,
          boundary.minY + margin,
          boundary.maxY - margin,
        ),
      },
      {
        axis: "x" as const,
        coordinate: clamp(
          minOtherX - margin,
          boundary.minX + margin,
          boundary.maxX - margin,
        ),
      },
      {
        axis: "x" as const,
        coordinate: clamp(
          maxOtherX + margin,
          boundary.minX + margin,
          boundary.maxX - margin,
        ),
      },
    ]

    for (const detour of detours) {
      const candidateRoute = createSegmentDoglegRoute({
        route,
        startIndex,
        endIndex,
        detour,
      })
      if (!candidateRoute) continue

      const candidateRoutes = cloneRoutes(routes)
      candidateRoutes[routeIndex] = candidateRoute
      candidates.push({
        candidateRoutes,
        movedRouteIndexes: new Set([routeIndex]),
      })
    }
  }

  return candidates
}

const routeHasViaAtPoint = (route: HdRoute, point: RoutePoint) =>
  (route.vias ?? []).some((via) => pointsCoincide(via, point))

const addViaIfMissing = (route: HdRoute, point: RoutePoint) => {
  route.vias ??= []
  if (routeHasViaAtPoint(route, point)) return
  route.vias.push({ x: point.x, y: point.y })
}

const createEndpointLayerSwapCandidates = ({
  routes,
  conflict,
}: {
  routes: HdRoute[]
  conflict: ClearanceConflict
}): CandidateRoutes[] => {
  const candidates: CandidateRoutes[] = []

  for (
    let conflictSideIndex = 0;
    conflictSideIndex < 2;
    conflictSideIndex += 1
  ) {
    const routeIndex = conflict.routeIndexes[conflictSideIndex]
    const route = routes[routeIndex]
    const points = route?.route ?? []
    if (!route || points.length < 2) continue

    for (const endpointIndex of [0, points.length - 1]) {
      if (
        !(conflict.routePointIndexes[conflictSideIndex] ?? []).includes(
          endpointIndex,
        )
      ) {
        continue
      }

      const endpoint = points[endpointIndex]
      const neighborIndex = endpointIndex === 0 ? 1 : points.length - 2
      const neighbor = points[neighborIndex]
      if (!endpoint || !neighbor || endpoint.z === undefined) continue
      const targetZ = endpoint.z === 0 ? 1 : 0

      const nextRoute = cloneRoute(route)
      const nextPoints = nextRoute.route ?? []
      const nextEndpoint = nextPoints[endpointIndex]
      const nextNeighbor = nextPoints[neighborIndex]
      if (!nextEndpoint || !nextNeighbor) continue

      nextNeighbor.z = targetZ
      const endpointLayerPoint = { ...nextEndpoint, z: targetZ }
      nextRoute.route =
        endpointIndex === 0
          ? dedupeRoutePoints([
              nextEndpoint,
              endpointLayerPoint,
              ...nextPoints.slice(1),
            ])
          : dedupeRoutePoints([
              ...nextPoints.slice(0, points.length - 1),
              endpointLayerPoint,
              nextEndpoint,
            ])
      addViaIfMissing(nextRoute, nextEndpoint)

      const candidateRoutes = cloneRoutes(routes)
      candidateRoutes[routeIndex] = nextRoute
      candidates.push({
        candidateRoutes,
        movedRouteIndexes: new Set([routeIndex]),
      })
    }
  }

  return candidates
}

const createSegmentLayerSwapCandidates = ({
  routes,
  conflict,
}: {
  routes: HdRoute[]
  conflict: ClearanceConflict
}): CandidateRoutes[] => {
  const candidates: CandidateRoutes[] = []

  for (
    let conflictSideIndex = 0;
    conflictSideIndex < 2;
    conflictSideIndex += 1
  ) {
    const routeIndex = conflict.routeIndexes[conflictSideIndex]
    const route = routes[routeIndex]
    const points = route?.route ?? []
    const routePointIndexes =
      conflict.routePointIndexes[conflictSideIndex] ?? []
    if (!route || routePointIndexes.length < 2) continue

    const startIndex = Math.min(...routePointIndexes)
    const endIndex = Math.max(...routePointIndexes)
    const start = points[startIndex]
    const end = points[endIndex]
    if (!start || !end || startIndex >= endIndex) continue
    if (start.z !== end.z) continue

    const sourceZ = start.z ?? 0
    const targetZ = sourceZ === 0 ? 1 : 0
    const nextRoute = cloneRoute(route)
    const nextPoints = nextRoute.route ?? []
    const nextStart = nextPoints[startIndex]
    const nextEnd = nextPoints[endIndex]
    if (!nextStart || !nextEnd) continue

    const startLayerPoint = { ...nextStart, z: targetZ }
    const endLayerPoint = { ...nextEnd, z: targetZ }
    const swappedMiddle = nextPoints
      .slice(startIndex + 1, endIndex)
      .map((point) => ({ ...point, z: targetZ }))
    const prefix = nextPoints.slice(0, startIndex + 1)
    if (startIndex === 0) {
      prefix[0] = startLayerPoint
    }
    const suffix = nextPoints.slice(endIndex)
    if (endIndex === nextPoints.length - 1) {
      suffix[0] = endLayerPoint
    }

    nextRoute.route = dedupeRoutePoints([
      ...prefix,
      ...(startIndex === 0 ? [] : [startLayerPoint]),
      ...swappedMiddle,
      ...(endIndex === nextPoints.length - 1 ? [] : [endLayerPoint]),
      ...suffix,
    ])
    addViaIfMissing(nextRoute, start)
    addViaIfMissing(nextRoute, end)

    const candidateRoutes = cloneRoutes(routes)
    candidateRoutes[routeIndex] = nextRoute
    candidates.push({
      candidateRoutes,
      movedRouteIndexes: new Set([routeIndex]),
    })
  }

  return candidates
}

const createClosedLoopCollapseCandidates = ({
  routes,
  conflict,
}: {
  routes: HdRoute[]
  conflict: ClearanceConflict
}): CandidateRoutes[] => {
  const candidates: CandidateRoutes[] = []

  for (const routeIndex of conflict.routeIndexes) {
    const route = routes[routeIndex]
    const points = route?.route ?? []
    const firstPoint = points[0]
    const lastPoint = points[points.length - 1]
    if (
      !route ||
      points.length <= 2 ||
      !firstPoint ||
      !lastPoint ||
      firstPoint.z === lastPoint.z ||
      !pointsCoincide(firstPoint, lastPoint) ||
      !routeHasViaAtPoint(route, firstPoint)
    ) {
      continue
    }

    const nextRoute = cloneRoute(route)
    nextRoute.route = [firstPoint, lastPoint]
    nextRoute.vias = (nextRoute.vias ?? []).filter((via) =>
      pointsCoincide(via, firstPoint),
    )

    const candidateRoutes = cloneRoutes(routes)
    candidateRoutes[routeIndex] = nextRoute
    candidates.push({
      candidateRoutes,
      movedRouteIndexes: new Set([routeIndex]),
    })
  }

  return candidates
}

const createLocallyMovedRoute = (
  route: HdRoute,
  pointIndexes: number[],
  delta: XY,
) => {
  const nextRoute = cloneRoute(route)
  const nextPoints = nextRoute.route ?? []

  for (const pointIndex of pointIndexes) {
    const point = nextPoints[pointIndex]
    if (!point) continue
    nextPoints[pointIndex] = {
      ...point,
      x: point.x + delta.x,
      y: point.y + delta.y,
    }
  }

  for (const via of nextRoute.vias ?? []) {
    const connectedPointWasMoved = pointIndexes.some((pointIndex) => {
      const point = route.route?.[pointIndex]
      return point ? pointsCoincide(point, via) : false
    })
    if (!connectedPointWasMoved) continue
    via.x += delta.x
    via.y += delta.y
  }

  nextRoute.route = dedupeRoutePoints(nextPoints)
  return nextRoute
}

const createsNewZeroClearanceTouch = (
  currentRoutes: HdRoute[],
  candidateRoutes: HdRoute[],
  movedRouteIndexes: Set<number>,
  geometryCache: RouteGeometryCache,
) => {
  const getZeroTouchPairKey = (conflict: ClearanceConflict) =>
    `${conflict.routeIndexes[0]}:${conflict.layers[0]}:${conflict.routeIndexes[1]}:${conflict.layers[1]}`
  const currentZeroConflictKeys = new Set(
    findClearanceConflicts(
      currentRoutes,
      movedRouteIndexes,
      0,
      geometryCache,
    ).map(getZeroTouchPairKey),
  )
  const candidateZeroConflicts = findClearanceConflicts(
    candidateRoutes,
    movedRouteIndexes,
    0,
    geometryCache,
  ).filter(
    (conflict) =>
      !(conflict.layers[0] === "via" && conflict.layers[1] === "via") &&
      !conflict.layers.some((layer, sideIndex) => {
        if (layer !== "via") return false
        const route = candidateRoutes[conflict.routeIndexes[sideIndex]]
        const pointIndexes = conflict.routePointIndexes[sideIndex] ?? []
        const lastPointIndex = (route?.route?.length ?? 0) - 1
        return pointIndexes.some(
          (pointIndex) => pointIndex === 0 || pointIndex === lastPointIndex,
        )
      }) &&
      !areRoutesSameNet(
        candidateRoutes[conflict.routeIndexes[0]],
        candidateRoutes[conflict.routeIndexes[1]],
      ),
  )

  return candidateZeroConflicts.some(
    (conflict) => !currentZeroConflictKeys.has(getZeroTouchPairKey(conflict)),
  )
}

const createCandidateRoutes = (
  routes: HdRoute[],
  moves: RouteMove[],
): CandidateRoutes | null => {
  const candidateRoutes = cloneRoutes(routes)
  const movedRouteIndexes = new Set<number>()

  for (const move of moves) {
    const route = routes[move.routeIndex]
    if (!route) continue

    candidateRoutes[move.routeIndex] = createLocallyMovedRoute(
      route,
      move.pointIndexes,
      move.delta,
    )
    movedRouteIndexes.add(move.routeIndex)
  }

  if (movedRouteIndexes.size === 0) return null
  return { candidateRoutes, movedRouteIndexes }
}

const getCandidateMoveGroups = ({
  routes,
  conflict,
  direction,
  step,
}: {
  routes: HdRoute[]
  conflict: ClearanceConflict
  direction: XY
  step: number
}): RouteMove[][] => {
  const firstMove = getConflictRouteMove(routes, conflict, 0, direction, step)
  const secondMove = getConflictRouteMove(routes, conflict, 1, direction, step)
  const moveGroups: RouteMove[][] = []

  if (firstMove && secondMove) {
    moveGroups.push([firstMove, secondMove])
  }
  if (firstMove) {
    moveGroups.push([firstMove])
  }
  if (secondMove) {
    moveGroups.push([secondMove])
  }

  return moveGroups
}

export const resolveTraceClearanceConflicts = ({
  routes,
  boundary,
  margin,
  geometryCache,
}: {
  routes: HdRoute[]
  boundary: BoundaryRect
  margin: number
  geometryCache: RouteGeometryCache
}) => {
  let acceptedMoves = 0
  let currentScore = getCleanupScore(routes, boundary, margin, geometryCache)
  if (currentScore.traceViolationCount === 0) return
  const tryAcceptCandidate = (candidate: CandidateRoutes) => {
    const { candidateRoutes, movedRouteIndexes } = candidate
    const endpointsStayedOnBoundary = Array.from(movedRouteIndexes).every(
      (routeIndex) =>
        routeEndpointsStayOnBoundarySides(
          routes[routeIndex] as HdRoute,
          candidateRoutes[routeIndex] as HdRoute,
          boundary,
        ),
    )
    if (!endpointsStayedOnBoundary) return false

    if (
      createsNewZeroClearanceTouch(
        routes,
        candidateRoutes,
        movedRouteIndexes,
        geometryCache,
      )
    ) {
      return false
    }

    const candidateScore = getCleanupScore(
      candidateRoutes,
      boundary,
      margin,
      geometryCache,
    )
    if (
      (currentScore.boundryViolationCount === 0 &&
        candidateScore.boundryViolationCount > 0) ||
      (currentScore.bufferHitCount === 0 &&
        candidateScore.bufferHitCount > 0) ||
      !scoreImproved(candidateScore, currentScore)
    ) {
      return false
    }

    routes.splice(0, routes.length, ...candidateRoutes)
    currentScore = candidateScore
    acceptedMoves += 1
    return true
  }

  for (let pass = 0; pass < MAX_CLEANUP_PASSES; pass += 1) {
    let acceptedMove = false
    let conflictIndex = 0

    while (conflictIndex < currentScore.traceViolations.length) {
      if (acceptedMoves >= MAX_ACCEPTED_MOVES) return
      const conflict = currentScore.traceViolations[conflictIndex]
      if (!conflict) break
      let acceptedConflictMove = false
      let candidateAttempts = 0

      const tryCandidate = (candidate: CandidateRoutes | null) => {
        if (!candidate) return false
        if (candidateAttempts >= MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT) {
          return false
        }
        candidateAttempts += 1
        return tryAcceptCandidate(candidate)
      }

      for (const step of CLEANUP_STEPS) {
        for (const direction of CLEANUP_DIRECTIONS) {
          const moveGroups = getCandidateMoveGroups({
            routes,
            conflict,
            direction,
            step,
          })

          for (const moves of moveGroups) {
            const candidate = createCandidateRoutes(routes, moves)
            if (tryCandidate(candidate)) {
              acceptedMove = true
              acceptedConflictMove = true
              break
            }
          }
          if (candidateAttempts >= MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT) break
          if (acceptedConflictMove) break
        }
        if (candidateAttempts >= MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT) break
        if (acceptedConflictMove) break
      }

      if (
        !acceptedConflictMove &&
        candidateAttempts < MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT
      ) {
        for (const step of CLEANUP_ESCAPE_STEPS) {
          for (const direction of CLEANUP_DIRECTIONS) {
            const moveGroups = getCandidateMoveGroups({
              routes,
              conflict,
              direction,
              step,
            })

            for (const moves of moveGroups) {
              const candidate = createCandidateRoutes(routes, moves)
              if (tryCandidate(candidate)) {
                acceptedMove = true
                acceptedConflictMove = true
                break
              }
            }
            if (candidateAttempts >= MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT) break
            if (acceptedConflictMove) break
          }
          if (candidateAttempts >= MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT) break
          if (acceptedConflictMove) break
        }
      }

      if (
        !acceptedConflictMove &&
        candidateAttempts < MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT
      ) {
        for (const candidate of createEndpointLayerSwapCandidates({
          routes,
          conflict,
        })) {
          if (tryCandidate(candidate)) {
            acceptedMove = true
            acceptedConflictMove = true
            break
          }
          if (candidateAttempts >= MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT) break
        }
      }

      if (
        !acceptedConflictMove &&
        candidateAttempts < MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT
      ) {
        for (const candidate of createDoglegCandidates({
          routes,
          conflict,
          boundary,
          margin,
        })) {
          if (tryCandidate(candidate)) {
            acceptedMove = true
            acceptedConflictMove = true
            break
          }
          if (candidateAttempts >= MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT) break
        }
      }

      if (
        !acceptedConflictMove &&
        candidateAttempts < MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT
      ) {
        for (const candidate of createSegmentLayerSwapCandidates({
          routes,
          conflict,
        })) {
          if (tryCandidate(candidate)) {
            acceptedMove = true
            acceptedConflictMove = true
            break
          }
          if (candidateAttempts >= MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT) break
        }
      }

      if (
        !acceptedConflictMove &&
        candidateAttempts < MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT
      ) {
        for (const candidate of createClosedLoopCollapseCandidates({
          routes,
          conflict,
        })) {
          if (tryCandidate(candidate)) {
            acceptedMove = true
            acceptedConflictMove = true
            break
          }
          if (candidateAttempts >= MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT) break
        }
      }

      if (
        !acceptedConflictMove &&
        candidateAttempts < MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT
      ) {
        for (const candidate of createSegmentDoglegCandidates({
          routes,
          conflict,
          boundary,
          margin,
        })) {
          if (tryCandidate(candidate)) {
            acceptedMove = true
            acceptedConflictMove = true
            break
          }
          if (candidateAttempts >= MAX_CANDIDATE_ATTEMPTS_PER_CONFLICT) break
        }
      }

      if (currentScore.traceViolationCount === 0) return
      if (acceptedConflictMove) {
        conflictIndex = 0
        continue
      }

      conflictIndex += 1
    }

    if (!acceptedMove) return
  }
}
