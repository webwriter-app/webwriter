import {graphicShapePresets} from "../src/graphic-shape-presets"
import {graphicPresetFillRule, graphicPresetPath, type GraphicPresetType} from "../src/graphic-shapes"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

/** Native SVG filling must keep decorative seams solid and real holes open. */
export function checkGraphicShapeFills() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", "0 0 100 100")
  document.body.append(svg)
  try {
    const samples: Partial<Record<GraphicPresetType, [number, number][]>> = {
      cylinder: [[50, 25]], cube: [[75, 15]], "folded-corner": [[90, 90]],
      "ribbon-up": [[50, 50]], "ribbon-down": [[50, 50]],
      "curved-ribbon-up": [[50, 50]], "curved-ribbon-down": [[50, 50]],
      "vertical-scroll": [[30, 6], [70, 94]], "horizontal-scroll": [[94, 30], [6, 70]],
      "sequential-access-storage": [[65, 85], [90, 85]],
      "magnetic-disk": [[50, 25]], "direct-access-storage": [[75, 50]],
    }
    for(const [type, points] of Object.entries(samples) as [GraphicPresetType, [number, number][]][]) {
      const path = document.createElementNS(svg.namespaceURI, "path") as SVGPathElement
      path.setAttribute("d", graphicPresetPath(type, {x: 0, y: 0, width: 100, height: 100}))
      path.setAttribute("fill-rule", graphicPresetFillRule(type))
      svg.replaceChildren(path)
      for(const [x, y] of points) assert(path.isPointInFill(new DOMPoint(x, y)), `${type}: unfilled overlap at ${x},${y}`)
      const definition = graphicShapePresets[type]
      // Reversing seams must not move the outline, including at adjustment limits.
      for(const value of [definition.adjustments[0].min, definition.adjustments[0].default, definition.adjustments[0].max]) {
        path.setAttribute("d", graphicPresetPath(type, {x: 0, y: 0, width: 100, height: 100}, [value]))
        const bounds = path.getBBox(), length = path.getTotalLength()
        path.setAttribute("d", definition.draw([value]))
        const original = path.getBBox()
        assert(Math.abs(path.getTotalLength() - length) < .01, `${type}: detail stroke changed`)
        for(const key of ["x", "y", "width", "height"] as const) assert(Math.abs(bounds[key] - original[key]) < .001, `${type}: ${key} changed`)
      }
    }
    for(const type of ["frame", "donut", "prohibited"] as const) {
      const path = document.createElementNS(svg.namespaceURI, "path") as SVGPathElement
      path.setAttribute("d", graphicPresetPath(type, {x: 0, y: 0, width: 100, height: 100}))
      path.setAttribute("fill-rule", graphicPresetFillRule(type))
      svg.replaceChildren(path)
      assert(path.isPointInFill(new DOMPoint(5, 50)), `${type}: missing outer fill`)
      const point = type === "prohibited" ? new DOMPoint(40, 60) : new DOMPoint(50, 50)
      assert(!path.isPointInFill(point), `${type}: intentional hole filled`)
    }
  }
  finally { svg.remove() }
}
