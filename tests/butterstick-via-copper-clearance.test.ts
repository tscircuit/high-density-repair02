import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import "bun-match-svg"
import { getSvgFromGraphicsObject, type GraphicsObject } from "graphics-debug"
import {
  HighDensityRepairSolver,
  type DatasetSample,
  type HdRoute,
} from "../lib"

type XY = { x: number; y: number }
type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

const getVia = (route: HdRoute): XY => {
  const points = route.route!
  return points.find(
    (point, index) => index > 0 && point.z !== points[index - 1]!.z,
  )!
}

const clip = (start: XY, end: XY, bounds: Bounds): XY[] | undefined => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  let low = 0
  let high = 1
  for (const [p, q] of [
    [-dx, start.x - bounds.minX],
    [dx, bounds.maxX - start.x],
    [-dy, start.y - bounds.minY],
    [dy, bounds.maxY - start.y],
  ]) {
    if (p === 0) {
      if (q! < 0) return
      continue
    }
    const ratio = q! / p!
    if (p! < 0) low = Math.max(low, ratio)
    else high = Math.min(high, ratio)
    if (low > high) return
  }
  return [
    { x: start.x + low * dx, y: start.y + low * dy },
    { x: start.x + high * dx, y: start.y + high * dy },
  ]
}

const drawNativeNode = (
  sample: DatasetSample,
  routes: HdRoute[],
  required: number,
): GraphicsObject => {
  const graphics: GraphicsObject = {
    coordinateSystem: "cartesian",
    lines: [],
    circles: [],
    texts: [],
    rects: [],
  }
  const pairNames = ["source_net_15_mst1", "source_net_5_mst1"]
  const pair = pairNames.map(
    (name) => routes.find((route) => route.connectionName === name)!,
  )
  const centers = pair.map(getVia)
  const radii = pair.map((route) => route.viaDiameter! / 2)
  const gap =
    Math.hypot(centers[0]!.x - centers[1]!.x, centers[0]!.y - centers[1]!.y) -
    radii[0]! -
    radii[1]!
  const originalVia = getVia(
    sample.nodeHdRoutes!.find(
      (route) => route.connectionName === pairNames[0],
    )!,
  )
  const moved = Math.hypot(
    centers[0]!.x - originalVia.x,
    centers[0]!.y - originalVia.y,
  )
  const color = (route: HdRoute): string =>
    route.connectionName === pairNames[0]
      ? "#2563eb"
      : route.connectionName === pairNames[1]
        ? "#a21caf"
        : "#94a3b8"
  const views = [
    {
      bounds: { minX: 9.9, maxX: 18.2, minY: -0.2, maxY: 9.2 },
      scale: 1,
      x: 0,
    },
    {
      bounds: { minX: 10.1, maxX: 11.5, minY: 3.5, maxY: 4.9 },
      scale: 5.9,
      x: 9.2,
    },
  ]
  for (const [viewIndex, view] of views.entries()) {
    const project = (point: XY): XY => ({
      x: view.x + (point.x - view.bounds.minX) * view.scale,
      y: 0.3 + (point.y - view.bounds.minY) * view.scale,
    })
    const inside = (point: XY): boolean =>
      point.x >= view.bounds.minX &&
      point.x <= view.bounds.maxX &&
      point.y >= view.bounds.minY &&
      point.y <= view.bounds.maxY
    for (const route of [...(sample.fixedHdRoutes ?? []), ...routes]) {
      const owned = routes.includes(route)
      const points = route.route ?? []
      for (let index = 1; index < points.length; index++) {
        const start = points[index - 1]!
        const end = points[index]!
        if (start.z !== end.z) continue
        if (viewIndex === 1 && (start.z ?? 0) > 2) continue
        const segment = clip(start, end, view.bounds)
        if (!segment) continue
        graphics.lines!.push({
          points: segment.map(project),
          strokeColor:
            owned && pairNames.includes(route.connectionName!)
              ? color(route)
              : "#cbd5e180",
          strokeWidth: (route.traceThickness ?? 0.1) * view.scale,
          strokeDash:
            (start.z ?? 0) === 0
              ? undefined
              : [0.24 * view.scale, 0.16 * view.scale],
          layer: `z${start.z ?? 0}`,
        })
      }
      for (const via of route.vias ?? []) {
        if (!inside(via)) continue
        graphics.circles!.push({
          center: project(via),
          radius: ((via.diameter ?? route.viaDiameter ?? 0.3) / 2) * view.scale,
          fill: owned ? `${color(route)}35` : "#cbd5e155",
          stroke: owned ? color(route) : "#94a3b8",
        })
      }
    }
    for (const obstacle of sample.clearanceObstacles ?? []) {
      if (!obstacle.center || !inside(obstacle.center)) continue
      if (obstacle.shape === "circle")
        graphics.circles!.push({
          center: project(obstacle.center),
          radius: (obstacle.width! / 2) * view.scale,
          fill: "#ef444422",
          stroke: "#ef4444",
          layer: `z${obstacle.zLayers?.join(",") ?? 0}`,
        })
      else
        graphics.rects!.push({
          center: project(obstacle.center),
          width: obstacle.width! * view.scale,
          height: obstacle.height! * view.scale,
          fill: "#ef444422",
          stroke: "#ef4444",
        })
    }
    if (viewIndex === 0) {
      graphics.lines!.push({
        points: [project({ x: 10.5, y: 0 }), project({ x: 17.875, y: 0 })],
        strokeColor: "#94a3b8",
        strokeWidth: 0.01,
      })
      graphics.lines!.push({
        points: [project({ x: 10.5, y: 0 }), project({ x: 10.5, y: 9.2 })],
        strokeColor: "#94a3b8",
        strokeWidth: 0.01,
      })
      graphics.rects!.push({
        center: project({ x: 10.8, y: 4.2 }),
        width: 1.4,
        height: 1.4,
        stroke: "#0f172a",
        fill: "transparent",
      })
      continue
    }
    // The outer ring is the declared via-copper clearance around the other net.
    graphics.circles!.push({
      center: project(centers[1]!),
      radius: (radii[1]! + required) * view.scale,
      fill: "transparent",
      stroke: "#475569",
    })
    graphics.circles!.push({
      center: project(originalVia),
      radius: radii[0]! * view.scale,
      fill: "transparent",
      stroke: "#94a3b8",
    })
    for (const [index, center] of centers.entries()) {
      const label = project({ x: center!.x, y: center!.y + 0.11 })
      graphics.texts!.push({
        ...label,
        text: index === 0 ? "net 15" : "net 5",
        fontSize: 0.26,
        anchorSide: "center",
        color: color(pair[index]!),
      })
    }
    const distance = gap + radii[0]! + radii[1]!
    const direction = {
      x: (centers[0]!.x - centers[1]!.x) / distance,
      y: (centers[0]!.y - centers[1]!.y) / distance,
    }
    const edges = [
      {
        x: centers[1]!.x + direction.x * radii[1]!,
        y: centers[1]!.y + direction.y * radii[1]!,
      },
      {
        x: centers[0]!.x - direction.x * radii[0]!,
        y: centers[0]!.y - direction.y * radii[0]!,
      },
    ]
    const measurementColor = gap + 1e-6 < required ? "#dc2626" : "#15803d"
    graphics.lines!.push({
      points: edges.map(project),
      strokeColor: measurementColor,
      strokeWidth: 0.025,
    })
    for (const edge of edges)
      graphics.lines!.push({
        points: [
          project({
            x: edge.x - direction.y * 0.025,
            y: edge.y + direction.x * 0.025,
          }),
          project({
            x: edge.x + direction.y * 0.025,
            y: edge.y - direction.x * 0.025,
          }),
        ],
        strokeColor: measurementColor,
        strokeWidth: 0.025,
      })
  }
  graphics.texts!.push(
    {
      x: 0,
      y: 10.9,
      text: `ButterStick native ${sample.nodeWithPortPoints!.capacityMeshNodeId}`,
      fontSize: 0.42,
      anchorSide: "top_left",
      color: "#0f172a",
    },
    {
      x: 0,
      y: 10.3,
      text: `${routes.length} owned routes · ${sample.fixedHdRoutes!.length} fixed · ${sample.clearanceObstacles!.length} obstacles`,
      fontSize: 0.28,
      anchorSide: "top_left",
      color: "#475569",
    },
    {
      x: 0,
      y: 9.85,
      text: "Native routing area · top solid, other layers dashed",
      fontSize: 0.25,
      anchorSide: "top_left",
      color: "#475569",
    },
    {
      x: 9.2,
      y: 9.85,
      text: `Copper gap ${gap.toFixed(5)} mm / required ${required.toFixed(5)} mm`,
      fontSize: 0.29,
      anchorSide: "top_left",
      color: "#0f172a",
    },
    {
      x: 9.2,
      y: 9.35,
      text: `Via movement ${moved.toFixed(5)} mm · trace rule ${sample.minClearance} mm`,
      fontSize: 0.27,
      anchorSide: "top_left",
      color: "#475569",
    },
    {
      x: 9.2,
      y: -0.1,
      text: `Shared layers 0-2 · dark ring: ${required.toFixed(3)} mm clearance`,
      fontSize: 0.23,
      anchorSide: "top_left",
      color: "#475569",
    },
  )
  return graphics
}

// Native source: github.com/butterstick-fpga/butterstick-hardware at 0694ddfa9824a07f0c6c6981186e45f80187659c.
// Captured from Main3180/Core2372/autorouter1092, node cmn_1__sub_2_0.
test("ButterStick native node via copper spacing", async (): Promise<void> => {
  const fixture = JSON.parse(
    gunzipSync(
      new Uint8Array(
        readFileSync(
          new URL(
            "./fixtures/butterstick-native-via-copper.json.gz",
            import.meta.url,
          ),
        ),
      ),
    ).toString(),
  ) as { sample: DatasetSample; margin: number }
  // Inferred separately so this repro also compiles before the optional API exists.
  const sample = { ...fixture.sample, viaCopperClearance: 0.1 }
  const original = structuredClone(sample)
  const solver = new HighDensityRepairSolver({
    sample,
    margin: fixture.margin,
    repairBoundaryDiagonals: false,
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(sample).toEqual(original)
  const repaired = solver.getOutput().repairedRoutes
  expect(repaired).toHaveLength(original.nodeHdRoutes!.length)
  for (const [index, route] of repaired.entries()) {
    expect(route.route![0]).toEqual(original.nodeHdRoutes![index]!.route![0])
    expect(route.route!.at(-1)).toEqual(
      original.nodeHdRoutes![index]!.route!.at(-1),
    )
  }
  const graphics = drawNativeNode(sample, repaired, sample.viaCopperClearance)
  await expect(
    getSvgFromGraphicsObject(graphics, {
      backgroundColor: "white",
      svgWidth: 1536,
      svgHeight: 1024,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
