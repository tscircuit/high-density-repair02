import { expect, test } from "bun:test"
import { HighDensityRepairSolver } from "../lib"

test("node repair aligns rounded via records with their precise layer transitions", () => {
  const solver = new HighDensityRepairSolver({
    sample: {
      nodeWithPortPoints: { center: { x: 0, y: 0 }, width: 4, height: 4 },
      nodeHdRoutes: [
        {
          connectionName: "signal",
          viaDiameter: 0.3,
          route: [
            { x: -2, y: 0, z: 0 },
            { x: 0.0003, y: 0.0002, z: 0 },
            { x: 0.0003, y: 0.0002, z: 2 },
            { x: 2, y: 0, z: 2 },
          ],
          vias: [{ x: 0, y: 0, diameter: 0.3 }],
        },
      ],
    },
    margin: 0.2,
  })
  solver.solve()
  const route = solver.getOutput().repairedRoutes[0]!
  expect(route.vias).toEqual([{ x: 0.0003, y: 0.0002, diameter: 0.3 }])
  expect(route.route![1]).toMatchObject({ x: 0.0003, y: 0.0002, z: 0 })
  expect(route.route![2]).toMatchObject({ x: 0.0003, y: 0.0002, z: 2 })
})
