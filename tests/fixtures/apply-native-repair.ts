import type { AnyCircuitElement, PcbTrace, PcbVia } from "circuit-json"
import type { DatasetSample, HdRoute } from "../../lib"

type PcbTraceId = string
type ConnectionName = string
type NativeRoute = HdRoute & {
  connectionName: string
  traceThickness: number
  route: NonNullable<HdRoute["route"]>
  vias: NonNullable<HdRoute["vias"]>
}
type NativeSection = {
  pcb_trace_id: PcbTraceId
  originalRoute: NativeRoute
  startIndex: number
  endIndex: number
}
export type NativeRepairFixture = {
  sample: DatasetSample & { minClearance: number; nodeHdRoutes: NativeRoute[] }
  circuitJson: AnyCircuitElement[]
  sections: NativeSection[]
}
type WirePoint = Extract<PcbTrace["route"][number], { route_type: "wire" }>

/** Splice repaired sections into the original PCB without replacing its parts or nets. */
export function applyNativeRepair(
  fixture: NativeRepairFixture,
  repairedRoutes: HdRoute[],
): AnyCircuitElement[] {
  const throughVia = fixture.circuitJson.find(
    (element): element is PcbVia => element.type === "pcb_via",
  )
  if (!throughVia) throw new Error("Missing native copper layer stack")
  const layers = throughVia.layers
  const repairedByName = new Map<ConnectionName, HdRoute>(
    repairedRoutes.map((route) => {
      if (!route.connectionName) throw new Error("Missing repaired connection")
      return [route.connectionName, route]
    }),
  )
  const sectionsByTraceId = new Map<PcbTraceId, NativeSection>(
    fixture.sections.map((section) => [section.pcb_trace_id, section]),
  )
  return fixture.circuitJson.map((element): AnyCircuitElement => {
    if (element.type !== "pcb_trace" && element.type !== "pcb_via")
      return element
    const section = sectionsByTraceId.get(element.pcb_trace_id ?? "")
    if (!section) return element
    const repaired = repairedByName.get(section.originalRoute.connectionName)
    if (
      !repaired?.route ||
      !repaired.vias ||
      repaired.traceThickness === undefined
    )
      throw new Error("Missing repaired native section")
    const input = fixture.sample.nodeHdRoutes.find(
      (route) => route.connectionName === repaired.connectionName,
    )
    if (!input?.vias) throw new Error("Missing original native section")
    if (element.type === "pcb_via") {
      const viaIndex = input.vias.findIndex(
        (via) => via.x === element.x && via.y === element.y,
      )
      if (viaIndex === -1) return element
      const via = repaired.vias[viaIndex]
      if (!via) throw new Error("Repair lost a native via")
      return { ...element, x: via.x, y: via.y }
    }
    const points = [
      ...section.originalRoute.route.slice(0, section.startIndex),
      ...repaired.route,
      ...section.originalRoute.route.slice(section.endIndex + 1),
    ]
    const route: PcbTrace["route"] = []
    for (const [index, point] of points.entries()) {
      const previous = points[index - 1]
      const layer = layers[point.z ?? 0]
      if (!layer) throw new Error("Missing native copper layer")
      if (previous && previous.z !== point.z) {
        const fromLayer = layers[previous.z ?? 0]
        if (!fromLayer || previous.x !== point.x || previous.y !== point.y)
          throw new Error("Native via endpoints must remain coincident")
        route.push({
          route_type: "via",
          x: point.x,
          y: point.y,
          from_layer: fromLayer,
          to_layer: layer,
        })
      }
      const first = element.route[0]
      const last = element.route.at(-1)
      const wire: WirePoint = {
        route_type: "wire",
        x: point.x,
        y: point.y,
        layer,
        width: repaired.traceThickness,
      }
      if (index === 0 && first?.route_type === "wire")
        wire.start_pcb_port_id = first.start_pcb_port_id
      if (index === points.length - 1 && last?.route_type === "wire")
        wire.end_pcb_port_id = last.end_pcb_port_id
      route.push(wire)
    }
    return { ...element, route }
  })
}
