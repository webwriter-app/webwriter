// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import {isGraphicPresetType, readGraphicPreset} from "../graphic-shapes"
import {DOMEditor} from "../domeditor"
import {$} from "../utility"
import {
  SVG_NAMESPACE,
  graphicShapeForNode,
  graphicShapeOptions,
  graphicShapeRoots,
  graphicShapeType,
  standaloneGraphicShape,
} from "../graphic"

let editor: DOMEditor

// Every preset's path and handles are covered in graphic-shapes.test.ts. These
// exercise each insertion/painting family through the complete editor lifecycle.
const insertionPresets = new Set([
  "text-box", "rounded-rectangle", "snip-round", "curved-connector-arrow",
  "donut", "cube", "heart", "up-arrow", "quad-arrow-callout", "divide",
  "magnetic-disk", "star-32", "vertical-scroll", "cloud-callout", "line-callout-2",
])
const insertionOptions = graphicShapeOptions.filter(option => !isGraphicPresetType(option.type) || insertionPresets.has(option.type))

async function mutationsDelivered() {
  await new Promise<void>(resolve => queueMicrotask(resolve))
  await new Promise<void>(resolve => queueMicrotask(resolve))
}

function clickShape(shape: Element, shiftKey = false) {
  shape.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, shiftKey}))
  document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, shiftKey}))
}

beforeEach(() => {
  document.body.replaceChildren()
  editor = new DOMEditor()
  $.move(document.body.firstElementChild!)
})

afterEach(() => editor.destroy())

describe("graphic editing", () => {
  it("shows a move cursor over preset paths inside a captured graphic", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "heart"})
    const graphic = document.querySelector("svg")!
    const path = graphic.querySelector("path")!
    editor.features.selection.captureElement(graphic)

    expect(getComputedStyle(graphic).cursor).toBe("crosshair")
    expect(getComputedStyle(path).cursor).toBe("move")

    const group = document.createElementNS(SVG_NAMESPACE, "g")
    graphic.append(group)
    group.append(path)
    expect(getComputedStyle(path).cursor).toBe("move")

    document.body.classList.add("◆", "◆graphic-panning")
    expect(getComputedStyle(path).cursor).toBe("grabbing")
  })

  it("recognizes labeled shape roots without normalizing unfamiliar SVG groups", () => {
    const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
    graphic.innerHTML = `
      <g id="unfamiliar"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/></g>
      <g id="labeled"><polygon points="50,0 100,50 50,100 0,50"/><text>Choice</text></g>
    `
    document.body.append(graphic)

    const unfamiliar = graphic.querySelector("#unfamiliar")!
    const labeled = graphic.querySelector("#labeled")!
    expect(graphicShapeType(unfamiliar)).toBeNull()
    expect(graphicShapeType(labeled)).toBe("diamond")
    expect(graphicShapeForNode(labeled.querySelector("text"))).toBe(labeled)
    expect(graphicShapeRoots(graphic)).toEqual([
      ...Array.from(unfamiliar.querySelectorAll("rect")),
      labeled,
    ])
    expect(unfamiliar.children).toHaveLength(2)
  })

  it("inserts an empty native 16:9 SVG drawing area", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})

    const graphic = document.querySelector("svg")!
    expect(graphic.namespaceURI).toBe(SVG_NAMESPACE)
    expect(graphic).toHaveAttribute("viewBox", "0 0 1600 900")
    expect(graphic).toHaveAttribute("width", "100%")
    expect(graphic.children).toHaveLength(0)
    expect($.selectedElement).toBe(graphic)
    expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    expect(graphic).toHaveClass("◆element-selected", "◆element-capture-selected")
    expect(editor.features.graphic.getState()).toMatchObject({active: true, capture: true})
    expect(editor.toHTML(true)).toBe('<svg viewBox="0 0 1600 900" width="100%"></svg>')
  })

  it.each(insertionOptions)("inserts a standalone $label graphic", option => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: option.type})

    const graphic = document.querySelector("svg")!
    const shape = graphic.firstElementChild!
    expect(Number(graphic.getAttribute("width"))).toBeGreaterThan(0)
    expect(graphic).toHaveStyle({
      position: "absolute",
      width: `${graphic.getAttribute("width")}px`,
      height: `${graphic.getAttribute("height")}px`,
    })
    expect(graphic).toHaveAttribute("overflow", "visible")
    expect(graphic.getAttribute("viewBox")).not.toBe("0 0 1600 900")
    expect(shape.namespaceURI).toBe(SVG_NAMESPACE)
    const polygonal = ["triangle", "diamond", "hexagon", "star", "arrow", "polygon"].includes(option.type)
    expect(shape.localName).toBe(option.type === "text-box" ? "g" : isGraphicPresetType(option.type) ? "path" : option.type === "rectangle" ? "rect" : option.type === "connector" ? "polyline" : polygonal ? "polygon" : option.type)
    expect(shape.localName === "g" ? shape.firstElementChild : shape).toHaveAttribute("stroke")
    expect($.selectedElement).toBe(graphic)
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    expect(graphic).toHaveClass("◆element-selected")
    expect(graphic).not.toHaveClass("◆element-capture-selected", "◆graphic-grid-visible")
    expect(editor.features.transformation.target).toBe(graphic)
    expect(editor.features.graphic.selectedShape).toBe(shape)
    expect(editor.features.graphic.getState()).toMatchObject({capture: false, selectionCount: 1})
    expect(editor.appendix.querySelector('[part~="selection-caret-node"]')).not.toBeNull()
    expect(editor.appendix.querySelector('[part~="atomic-selection-overlay"]')).toBeNull()
    expect(editor.appendix.querySelector('.◆graphic-selection-outline')).toHaveAttribute("display", "none")
    expect(editor.appendix.querySelectorAll('.◆graphic-specific-handles button').length).toBeGreaterThan(0)
    expect(editor.appendix.querySelector('.◆graphic-ports')?.children).toHaveLength(0)
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(document.body.querySelector('[data-graphic-handle]')).toBeNull()
    if(option.type === "text-box") expect(shape.querySelector("text")).toHaveTextContent("Text")
  })

  it.each(["commit", "cancel", "replace", "mutate"])("adjusts preset handles safely on %s", async outcome => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rounded-rectangle"})
    const graphic = document.querySelector("svg")!
    const shape = graphic.querySelector("path")!
    Object.defineProperty(graphic, "getScreenCTM", {
      configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}),
    })
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const original = shape.getAttribute("d")!
    const state = readGraphicPreset(shape)!
    const handle = editor.appendix.querySelector('[data-graphic-handle="adjust-radius"]')!
    const pointer = {bubbles: true, composed: true, button: 0, pointerId: 19}
    handle.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: state.bounds.x + 28.8, clientY: state.bounds.y}))
    document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: state.bounds.x + 72, clientY: state.bounds.y}))
    expect(editor.appendix.querySelector(".◆graphic-preview")).not.toBeNull()
    expect(shape.getAttribute("d")).toBe(original)
    if(outcome === "cancel") document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))
    if(outcome === "replace") {
      const replacement = shape.cloneNode(true) as Element
      replacement.removeAttribute("class")
      shape.replaceWith(replacement)
    }
    const externalPath = "M 0 0 C 10 10 30 70 99 35 Z"
    if(outcome === "mutate") shape.setAttribute("d", externalPath)
    document.dispatchEvent(new PointerEvent("pointerup", pointer))
    await mutationsDelivered()
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(document.querySelector(".◆graphic-preview-source")).toBeNull()
    if(outcome === "commit") {
      expect(readGraphicPreset(shape)!.values[0]).toBeCloseTo(30)
      editor.features.history.actions.undo({type: "undo"})
      expect(shape.getAttribute("d")).toBe(original)
      editor.features.history.actions.redo({type: "redo"})
      expect(readGraphicPreset(shape)!.values[0]).toBeCloseTo(30)
    }
    else expect(shape.getAttribute("d")).toBe(outcome === "mutate" ? externalPath : original)
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(document.body.querySelector("[data-graphic-handle]")).toBeNull()
  })

  it("adjusts a labeled preset in an irregular SVG group without changing siblings", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rounded-rectangle"})
    const shape = graphic.querySelector("path")!
    const group = document.createElementNS(SVG_NAMESPACE, "g")
    group.innerHTML = '<!--preserve--><foreignObject><custom-widget xmlns="http://www.w3.org/1999/xhtml" title="keep"/></foreignObject>'
    const sibling = group.innerHTML
    graphic.append(group)
    group.append(shape)
    clickShape(shape)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "label", value: "Caption"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "adjust-radius", value: "35"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "width", value: "420"})
    expect(readGraphicPreset(shape)?.values[0]).toBeCloseTo(35)
    expect(readGraphicPreset(shape)?.bounds.width).toBeCloseTo(420)
    expect(group.querySelector("text")?.textContent).toBe("Caption")
    expect(group.innerHTML.startsWith(sibling)).toBe(true)
    expect(shape.attributes).not.toEqual(expect.arrayContaining([expect.objectContaining({name: "data-shape"})]))
  })

  it("capture-selects a drawing-area click and adds a shape to that live SVG", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!

    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))

    expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    expect(graphic).toHaveClass("◆element-selected", "◆element-capture-selected")
    expect(editor.features.graphic.getState()).toEqual({
      active: true,
      capture: true,
      selectionCount: 0,
      options: {grid: true, snap: true, guides: true},
    })

    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const rectangle = graphic.querySelector("rect")!
    expect(rectangle).toHaveClass("◆graphic-shape-selected")
    expect(editor.features.graphic.getState()).toMatchObject({
      active: true,
      capture: true,
      shape: "rectangle",
      parameters: {x: "680", y: "330", width: "240", height: "240"},
    })
  })

  it("fits a standalone rectangle to its stroke and reselects it through the element path", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    expect(graphic).toHaveAttribute("viewBox", "678 328 244 244")
    expect(graphic).toHaveAttribute("width", "244")
    expect(graphic).toHaveAttribute("height", "244")
    const paragraph = document.createElement("p")
    paragraph.textContent = "Other content"
    document.body.append(paragraph)
    $.move(paragraph.firstChild!)
    editor.features.selection.processSelection()
    expect(editor.appendix.querySelector('.◆graphic-overlay')).toHaveAttribute("hidden")

    clickShape(graphic.firstElementChild!)
    document.dispatchEvent(new Event("selectionchange"))

    expect($.selectedElement).toBe(graphic)
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    expect(editor.features.transformation.target).toBe(graphic)
    expect(editor.appendix.querySelector('.◆graphic-overlay')).not.toHaveAttribute("hidden")
    expect(graphic).not.toHaveClass("◆graphic-grid-visible")
  })

  it.each(["Delete", "Backspace"])("deletes the whole standalone shape with %s and supports undo", async key => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    await mutationsDelivered()
    editor.doc.stopCapturing()
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key}))
    await mutationsDelivered()
    expect(document.querySelector("svg")).toBeNull()
    expect(editor.appendix.querySelector('.◆graphic-overlay')).toHaveAttribute("hidden")
    editor.features.history.actions.undo({type: "undo"})
    const graphic = document.querySelector("svg")!
    expect(graphic.querySelector("rect")).not.toBeNull()
    clickShape(graphic)
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    expect(editor.features.graphic.selectedShape).toBe(graphic.querySelector("rect"))
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it.each(["commit", "cancel", "replace"])("edits standalone yellow affordances safely on %s", async outcome => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const shape = graphic.querySelector("rect")!
    Object.defineProperty(graphic, "getScreenCTM", {
      configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: -678, f: -328}),
    })
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const handle = editor.appendix.querySelector('[data-graphic-handle="roundness"]')!
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, clientX: 14, clientY: 2}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: 62, clientY: 2}))
    expect(editor.appendix.querySelector('.◆graphic-preview')).not.toBeNull()
    if(outcome === "cancel") document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))
    if(outcome === "replace") {
      const replacement = shape.cloneNode(true) as Element
      replacement.removeAttribute("class")
      shape.replaceWith(replacement)
    }
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    await mutationsDelivered()
    expect(shape).toHaveAttribute("rx", outcome === "commit" ? "60" : "12")
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    expect(editor.appendix.querySelector('.◆graphic-preview')).toBeNull()
    expect(document.querySelector('.◆graphic-preview-source')).toBeNull()
    if(outcome === "commit") {
      editor.features.history.actions.undo({type: "undo"})
      expect(shape).toHaveAttribute("rx", "12")
      editor.features.history.actions.redo({type: "redo"})
      expect(shape).toHaveAttribute("rx", "60")
    }
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("recognizes serialized standalone shapes while preserving unfamiliar or expanded SVG content", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const copy = graphic.cloneNode(true) as SVGSVGElement
    copy.insertAdjacentHTML("afterbegin", '<title>Shape</title><!--keep--><defs><marker id="tip"/></defs>')
    document.body.append(copy)
    clickShape(copy.querySelector("rect")!)
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    expect(standaloneGraphicShape(copy)).toBe(copy.querySelector("rect"))
    copy.insertAdjacentHTML("beforeend", '<g transform="translate(3 4)"><path d="M0 0 L10 10"/></g>')
    const content = copy.innerHTML
    clickShape(copy)
    expect(standaloneGraphicShape(copy)).toBeNull()
    expect(editor.features.selection.captureSelectedElement).toBe(copy)
    expect(copy.innerHTML).toBe(content)
    editor.features.graphic.disable()
    expect(copy).not.toHaveClass("◆graphic-grid-visible")
    expect(editor.appendix.querySelector('.◆graphic-overlay')).toBeNull()
  })

  it("restores a standalone node selection after native focus clears its range", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    document.getSelection()!.removeAllRanges()
    editor.features.selection.processSelection()
    expect($.selectedElement).toBe(graphic)
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    $.move(document.body, 0)
    editor.features.selection.processSelection()
    expect($.selectedElement).toBeUndefined()
    expect(graphic).not.toHaveClass("◆element-selected")
  })

  it("expands the element to fit an edited radius beyond the original viewport in one undo step", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "ellipse"})
    const graphic = document.querySelector("svg")!
    const ellipse = graphic.querySelector("ellipse")!
    Object.defineProperty(graphic, "getScreenCTM", {
      configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}),
    })
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const handle = editor.appendix.querySelector('[data-graphic-handle="radius-x"]')!
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, clientX: 920, clientY: 450}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: 1100, clientY: 450}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    await mutationsDelivered()
    expect(ellipse).toHaveAttribute("rx", "300")
    expect(graphic).toHaveAttribute("viewBox", "498 328 604 244")
    expect(graphic.style.width).toBe("604px")
    expect(graphic.style.height).toBe("244px")
    expect($.selectedElement).toBe(graphic)
    editor.features.history.actions.undo({type: "undo"})
    expect(ellipse).toHaveAttribute("rx", "120")
    expect(graphic).toHaveAttribute("viewBox", "678 328 244 244")
    expect(graphic.style.width).toBe("244px")
    editor.features.history.actions.redo({type: "redo"})
    expect(ellipse).toHaveAttribute("rx", "300")
    expect(graphic.getAttribute("style")).toContain("width: 604px")
  })

  it.each(insertionOptions)("preserves the rendered form and size of an added $label", option => {
    const createGraphic = (xScale: number, yScale: number) => {
      const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
      graphic.setAttribute("viewBox", "0 0 1600 900")
      Object.defineProperty(graphic, "getScreenCTM", {
        configurable: true,
        value: () => ({a: xScale, b: 0, c: 0, d: yScale, e: 0, f: 0}),
      })
      document.body.append(graphic)
      editor.features.selection.captureElement(graphic)
      return graphic
    }
    const baselineGraphic = createGraphic(1, 1)
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: option.type})
    const baseline = editor.features.graphic.getState()!.parameters!
    const transformedGraphic = createGraphic(1, 0.5)
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: option.type})
    const transformed = editor.features.graphic.getState()!.parameters!
    const baselineShape = graphicShapeRoots(baselineGraphic)[0]
    const transformedShape = graphicShapeRoots(transformedGraphic)[0]

    expect(Number(transformed.width)).toBeCloseTo(Number(baseline.width), 2)
    expect(Number(transformed.height) * 0.5).toBeCloseTo(Number(baseline.height), 2)
    expect(baselineShape.localName === "g" ? baselineShape.firstElementChild : baselineShape).toHaveAttribute("vector-effect", "non-scaling-stroke")
    expect(transformedShape.localName === "g" ? transformedShape.firstElementChild : transformedShape).toHaveAttribute("vector-effect", "non-scaling-stroke")
    if(option.type === "rectangle") {
      expect(Number(transformedShape.getAttribute("rx"))).toBeCloseTo(Number(baselineShape.getAttribute("rx")), 2)
      expect(Number(transformedShape.getAttribute("ry")) * 0.5).toBeCloseTo(Number(baselineShape.getAttribute("ry")), 2)
    }
  })

  it("centers shapes at their natural size in differently sized viewBoxes", () => {
    const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
    graphic.setAttribute("viewBox", "100 50 800 400")
    Object.defineProperty(graphic, "getScreenCTM", {
      configurable: true,
      value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}),
    })
    document.body.append(graphic)
    editor.features.selection.captureElement(graphic)

    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})

    expect(editor.features.graphic.getState()?.parameters).toMatchObject({
      x: "380", y: "130", width: "240", height: "240",
    })
  })

  it("uniformly reduces a natural shape only when the rendered graphic is too small", () => {
    const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
    graphic.setAttribute("viewBox", "0 0 1600 900")
    Object.defineProperty(graphic, "getScreenCTM", {
      configurable: true,
      value: () => ({a: 0.1, b: 0, c: 0, d: 0.1, e: 0, f: 0}),
    })
    document.body.append(graphic)
    editor.features.selection.captureElement(graphic)

    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const parameters = editor.features.graphic.getState()!.parameters!
    const renderedWidth = Number(parameters.width) * 0.1
    const renderedHeight = Number(parameters.height) * 0.1

    expect(renderedWidth).toBeLessThan(240)
    expect(renderedHeight).toBeLessThan(240)
    expect(renderedWidth / renderedHeight).toBeCloseTo(1)
    expect(Number(parameters.x)).toBeGreaterThanOrEqual(0)
    expect(Number(parameters.y)).toBeGreaterThanOrEqual(0)
    expect(Number(parameters.x) + Number(parameters.width)).toBeLessThanOrEqual(1600)
    expect(Number(parameters.y) + Number(parameters.height)).toBeLessThanOrEqual(900)
  })

  it("inserts every closed shape without flattening its natural form", () => {
    const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
    graphic.setAttribute("viewBox", "0 0 1600 900")
    document.body.append(graphic)
    editor.features.selection.captureElement(graphic)

    graphicShapeOptions.filter(option => option.type !== "line" && option.type !== "connector").forEach(option => {
      graphic.replaceChildren()
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: option.type})
      const parameters = editor.features.graphic.getState()!.parameters!
      const ratio = Number(parameters.width) / Number(parameters.height)
      expect(ratio, `${option.label} should retain its natural form`).toBeGreaterThanOrEqual(0.85)
      expect(ratio, `${option.label} should retain its natural form`).toBeLessThanOrEqual(1.2)
    })
  })

  it("does not add a shape to a merely node-selected graphic", () => {
    const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
    graphic.setAttribute("viewBox", "0 0 1600 900")
    document.body.append(graphic)
    $.selectElement(graphic)
    editor.features.selection.processSelection()

    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "ellipse"})

    expect(graphic.children).toHaveLength(0)
    expect(editor.features.graphic.getState()).toEqual({
      active: true,
      capture: false,
      selectionCount: 0,
      options: {grid: true, snap: true, guides: true},
    })
  })

  it("moves shapes directly and exposes shape-specific appendix affordances", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const rectangle = graphic.querySelector("rect")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    Object.defineProperty(rectangle, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(400, 250, 800, 400),
    })

    rectangle.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 400,
      clientY: 250,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 500,
      clientY: 300,
    }))

    expect(rectangle).toHaveAttribute("x", "680")
    expect(rectangle).toHaveAttribute("y", "330")
    expect(rectangle).toHaveClass("◆graphic-preview-source")
    expect(editor.appendix.querySelector(".◆graphic-preview")).not.toBeNull()

    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("x", "780")
    expect(rectangle).toHaveAttribute("y", "380")
    expect(rectangle).not.toHaveClass("◆graphic-preview-source")
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    const overlay = editor.appendix.querySelector<HTMLElement>(".◆graphic-overlay")!
    expect(overlay.getRootNode()).toBe(editor.appendix)
    expect(overlay.querySelector('[data-graphic-handle="rotate"]')).not.toBeNull()
    expect(overlay.querySelector('[data-graphic-handle="roundness"]')).not.toBeNull()
    expect(document.body.querySelector("[data-graphic-handle]")).toBeNull()
  })

  it("edits geometry and paint parameters without serializing selection chrome", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const rectangle = graphic.querySelector("rect")!
    rectangle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))

    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "width", value: "640"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "corner-radius", value: "48"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "fill", value: "#ef4444"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "30"})

    expect(rectangle).toHaveAttribute("width", "640")
    expect(rectangle).toHaveAttribute("rx", "48")
    expect(rectangle).toHaveAttribute("fill", "#ef4444")
    expect(rectangle.getAttribute("transform")).toMatch(/^rotate\(30 /)
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(editor.toHTML(true)).toContain('width="640"')
    expect(editor.toHTML(true)).not.toContain("data-graphic-handle")
  })

  it("stores multiline shape labels as native SVG text and keeps them centered", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const rectangle = graphic.querySelector("rect")!
    clickShape(rectangle)

    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "label", value: "Release\nplan"})

    const group = graphic.querySelector("g")!
    const text = group.querySelector("text")!
    expect(group.firstElementChild).toBe(rectangle)
    expect(editor.features.graphic.selectedShape).toBe(group)
    expect(editor.features.graphic.getState()).toMatchObject({
      shape: "rectangle",
      parameters: {label: "Release\nplan", "font-size": "48", "text-color": "#0f172a"},
    })
    expect(text).toHaveAttribute("x", "800")
    expect(text).toHaveAttribute("y", "450")
    expect(getComputedStyle(text).pointerEvents).toBe("auto")
    expect(getComputedStyle(text).cursor).toBe("text")
    expect(Array.from(text.querySelectorAll("tspan"), span => span.textContent)).toEqual(["Release", "plan"])

    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "width", value: "720"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "30"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "fill", value: "#dbeafe"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "font-size", value: "56"})

    expect(text).toHaveAttribute("x", "1040")
    expect(text).toHaveAttribute("font-size", "56")
    expect(group.getAttribute("transform")).toMatch(/^rotate\(30 /)
    expect(rectangle).not.toHaveAttribute("transform")
    expect(rectangle).toHaveAttribute("fill", "#dbeafe")
    expect(group).not.toHaveAttribute("fill")
    clickShape(text)
    expect(editor.features.graphic.selectedShape).toBe(group)
    expect(editor.toHTML(true)).toContain("<text")
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("edits rich labels in the SVG with only an input proxy and caret in the appendix", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "diamond"})
    const polygon = document.querySelector("polygon")!
    polygon.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
    const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
    expect(proxy).not.toBeNull()
    expect(proxy.style.opacity).toBe("0")
    expect(document.body.querySelector("textarea")).toBeNull()
    editor.features.mark.toggleMark("b")
    proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "Decision", cancelable: true}))
    const group = document.querySelector("svg > g")!
    expect(group.querySelector("text")).toHaveTextContent("Decision")
    expect(group.querySelector("tspan")!.getAttribute("style")).toContain("font-weight: bold")
    expect(editor.features.mark.getState().marks).toContain("b")
    proxy.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))
    expect(group.querySelector("text")).toHaveTextContent("Decision")
    expect(editor.appendix.querySelector(".◆graphic-label-input")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("opens the selected shape label editor with Enter and retains graphic capture on Escape", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const rectangle = graphic.querySelector("rect")!
    clickShape(rectangle)

    const enter = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"})
    document.dispatchEvent(enter)

    expect(enter.defaultPrevented).toBe(true)
    expect(editor.appendix.querySelector(".◆graphic-label-input")).not.toBeNull()

    editor.appendix.querySelector(".◆graphic-label-input")!.dispatchEvent(
      new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Escape"}),
    )

    expect(editor.appendix.querySelector(".◆graphic-label-input")).toBeNull()
    expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    expect(graphic).toHaveClass("◆element-capture-selected")
  })

  it("owns text and navigation input while capture-selected", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    const events = [
      new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "a"}),
      new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"}),
      new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "ArrowRight"}),
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        data: "a",
        inputType: "insertText",
      }),
      new Event("paste", {bubbles: true, cancelable: true}),
    ]

    events.forEach(event => document.dispatchEvent(event))

    events.forEach(event => expect(event.defaultPrevented).toBe(true))
    expect(document.body.children).toHaveLength(1)
    expect(graphic).toBe(document.body.firstElementChild)
    expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    expect(graphic).toHaveClass("◆element-capture-selected")
  })

  it("moves labeled shapes and their text together through the preview path", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "label", value: "Move me"})
    const group = graphic.querySelector("g")!
    const rectangle = group.querySelector("rect")!
    const text = group.querySelector("text")!

    group.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 620, clientY: 360}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: 720, clientY: 410}))
    expect(editor.appendix.querySelector(".◆graphic-preview g text")).toHaveTextContent("Move me")
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("x", "780")
    expect(rectangle).toHaveAttribute("y", "380")
    expect(text).toHaveAttribute("x", "900")
    expect(text).toHaveAttribute("y", "500")
  })

  it("undoes and redoes a native label wrapper as one edit", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    clickShape(graphic.querySelector("rect")!)
    await mutationsDelivered()
    editor.doc.stopCapturing()

    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "label", value: "Milestone"})
    await mutationsDelivered()
    expect(graphic.querySelector("g > text")).toHaveTextContent("Milestone")

    editor.features.history.actions.undo({type: "undo"})
    expect(graphic.querySelector("g")).toBeNull()
    expect(graphic.querySelector("rect")).not.toBeNull()
    editor.features.history.actions.redo({type: "redo"})
    expect(graphic.querySelector("g > text")).toHaveTextContent("Milestone")
  })

  it("exposes native geometry parameters and vertex handles for richer shapes", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))

    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "hexagon"})
    const hexagon = graphic.querySelectorAll("polygon")[0]
    expect(editor.features.graphic.getState()).toMatchObject({shape: "hexagon", parameters: {inset: "60"}})
    expect(editor.appendix.querySelectorAll('[data-graphic-handle^="vertex-"]')).toHaveLength(6)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "inset", value: "60"})
    expect(hexagon.getAttribute("points")!.split(" ")[0]).toBe("740,330")

    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "star"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "inner-radius", value: "30"})
    expect(editor.features.graphic.getState()).toMatchObject({shape: "star", parameters: {"inner-radius": "30"}})
    expect(editor.appendix.querySelectorAll('[data-graphic-handle^="vertex-"]')).toHaveLength(10)

    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "arrow"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "head-size", value: "50"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "tail-width", value: "30"})
    expect(editor.features.graphic.getState()).toMatchObject({
      shape: "arrow",
      parameters: {"head-size": "50", "tail-width": "30"},
    })
    expect(editor.appendix.querySelectorAll('[data-graphic-handle^="vertex-"]')).toHaveLength(7)
  })

  it("resizes and rotates with appendix handles", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const rectangle = graphic.querySelector("rect")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })

    rectangle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 400, clientY: 250}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    const overlay = editor.appendix.querySelector<HTMLElement>(".◆graphic-overlay")!
    const southeast = overlay.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-se"]')!
    southeast.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 1200,
      clientY: 650,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: 1400, clientY: 750}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("width", "720")
    expect(rectangle).toHaveAttribute("height", "420")

    const rotate = overlay.querySelector<HTMLButtonElement>('[data-graphic-handle="rotate"]')!
    rotate.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 1040,
      clientY: 306,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: 1274, clientY: 540}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle.getAttribute("transform")).toMatch(/^rotate\(90 /)
  })

  it.each([
    {handle: "move", start: [800, 450], moves: [[810, 470], [830, 490]]},
    {handle: "resize-se", start: [920, 570], moves: [[940, 590], [960, 610]]},
    {handle: "rotate", start: [800, 306], moves: [[944, 450], [800, 594]]},
  ])("keeps an SVG $handle gesture separate from adjacent edits in undo and redo", ({handle, start, moves}) => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const rectangle = graphic.querySelector("rect")!
    clickShape(rectangle)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    rectangle.setAttribute("data-before", "keep")
    const before = editor.toHTML(true)
    const control = handle === "move" ? rectangle
      : editor.appendix.querySelector(`[data-graphic-handle="${handle}"]`)!
    control.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, composed: true, button: 0, clientX: start[0], clientY: start[1],
    }))
    for(const [clientX, clientY] of moves) {
      document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX, clientY}))
      editor.doc.syncFromDOM()
      expect(editor.toHTML(true)).toBe(before)
    }
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    const after = editor.toHTML(true)
    expect(after).not.toBe(before)
    rectangle.setAttribute("data-after", "later")
    editor.doc.syncFromDOM()

    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(after)
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(before)
    editor.doc.undo()
    expect(rectangle).not.toHaveAttribute("data-before")
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(before)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(after)
    editor.doc.redo()
    expect(rectangle).toHaveAttribute("data-after", "later")
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(editor.doc.body.toString()).not.toContain("◆")
  })

  it.each([
    {label: "snaps to 5° when Snap is on", snap: true, altKey: false, expected: 15},
    {label: "does not snap when Snap is off", snap: false, altKey: false, expected: 13},
    {label: "temporarily bypasses Snap with Alt", snap: true, altKey: true, expected: 13},
  ])("$label while rotating one shape", ({snap, altKey, expected}) => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const rectangle = graphic.querySelector("rect")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    if(!snap) editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "snap"})
    clickShape(rectangle)

    const center = {x: 800, y: 450}
    const radius = 144
    const radians = (-90 + 13) * Math.PI / 180
    const rotate = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="rotate"]')!
    rotate.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: center.x,
      clientY: center.y - radius,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: center.x + Math.cos(radians) * radius,
      clientY: center.y + Math.sin(radians) * radius,
      altKey,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("transform", `rotate(${expected} 800 450)`)
  })

  it("resizes a rotated shape in its local axes", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const rectangle = graphic.querySelector("rect")!
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "90"})
    rectangle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    const outline = editor.appendix.querySelector<SVGPolygonElement>(".◆graphic-selection-outline")!
    const fixedNorthwest = outline.getAttribute("points")!.split(" ")[0]
    const southeast = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-se"]')!
    southeast.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 710,
      clientY: 630,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 660,
      clientY: 680,
      altKey: true,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("x", "615")
    expect(rectangle).toHaveAttribute("y", "375")
    expect(rectangle).toHaveAttribute("width", "350")
    expect(rectangle).toHaveAttribute("height", "260")
    expect(rectangle.getAttribute("transform")).toMatch(/^rotate\(90 /)
    expect(outline.getAttribute("points")!.split(" ")[0]).toBe(fixedNorthwest)
  })

  it("keeps the opposite edge fixed while resizing a rotated shape", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const rectangle = graphic.querySelector("rect")!
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "90"})

    const west = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-w"]')!
    const east = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-e"]')!
    const fixedEast = {left: east.style.left, top: east.style.top}
    west.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 800,
      clientY: 270,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 800,
      clientY: 220,
      altKey: true,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("x", "625")
    expect(rectangle).toHaveAttribute("y", "275")
    expect(rectangle).toHaveAttribute("width", "350")
    expect(rectangle).toHaveAttribute("height", "240")
    expect({left: east.style.left, top: east.style.top}).toEqual(fixedEast)
  })

  it("switches a crossed corner and snaps its new moving edges", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const rectangle = graphic.querySelector("rect")!
    const northwest = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-nw"]')!
    const southeast = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-se"]')!

    northwest.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 620,
      clientY: 360,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 1047,
      clientY: 597,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("x", "920")
    expect(rectangle).toHaveAttribute("y", "570")
    expect(rectangle).toHaveAttribute("width", "130")
    expect(rectangle).toHaveAttribute("height", "30")
    expect({left: northwest.style.left, top: northwest.style.top}).toEqual({left: "920px", top: "570px"})
    expect({left: southeast.style.left, top: southeast.style.top}).toEqual({left: "1050px", top: "600px"})
  })

  it("switches crossed corners around the fixed anchor of a rotated shape", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const rectangle = graphic.querySelector("rect")!
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "90"})
    const outline = editor.appendix.querySelector<SVGPolygonElement>(".◆graphic-selection-outline")!
    const fixedSoutheast = outline.getAttribute("points")!.split(" ")[2]
    const northwest = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-nw"]')!

    northwest.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 890,
      clientY: 270,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 660,
      clientY: 680,
      altKey: true,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("x", "615")
    expect(rectangle).toHaveAttribute("y", "615")
    expect(rectangle).toHaveAttribute("width", "110")
    expect(rectangle).toHaveAttribute("height", "20")
    const corners = outline.getAttribute("points")!.split(" ")
    expect(corners[0]).toBe(fixedSoutheast)
    expect(corners[2]).toBe("660,680")
  })

  it("shows endpoint and vertex affordances for lines and polygons", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "line"})
    let graphic = document.querySelector("svg")!
    graphic.querySelector("line")!.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    let overlay = editor.appendix.querySelector<HTMLElement>(".◆graphic-overlay")!
    expect(overlay.querySelector('[data-graphic-handle="line-start"]')).not.toBeNull()
    expect(overlay.querySelector('[data-graphic-handle="line-end"]')).not.toBeNull()

    editor.features.selection.captureElement(graphic)
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "polygon"})
    overlay = editor.appendix.querySelector<HTMLElement>(".◆graphic-overlay")!
    expect(overlay.querySelectorAll('[data-graphic-handle^="vertex-"]')).toHaveLength(5)
  })

  it("moves a horizontal line without changing its endpoints' axis", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "line"})
    const graphic = document.querySelector("svg")!
    const line = graphic.querySelector("line")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })

    line.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 350, clientY: 450}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: 400, clientY: 475}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(line).toHaveAttribute("x1", "690")
    expect(line).toHaveAttribute("x2", "1010")
    expect(line).toHaveAttribute("y1", "475")
    expect(line).toHaveAttribute("y2", "475")
  })

  it("does not move a selected shape until the drag threshold is crossed", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const rectangle = document.querySelector("rect")!

    rectangle.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 620,
      clientY: 360,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 622,
      clientY: 361,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("x", "680")
    expect(rectangle).toHaveAttribute("y", "330")
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
  })

  it("adds and removes shapes from a shared selection with Shift-click", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "ellipse"})
    const rectangle = graphic.querySelector("rect")!
    const ellipse = graphic.querySelector("ellipse")!

    clickShape(rectangle)
    clickShape(ellipse, true)

    expect(editor.features.graphic.selectedShapes).toEqual([rectangle, ellipse])
    expect(rectangle).toHaveClass("◆graphic-shape-selected")
    expect(ellipse).toHaveClass("◆graphic-shape-selected")
    expect(editor.features.graphic.getState()).toMatchObject({
      active: true,
      capture: true,
      selectionCount: 2,
      parameters: {fill: "#ffffff"},
    })
    expect(editor.features.graphic.getState()).not.toHaveProperty("shape")
    expect(editor.appendix.querySelectorAll(".◆graphic-individual-outline")).toHaveLength(2)

    clickShape(ellipse, true)

    expect(editor.features.graphic.selectedShapes).toEqual([rectangle])
    expect(ellipse).not.toHaveClass("◆graphic-shape-selected")
    expect(editor.features.graphic.getState()).toMatchObject({selectionCount: 1, shape: "rectangle"})
  })

  it("marquee-selects intersecting shapes and keeps the marquee in the appendix", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    for(let index = 0; index < 3; index++) {
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    }
    const rectangles = Array.from(graphic.querySelectorAll("rect"))
    ;[[100, 100], [300, 150], [700, 500]].forEach(([x, y], index) => {
      rectangles[index].setAttribute("x", String(x))
      rectangles[index].setAttribute("y", String(y))
      rectangles[index].setAttribute("width", "100")
      rectangles[index].setAttribute("height", "100")
    })

    graphic.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 50,
      clientY: 50,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 450,
      clientY: 350,
    }))

    expect(editor.features.graphic.selectedShapes).toEqual(rectangles.slice(0, 2))
    const marquee = editor.appendix.querySelector<SVGRectElement>(".◆graphic-marquee")!
    expect(marquee).not.toHaveAttribute("hidden")
    expect(marquee).not.toHaveAttribute("display")
    expect(marquee).toHaveAttribute("x", "50")
    expect(editor.appendix.querySelector(".◆graphic-selection-outline")).toHaveStyle({display: "none"})
    expect(editor.appendix.querySelectorAll(".◆graphic-handle:not([hidden])")).toHaveLength(0)
    expect(document.body.querySelector(".◆graphic-marquee")).toBeNull()

    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(marquee).toHaveAttribute("hidden")
    expect(marquee).toHaveAttribute("display", "none")
    expect(editor.appendix.querySelector(".◆graphic-selection-outline")).not.toHaveStyle({display: "none"})
    expect(editor.appendix.querySelectorAll(".◆graphic-handle:not([hidden])")).toHaveLength(9)
    expect(editor.features.graphic.getState()).toMatchObject({selectionCount: 2})
    expect(editor.toHTML(true)).not.toContain("◆graphic-marquee")
  })

  it("restores the base selection when an additive marquee is cancelled", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    for(let index = 0; index < 3; index++) {
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    }
    const rectangles = Array.from(graphic.querySelectorAll("rect"))
    ;[[100, 100], [300, 100], [700, 500]].forEach(([x, y], index) => {
      rectangles[index].setAttribute("x", String(x))
      rectangles[index].setAttribute("y", String(y))
      rectangles[index].setAttribute("width", "100")
      rectangles[index].setAttribute("height", "100")
    })
    clickShape(rectangles[2])

    graphic.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerId: 4,
      shiftKey: true,
      clientX: 50,
      clientY: 50,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      pointerId: 4,
      shiftKey: true,
      clientX: 500,
      clientY: 300,
    }))
    expect(editor.features.graphic.selectedShapes).toHaveLength(3)
    expect(editor.features.graphic.selectedShapes).toEqual(expect.arrayContaining(rectangles))

    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))

    expect(editor.features.graphic.selectedShapes).toEqual([rectangles[2]])
    expect(editor.appendix.querySelector(".◆graphic-marquee")).toHaveAttribute("hidden")
    expect(editor.features.graphic.getState()).toMatchObject({selectionCount: 1})
  })

  it("moves a multi-selection through one preview and one undo step", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    let graphicRect = new DOMRect(0, 0, 1600, 900)
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => graphicRect,
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const [first, second] = Array.from(graphic.querySelectorAll("rect"))
    first.setAttribute("x", "100")
    first.setAttribute("y", "100")
    first.setAttribute("width", "100")
    first.setAttribute("height", "100")
    second.setAttribute("x", "300")
    second.setAttribute("y", "100")
    second.setAttribute("width", "100")
    second.setAttribute("height", "100")
    await mutationsDelivered()
    clickShape(first)
    clickShape(second, true)

    first.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 100,
      clientY: 100,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 150,
      clientY: 125,
      altKey: true,
    }))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

    expect(first).toHaveAttribute("x", "100")
    expect(second).toHaveAttribute("x", "300")
    expect(first).toHaveClass("◆graphic-preview-source")
    expect(second).toHaveClass("◆graphic-preview-source")
    const preview = editor.appendix.querySelector<SVGSVGElement>(".◆graphic-preview")!
    expect(Array.from(preview.querySelectorAll("rect"), shape => [shape.getAttribute("x"), shape.getAttribute("y")])).toEqual([
      ["150", "125"], ["350", "125"],
    ])

    graphicRect = new DOMRect(40, 60, 1600, 900)
    document.dispatchEvent(new Event("scroll"))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    expect(preview.style.left).toBe("40px")
    expect(preview.style.top).toBe("60px")

    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(first).toHaveAttribute("x", "150")
    expect(second).toHaveAttribute("x", "350")
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    await mutationsDelivered()
    editor.features.history.actions.undo({type: "undo"})
    expect(Array.from(graphic.querySelectorAll("rect"), shape => shape.getAttribute("x"))).toEqual(["100", "300"])
  })

  it("resizes and rotates a multi-selection around its shared frame", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const [first, second] = Array.from(graphic.querySelectorAll("rect"))
    ;[first, second].forEach((shape, index) => {
      shape.setAttribute("x", String(100 + index * 200))
      shape.setAttribute("y", "100")
      shape.setAttribute("width", "100")
      shape.setAttribute("height", "100")
    })
    clickShape(first)
    clickShape(second, true)

    const southeast = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-se"]')!
    southeast.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 400,
      clientY: 200,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 700,
      clientY: 300,
      altKey: true,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect([first.getAttribute("x"), first.getAttribute("width")]).toEqual(["100", "200"])
    expect([second.getAttribute("x"), second.getAttribute("width")]).toEqual(["500", "200"])

    // Restore a simple horizontal frame so the group rotation has exact centers.
    ;[first, second].forEach((shape, index) => {
      shape.setAttribute("x", String(100 + index * 200))
      shape.setAttribute("y", "100")
      shape.setAttribute("width", "100")
      shape.setAttribute("height", "100")
    })
    editor.features.graphic.refresh()
    const rotate = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="rotate"]')!
    rotate.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 250,
      clientY: 50,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 350,
      clientY: 150,
      shiftKey: true,
      altKey: true,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect([first.getAttribute("x"), first.getAttribute("y")]).toEqual(["200", "0"])
    expect([second.getAttribute("x"), second.getAttribute("y")]).toEqual(["200", "200"])
    expect(first.getAttribute("transform")).toMatch(/^rotate\(90 /)
    expect(second.getAttribute("transform")).toMatch(/^rotate\(90 /)
  })

  it("snaps a multi-selection rotation to 5°", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const [first, second] = Array.from(graphic.querySelectorAll("rect"))
    ;[first, second].forEach((shape, index) => {
      shape.setAttribute("x", String(100 + index * 200))
      shape.setAttribute("y", "100")
      shape.setAttribute("width", "100")
      shape.setAttribute("height", "100")
    })
    clickShape(first)
    clickShape(second, true)

    const center = {x: 250, y: 150}
    const radius = 100
    const radians = (-90 + 13) * Math.PI / 180
    const rotate = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="rotate"]')!
    rotate.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: center.x,
      clientY: center.y - radius,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: center.x + Math.cos(radians) * radius,
      clientY: center.y + Math.sin(radians) * radius,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(first.getAttribute("transform")).toMatch(/^rotate\(15 /)
    expect(second.getAttribute("transform")).toMatch(/^rotate\(15 /)
  })

  it("aligns, distributes, and reorders selected shapes as grouped commands", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    for(let index = 0; index < 3; index++) {
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    }
    const rectangles = Array.from(graphic.querySelectorAll("rect"))
    ;[[0, 60], [300, 10], [900, 110]].forEach(([x, y], index) => {
      rectangles[index].setAttribute("x", String(x))
      rectangles[index].setAttribute("y", String(y))
      rectangles[index].setAttribute("width", "100")
      rectangles[index].setAttribute("height", "100")
    })
    clickShape(rectangles[0])
    clickShape(rectangles[1], true)
    clickShape(rectangles[2], true)

    editor.features.graphic.actions.arrangeGraphicShapes({type: "arrangeGraphicShapes", operation: "align-top"})
    expect(rectangles.map(shape => shape.getAttribute("y"))).toEqual(["10", "10", "10"])

    editor.features.graphic.actions.arrangeGraphicShapes({type: "arrangeGraphicShapes", operation: "distribute-horizontal"})
    expect(rectangles.map(shape => shape.getAttribute("x"))).toEqual(["0", "450", "900"])

    clickShape(rectangles[2], true)
    editor.features.graphic.actions.arrangeGraphicShapes({type: "arrangeGraphicShapes", operation: "bring-front"})
    expect(Array.from(graphic.querySelectorAll("rect"))).toEqual([rectangles[2], rectangles[0], rectangles[1]])
    expect(editor.toHTML(true)).not.toContain("◆graphic-shape-selected")
  })

  it("snaps a preview to sibling alignment and commits once on release", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const [moving, target] = Array.from(graphic.querySelectorAll("rect"))
    moving.setAttribute("x", "100")
    moving.setAttribute("y", "100")
    moving.setAttribute("width", "200")
    moving.setAttribute("height", "100")
    target.setAttribute("x", "500")
    target.setAttribute("y", "300")
    target.setAttribute("width", "200")
    target.setAttribute("height", "100")

    moving.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 100,
      clientY: 100,
    }))
    expect(moving.isConnected).toBe(true)
    expect(editor.features.graphic.selectedShapes).toEqual([moving])
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 497,
      clientY: 100,
    }))

    expect(moving).toHaveAttribute("x", "100")
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const preview = editor.appendix.querySelector<SVGSVGElement>(".◆graphic-preview")!
    expect(preview.querySelector("rect")).toHaveAttribute("x", "500")
    const guide = editor.appendix.querySelector<SVGLineElement>('.◆graphic-guide[data-axis="x"]')!
    expect(guide).not.toHaveAttribute("hidden")
    expect(guide).not.toHaveAttribute("display")
    expect(guide.dataset.kind).toBe("object")
    expect(guide.getAttribute("part")).toContain("graphic-guide-object")

    editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "guides"})
    expect(guide).toHaveAttribute("hidden")
    expect(guide).toHaveAttribute("display", "none")
    expect(editor.features.graphic.getState()?.options?.guides).toBe(false)

    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(moving).toHaveAttribute("x", "500")
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("draws and reconnects an orthogonal connector through appendix connection ports", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const [first, second] = Array.from(graphic.querySelectorAll("rect"))
    ;[
      [first, 100, 100],
      [second, 500, 300],
    ].forEach(([shape, x, y]) => {
      ;(shape as SVGRectElement).setAttribute("x", String(x))
      ;(shape as SVGRectElement).setAttribute("y", String(y))
      ;(shape as SVGRectElement).setAttribute("width", "100")
      ;(shape as SVGRectElement).setAttribute("height", "100")
    })
    clickShape(first)

    const ports = editor.appendix.querySelectorAll<HTMLButtonElement>("[data-graphic-port]")
    expect(ports).toHaveLength(4)
    const east = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-port="e"]')!
    east.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      pointerId: 3,
      clientX: 214,
      clientY: 150,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      pointerId: 3,
      clientX: 500,
      clientY: 350,
    }))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

    expect(graphic.querySelector("polyline")).toBeNull()
    expect(editor.appendix.querySelector(".◆graphic-preview polyline")).toHaveAttribute(
      "points",
      "200,150 350,150 350,350 500,350",
    )
    expect(editor.appendix.querySelector(".◆graphic-port-target")).toHaveAttribute("cx", "500")
    expect(editor.appendix.querySelector(".◆graphic-port-target")).toHaveAttribute("cy", "350")

    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 3}))

    const connector = graphic.querySelector("polyline")!
    expect(connector).toHaveAttribute("points", "200,150 350,150 350,350 500,350")
    expect(editor.features.graphic.getState()).toMatchObject({shape: "connector", selectionCount: 1})
    expect(editor.appendix.querySelectorAll("[data-graphic-port]")).toHaveLength(0)
    const end = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="connector-end"]')!
    end.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      pointerId: 4,
      clientX: 500,
      clientY: 350,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      pointerId: 4,
      clientX: 550,
      clientY: 300,
    }))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 4}))

    expect(connector).toHaveAttribute("points", "200,150 375,150 375,300 550,300")
    expect(editor.toHTML(true)).not.toContain("data-graphic")
  })

  it("keeps inferred connector endpoints attached while shapes move and resize", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "connector"})
    const [first, second] = Array.from(graphic.querySelectorAll("rect"))
    const connector = graphic.querySelector("polyline")!
    first.setAttribute("x", "100")
    first.setAttribute("y", "100")
    first.setAttribute("width", "100")
    first.setAttribute("height", "100")
    second.setAttribute("x", "500")
    second.setAttribute("y", "300")
    second.setAttribute("width", "100")
    second.setAttribute("height", "100")
    connector.setAttribute("points", "200,150 350,150 350,350 500,350")

    clickShape(first)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "label", value: "Source"})
    const labeledSource = first.parentElement as unknown as SVGGElement
    expect(labeledSource.localName).toBe("g")
    expect(editor.features.graphic.selectedShape).toBe(labeledSource)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "x", value: "150"})
    expect(connector).toHaveAttribute("points", "250,150 375,150 375,350 500,350")
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "90"})
    expect(connector).toHaveAttribute("points", "200,200 350,200 350,350 500,350")
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "0"})
    expect(connector).toHaveAttribute("points", "250,150 375,150 375,350 500,350")

    clickShape(second)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "width", value: "200"})
    expect(connector).toHaveAttribute("points", "250,150 375,150 375,350 500,350")
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "x", value: "600"})
    expect(connector).toHaveAttribute("points", "250,150 425,150 425,350 600,350")
  })

  it("previews and commits attached connectors with a shape in one undo step", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "connector"})
    const [first, second] = Array.from(graphic.querySelectorAll("rect"))
    const connector = graphic.querySelector("polyline")!
    ;[
      [first, 100, 100],
      [second, 500, 300],
    ].forEach(([shape, x, y]) => {
      ;(shape as SVGRectElement).setAttribute("x", String(x))
      ;(shape as SVGRectElement).setAttribute("y", String(y))
      ;(shape as SVGRectElement).setAttribute("width", "100")
      ;(shape as SVGRectElement).setAttribute("height", "100")
    })
    connector.setAttribute("points", "200,150 350,150 350,350 500,350")
    await mutationsDelivered()
    clickShape(first)

    first.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 100,
      clientY: 100,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 150,
      clientY: 100,
      altKey: true,
    }))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

    expect(first).toHaveAttribute("x", "100")
    expect(connector).toHaveAttribute("points", "200,150 350,150 350,350 500,350")
    expect(connector).toHaveClass("◆graphic-preview-source")
    expect(editor.appendix.querySelector(".◆graphic-preview polyline")).toHaveAttribute(
      "points",
      "250,150 375,150 375,350 500,350",
    )

    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    expect(first).toHaveAttribute("x", "150")
    expect(connector).toHaveAttribute("points", "250,150 375,150 375,350 500,350")
    await mutationsDelivered()
    editor.features.history.actions.undo({type: "undo"})
    expect(first).toHaveAttribute("x", "100")
    expect(connector).toHaveAttribute("points", "200,150 350,150 350,350 500,350")
  })

  it("removes connectors attached to a deleted shape", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "connector"})
    const rectangle = graphic.querySelector("rect")!
    const connector = graphic.querySelector("polyline")!
    rectangle.setAttribute("x", "100")
    rectangle.setAttribute("y", "100")
    rectangle.setAttribute("width", "100")
    rectangle.setAttribute("height", "100")
    connector.setAttribute("points", "200,150 300,150")
    clickShape(rectangle)

    const deletion = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Delete"})
    document.dispatchEvent(deletion)
    await mutationsDelivered()

    expect(deletion.defaultPrevented).toBe(true)
    expect(graphic.isConnected).toBe(true)
    expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    expect(rectangle.isConnected).toBe(false)
    expect(connector.isConnected).toBe(false)
    expect(document.querySelector("rect")).toBeNull()
    expect(document.querySelector("polyline")).toBeNull()
  })

  it("switches connector routing and adds native SVG arrow markers", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "connector"})
    const graphic = document.querySelector("svg")!
    const connector = graphic.querySelector("polyline")!
    connector.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))

    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "routing", value: "straight"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "end-arrow", value: "true"})

    expect(connector.getAttribute("points")!.trim().split(/\s+/)).toHaveLength(2)
    expect(connector.getAttribute("marker-end")).toMatch(/^url\(#graphic-arrow-\d+\)$/)
    expect(graphic.querySelector("defs marker path")).toHaveAttribute("d", "M 0 0 L 10 5 L 0 10 z")
    expect(graphic.querySelector("defs marker path")).toHaveAttribute("fill", "context-stroke")
    expect(editor.features.graphic.getState()).toMatchObject({
      shape: "connector",
      parameters: {routing: "straight", "start-arrow": "false", "end-arrow": "true"},
    })
    expect(editor.toHTML(true)).not.toContain("◆")

    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "end-arrow", value: "false"})
    expect(connector).not.toHaveAttribute("marker-end")
    expect(graphic.querySelector("defs")).toBeNull()
  })

  it("derives a layer list from live shape roots and safely manages each layer", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "ellipse"})
    const rectangle = graphic.querySelector("rect")!
    const ellipse = graphic.querySelector("ellipse")!
    await mutationsDelivered()

    expect(editor.features.graphic.getState()?.layers).toEqual([
      {index: 0, label: "Rectangle 1", type: "rectangle", selected: false, primary: false, visible: true, locked: false},
      {index: 1, label: "Ellipse 2", type: "ellipse", selected: true, primary: true, visible: true, locked: false},
    ])

    editor.features.graphic.actions.manageGraphicLayer({type: "manageGraphicLayer", operation: "toggle-lock", index: 1})
    expect(ellipse).toHaveClass("◆graphic-shape-locked")
    expect(editor.features.graphic.selectedShapes).toHaveLength(0)
    expect(editor.features.graphic.getState()?.layers?.[1]).toMatchObject({locked: true, selected: false})
    expect(editor.toHTML(true)).not.toContain("graphic-shape-locked")

    editor.features.graphic.actions.manageGraphicLayer({type: "manageGraphicLayer", operation: "toggle-lock", index: 1})
    editor.features.graphic.actions.manageGraphicLayer({type: "manageGraphicLayer", operation: "select", index: 1})
    expect(editor.features.graphic.selectedShape).toBe(ellipse)

    editor.features.graphic.actions.manageGraphicLayer({type: "manageGraphicLayer", operation: "toggle-visibility", index: 0})
    expect(rectangle).toHaveAttribute("visibility", "hidden")
    expect(editor.features.graphic.getState()?.layers?.[0].visible).toBe(false)
    await mutationsDelivered()

    editor.features.graphic.actions.manageGraphicLayer({type: "manageGraphicLayer", operation: "send-back", index: 1})
    expect(graphicShapeRoots(graphic)).toEqual([ellipse, rectangle])
    expect(editor.features.graphic.getState()?.layers?.map(layer => layer.type)).toEqual(["ellipse", "rectangle"])
    expect(editor.toHTML(true)).toContain('visibility="hidden"')

    await mutationsDelivered()
    editor.features.history.actions.undo({type: "undo"})
    expect(graphicShapeRoots(graphic).map(shape => shape.localName)).toEqual(["rect", "ellipse"])
    await mutationsDelivered()
    editor.features.history.actions.undo({type: "undo"})
    expect(graphic.querySelector("rect")).not.toHaveAttribute("visibility")
    editor.features.history.actions.redo({type: "redo"})
    await mutationsDelivered()
    editor.features.history.actions.redo({type: "redo"})
    await mutationsDelivered()
    expect(graphicShapeRoots(graphic).map(shape => shape.localName)).toEqual(["ellipse", "rect"])
    expect(graphic.querySelector("rect")).toHaveAttribute("visibility", "hidden")
  })

  it("zooms, fits, and pans a captured graphic without authoring viewport state", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(100, 100, 800, 450),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})

    editor.features.graphic.actions.navigateGraphic({type: "navigateGraphic", operation: "zoom-in"})
    expect(editor.features.graphic.getState()?.viewport).toEqual({zoom: 120})
    expect(graphic).toHaveClass("◆graphic-viewport-active")
    expect(editor.toHTML(true)).not.toContain("graphic-viewport-active")

    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      composed: true,
      cancelable: true,
      deltaY: -100,
    })
    Object.defineProperties(wheel, {
      ctrlKey: {value: true},
      clientX: {value: 500},
      clientY: {value: 325},
    })
    graphic.dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(true)
    expect(editor.features.graphic.getState()!.viewport!.zoom).toBeGreaterThan(120)

    editor.features.graphic.actions.navigateGraphic({type: "navigateGraphic", operation: "actual-size"})
    expect(editor.features.graphic.getState()?.viewport).toBeUndefined()
    expect(graphic).not.toHaveClass("◆graphic-viewport-active")

    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: " ", code: "Space"}))
    expect(document.body).toHaveClass("◆graphic-pan-ready")
    graphic.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerId: 8,
      clientX: 300,
      clientY: 250,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      pointerId: 8,
      clientX: 360,
      clientY: 285,
    }))
    expect(document.body).toHaveClass("◆graphic-panning")
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 8}))
    document.dispatchEvent(new KeyboardEvent("keyup", {bubbles: true, key: " ", code: "Space"}))
    expect(editor.features.graphic.getState()?.viewport).toEqual({zoom: 100})
    expect(document.body).not.toHaveClass("◆graphic-pan-ready", "◆graphic-panning")

    editor.features.graphic.actions.navigateGraphic({type: "navigateGraphic", operation: "fit-content"})
    expect(editor.features.graphic.getState()!.viewport!.zoom).toBeGreaterThan(100)
    editor.features.graphic.actions.navigateGraphic({type: "navigateGraphic", operation: "actual-size"})
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("toggles editor-only grid presentation without serializing it", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))

    expect(graphic).toHaveClass("◆graphic-grid-visible")
    editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "grid"})

    expect(graphic).not.toHaveClass("◆graphic-grid-visible")
    expect(editor.features.graphic.getState()?.options?.grid).toBe(false)
    expect(editor.toHTML(true)).not.toContain("graphic-grid-visible")
  })

  it.each([false, true])("repeats the grid despite a theme background reset (with shapes: %s)", withShapes => {
    const theme = new CSSStyleSheet()
    theme.replaceSync("* { background-repeat: no-repeat; }")
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, theme]
    try {
      editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
      const graphic = document.querySelector("svg")!
      if(withShapes) editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})

      expect(getComputedStyle(graphic).backgroundImage).toContain("linear-gradient")
      expect(getComputedStyle(graphic).backgroundRepeat).toBe("repeat")

      editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "grid"})
      expect(getComputedStyle(graphic).backgroundImage).not.toContain("linear-gradient")
      expect(getComputedStyle(graphic).backgroundRepeat).toBe("no-repeat")

      editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "grid"})
      expect(getComputedStyle(graphic).backgroundRepeat).toBe("repeat")
      expect(editor.toHTML(true)).not.toContain("graphic-grid-visible")

      editor.features.graphic.disable()
      expect(graphic).not.toHaveClass("◆graphic-grid-visible")
      expect(getComputedStyle(graphic).backgroundRepeat).toBe("no-repeat")
    }
    finally {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== theme)
    }
  })
})


it("edits standalone SVG text without inventing a shape or rebuilding positioned spans", () => {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg")
  const text = document.createElementNS(SVG_NAMESPACE, "text")
  const span = document.createElementNS(SVG_NAMESPACE, "tspan")
  text.setAttribute("x", "100")
  span.setAttribute("rotate", "20")
  span.textContent = "label"
  text.append(span)
  svg.append(text)
  document.body.append(svg)
  span.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
  expect(proxy).not.toBeNull()
  editor.features.mark.toggleMark("b")
  expect(svg.firstElementChild).toBe(text)
  expect(text.firstElementChild).toBe(span)
  expect(span.getAttribute("rotate")).toBe("20")
  expect(editor.features.mark.getState().marks).toContain("b")
  editor.destroy()
  expect(text.classList.contains("◆graphic-text-editing")).toBe(false)
  expect(editor.appendix.querySelector(".◆graphic-label-input")).toBeNull()
})


it("cleans up the SVG text input and marker when a remote edit replaces the label", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "diamond"})
  document.querySelector("polygon")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const old = document.querySelector("text")!
  const replacement = document.createElementNS(SVG_NAMESPACE, "text")
  replacement.textContent = "remote"
  old.replaceWith(replacement)
  editor.features.graphic.refresh()
  expect(old.classList.contains("◆graphic-text-editing")).toBe(false)
  expect(editor.appendix.querySelector(".◆graphic-label-input")).toBeNull()
  expect(replacement.textContent).toBe("remote")
})


it("stops routing marks to a label when the document selection moves elsewhere", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "diamond"})
  document.querySelector("polygon")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const text = document.querySelector("text")!
  const paragraph = document.createElement("p")
  paragraph.textContent = "outside"
  document.body.append(paragraph)
  document.getSelection()!.setBaseAndExtent(paragraph.firstChild!, 0, paragraph.firstChild!, 7)
  editor.features.graphic.refresh()
  editor.features.mark.toggleMark("b")
  expect(paragraph.querySelector("b")?.textContent).toBe("outside")
  expect(text.querySelector("tspan")).toBeNull()
  expect(editor.appendix.querySelector(".◆graphic-label-input")).toBeNull()
})


it("positions an empty label caret using an appendix measurement in SVG screen coordinates", () => {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg")
  svg.innerHTML = '<g><rect x="100" y="80" width="400" height="140"/><text x="300" y="150" font-size="48" dominant-baseline="middle"></text></g>'
  document.body.append(svg)
  const text = svg.querySelector("text")!
  Object.defineProperty(text, "getScreenCTM", {value: () => ({a: .5, b: 0, c: 0, d: .5, e: 40, f: 20})})
  const measure = vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(function(this: Range) {
    const sample = this.startContainer.parentElement
    if(sample?.getRootNode() !== editor.appendix || sample.localName !== "text") return new DOMRect()
    expect(this.collapsed).toBe(true)
    expect(sample.getAttribute("x")).toBe("300")
    expect(sample.getAttribute("y")).toBe("150")
    expect(sample.parentElement!.getAttribute("transform")).toBe("matrix(0.5 0 0 0.5 40 20)")
    expect(text.childNodes).toHaveLength(0)
    return new DOMRect(190, 81, 0, 28)
  })
  try {
    svg.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
    const caret = editor.appendix.querySelector<HTMLElement>('[part="graphic-text-caret"]')!
    expect(caret.style.left).toBe("190px")
    expect(caret.style.top).toBe("81px")
    expect(caret.style.height).toBe("28px")
    expect(editor.appendix.querySelector("svg text")).toBeNull()
    expect(text.childNodes).toHaveLength(0)
    expect(editor.features.graphic.textEditingRange?.collapsed).toBe(true)
    const proxy = editor.appendix.querySelector(".◆graphic-label-input")!
    proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "Label", cancelable: true}))
    expect(text.textContent).toBe("Label")
    expect(editor.toHTML(true)).not.toContain("graphic-text")
  }
  finally { measure.mockRestore() }
})

it("creates an editable centered label on double-clicking an unlabeled shape", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  const rect = document.querySelector("rect")!
  rect.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const text = rect.parentElement!.querySelector("text")!
  expect(text.textContent).toBe("")
  expect(Number(text.getAttribute("x"))).toBe(Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")) / 2)
  expect(Number(text.getAttribute("y"))).toBe(Number(rect.getAttribute("y")) + Number(rect.getAttribute("height")) / 2)
  const proxy = editor.appendix.querySelector(".◆graphic-label-input")!
  editor.features.mark.toggleMark("b")
  proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "New", cancelable: true}))
  expect(text.textContent).toBe("New")
  expect(editor.features.mark.getState().marks).toContain("b")
})

it.each([false, true])("commits native label input when cancelable beforeinput is absent (beforeinput: %s)", beforeinput => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  document.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
  const text = document.querySelector("svg text")!
  editor.features.mark.toggleMark("b")
  if(beforeinput) proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "Label"}))
  proxy.value = "Label"
  proxy.dispatchEvent(new InputEvent("input", {inputType: "insertText", data: "Label"}))
  expect(text.textContent).toBe("Label")
  expect(proxy.value).toBe("")
  expect(editor.features.mark.getState().marks).toContain("b")
  proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "!", cancelable: true}))
  expect(text.textContent).toBe("Label!")
  expect(editor.toHTML(true)).not.toContain("graphic-label-input")
})

it("commits composed label text once after native input", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  document.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
  const text = document.querySelector("svg text")!
  proxy.value = "é"
  proxy.dispatchEvent(new InputEvent("input", {inputType: "insertCompositionText", data: "é", isComposing: true}))
  expect(text.textContent).toBe("")
  proxy.dispatchEvent(Object.assign(new Event("compositionend"), {data: "é"}))
  proxy.dispatchEvent(new InputEvent("input", {inputType: "insertText", data: "é"}))
  expect(text.textContent).toBe("é")
  expect(proxy.value).toBe("")
})

it("retains graphic capture while editing a label and typing after native focus moves", async () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  const graphic = document.querySelector("svg")!
  graphic.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
  const text = graphic.querySelector("text")!
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
  proxy.blur()
  editor.features.selection.processSelection()
  expect(graphic).toHaveClass("◆element-capture-selected")
  document.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "First", cancelable: true}))
  await mutationsDelivered()
  expect(text.textContent).toBe("First")
  expect(editor.features.graphic.isTextInputFocused).toBe(true)
  expect(editor.appendix.querySelector<HTMLElement>('[part="graphic-text-caret"]')!.style.animation).toContain("blink")
  document.getSelection()!.removeAllRanges()
  proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: " second", cancelable: true}))
  expect(text.textContent).toBe("First second")
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
})

it("reopens a label on one click and preserves backwards Shift selection across proxy focus", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "text-box"})
  const graphic = document.querySelector("svg")!
  const text = graphic.querySelector("text")!
  text.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, pointerId: 1}))
  document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 1}))
  const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
  expect(proxy).not.toBeNull()
  const node = text.firstChild!
  document.getSelection()!.setBaseAndExtent(node, 4, node, 2)
  editor.features.graphic.rememberTextSelection()
  // Chromium projects an appendix input selection to BODY while it is focused.
  document.getSelection()!.setBaseAndExtent(document.body, 0, document.body, 0)
  proxy.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowLeft", shiftKey: true, bubbles: true, cancelable: true}))
  expect(document.getSelection()!.anchorOffset).toBe(4)
  expect(document.getSelection()!.focusOffset).toBe(1)
  expect(editor.features.graphic.textEditingRange?.toString()).toBe("ext")
  proxy.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true}))
  expect(editor.features.graphic.textEditingRange?.toString()).toBe("xt")
  proxy.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}))
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
  expect(text).not.toHaveClass("◆graphic-text-editing")
  expect(editor.toHTML(true)).not.toContain("◆")
})


it.each(["shape", "canvas"])("capture-selects an element-selected standalone graphic by clicking its %s", surface => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  const graphic = document.querySelector("svg")!
  const shape = graphic.querySelector("rect")!
  expect($.selectedElement).toBe(graphic)
  expect(editor.features.selection.captureSelectedElement).toBeNull()
  clickShape(surface === "shape" ? shape : graphic)
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
  expect(graphic).toHaveClass("◆element-capture-selected")
  expect(editor.features.graphic.getState()?.capture).toBe(true)
  clickShape(shape)
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
  expect(editor.features.graphic.selectedShape).toBe(shape)
  expect(editor.toHTML(true)).not.toContain("◆")
})

it("capture-selects an element-selected drawing canvas on an interior click", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
  const graphic = document.querySelector("svg")!
  editor.features.selection.selectElement(graphic)
  expect(editor.features.selection.captureSelectedElement).toBeNull()
  clickShape(graphic)
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
})

it("does not capture an element-selected graphic on a secondary click", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  document.querySelector("rect")!.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 2}))
  expect(editor.features.selection.captureSelectedElement).toBeNull()
})


it("leaves label editing and capture selection when its canvas edge is clicked", () => {
  const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
  graphic.innerHTML = '<g><rect width="100" height="50"/><text>Label</text></g>'
  document.body.append(graphic)
  graphic.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
  expect(editor.features.graphic.isTextInputFocused).toBe(true)
  editor.features.selection.selectionCaret!.querySelector(".◆capture-edge")!
    .dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0}))
  expect(editor.features.selection.captureSelectedElement).toBeNull()
  expect($.selectedElement).toBe(graphic)
  expect(graphic).not.toHaveClass("◆element-capture-selected")
  expect(editor.appendix.querySelector(".◆graphic-label-input")).toBeNull()
})


it("keeps graphic grid tiles fixed when dimensions and the viewBox change", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
  const graphic = document.querySelector("svg")!
  const tileSize = getComputedStyle(graphic).backgroundSize
  expect(tileSize).toContain("24px 24px")
  for(const [width, height, viewBox] of [["300px", "200px", "0 0 1600 900"], ["900px", "100px", "200 300 400 200"]]) {
    graphic.style.width = width
    graphic.style.height = height
    graphic.setAttribute("viewBox", viewBox)
    editor.features.graphic.refresh()
    expect(getComputedStyle(graphic).backgroundSize).toBe(tileSize)
  }
})
