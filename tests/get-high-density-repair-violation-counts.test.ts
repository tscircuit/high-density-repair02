import { expect, test } from "bun:test"
import { getHighDensityRepairViolationCounts } from "../lib"

test("counts repairable boundary geometry without running the solver", (): void => {
  expect(
    getHighDensityRepairViolationCounts({
      nodeWithPortPoints: {
        capacityMeshNodeId: "cmn_272",
        center: { x: 11.2, y: -3.945 },
        width: 0.64,
        height: 0.38,
        portPoints: [
          {
            x: 11.52,
            y: -3.945,
            z: 0,
            connectionName: "source_trace_3__source_net_3",
          },
          {
            x: 10.88,
            y: -3.945,
            z: 0,
            connectionName: "source_trace_3__source_net_3",
          },
        ],
      },
      nodeHdRoutes: [
        {
          capacityMeshNodeId: "cmn_272",
          connectionName: "source_trace_3__source_net_3",
          rootConnectionName: "source_trace_3",
          route: [
            { x: 11.52, y: -3.945, z: 0 },
            { x: 10.88, y: -3.945, z: 0 },
          ],
          traceThickness: 0.1,
          vias: [],
          viaDiameter: 0.3,
        },
      ],
      margin: 0.2,
    }),
  ).toEqual({
    boundaryViolationCount: 1,
    traceViolationCount: 0,
    totalViolationCount: 1,
  })
})
