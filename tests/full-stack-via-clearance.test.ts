import { expect, test } from "bun:test"
import { FixedCopperClearanceGuard } from "../lib/high-density-repair-solver/functions/FixedCopperClearanceGuard"
import { getRouteObstacleClearance } from "../lib/high-density-repair-solver/functions/repairNodeClearance"
import { buildRepairFrames } from "../lib/high-density-repair-solver/steps/buildRepairFrames"
import type {
  HdRoute,
  Obstacle,
} from "../lib/high-density-repair-solver/shared/types"

function viaRoute(x: number, y: number, name = "signal"): HdRoute {
  return {
    connectionName: name,
    rootConnectionName: name,
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x, y, z: 0 },
      { x, y, z: 1 },
    ],
    vias: [{ x, y }],
  }
}

function wire(y: number, z: number, name = "signal"): HdRoute {
  return {
    connectionName: name,
    rootConnectionName: name,
    traceThickness: 0.1,
    route: [
      { x: -1, y, z },
      { x: 1, y, z },
    ],
  }
}

test("physical through vias protect unused board layers while blind and legacy spans remain unchanged", () => {
  const policy = { layerCount: 8, allowBlindAndBuriedVias: false }
  // Exact sample024 via/keepout witnesses after node repair. Their signal
  // transitions use layers 0 and 1, while the drilled copper crosses 4 and 5.
  const witnesses = [
    {
      name: "source_net_altium_pcb_13",
      x: 232.2001473447531,
      y: 40.304998229863784,
      center: { x: 232.0036, y: 40.462199999999996 },
      width: 0.5334000000000098,
      height: 0.5334000000000098,
      z: 5,
    },
    {
      name: "source_net_altium_pcb_13",
      x: 231.80673045595643,
      y: 40.3049984,
      center: { x: 232.0036, y: 40.462199999999996 },
      width: 0.5334000000000098,
      height: 0.5334000000000098,
      z: 5,
    },
    {
      name: "source_net_altium_pcb_106",
      x: 279.35798873586356,
      y: 69.04531268753666,
      center: { x: 279.56525748, y: 69.33840082 },
      width: 0.5333999999999955,
      height: 0.5333999999999955,
      z: 5,
    },
    {
      name: "source_net_altium_pcb_106",
      x: 279.35798873586356,
      y: 69.04531268753666,
      center: { x: 279.55240000000003, y: 69.342 },
      width: 0.5334000000000098,
      height: 0.5334000000000098,
      z: 4,
    },
  ]
  for (const witness of witnesses) {
    const route = viaRoute(witness.x, witness.y, witness.name)
    const obstacle: Obstacle = {
      type: "rect",
      center: witness.center,
      width: witness.width,
      height: witness.height,
      zLayers: [witness.z],
      connectedTo: [],
    }
    expect(getRouteObstacleClearance(route, obstacle)).toBe(Infinity)
    expect(getRouteObstacleClearance(route, obstacle, policy)).toBeLessThan(0)
    expect(
      getRouteObstacleClearance(route, obstacle, {
        ...policy,
        allowBlindAndBuriedVias: true,
      }),
    ).toBe(Infinity)
    const result = buildRepairFrames(
      {
        ...policy,
        nodeWithPortPoints: {
          center: { x: witness.x, y: witness.y },
          width: 1,
          height: 1,
        },
        nodeHdRoutes: [route],
        clearanceObstacles: [obstacle],
      },
      0.2,
      false,
      false,
    )
    expect(result.clearanceRepairStats).toBeDefined()
    expect(
      result.clearanceRepairStats!.nodeClearanceInitialConflictCount,
    ).toBeGreaterThan(0)
  }
  // Exact Net385/R88.2 bottom-pad location, including an unidentified raw-pad
  // variant. No PCB/source identity is required to protect physical copper.
  const r88: Obstacle = {
    type: "rect",
    center: { x: 110.03789778000001, y: 162.24499935999998 },
    width: 1.00000054,
    height: 0.9500006400000001,
    zLayers: [7],
    connectedTo: [
      "source_net_altium_pcb_349",
      "pcb_smtpad_altium_8093",
      "pcb_port_altium_8093",
    ],
  }
  const ground = viaRoute(
    109.94945643620899,
    162.56999868,
    "source_net_altium_pcb_385_mst331",
  )
  for (const connectedTo of [r88.connectedTo, []]) {
    const pad = { ...r88, connectedTo }
    expect(getRouteObstacleClearance(ground, pad)).toBe(Infinity)
    expect(getRouteObstacleClearance(ground, pad, policy)).toBeLessThan(0)
    const standalone = { ...ground, route: [] }
    expect(getRouteObstacleClearance(standalone, pad, policy)).toBeLessThan(0)
  }
  const fixed = viaRoute(0, 0, "fixed")
  const before = [wire(0.5, 7)]
  const after = [wire(0, 7)]
  expect(
    new FixedCopperClearanceGuard([fixed], 0.1).allows(before, after, [0]),
  ).toBe(true)
  expect(
    new FixedCopperClearanceGuard([fixed], 0.1, [], policy).allows(
      before,
      after,
      [0],
    ),
  ).toBe(false)
  expect(
    new FixedCopperClearanceGuard([fixed], 0.1, [], {
      ...policy,
      allowBlindAndBuriedVias: true,
    }).allows(before, after, [0]),
  ).toBe(true)
  const movingBefore = [viaRoute(0, 0.5)]
  const movingAfter = [viaRoute(0, 0)]
  const fixedWire = wire(0, 7, "fixed")
  expect(
    new FixedCopperClearanceGuard([fixedWire], 0.1, [], policy).allows(
      movingBefore,
      movingAfter,
      [0],
    ),
  ).toBe(false)
  expect(
    new FixedCopperClearanceGuard([fixedWire], 0.1, [], {
      ...policy,
      allowBlindAndBuriedVias: true,
    }).allows(movingBefore, movingAfter, [0]),
  ).toBe(true)
  const ownPad = {
    ...r88,
    zLayers: [0, 1, 2, 3, 4, 5, 6, 7],
    connectedTo: [ground.rootConnectionName!],
  }
  const ownGuard = new FixedCopperClearanceGuard([], 0.1, [ownPad], policy)
  expect(
    ownGuard.allows(
      [{ ...ground, ...viaRoute(112, 162.56999868, ground.connectionName) }],
      [ground],
      [0],
    ),
  ).toBe(true)
  expect(() =>
    getRouteObstacleClearance(ground, r88, { layerCount: 0 }),
  ).toThrow("positive integer")
})
