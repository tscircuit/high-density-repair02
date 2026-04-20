import { cloneRoute } from "../functions/cloneRoute"
import { dedupeRoutePoints } from "../functions/dedupeRoutePoints"
import {
  findClearanceConflicts,
  type ClearanceConflict,
} from "../functions/findClearanceConflicts"
import { findInteriorDiagonalSegmentsInBufferZone } from "../functions/findInteriorDiagonalSegmentsInBufferZone"
import { findTraceClearanceRegressions } from "../functions/findTraceClearanceRegressions"
import { isPointNearSide } from "../functions/isPointNearSide"
import {
  EPSILON,
  TRACE_CLEARANCE_REGRESSION_MAX,
} from "../shared/constants"
import type {
  BoundaryRect,
  BoundarySide,
  HdRoute,
  RouteGeometryCache,
  RoutePoint,
} from "../shared/types"

const isPointInSideBuffer = (
  point: RoutePoint,
  boundary: BoundaryRect,
  side: BoundarySide,
  margin: number,
) => isPointNearSide(point, boundary, side, margin)

const nudgedPointInwardFromSide = (
  point: RoutePoint,
  boundary: BoundaryRect,
  side: BoundarySide,
  depth: number,
): RoutePoint => {
  switch (side) {
    case "left":
      return { ...point, x: Math.min(boundary.minX + depth, boundary.maxX) }
    case "right":
      return { ...point, x: Math.max(boundary.maxX - depth, boundary.minX) }
    case "top":
      return { ...point, y: Math.max(boundary.maxY - depth, boundary.minY) }
    case "bottom":
      return { ...point, y: Math.min(boundary.minY + depth, boundary.maxY) }
  }
}

const getConflictPairKey = (conflict: ClearanceConflict) =>
  `${conflict.routeIndexes[0]}:${conflict.layers[0]}:${conflict.routeIndexes[1]}:${conflict.layers[1]}`

const getRouteNetNames = (route: HdRoute | undefined): string[] => {
  if (!route) return []
  const names = [route.connectionName, route.rootConnectionName].filter(
    (name): name is string => Boolean(name),
  )
  return Array.from(new Set(names))
}

const areRoutesSameNet = (
  firstRoute: HdRoute | undefined,
  secondRoute: HdRoute | undefined,
) => {
  const firstNames = getRouteNetNames(firstRoute)
  const secondNames = getRouteNetNames(secondRoute)
  if (firstNames.length === 0 || secondNames.length === 0) return false
  return firstNames.some((name) => secondNames.includes(name))
}

const countRouteViolations = (
  route: HdRoute | undefined,
  boundary: BoundaryRect,
  margin: number,
): number => {
  if (!route) return 0
  return findInteriorDiagonalSegmentsInBufferZone([route], boundary, margin).length
}

/**
 * For each route with remaining boundary violations, nudge interior points
 * that sit ON a violating side inward just enough to stop being counted as
 * a boundary violation, while preserving trace clearance with other
 * routes.
 *
 * We try progressively smaller nudge depths so that tightly packed areas
 * can still benefit (even a nudge of a few µm is enough to remove the
 * "segment overlaps boundary" violation — the detector uses EPSILON for
 * the "on side" comparison).
 */
export const targetedBoundaryCleanup = ({
  routes,
  boundary,
  margin,
  geometryCache,
}: {
  routes: HdRoute[]
  boundary: BoundaryRect
  margin: number
  geometryCache: RouteGeometryCache
}): { movesAccepted: number } => {
  const initialViolations = findInteriorDiagonalSegmentsInBufferZone(
    routes,
    boundary,
    margin,
  )
  if (initialViolations.length === 0) return { movesAccepted: 0 }

  const perRouteSides = new Map<number, Set<BoundarySide>>()
  for (const violation of initialViolations) {
    const existing = perRouteSides.get(violation.routeIndex) ?? new Set()
    for (const side of violation.touchedSides) existing.add(side)
    perRouteSides.set(violation.routeIndex, existing)
  }

  // Candidate nudge depths from smallest to largest. The smallest nudge
  // that actually removes the boundary violation and passes clearance
  // guards is preferred because it is the least disruptive to trace
  // clearance with neighbouring routes. We start at a few EPSILON so we
  // clear the strict "on boundary" equality check used by the detector.
  const nudgeDepths = [
    EPSILON * 8,
    0.01,
    margin / 4,
    margin / 2,
    margin + EPSILON * 8,
  ]
  let movesAccepted = 0

  const tryApplyCandidate = (
    routeIndex: number,
    candidateRoute: HdRoute,
    beforeViolationCount: number,
  ): boolean => {
    const candidatePoints = candidateRoute.route ?? []
    if (candidatePoints.length < 2) return false
    const dedupedRoute: HdRoute = {
      ...candidateRoute,
      route: dedupeRoutePoints(candidatePoints),
    }
    if ((dedupedRoute.route?.length ?? 0) < 2) return false

    const candidateRoutes = routes.slice()
    candidateRoutes[routeIndex] = dedupedRoute

    const afterViolationCount = countRouteViolations(
      candidateRoutes[routeIndex],
      boundary,
      margin,
    )
    if (afterViolationCount >= beforeViolationCount) return false

    // Use route-pair keys rather than point-index keys: tiny nudges often
    // only change segment bundling, not the underlying route pairs in
    // conflict. We only want to reject when a fundamentally NEW pair of
    // routes starts overlapping at zero clearance. Also ignore conflicts
    // between routes of the same net (those are legal).
    const isSameNetConflict = (conflict: ClearanceConflict) =>
      areRoutesSameNet(
        routes[conflict.routeIndexes[0]],
        routes[conflict.routeIndexes[1]],
      )
    const currentZeroConflictPairKeys = new Set(
      findClearanceConflicts(routes, new Set([routeIndex]), 0, geometryCache)
        .filter((conflict) => !isSameNetConflict(conflict))
        .map(getConflictPairKey),
    )
    const candidateZeroConflicts = findClearanceConflicts(
      candidateRoutes,
      new Set([routeIndex]),
      0,
      geometryCache,
    ).filter((conflict) => !isSameNetConflict(conflict))
    if (
      candidateZeroConflicts.some(
        (conflict) => !currentZeroConflictPairKeys.has(getConflictPairKey(conflict)),
      )
    ) {
      return false
    }

    // Reject any new trace-clearance regression for different nets.
    // This keeps boundary cleanup from trading away trace quality.
    const traceRegressions = findTraceClearanceRegressions({
      currentRoutes: routes,
      candidateRoutes,
      candidateRouteIndexes: new Set([routeIndex]),
      maximumAllowedClearance: Math.min(
        margin / 2,
        TRACE_CLEARANCE_REGRESSION_MAX,
      ),
    }).filter(
      (regression) =>
        !areRoutesSameNet(
          routes[regression.routeIndexes[0]],
          routes[regression.routeIndexes[1]],
        ),
    )
    if (traceRegressions.length > 0) return false

    routes[routeIndex] = dedupedRoute
    return true
  }

  const tryNudgeGroup = (
    routeIndex: number,
    pointIndexes: number[],
    side: BoundarySide,
    beforeViolationCount: number,
  ): boolean => {
    if (pointIndexes.length === 0) return false
    for (const depth of nudgeDepths) {
      const currentRoute = routes[routeIndex]
      const candidateRoute = cloneRoute(currentRoute)
      const candidatePoints = candidateRoute.route ?? []
      let changed = false
      for (const pointIndex of pointIndexes) {
        const point = candidatePoints[pointIndex]
        if (!point) continue
        candidatePoints[pointIndex] = nudgedPointInwardFromSide(
          point,
          boundary,
          side,
          depth,
        )
        changed = true
      }
      if (!changed) return false
      if (tryApplyCandidate(routeIndex, candidateRoute, beforeViolationCount)) {
        return true
      }
    }
    return false
  }

  const perpendicularSidesOfEndpoint = (
    point: RoutePoint,
    primarySide: BoundarySide,
  ): BoundarySide[] => {
    const sides: BoundarySide[] = []
    if (primarySide === "top" || primarySide === "bottom") {
      if (Math.abs(point.x - boundary.minX) <= EPSILON) sides.push("left")
      if (Math.abs(point.x - boundary.maxX) <= EPSILON) sides.push("right")
    } else {
      if (Math.abs(point.y - boundary.minY) <= EPSILON) sides.push("bottom")
      if (Math.abs(point.y - boundary.maxY) <= EPSILON) sides.push("top")
    }
    return sides
  }

  const tryBridgeTwoPointRoute = (
    routeIndex: number,
    side: BoundarySide,
    beforeViolationCount: number,
  ): boolean => {
    const currentRoute = routes[routeIndex]
    const points = currentRoute.route ?? []
    if (points.length !== 2) return false
    const [start, end] = points as [RoutePoint, RoutePoint]
    if (!isPointInSideBuffer(start, boundary, side, margin)) return false
    if (!isPointInSideBuffer(end, boundary, side, margin)) return false

    // If either endpoint sits at a corner, the naive bridge would cross
    // the perpendicular boundary side and create a new violation on that
    // side. Offset the corresponding bridge point inward from the
    // perpendicular side too.
    const startPerp = perpendicularSidesOfEndpoint(start, side)
    const endPerp = perpendicularSidesOfEndpoint(end, side)

    for (const depth of nudgeDepths) {
      let midStart = nudgedPointInwardFromSide(start, boundary, side, depth)
      let midEnd = nudgedPointInwardFromSide(end, boundary, side, depth)
      for (const perp of startPerp) {
        midStart = nudgedPointInwardFromSide(midStart, boundary, perp, depth)
      }
      for (const perp of endPerp) {
        midEnd = nudgedPointInwardFromSide(midEnd, boundary, perp, depth)
      }
      const candidateRoute: HdRoute = {
        ...currentRoute,
        route: [start, midStart, midEnd, end],
      }
      if (tryApplyCandidate(routeIndex, candidateRoute, beforeViolationCount)) {
        return true
      }
    }
    return false
  }

  for (const [routeIndex, sides] of perRouteSides) {
    const route = routes[routeIndex]
    if (!route) continue

    for (const side of sides) {
      let keepTrying = true
      while (keepTrying) {
        keepTrying = false
        const currentRoute = routes[routeIndex]
        const points = currentRoute.route ?? []
        if (points.length === 2) {
          const beforeViolationCount = countRouteViolations(
            routes[routeIndex],
            boundary,
            margin,
          )
          if (
            beforeViolationCount > 0 &&
            tryBridgeTwoPointRoute(routeIndex, side, beforeViolationCount)
          ) {
            movesAccepted += 1
          }
          break
        }
        if (points.length < 3) break

        const beforeViolationCount = countRouteViolations(
          routes[routeIndex],
          boundary,
          margin,
        )
        if (beforeViolationCount === 0) break

        // Collect every interior-on-side point
        const flushPointIndexes: number[] = []
        for (let i = 1; i < points.length - 1; i += 1) {
          const point = points[i]
          if (!point) continue
          if (isPointInSideBuffer(point, boundary, side, margin)) {
            flushPointIndexes.push(i)
          }
        }
        if (flushPointIndexes.length === 0) break

        // Attempt 1: nudge every flush point at once (largest -> smallest)
        if (
          tryNudgeGroup(
            routeIndex,
            flushPointIndexes,
            side,
            beforeViolationCount,
          )
        ) {
          movesAccepted += 1
          keepTrying = true
          continue
        }

        // Attempt 2: split into maximal consecutive runs and nudge each
        // independently.
        let appliedAny = false
        let routeViolationCount = beforeViolationCount
        let i = 0
        while (i < flushPointIndexes.length) {
          let j = i
          while (
            j + 1 < flushPointIndexes.length &&
            flushPointIndexes[j + 1] === flushPointIndexes[j] + 1
          ) {
            j += 1
          }
          const group = flushPointIndexes.slice(i, j + 1)
          if (tryNudgeGroup(routeIndex, group, side, routeViolationCount)) {
            movesAccepted += 1
            appliedAny = true
            routeViolationCount = countRouteViolations(
              routes[routeIndex],
              boundary,
              margin,
            )
          }
          i = j + 1
        }

        // Attempt 3: individual point-by-point fallback
        if (!appliedAny) {
          const pointsSnapshot = routes[routeIndex].route ?? []
          let routeViolationCount = beforeViolationCount
          for (let k = 1; k < pointsSnapshot.length - 1; k += 1) {
            const point = pointsSnapshot[k]
            if (!point) continue
            if (!isPointInSideBuffer(point, boundary, side, margin)) continue
            if (tryNudgeGroup(routeIndex, [k], side, routeViolationCount)) {
              movesAccepted += 1
              appliedAny = true
              routeViolationCount = countRouteViolations(
                routes[routeIndex],
                boundary,
                margin,
              )
            }
          }
        }

        if (appliedAny) keepTrying = true
      }
    }
  }

  // Fallback: for any route that is STILL violating and whose every point
  // sits on the same violating side with a uniform layer, simplify to a
  // 2-point route and let the bridge logic produce a fresh inward shape.
  // This handles (rare) routes that run FLUSH along the boundary with
  // internal backtracking — once collapsed, a single bridge step can
  // resolve them.
  for (const [routeIndex, sides] of perRouteSides) {
    const route = routes[routeIndex]
    if (!route) continue
    const points = route.route ?? []
    if (points.length <= 2) continue
    const beforeViolationCount = countRouteViolations(
      routes[routeIndex],
      boundary,
      margin,
    )
    if (beforeViolationCount === 0) continue
    for (const side of sides) {
      if (
        !points.every((point) => isPointInSideBuffer(point, boundary, side, margin))
      ) {
        continue
      }
      const firstZ = points[0]?.z
      if (!points.every((point) => point.z === firstZ)) continue
      const simplifiedRoute: HdRoute = {
        ...route,
        route: [
          points[0] as RoutePoint,
          points[points.length - 1] as RoutePoint,
        ],
      }
      const savedRoute = routes[routeIndex]
      routes[routeIndex] = simplifiedRoute
      if (tryBridgeTwoPointRoute(routeIndex, side, beforeViolationCount)) {
        movesAccepted += 1
      } else {
        // Restore the original route if bridging didn't succeed.
        routes[routeIndex] = savedRoute
      }
      break
    }
  }

  return { movesAccepted }
}
