// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {graphicShapeDragType, graphicShapeOptions} from "../graphic"
import {themeColorColumns} from "../css-color"
import {ShapeKeyboard} from "./shape-keyboard"

async function mountKeyboard() {
  const keyboard = new ShapeKeyboard()
  document.body.append(keyboard)
  await keyboard.updateComplete
  return keyboard
}

afterEach(() => document.body.replaceChildren())

describe("shape keyboard", () => {
  it("keeps the keyboard focused on shape keys and page tabs", async () => {
    const keyboard = await mountKeyboard()
    const root = keyboard.shadowRoot!
    expect(root.querySelector('[aria-label="New shape style"]')).toBeNull()
    expect(root.querySelector("input, select")).toBeNull()
    expect(root.querySelector("h2")).toBeNull()
    expect(root.querySelector("section")!.getAttribute("aria-label")).toBe("Shapes")
    expect(root.querySelector(".header")!.contains(root.querySelector('[aria-label="Shape pages"]'))).toBe(true)
    expect(root.querySelector(".header")!.contains(root.querySelector(".freehand"))).toBe(true)
    expect(root.querySelector(".freehand")!.parentElement).not.toBe(root.querySelector(".tabs"))
    expect(root.querySelector(".freehand svg")).not.toBeNull()
    expect(root.textContent).not.toContain("Style keys, then insert")
  })

  it("gives both tab groups accessible icon buttons", async () => {
    const keyboard = await mountKeyboard()
    const root = keyboard.shadowRoot!
    expect(root.querySelector('.drawing-modes[role="group"]')!.getAttribute("aria-label")).toBe("Drawing modes")
    for(const button of root.querySelectorAll(".tabs button, .drawing-modes button")) {
      expect(button.getAttribute("aria-label")).toBeTruthy()
      expect(button.getAttribute("title")).toBeTruthy()
      expect(button.querySelector('.tab-icon[aria-hidden="true"] svg')).not.toBeNull()
      expect(button.querySelector(".tab-label")!.textContent).toBe(button.getAttribute("aria-label"))
    }
  })

  it.each(["draw", "lines", "curves"] as const)("keeps opacity in the %s footer and out of shape pages", async mode => {
    const keyboard = await mountKeyboard()
    keyboard.mode = mode
    await keyboard.updateComplete
    const root = keyboard.shadowRoot!
    expect(root.querySelector(".brush-footer > .opacity input")).not.toBeNull()
    expect(root.querySelector(".header .opacity")).toBeNull()
    root.querySelector<HTMLButtonElement>('.tabs button[aria-label="Basic"]')!.click()
    await keyboard.updateComplete
    expect(root.querySelector(".opacity")).toBeNull()
  })

  it("shows each category catalog exactly once", async () => {
    const keyboard = await mountKeyboard()
    const tabs = [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tabs button")]

    const pages = ["Basic", "Advanced", "Flowchart"]
    const belongsTo = (category: string, page: string) => page === "Flowchart" ? category === "Flowchart"
      : page === "Basic" ? ["Lines", "Rectangles", "Basic shapes"].includes(category)
        : !["Lines", "Rectangles", "Basic shapes", "Flowchart"].includes(category)
    expect(tabs.map(tab => tab.getAttribute("aria-label"))).toEqual(pages)
    expect(tabs.filter(tab => tab.getAttribute("aria-pressed") === "true")).toHaveLength(1)

    const shown: string[] = []
    for(const [index, tab] of tabs.entries()) {
      tab.click()
      await keyboard.updateComplete
      expect(tab.getAttribute("aria-pressed")).toBe("true")
      expect(keyboard.shadowRoot!.querySelector(".grid")!.getAttribute("aria-label"))
        .toBe(pages[index])
      const keys = [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".grid button")]
      const expected = graphicShapeOptions.filter(option => belongsTo(option.category, pages[index]))
      expect(keys.map(key => key.title)).toEqual(expected.map(option => option.label))
      keys.forEach((key, i) => {
        expect(key.querySelector("path")!.getAttribute("d")).toBe(expected[i].path)
        expect(key.querySelector("g")!.getAttribute("fill-rule")).toBe(expected[i].fillRule)
      })
      shown.push(...keys.map(key => key.title))
    }

    expect(shown).toHaveLength(graphicShapeOptions.length)
    // Some catalog entries can share a human-readable label, so compare each
    // category's ordered catalog above instead of treating labels as IDs.
    expect(shown).toEqual(pages.flatMap(page =>
      graphicShapeOptions.filter(option => belongsTo(option.category, page)).map(option => option.label),
    ))
  })

  it("previews insertion paint and emits an independent paint copy", async () => {
    const keyboard = await mountKeyboard()
    keyboard.paint = {fill: "#12ab34", stroke: "#ab1234", "stroke-width": "6", opacity: "0.5"}
    await keyboard.updateComplete

    const preview = keyboard.shadowRoot!.querySelector(".grid svg g")!
    expect(preview.getAttribute("fill")).toBe("#12ab34")
    expect(preview.getAttribute("stroke")).toBe("#ab1234")
    expect(preview.getAttribute("stroke-width")).toBe("6")
    expect(preview.getAttribute("opacity")).toBe("0.5")

    let detail: {shape: string; paint: Record<string, string>} | undefined
    keyboard.addEventListener("shape-keyboard-command", event => {
      detail = (event as CustomEvent<typeof detail>).detail
    })
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.grid button[title="Ellipse"]')!.click()

    expect(detail).toEqual({
      shape: "ellipse",
      paint: {fill: "#12ab34", stroke: "#ab1234", "stroke-width": "6", opacity: "0.5"},
    })
    detail!.paint.fill = "#000000"
    expect(keyboard.paint.fill).toBe("#12ab34")
    const basicTab = [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tabs button")]
      .find(tab => tab.getAttribute("aria-label") === "Basic")!
    basicTab.click()
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.grid button[title="Line"] svg g')!.getAttribute("fill"))
      .toBe("none")
  })

  it("offers narrow arrows after Connector with stroke-colored heads and unfilled shafts", async () => {
    const keyboard = await mountKeyboard()
    keyboard.paint = {fill: "#12ab34", stroke: "#ab1234", "stroke-width": "6", opacity: "0.5"}
    await keyboard.updateComplete
    const keys = [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".grid .key")]
    expect(keys.slice(0, 7).map(key => key.title)).toEqual([
      "Text box", "Image", "Line", "Connector", "Narrow left arrow", "Narrow right arrow", "Narrow left-right arrow",
    ])
    const commands: string[] = []
    keyboard.addEventListener("shape-keyboard-command", event => commands.push((event as CustomEvent).detail.shape))
    for(const key of keys.slice(4, 7)) {
      expect(key.querySelector("g")!.getAttribute("fill")).toBe("none")
      expect(key.querySelector("path")!.getAttribute("fill")).toBe("#ab1234")
      key.click()
    }
    expect(commands).toEqual(["line-start-arrow", "line-end-arrow", "line-both-arrows"])
    const data = new DataTransfer()
    const event = new Event("dragstart", {bubbles: true, composed: true})
    Object.assign(event, {dataTransfer: data})
    vi.spyOn(data, "setDragImage").mockImplementation(() => undefined)
    keys[6].dispatchEvent(event)
    expect(JSON.parse(data.getData(graphicShapeDragType))).toEqual({shape: "line-both-arrows", paint: keyboard.paint})
  })

  it("shows width rows and color columns, and applies a preset as one paint update", async () => {
    const keyboard = await mountKeyboard()
    keyboard.paint = {fill: "#123456", stroke: "#000000", "stroke-width": "3", opacity: "0.6"}
    keyboard.mode = "draw"
    await keyboard.updateComplete

    const rows = [...keyboard.shadowRoot!.querySelectorAll<HTMLTableRowElement>(".brush-grid tbody tr")]
    expect(rows).toHaveLength(4)
    expect(rows.map(row => row.querySelector("path")!.getAttribute("stroke-width")))
      .toEqual(["1", "2", "4", "8"])
    for(const [index, row] of rows.entries()) {
      const paths = [...row.querySelectorAll("path")]
      expect(paths.map(path => path.getAttribute("stroke")))
        .toEqual(themeColorColumns.map(([base]) => `#${base}`))
      expect(paths.every(path => path.getAttribute("stroke-width") === ["1", "2", "4", "8"][index])).toBe(true)
    }
    expect(keyboard.shadowRoot!.querySelector(".brush-grid th, .brush-grid thead")).toBeNull()

    let change: {paint: Record<string, string>} | undefined
    keyboard.addEventListener("shape-paint-change", event => {
      change = (event as CustomEvent<typeof change>).detail
    })
    const target = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="#5b9bd5, 4 px brush"]')!
    target.click()
    await keyboard.updateComplete

    expect(change!.paint).toEqual({fill: "#123456", stroke: "#5b9bd5", "stroke-width": "4", opacity: "0.6"})
    expect(target.getAttribute("aria-pressed")).toBe("true")
    change!.paint.stroke = "#000000"
    expect(keyboard.paint.stroke).not.toBe("#000000")
  })

  it("updates drawing opacity and displays its percentage", async () => {
    const keyboard = await mountKeyboard()
    keyboard.mode = "draw"
    await keyboard.updateComplete
    let change: {paint: Record<string, string>} | undefined
    keyboard.addEventListener("shape-paint-change", event => {
      change = (event as CustomEvent<typeof change>).detail
    })

    const input = keyboard.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Drawing opacity"]')!
    expect(keyboard.shadowRoot!.querySelector(".brush-footer")!.contains(input)).toBe(true)
    expect(keyboard.shadowRoot!.querySelector(".header")!.contains(input)).toBe(false)
    input.value = "0.35"
    input.dispatchEvent(new Event("input", {bubbles: true}))
    await keyboard.updateComplete

    expect(change!.paint.opacity).toBe("0.35")
    expect(keyboard.shadowRoot!.querySelector(".opacity output")!.textContent).toBe("35%")
  })

  it("previews custom drafts, validates widths, and keeps saved brushes available", async () => {
    const keyboard = await mountKeyboard()
    keyboard.mode = "draw"
    await keyboard.updateComplete
    keyboard.paint = {...keyboard.paint, stroke: "#abcdef", "stroke-width": "5", opacity: "0.35"}
    await keyboard.updateComplete
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>(".add-brush")!.click()
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector<HTMLDialogElement>("dialog")!.open).toBe(true)
    const color = keyboard.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Custom brush color"]')!
    const width = keyboard.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Custom brush width"]')!
    const apply = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('button[type="submit"]')!
    expect(color.value).toBe("#abcdef")
    expect(width.value).toBe("5")
    color.value = "#2468ac"
    color.dispatchEvent(new Event("input", {bubbles: true}))
    width.value = "101"
    width.dispatchEvent(new Event("input", {bubbles: true}))
    await keyboard.updateComplete
    expect(apply.disabled).toBe(true)

    width.value = "7.5"
    width.dispatchEvent(new Event("input", {bubbles: true}))
    await keyboard.updateComplete
    expect(apply.disabled).toBe(false)
    const preview = keyboard.shadowRoot!.querySelector(".brush-preview path")!
    expect(preview.getAttribute("stroke")).toBe("#2468ac")
    expect(preview.getAttribute("stroke-width")).toBe("7.5")
    expect(preview.getAttribute("opacity")).toBe("0.35")
    expect(keyboard.paint.stroke).toBe("#abcdef")
    let change: {paint: Record<string, string>} | undefined
    keyboard.addEventListener("shape-paint-change", event => {
      change = (event as CustomEvent<typeof change>).detail
    })
    apply.click()
    await keyboard.updateComplete
    expect(change!.paint.stroke).toBe("#2468ac")
    expect(change!.paint["stroke-width"]).toBe("7.5")
    expect(change!.paint.opacity).toBe("0.35")
    expect(keyboard.shadowRoot!.querySelector("dialog")).toBeNull()
    expect(keyboard.shadowRoot!.querySelectorAll(".custom-brushes .brush")).toHaveLength(1)

    keyboard.shadowRoot!.querySelector<HTMLButtonElement>(".add-brush")!.click()
    await keyboard.updateComplete
    const nextWidth = keyboard.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Custom brush width"]')!
    nextWidth.value = "12"
    nextWidth.dispatchEvent(new Event("input", {bubbles: true}))
    await keyboard.updateComplete
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelectorAll(".custom-brushes .brush")).toHaveLength(2)
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Custom #2468ac, 7.5 px brush"]')!.click()
    expect(keyboard.paint["stroke-width"]).toBe("7.5")
  })

  it("discards cancelled drafts and closes the dialog on mode changes and removal", async () => {
    const keyboard = await mountKeyboard()
    keyboard.mode = "draw"
    await keyboard.updateComplete
    const originalPaint = {...keyboard.paint}
    const open = async () => {
      keyboard.shadowRoot!.querySelector<HTMLButtonElement>(".add-brush")!.click()
      await keyboard.updateComplete
      return keyboard.shadowRoot!.querySelector<HTMLDialogElement>("dialog")!
    }
    const dialog = await open()
    keyboard.customColor = "#123456"
    dialog.dispatchEvent(new Event("cancel"))
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector("dialog")).toBeNull()
    expect(keyboard.paint).toEqual(originalPaint)
    expect(keyboard.customBrushes).toEqual([])
    const reopened = await open()
    expect(keyboard.customColor).toBe(originalPaint.stroke)
    keyboard.mode = "select"
    await keyboard.updateComplete
    expect(reopened.open).toBe(false)
    expect(keyboard.shadowRoot!.querySelector("dialog")).toBeNull()
    keyboard.mode = "draw"
    await keyboard.updateComplete
    const removed = await open()
    keyboard.remove()
    expect(removed.open).toBe(false)
  })

  it("synchronizes Freehand with external draw and select modes", async () => {
    const keyboard = await mountKeyboard()
    const events: string[] = []
    keyboard.addEventListener("ribbon-button-click", event => {
      events.push((event as CustomEvent<{label: string}>).detail.label)
    })

    const advanced = [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tabs button")]
      .find(button => button.getAttribute("aria-label") === "Advanced")!
    advanced.click()
    await keyboard.updateComplete
    expect(events).toEqual([])

    keyboard.mode = "draw"
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector(".drawing-panel")).not.toBeNull()
    expect(keyboard.shadowRoot!.querySelector<HTMLButtonElement>(".freehand")!.getAttribute("aria-pressed"))
      .toBe("true")

    keyboard.mode = "select"
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector(".drawing-panel")).not.toBeNull()
    expect(keyboard.shadowRoot!.querySelector(".grid")).toBeNull()
    expect(keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.drawing-mode[aria-pressed="true"]')!.getAttribute("aria-label"))
      .toBe("Freehand")
    expect([...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".brush")].every(button => button.getAttribute("aria-pressed") === "false")).toBe(true)

    keyboard.shadowRoot!.querySelector<HTMLButtonElement>(".freehand")!.click()
    expect(events.at(-1)).toBe("graphic-mode:draw")
    await keyboard.updateComplete
    advanced.click()
    expect(events.at(-1)).toBe("graphic-mode:select")
  })

  it.each(["draw", "lines", "curves"] as const)("keeps the %s drawing page open while idle and rearms after its brush paint event", async mode => {
    const keyboard = await mountKeyboard()
    keyboard.mode = mode
    await keyboard.updateComplete
    keyboard.mode = "select"
    await keyboard.updateComplete

    const page = mode === "draw" ? "Freehand" : mode === "lines" ? "Lines" : "Curves"
    const tab = [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".drawing-mode")]
      .find(button => button.getAttribute("aria-label") === page)!
    expect(tab.getAttribute("aria-pressed")).toBe("true")
    const brushes = [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".brush")]
    expect(brushes.length).toBeGreaterThan(0)
    expect(brushes.every(button => button.getAttribute("aria-pressed") === "false")).toBe(true)

    const events: string[] = []
    keyboard.addEventListener("shape-paint-change", () => events.push("paint"))
    keyboard.addEventListener("ribbon-button-click", event => events.push((event as CustomEvent<{label: string}>).detail.label))
    const target = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="#5b9bd5, 8 px brush"]')!
    target.click()
    expect(events).toEqual(["paint", `graphic-mode:${mode}`])
    expect(keyboard.paint.stroke).toBe("#5b9bd5")
    keyboard.mode = mode
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="#5b9bd5, 8 px brush"]')!.getAttribute("aria-pressed")).toBe("true")
  })

  it("does not rearm drawing when opacity changes while the retained page is idle", async () => {
    const keyboard = await mountKeyboard()
    keyboard.mode = "lines"
    await keyboard.updateComplete
    keyboard.mode = "select"
    await keyboard.updateComplete
    const events: string[] = []
    keyboard.addEventListener("shape-paint-change", () => events.push("paint"))
    keyboard.addEventListener("ribbon-button-click", event => events.push((event as CustomEvent<{label: string}>).detail.label))
    const input = keyboard.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Drawing opacity"]')!
    input.value = "0.4"
    input.dispatchEvent(new Event("input", {bubbles: true}))
    await keyboard.updateComplete
    expect(events).toEqual(["paint"])
    expect(keyboard.paint.opacity).toBe("0.4")
    expect([...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".brush")].every(button => button.getAttribute("aria-pressed") === "false")).toBe(true)
  })

  it("rearms the retained Curves page after saving a custom brush", async () => {
    const keyboard = await mountKeyboard()
    keyboard.mode = "curves"
    await keyboard.updateComplete
    keyboard.mode = "select"
    await keyboard.updateComplete
    const events: string[] = []
    keyboard.addEventListener("shape-paint-change", () => events.push("paint"))
    keyboard.addEventListener("ribbon-button-click", event => events.push((event as CustomEvent<{label: string}>).detail.label))
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>(".add-brush")!.click()
    await keyboard.updateComplete
    const color = keyboard.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Custom brush color"]')!
    const width = keyboard.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Custom brush width"]')!
    color.value = "#2468ac"
    color.dispatchEvent(new Event("input", {bubbles: true}))
    width.value = "7.5"
    width.dispatchEvent(new Event("input", {bubbles: true}))
    await keyboard.updateComplete
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
    expect(events).toEqual(["paint", "graphic-mode:curves"])
    expect(keyboard.paint.stroke).toBe("#2468ac")
    keyboard.mode = "curves"
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Custom #2468ac, 7.5 px brush"]')!.getAttribute("aria-pressed")).toBe("true")
  })

  it("switches among drawing modes while sharing the brush panel", async () => {
    const keyboard = await mountKeyboard()
    const events: string[] = []
    keyboard.addEventListener("ribbon-button-click", event => events.push((event as CustomEvent<{label: string}>).detail.label))
    const tab = (name: string) => [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".drawing-mode")]
      .find(button => button.textContent?.trim() === name)!

    tab("Lines").click()
    await keyboard.updateComplete
    expect(events).toEqual(["graphic-mode:lines"])
    expect(tab("Lines").getAttribute("aria-pressed")).toBe("true")
    expect(tab("Lines").getAttribute("aria-description")).toContain("click the first vertex to close")
    expect(tab("Lines").getAttribute("aria-description")).toContain("Alt disables snapping; Shift constrains direction")
    expect(keyboard.shadowRoot!.querySelectorAll(".brush-grid tbody tr")).toHaveLength(4)
    expect(keyboard.shadowRoot!.querySelectorAll(".brush-grid tbody tr:first-child td")).toHaveLength(themeColorColumns.length)

    keyboard.mode = "curves"
    await keyboard.updateComplete
    expect(tab("Curves").getAttribute("aria-pressed")).toBe("true")
    expect(tab("Curves").getAttribute("aria-description")).toContain("Click or drag anchors to set handles")
    expect(keyboard.shadowRoot!.querySelector(".drawing-panel")).not.toBeNull()

    const advanced = [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tabs button")]
      .find(button => button.getAttribute("aria-label") === "Advanced")!
    advanced.click()
    await keyboard.updateComplete
    expect(events.at(-1)).toBe("graphic-mode:select")
    expect(keyboard.mode).toBe("curves")
    keyboard.mode = "select"
    await keyboard.updateComplete
    expect(advanced.getAttribute("aria-pressed")).toBe("true")
  })

  it("drags the painted shape with its SVG as the drag image", async () => {
    const keyboard = await mountKeyboard()
    keyboard.paint = {fill: "red", stroke: "blue", "stroke-width": "6", opacity: "0.5"}
    await keyboard.updateComplete
    const key = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.key[title="Ellipse"]')!
    expect(key.getAttribute("draggable")).toBe("true")
    const pointer = new PointerEvent("pointerdown", {cancelable: true, pointerType: "mouse"})
    key.dispatchEvent(pointer)
    expect(pointer.defaultPrevented).toBe(false)
    const data = new DataTransfer()
    const setDragImage = vi.spyOn(data, "setDragImage").mockImplementation(() => undefined)
    const event = new Event("dragstart", {bubbles: true, composed: true})
    Object.assign(event, {dataTransfer: data})
    key.dispatchEvent(event)
    expect(JSON.parse(data.getData(graphicShapeDragType))).toEqual({shape: "ellipse", paint: keyboard.paint})
    expect(data.effectAllowed).toBe("copy")
    expect(setDragImage).toHaveBeenCalledWith(key.querySelector("svg"), 0, 0)
  })

  it("centers each preview on its measured geometry bounds", async () => {
    const keyboard = await mountKeyboard()
    const preview = keyboard.shadowRoot!.querySelector<SVGSVGElement>(".grid svg")!
    const geometry = preview.querySelector("g")!
    Object.defineProperty(geometry, "getBBox", {value: () => ({x: 10, y: 20, width: 40, height: 10})})
    keyboard.requestUpdate()
    await keyboard.updateComplete
    expect(preview.getAttribute("viewBox")).toBe("6 1 48 48")
  })

  it("preserves pointer selection and emits the close event", async () => {
    const keyboard = await mountKeyboard()
    const focusedInput = document.createElement("input")
    document.body.append(focusedInput)
    focusedInput.focus()
    const key = keyboard.shadowRoot!.querySelector<HTMLButtonElement>(".grid button")!
    const pointerdown = new Event("pointerdown", {bubbles: true, cancelable: true})
    key.dispatchEvent(pointerdown)
    expect(pointerdown.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(focusedInput)

    let closeEvent: Event | undefined
    keyboard.addEventListener("shape-keyboard-close", event => closeEvent = event)
    const hide = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Hide shape keyboard"]')!
    const closePointerdown = new Event("pointerdown", {bubbles: true, cancelable: true})
    hide.dispatchEvent(closePointerdown)
    expect(closePointerdown.defaultPrevented).toBe(true)
    hide.click()

    expect(closeEvent).toMatchObject({bubbles: true, composed: true})
    expect(document.activeElement).toBe(focusedInput)
  })
})
