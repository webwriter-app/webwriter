// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"

beforeEach(() => document.body.replaceChildren())

describe("graphic ribbon", () => {
  it("does not show graphic editing drawers without a graphic selection", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    document.body.append(ribbon)
    await ribbon.updateComplete

    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Graphic"]')).toBeNull()
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Canvas"]')).toBeNull()
  })

  it("inserts an empty graphic from the main button and offers standalone shapes", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Insert"
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete
    const graphic = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Media"] ribbon-button[label="Graphic"]',
    )!
    await graphic.updateComplete

    graphic.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {label: "Graphic", keepDrawerOpen: false}}))
    expect(graphic.submenu.map(item => typeof item === "string" ? item : item.action)).toEqual([
      "insert-graphic-shape:rectangle",
      "insert-graphic-shape:ellipse",
      "insert-graphic-shape:triangle",
      "insert-graphic-shape:diamond",
      "insert-graphic-shape:hexagon",
      "insert-graphic-shape:star",
      "insert-graphic-shape:arrow",
      "insert-graphic-shape:polygon",
      "insert-graphic-shape:line",
      "insert-graphic-shape:connector",
    ])
  })

  it("enables shape insertion only for a capture-selected drawing area", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {active: true, capture: false}
    document.body.append(ribbon)
    await ribbon.updateComplete
    let shape = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Graphic"] ribbon-button[label="Add shape"]')!
    expect(shape.disabled).toBe(true)

    ribbon.graphic = {active: true, capture: true, options: {grid: true, snap: true, guides: true}}
    await ribbon.updateComplete
    shape = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Graphic"] ribbon-button[label="Add shape"]')!
    expect(shape.disabled).toBe(false)
    expect(shape.submenu).toHaveLength(10)
    expect(Array.from(ribbon.shadowRoot!.querySelectorAll("ribbon-drawer"), drawer => drawer.getAttribute("label"))).toEqual([
      "Graphic", "Geometry", "Text", "Connector", "Arrange", "Layers", "Canvas", "View",
    ])
  })

  it("maps multi-selection commands into a compact Arrange drawer", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {
      active: true,
      capture: true,
      selectionCount: 2,
      parameters: {fill: "#60a5fa", stroke: "#1d4ed8", "stroke-width": "8", opacity: "1"},
      options: {grid: true, snap: true, guides: true},
    }
    document.body.append(ribbon)
    await ribbon.updateComplete

    const align = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Arrange"] ribbon-button[label="Align"]')!
    const distribute = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Arrange"] ribbon-button[label="Distribute"]')!
    const order = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Arrange"] ribbon-button[label="Order"]')!
    const fill = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Graphic"] ribbon-button[label="Fill"]')!
    const geometry = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Geometry"] ribbon-button[label="Geometry"]')!

    expect(align.disabled).toBe(false)
    expect(align.submenu).toHaveLength(6)
    expect(distribute.disabled).toBe(true)
    expect(order.disabled).toBe(false)
    expect(fill.disabled).toBe(false)
    expect(geometry.disabled).toBe(true)

    ribbon.graphic = {...ribbon.graphic, selectionCount: 3}
    await ribbon.updateComplete
    expect(ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Distribute"]')!.disabled).toBe(false)
  })

  it("reflects selected shape parameters and dispatches edits", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {
      active: true,
      capture: true,
      shape: "rectangle",
      parameters: {
        x: "400", y: "250", width: "800", height: "400", rotation: "0",
        fill: "#60a5fa", stroke: "#1d4ed8", "stroke-width": "12", opacity: "1",
        "corner-radius": "0",
      },
    }
    const listener = vi.fn()
    ribbon.addEventListener("graphic-parameter-change", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete
    const geometry = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Geometry"] ribbon-button[label="Geometry"]')!
    await geometry.updateComplete
    const width = geometry.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Graphic: Width"]')!
    expect(width.value).toBe("800")
    expect(geometry.shadowRoot!.querySelector('input[aria-label="Graphic: Corner radius"]')).not.toBeNull()

    width.value = "960"
    width.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {name: "width", value: "960"}}))
  })

  it("edits native shape labels from the contextual Text drawer", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {
      active: true,
      capture: true,
      selectionCount: 1,
      shape: "rectangle",
      parameters: {label: "Roadmap", "text-color": "#1d4ed8", "font-size": "52"},
    }
    const listener = vi.fn()
    ribbon.addEventListener("graphic-parameter-change", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete

    const label = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Text"] ribbon-button[label="Label"]')!
    await label.updateComplete
    const text = label.shadowRoot!.querySelector<HTMLTextAreaElement>('textarea[aria-label="Graphic: Label"]')!
    const color = label.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Graphic: Text color"]')!
    const size = label.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Graphic: Font size"]')!
    expect(text.value).toBe("Roadmap")
    expect(color.value).toBe("#1d4ed8")
    expect(size.value).toBe("52")

    text.value = "Release plan"
    text.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {name: "label", value: "Release plan"}}))
  })

  it("shows shape-specific geometry controls for stars and arrows", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {
      active: true,
      capture: true,
      selectionCount: 1,
      shape: "star",
      parameters: {"inner-radius": "45"},
    }
    document.body.append(ribbon)
    await ribbon.updateComplete
    let geometry = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Geometry"] ribbon-button[label="Geometry"]')!
    await geometry.updateComplete
    expect(geometry.shadowRoot!.querySelector('input[aria-label="Graphic: Inner radius"]')).toHaveValue(45)

    ribbon.graphic = {
      active: true,
      capture: true,
      selectionCount: 1,
      shape: "arrow",
      parameters: {"head-size": "36", "tail-width": "42"},
    }
    await ribbon.updateComplete
    geometry = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Geometry"] ribbon-button[label="Geometry"]')!
    await geometry.updateComplete
    expect(geometry.shadowRoot!.querySelector('input[aria-label="Graphic: Head size"]')).toHaveValue(36)
    expect(geometry.shadowRoot!.querySelector('input[aria-label="Graphic: Tail width"]')).toHaveValue(42)
  })

  it("maps connector routing and arrowheads into a contextual drawer", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {
      active: true,
      capture: true,
      selectionCount: 1,
      shape: "connector",
      parameters: {
        routing: "orthogonal",
        "start-arrow": "false",
        "end-arrow": "true",
      },
    }
    const listener = vi.fn()
    ribbon.addEventListener("graphic-parameter-change", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete
    const routing = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Connector"] ribbon-button[label="Routing"]',
    )!
    expect(routing.disabled).toBe(false)
    await routing.updateComplete
    const select = routing.shadowRoot!.querySelector<HTMLSelectElement>('select[aria-label="Graphic: Connector routing"]')!
    const startArrow = routing.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Graphic: Start arrow"]')!
    const endArrow = routing.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Graphic: End arrow"]')!
    expect(select.value).toBe("orthogonal")
    expect(startArrow.checked).toBe(false)
    expect(endArrow.checked).toBe(true)

    select.value = "straight"
    select.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    startArrow.checked = true
    startArrow.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(listener).toHaveBeenNthCalledWith(1, expect.objectContaining({detail: {name: "routing", value: "straight"}}))
    expect(listener).toHaveBeenNthCalledWith(2, expect.objectContaining({detail: {name: "start-arrow", value: "true"}}))
  })

  it("reflects canvas options as contextual toggle buttons", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {
      active: true,
      capture: true,
      options: {grid: true, snap: false, guides: true},
    }
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete
    const grid = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Canvas"] ribbon-button[label="Grid"]')!
    const snap = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Canvas"] ribbon-button[label="Snap"]')!
    expect(grid.toggle).toBe(true)
    expect(grid.active).toBe(true)
    expect(snap.active).toBe(false)

    await grid.updateComplete
    grid.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {label: "toggle-graphic-option:grid", keepDrawerOpen: false}}))
  })

  it("projects live layers and viewport controls into compact dropdowns", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {
      active: true,
      capture: true,
      selectionCount: 1,
      shape: "ellipse",
      layers: [
        {index: 0, label: "Background", type: "rectangle", selected: false, primary: false, visible: true, locked: false},
        {index: 1, label: "Milestone", type: "ellipse", selected: true, primary: true, visible: true, locked: false},
      ],
      viewport: {zoom: 150},
    }
    const layerListener = vi.fn()
    const viewportListener = vi.fn()
    ribbon.addEventListener("graphic-layer-action", layerListener)
    ribbon.addEventListener("graphic-viewport-action", viewportListener)
    document.body.append(ribbon)
    await ribbon.updateComplete

    const layers = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Layers"] ribbon-button[label="Layers"]',
    )!
    await layers.updateComplete
    const milestone = layers.shadowRoot!.querySelector<HTMLElement>('[data-layer-index="1"]')!
    expect(milestone.dataset.selected).toBe("true")
    milestone.querySelector<HTMLButtonElement>('[aria-label="Hide Milestone"]')!.click()
    milestone.querySelector<HTMLButtonElement>('[aria-label="Lock Milestone"]')!.click()
    layers.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Back layer"]')!.click()

    expect(layerListener).toHaveBeenNthCalledWith(1, expect.objectContaining({
      detail: {operation: "toggle-visibility", index: 1},
    }))
    expect(layerListener).toHaveBeenNthCalledWith(2, expect.objectContaining({
      detail: {operation: "toggle-lock", index: 1},
    }))
    expect(layerListener).toHaveBeenNthCalledWith(3, expect.objectContaining({
      detail: {operation: "send-back", index: 1},
    }))

    const zoom = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="View"] ribbon-button[label="150%"]',
    )!
    await zoom.updateComplete
    expect(zoom.shadowRoot!.querySelector("output")).toHaveTextContent("150%")
    zoom.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click()
    const range = zoom.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Graphic zoom percentage"]')!
    range.value = "200"
    range.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(viewportListener).toHaveBeenNthCalledWith(1, expect.objectContaining({detail: {operation: "zoom-in"}}))
    expect(viewportListener).toHaveBeenNthCalledWith(2, expect.objectContaining({
      detail: {operation: "set-zoom", zoom: 200},
    }))
  })
})
