// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {graphicShapeDragType, graphicShapeOptions} from "../graphic"
import {themeColorColumns} from "../css-color"
import {ShapeKeyboard} from "./shape-keyboard"
import type {ShapeKeyboardInput} from "../editor-bridge"

const originalBasic = graphicShapeOptions.filter(option => ["Lines", "Triangles", "Rectangles", "Basic shapes"].includes(option.category))
const starOrder = (type: string) => type === "star-3" ? 0 : type === "star-4" ? 1 : type === "star" ? 2 : 3
const stars = graphicShapeOptions.filter(option => option.type === "star" || option.type.startsWith("star-"))
  .sort((a, b) => starOrder(a.type) - starOrder(b.type))
const rectangular = originalBasic.filter(option => option.category === "Rectangles" || ["parallelogram", "trapezoid"].includes(option.type))
  .sort((a, b) => Number(b.type === "square-rectangle") - Number(a.type === "square-rectangle"))
const geometric = originalBasic.filter(option => option.category === "Triangles" || [
  "diamond", "pentagon", "hexagon", "heptagon", "octagon", "decagon", "dodecagon", "ellipse", "pie", "chord",
].includes(option.type))
const basic = [...originalBasic.filter(option => option.category === "Lines"), ...rectangular, ...geometric, ...stars]
const arrowRows = [
  ["Arrow", "Left arrow", "Up arrow", "Down arrow", "Left-right arrow", "Up-down arrow", "Quad arrow", "Left-right-up arrow", "Left-up arrow", "Bent-up arrow"],
  ["Bent arrow", "U-turn arrow", "Curved left arrow", "Curved right arrow", "Curved up arrow", "Curved down arrow", "Circular arrow"],
  ["Striped right arrow", "Notched right arrow", "Pentagon arrow", "Chevron", "Right arrow callout", "Down arrow callout", "Left arrow callout", "Up arrow callout", "Left-right arrow callout", "Quad arrow callout"],
]
const arrows = arrowRows.flat().map(label => graphicShapeOptions.find(option => option.label === label)!)
const advancedRows = [
  ["Teardrop", "Frame", "Half frame", "L corner", "Diagonal stripe", "Plus", "Plaque", "Cylinder", "Cube", "Donut", "No / prohibited"],
  ["Block arc", "Folded corner", "Heart", "Lightning bolt", "Sun", "Moon", "Cloud", "Explosion 1", "Explosion 2"],
  ["Plus sign", "Minus", "Multiply", "Divide", "Equal", "Left bracket", "Right bracket", "Left brace", "Right brace"],
  ["Ribbon up", "Ribbon down", "Vertical scroll", "Horizontal scroll", "Wave", "Double wave", "Rectangular callout", "Rounded rectangular callout", "Oval callout", "Cloud callout", "Line callout 1"],
]
const advanced = advancedRows.flat().map(label => graphicShapeOptions.find(option => option.label === label)!)
const catalogs = {Basic: basic, Advanced: advanced, Arrows: arrows, Flowchart: graphicShapeOptions.filter(option => option.category === "Flowchart")}

async function mountKeyboard() {
  const keyboard = new ShapeKeyboard()
  document.body.append(keyboard)
  await keyboard.updateComplete
  return keyboard
}

afterEach(() => document.body.replaceChildren())

describe("shape keyboard", () => {
  it("blocks insertion, dragging, and modifier reactions when insertion is disabled", async () => {
    const keyboard = await mountKeyboard()
    const command = vi.fn()
    const preview = vi.fn()
    keyboard.addEventListener("shape-keyboard-command", command)
    keyboard.addEventListener("shape-keyboard-preview", preview)
    keyboard.insertionDisabled = true
    await keyboard.updateComplete
    const input = {type: "keydown" as const, key: "1", code: "Digit1", altKey: true, shiftKey: true, capsLock: true, repeat: false}
    expect(keyboard.handleInput(input)).toBe(false)
    expect(keyboard.handleInput({...input, type: "keyup"})).toBe(false)
    const keys = [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".key")]
    expect(keys.every(key => key.disabled && key.getAttribute("draggable") === "false")).toBe(true)
    keys[0].click()
    const drag = new Event("dragstart", {bubbles: true, cancelable: true})
    keys[0].dispatchEvent(drag)
    expect(drag.defaultPrevented).toBe(true)
    expect(command).not.toHaveBeenCalled()
    keyboard.insertionDisabled = false
    await keyboard.updateComplete
    expect(keyboard.handleInput({...input, shiftKey: false, capsLock: false})).toBe(true)
    expect(command).not.toHaveBeenCalled()
    expect(preview.mock.calls[0][0].detail).toMatchObject({shape: "text-box", code: "Digit1"})
  })

  it("ignores keyboard inputs while keeping shape buttons, tabs, and dragging available", async () => {
    const keyboard = await mountKeyboard()
    const command = vi.fn()
    keyboard.addEventListener("shape-keyboard-command", command)
    keyboard.keyboardInputDisabled = true
    await keyboard.updateComplete
    const input = {type: "keydown" as const, key: "1", code: "Digit1", altKey: true, shiftKey: true, capsLock: true, repeat: false}
    expect(keyboard.handleInput(input)).toBe(false)
    expect(keyboard.handleInput({...input, type: "keyup"})).toBe(false)
    expect(command).not.toHaveBeenCalled()
    const button = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Rectangle"]')!
    expect(button.disabled).toBe(false)
    expect(button.getAttribute("draggable")).toBe("true")
    button.click()
    expect(command.mock.calls[0][0].detail).toEqual({shape: "square-rectangle", paint: {fill: keyboard.paint.fill}})
    const data = new DataTransfer()
    const drag = new Event("dragstart", {bubbles: true, cancelable: true})
    Object.assign(drag, {dataTransfer: data})
    vi.spyOn(data, "setDragImage").mockImplementation(() => undefined)
    button.dispatchEvent(drag)
    expect(drag.defaultPrevented).toBe(false)
    expect(JSON.parse(data.getData(graphicShapeDragType))).toEqual({shape: "square-rectangle", paint: {fill: keyboard.paint.fill}})
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Advanced"]')!.click()
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector('.grid[aria-label="Advanced"]')).not.toBeNull()
    keyboard.keyboardInputDisabled = false
    await keyboard.updateComplete
    expect(keyboard.handleInput({...input, shiftKey: false, capsLock: false})).toBe(true)
    expect(command).toHaveBeenCalledOnce()
  })

  it.each(["Basic", "Advanced", "Arrows", "Flowchart"] as const)("places the %s number row at the first position while shortcuts start at the second physical key", async page => {
    const keyboard = await mountKeyboard()
    keyboard.activePage = page
    await keyboard.updateComplete
    const row = keyboard.shadowRoot!.querySelector(".key-row")!
    expect(row.firstElementChild!.localName).toBe("button")
    const first = row.querySelector<HTMLButtonElement>("button")!
    expect(first.title).toBe(catalogs[page][0].label)
    expect(first.querySelector(".hint")!.textContent).toBe("1")
    expect(first.getAttribute("aria-keyshortcuts")).toBe("1")
    const commands: string[] = []
    keyboard.addEventListener("shape-keyboard-preview", event => commands.push((event as CustomEvent).detail.shape))
    const input = {type: "keydown" as const, key: "`", code: "Backquote", altKey: true, shiftKey: false, capsLock: false, repeat: false}
    expect(keyboard.handleInput(input)).toBe(false)
    expect(keyboard.handleInput({...input, key: "1", code: "Digit1"})).toBe(true)
    expect(commands).toEqual([catalogs[page][0].type])
  })

  it("starts the star variants on the last row and maps shortcuts to their new positions", async () => {
    const keyboard = await mountKeyboard()
    const keys = [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".grid .key")]
    expect(keys.slice(29, 33).map(key => key.title)).toEqual(["3-point star", "4-point star", "5-point star", "6-point star"])
    const rows = [...keyboard.shadowRoot!.querySelectorAll(".key-row")]
    expect(rows.map(row => row.querySelectorAll("button").length)).toEqual([7, 11, 11, 11])
    expect([...rows[3].querySelectorAll<HTMLButtonElement>("button")].map(key => key.title)).toEqual(stars.map(option => option.label))
    expect(keys[29].querySelector(".hint")!.textContent).toBe("<")
    expect(keys[30].querySelector(".hint")!.textContent).toBe("z")
    expect(keys[31].querySelector(".hint")!.textContent).toBe("x")
    const commands: string[] = []
    keyboard.addEventListener("shape-keyboard-preview", event => commands.push((event as CustomEvent).detail.shape))
    const input = {type: "keydown" as const, key: "<", code: "IntlBackslash", altKey: true, shiftKey: false, capsLock: false, repeat: false}
    expect(keyboard.handleInput({...input, key: "8", code: "Digit8"})).toBe(false)
    expect(keyboard.handleInput({...input, key: "-", code: "Minus"})).toBe(false)
    keyboard.handleInput(input)
    keyboard.handleInput({...input, key: "z", code: "KeyZ"})
    keyboard.handleInput({...input, key: "x", code: "KeyX"})
    expect(commands).toEqual(["star-3", "star-4", "star"])
  })

  it("groups rectangles on row two, triangles through Chord on row three, and moves Teardrop to Advanced", async () => {
    const keyboard = await mountKeyboard()
    const rows = [...keyboard.shadowRoot!.querySelectorAll(".key-row")]
    const titles = (row: Element) => [...row.querySelectorAll<HTMLButtonElement>("button")].map(button => button.title)
    expect(titles(rows[1])).toEqual([
      "Rectangle", "Rounded rectangle", "Snip one corner", "Snip same side", "Snip diagonal",
      "Snip round", "Round one corner", "Round same side", "Round diagonal", "Parallelogram", "Trapezoid",
    ])
    expect(titles(rows[2])).toEqual([
      "Triangle", "Diamond", "Pentagon", "Hexagon", "Heptagon", "Octagon", "Decagon",
      "Dodecagon", "Ellipse", "Pie", "Chord",
    ])
    expect(keyboard.shadowRoot!.querySelector('button[title="Teardrop"]')).toBeNull()
    expect(graphicShapeOptions.some(option => ["right-triangle", "rectangle"].includes(option.type))).toBe(false)
    expect(graphicShapeOptions.filter(option => option.label === "Rectangle").map(option => option.type)).toEqual(["square-rectangle"])
    const commands: string[] = []
    keyboard.addEventListener("shape-keyboard-preview", event => commands.push((event as CustomEvent).detail.shape))
    const input = {type: "keydown" as const, key: "q", code: "KeyQ", altKey: true, shiftKey: false, capsLock: false, repeat: false}
    keyboard.handleInput(input)
    keyboard.handleInput({...input, key: "w", code: "KeyW"})
    keyboard.handleInput({...input, key: "a", code: "KeyA"})
    keyboard.handleInput({...input, key: "'", code: "Quote"})
    keyboard.activePage = "Advanced"
    await keyboard.updateComplete
    keyboard.handleInput({...input, key: "1", code: "Digit1"})
    expect(commands.filter(Boolean)).toEqual(["square-rectangle", "rounded-rectangle", "triangle", "chord", "teardrop"])
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector('.grid[aria-label="Advanced"] button[title="Teardrop"]')).not.toBeNull()
  })

  it.each(["Basic", "Advanced", "Arrows", "Flowchart"] as const)("reflows %s into eleven columns with matching physical shortcuts", async page => {
    const keyboard = await mountKeyboard()
    keyboard.activePage = page
    await keyboard.updateComplete
    const codes = [
      [...Array.from({length: 9}, (_, i) => `Digit${i+1}`), "Digit0", "Minus"],
      [...[..."QWERTYUIOP"].map(key => `Key${key}`), "BracketLeft"],
      [...[..."ASDFGHJKL"].map(key => `Key${key}`), "Semicolon", "Quote"],
      ["IntlBackslash", ...[..."ZXCVBNM"].map(key => `Key${key}`), "Comma", "Period", "Slash"],
    ]
    const commands: string[] = []
    keyboard.addEventListener("shape-keyboard-preview", event => commands.push((event as CustomEvent).detail.shape))
    const input = {type: "keydown" as const, key: "", code: "", altKey: true, shiftKey: false, capsLock: false, repeat: false}
    for(const [rowIndex, row] of [...keyboard.shadowRoot!.querySelectorAll(".key-row")].entries()) {
      expect(row.children.length).toBeLessThanOrEqual(11)
      for(const [column, key] of [...row.querySelectorAll<HTMLButtonElement>("button")].entries()) {
        expect(keyboard.handleInput({...input, code: codes[rowIndex][column]})).toBe(true)
        const expected = catalogs[page].find(option => option.label === key.title)!
        expect(commands.at(-1)).toBe(expected.type)
      }
    }
    expect(commands).toHaveLength(catalogs[page].length)
    expect(keyboard.shadowRoot!.querySelector(".surplus")).toBeNull()
    for(const code of ["Backquote", "BracketRight", "Backslash", "Equal"]) expect(keyboard.handleInput({...input, code})).toBe(false)
    expect(keyboard.shadowRoot!.querySelector('button[title="Arc"]')).toBeNull()
  })

  it("separates hard-corner, rounded, and remaining arrows with matching shortcuts", async () => {
    const keyboard = await mountKeyboard()
    keyboard.activePage = "Arrows"
    await keyboard.updateComplete
    const rows = [...keyboard.shadowRoot!.querySelectorAll(".key-row")]
    expect(rows.map(row => [...row.querySelectorAll<HTMLButtonElement>("button")].map(button => button.title)))
      .toEqual([...arrowRows, []])
    expect(rows.map(row => [...row.querySelectorAll(".hint")].map(hint => hint.textContent).join("")))
      .toEqual(["1234567890", "qwertyu", "asdfghjkl;", ""])
    const commands: string[] = []
    keyboard.addEventListener("shape-keyboard-preview", event => commands.push((event as CustomEvent).detail.shape))
    const input = {type: "keydown" as const, key: "", code: "", altKey: true, shiftKey: false, capsLock: false, repeat: false}
    for(const code of ["Minus", "KeyI", "KeyO", "KeyP", "BracketLeft", "Quote", "IntlBackslash", "KeyZ"]) {
      expect(keyboard.handleInput({...input, code})).toBe(false)
    }
    for(const code of ["Digit9", "Digit0", "KeyQ", "KeyU", "KeyA", "Semicolon"]) {
      expect(keyboard.handleInput({...input, code})).toBe(true)
    }
    expect(commands).toEqual(["left-up-arrow", "bent-up-arrow", "bent-arrow", "circular-arrow", "striped-right-arrow", "quad-arrow-callout"])
  })

  it("flows regrouped shapes across four keyboard rows of at most eleven keys", async () => {
    const keyboard = await mountKeyboard()
    keyboard.activePage = "Advanced"
    await keyboard.updateComplete
    const root = keyboard.shadowRoot!
    const rows = [...root.querySelectorAll(".key-row")]
    expect(rows).toHaveLength(4)
    expect(rows.map(row => row.querySelectorAll("button").length)).toEqual(advancedRows.map(row => row.length))
    const hints = rows.map(row => [...row.querySelectorAll(".hint")].map(hint => hint.textContent).join(""))
    expect(hints).toEqual(["1234567890-", "qwertyuio", "asdfghjkl", "<zxcvbnm,./"])
    const keys = [...root.querySelectorAll(".main-keys button")]
    keys.forEach(key => expect(key.getAttribute("aria-keyshortcuts")).toBe(key.querySelector(".hint")!.textContent))
    expect(rows.map(row => [...row.querySelectorAll<HTMLButtonElement>("button")].map(key => key.title)))
      .toEqual(advancedRows)
    expect(root.querySelector(".surplus .hint")).toBeNull()
  })

  it("keeps Advanced row breaks and shortcuts aligned to their physical rows", async () => {
    const keyboard = await mountKeyboard()
    keyboard.activePage = "Advanced"
    await keyboard.updateComplete
    const rows = [...keyboard.shadowRoot!.querySelectorAll(".key-row")]
    const titles = (row: Element) => [...row.querySelectorAll<HTMLButtonElement>("button")].map(button => button.title)
    expect(rows.map(titles)).toEqual(advancedRows)
    const commands: string[] = []
    keyboard.addEventListener("shape-keyboard-preview", event => commands.push((event as CustomEvent).detail.shape))
    const input = {type: "keydown" as const, key: "", code: "", altKey: true, shiftKey: false, capsLock: false, repeat: false}
    for(const [code, expected] of [["KeyI", "seal-1"], ["KeyO", "seal-2"], ["KeyA", "equation-plus"]] as const) {
      expect(keyboard.handleInput({...input, code})).toBe(true)
      expect(commands.at(-1)).toBe(expected)
    }
    for(const code of ["KeyP", "BracketLeft"]) expect(keyboard.handleInput({...input, code})).toBe(false)
    expect(commands).toEqual(["seal-1", "seal-2", "equation-plus"])
    expect(titles(rows[1])).not.toContain("Plus sign")
    expect(titles(rows[2])[0]).toBe("Plus sign")
  })

  it("uses the configured keyboard map and refreshes it when the layout changes", async () => {
    const layout = new EventTarget()
    const labels = ["§1234567890'", "qwertzuiopü¨", "asdfghjklöä$", "<yxcvbnm,.-^"]
    // These are physical key codes, independent of the configured key legends.
    const codes = [
      ["Backquote", ...Array.from({length: 9}, (_, i) => `Digit${i + 1}`), "Digit0", "Minus"],
      [...[..."QWERTYUIOP"].map(key => `Key${key}`), "BracketLeft"],
      [...[..."ASDFGHJKL"].map(key => `Key${key}`), "Semicolon", "Quote"],
      ["IntlBackslash", ...[..."ZXCVBNM"].map(key => `Key${key}`), "Comma", "Period", "Slash"],
    ]
    const map = new Map(codes.flatMap((row, i) => row.map((code, j) => [code, labels[i][j]] as const)))
    Object.assign(layout, {getLayoutMap: vi.fn(async () => map)})
    Object.defineProperty(navigator, "keyboard", {configurable: true, value: layout})
    try {
      const keyboard = await mountKeyboard()
      keyboard.activePage = "Advanced"
      await keyboard.updateComplete
      const hints = () => [...keyboard.shadowRoot!.querySelectorAll(".key-row")]
        .map(row => [...row.querySelectorAll(".hint")].map(hint => hint.textContent).join(""))
      const expectedCodes = [
        [...Array.from({length: 9}, (_, i) => `Digit${i+1}`), "Digit0", "Minus"],
        [...[..."QWERTYUIOP"].map(key => `Key${key}`), "BracketLeft"],
        [...[..."ASDFGHJKL"].map(key => `Key${key}`)],
        ["IntlBackslash", ...[..."ZXCVBNM"].map(key => `Key${key}`), "Comma", "Period", "Slash"],
      ]
      expect(hints()).toEqual(advancedRows.map((row, rowIndex) => row.map((_, column) => map.get(expectedCodes[rowIndex][column]) ?? "").join("")))
      const commands: string[] = []
      keyboard.addEventListener("shape-keyboard-preview", event => commands.push((event as CustomEvent).detail.shape))
      const last = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.key-row button[title="Line callout 1"]')!
      const lastCode = codes[3][8]
      keyboard.handleInput({type: "keydown", code: lastCode, key: map.get(lastCode)!, altKey: true, shiftKey: false, capsLock: false, repeat: false})
      last.click()
      expect(commands).toHaveLength(1)
      map.set("KeyY", "y")
      map.delete("IntlBackslash")
      layout.dispatchEvent(new Event("layoutchange"))
      await Promise.resolve()
      await keyboard.updateComplete
      expect(hints()[1]).toBe("qwertyuio")
      expect(keyboard.shadowRoot!.querySelectorAll(".key-row:last-child button")).toHaveLength(10)
      keyboard.activePage = "Basic"
      await keyboard.updateComplete
      const firstStar = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.key-row:last-child button[title="3-point star"]')!
      expect(firstStar.getAttribute("aria-keyshortcuts")).toBe("y")
      expect(keyboard.shadowRoot!.querySelector('button[title="4-point star"]')!.getAttribute("aria-keyshortcuts")).toBe("x")
      expect(keyboard.shadowRoot!.querySelector('button[title="5-point star"]')!.getAttribute("aria-keyshortcuts")).toBe("c")
      keyboard.handleInput({type: "keydown", key: "c", code: "KeyC", altKey: true, shiftKey: false, capsLock: false, repeat: false})
      expect(commands.at(-1)).toBe("star")
      map.delete("Quote")
      layout.dispatchEvent(new Event("layoutchange"))
      await Promise.resolve()
      await keyboard.updateComplete
      expect(keyboard.shadowRoot!.querySelector('.surplus button[title="Chord"]')).not.toBeNull()
      expect(keyboard.shadowRoot!.querySelector('.key-row:last-child button[title="3-point star"]')).not.toBeNull()
      keyboard.remove()
      const getMap = (layout as unknown as {getLayoutMap: ReturnType<typeof vi.fn>}).getLayoutMap
      getMap.mockClear()
      layout.dispatchEvent(new Event("layoutchange"))
      expect(getMap).not.toHaveBeenCalled()
    }
    finally { Reflect.deleteProperty(navigator, "keyboard") }
  })

  it("mounts when keyboard layout access has no layoutchange event API", async () => {
    const getLayoutMap = vi.fn(async () => new Map<string, string>())
    Object.defineProperty(navigator, "keyboard", {configurable: true, value: {getLayoutMap}})
    try {
      const keyboard = await mountKeyboard()
      expect(getLayoutMap).toHaveBeenCalledOnce()
      expect(keyboard.shadowRoot!.querySelector(".key")).not.toBeNull()
      expect(() => keyboard.remove()).not.toThrow()
    }
    finally { Reflect.deleteProperty(navigator, "keyboard") }
  })

  it("keeps manually selected shape pages through Shift and CapsLock while a shape key is held", async () => {
    const keyboard = await mountKeyboard()
    const input = (changes: Partial<ShapeKeyboardInput>) => keyboard.handleInput({
      type: "keydown", key: "1", code: "Digit1", altKey: true, shiftKey: false, capsLock: false, repeat: false, ...changes,
    })
    const previews: unknown[] = []
    keyboard.addEventListener("shape-keyboard-preview", event => previews.push((event as CustomEvent).detail))
    for(const page of ["Basic", "Advanced", "Arrows", "Flowchart"] as const) {
      keyboard.activePage = page
      await keyboard.updateComplete
      expect(input({})).toBe(true)
      expect(previews.at(-1)).toMatchObject({shape: catalogs[page][0].type, code: "Digit1"})
      expect(input({key: "Shift", code: "ShiftLeft", shiftKey: true})).toBe(false)
      expect(input({key: "CapsLock", code: "CapsLock", capsLock: true})).toBe(false)
      expect(input({type: "keyup", key: "CapsLock", code: "CapsLock", capsLock: true})).toBe(false)
      expect(input({key: "1", code: "Digit1", repeat: true})).toBe(true)
      await keyboard.updateComplete
      expect(keyboard.activePage).toBe(page)
      expect(keyboard.shadowRoot!.querySelector(".grid")!.getAttribute("aria-label")).toBe(page)
      expect(previews.at(-1)).toMatchObject({shape: catalogs[page][0].type, code: "Digit1"})
      expect([...keyboard.shadowRoot!.querySelectorAll("[aria-keyshortcuts]")].every(key => !key.getAttribute("aria-keyshortcuts")!.startsWith("Shift+"))).toBe(true)
      input({type: "keyup", key: "1", code: "Digit1"})
    }
    keyboard.activePage = "Advanced"
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector('[aria-keyshortcuts="Shift+q"]')).toBeNull()
    expect(keyboard.shadowRoot!.querySelector('[aria-keyshortcuts="q"] .hint')!.textContent).toBe("q")
  })

  it("cycles the seven visible tabs with Tab and Shift+Tab, clearing held shape previews", async () => {
    const keyboard = await mountKeyboard()
    const pages = ["Basic", "Advanced", "Arrows", "Flowchart", "Freehand", "Lines", "Curves"]
    const modes: string[] = []
    const previews: unknown[] = []
    keyboard.addEventListener("ribbon-button-click", event => modes.push((event as CustomEvent<{label: string}>).detail.label))
    keyboard.addEventListener("shape-keyboard-preview", event => previews.push((event as CustomEvent).detail))
    const tab = (shiftKey = false, repeat = false, type: ShapeKeyboardInput["type"] = "keydown") => keyboard.handleInput({
      type, key: "Tab", code: "Tab", altKey: false, shiftKey, capsLock: false, repeat,
    })

    expect(tab()).toBe(true)
    await keyboard.updateComplete
    expect(keyboard.activePage).toBe("Advanced")
    expect(tab(true)).toBe(true)
    await keyboard.updateComplete
    expect(keyboard.activePage).toBe("Basic")
    expect(tab(true)).toBe(true)
    await keyboard.updateComplete
    expect(keyboard.activePage).toBe("Curves")
    expect(modes).toEqual(["graphic-mode:curves"])
    expect(tab()).toBe(true)
    await keyboard.updateComplete
    expect(keyboard.activePage).toBe("Basic")
    expect(modes.at(-1)).toBe("graphic-mode:select")

    expect(keyboard.handleInput({type: "keydown", key: "1", code: "Digit1", altKey: true, shiftKey: false, capsLock: false, repeat: false})).toBe(true)
    expect(previews.at(-1)).toMatchObject({shape: "text-box"})
    expect(tab()).toBe(true)
    expect(previews.at(-1)).toEqual({shape: null})
    await keyboard.updateComplete
    expect(keyboard.activePage).toBe("Advanced")
    expect(tab(false, true)).toBe(true)
    expect(keyboard.activePage).toBe("Advanced")
    expect(tab(false, false, "keyup")).toBe(false)
    expect(keyboard.activePage).toBe("Advanced")

    keyboard.activePage = "Basic"
    await keyboard.updateComplete
    for(const page of pages.slice(1)) {
      expect(tab()).toBe(true)
      await keyboard.updateComplete
      expect(keyboard.activePage).toBe(page)
    }
    expect(tab()).toBe(true)
    await keyboard.updateComplete
    expect(keyboard.activePage).toBe("Basic")
    expect(modes).toEqual(["graphic-mode:curves", "graphic-mode:select", "graphic-mode:draw", "graphic-mode:lines", "graphic-mode:curves", "graphic-mode:select"])
  })

  it("does not navigate tabs when shortcut input is disabled or the brush dialog is open", async () => {
    const keyboard = await mountKeyboard()
    const tab = () => keyboard.handleInput({type: "keydown", key: "Tab", code: "Tab", altKey: false, shiftKey: false, capsLock: false, repeat: false})
    for(const blocked of ["insertionDisabled", "keyboardInputDisabled", "brushDialogOpen"] as const) {
      keyboard.activePage = "Basic"
      keyboard[blocked] = true
      expect(tab()).toBe(false)
      expect(keyboard.activePage).toBe("Basic")
      keyboard[blocked] = false
    }
  })

  it("does not insert shapes from unmapped keys or drawing pages", async () => {
    const keyboard = await mountKeyboard()
    const command = vi.fn()
    keyboard.addEventListener("shape-keyboard-command", command)
    const input: ShapeKeyboardInput = {type: "keydown", key: "Escape", code: "Escape", altKey: true, shiftKey: false, capsLock: false, repeat: false}
    expect(keyboard.handleInput(input)).toBe(false)
    keyboard.mode = "draw"
    await keyboard.updateComplete
    expect(keyboard.handleInput({...input, key: "q", code: "KeyQ", shiftKey: true})).toBe(true)
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector(".drawing-panel")).not.toBeNull()
    expect(command).not.toHaveBeenCalled()
  })

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

  it("shows an insertion hint in the last three columns of the Basic first row only", async () => {
    const keyboard = await mountKeyboard()
    const firstRow = keyboard.shadowRoot!.querySelector(".key-row")!
    const hint = firstRow.querySelector<HTMLElement>(".shape-hint")!
    expect(hint.textContent).toBe("Hold key and click to insert")
    expect(hint.style.gridColumn).toBe("9 / span 3")
    expect(firstRow.querySelectorAll("button")).toHaveLength(7)
    expect(firstRow.children).toHaveLength(9)
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.tabs button[aria-label="Advanced"]')!.click()
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector(".shape-hint")).toBeNull()
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

    const pages = ["Basic", "Advanced", "Arrows", "Flowchart"] as const
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
      const expected = catalogs[pages[index]]
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
    expect(shown).toEqual(pages.flatMap(page => catalogs[page].map(option => option.label)))
  })

  it("moves Frame onward and the old side keys to Advanced, stars to Basic, and the full block-arrow range to Arrows", async () => {
    const keyboard = await mountKeyboard()
    const titles = () => [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".grid .key")].map(key => key.title)
    expect(titles().slice(0, 29)).toEqual(basic.slice(0, 29).map(option => option.label))
    expect(titles().slice(29)).toEqual(stars.map(option => option.label))
    expect(titles()).toContain("32-point star")
    expect(titles()).not.toContain("Frame")
    expect(titles()).not.toContain("Explosion 1")
    expect(titles()).not.toContain("Explosion 2")
    keyboard.activePage = "Advanced"
    await keyboard.updateComplete
    expect(titles()).toEqual(advancedRows.flat())
    expect(titles()).toContain("Cloud")
    expect(titles()).toContain("Right brace")
    expect(titles()).toContain("Ribbon up")
    expect(titles()).not.toContain("Parentheses")
    expect(titles()).not.toContain("Braces")
    expect(titles()).not.toContain("Curved ribbon up")
    expect(titles()).not.toContain("Curved ribbon down")
    expect(titles()).toContain("Explosion 1")
    expect(titles()).toContain("Explosion 2")
    expect(titles()).not.toContain("5-point star")
    expect(titles()).not.toContain("Arrow")
    keyboard.activePage = "Arrows"
    await keyboard.updateComplete
    expect(titles()).toEqual(arrows.map(option => option.label))
    expect(titles()[0]).toBe("Arrow")
    expect(titles().at(-1)).toBe("Quad arrow callout")
    const commands: string[] = []
    keyboard.addEventListener("shape-keyboard-preview", event => commands.push((event as CustomEvent).detail.shape))
    const input = {type: "keydown" as const, key: "1", code: "Digit1", altKey: true, shiftKey: false, capsLock: false, repeat: false}
    keyboard.handleInput(input)
    keyboard.handleInput({...input, key: "u", code: "KeyU"})
    keyboard.handleInput({...input, type: "keyup"})
    await keyboard.updateComplete
    keyboard.activePage = "Advanced"
    await keyboard.updateComplete
    keyboard.handleInput(input)
    keyboard.handleInput({...input, type: "keyup"})
    expect(commands.filter(Boolean)).toEqual(["arrow", "circular-arrow", advanced[0].type])
    expect(keyboard.shadowRoot!.querySelector(".grid")!.getAttribute("aria-label")).toBe("Advanced")
  })

  it("keeps text box defaults for click, shortcut, and drag insertion instead of applying shape fill and stroke", async () => {
    const keyboard = await mountKeyboard()
    keyboard.paint = {fill: "red", stroke: "blue", "stroke-width": "6", opacity: "0.5"}
    await keyboard.updateComplete
    const command = vi.fn()
    keyboard.addEventListener("shape-keyboard-command", command)
    const button = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Text box"]')!
    button.click()
    keyboard.handleInput({type: "keydown", key: "1", code: "Digit1", altKey: true, shiftKey: false, capsLock: false, repeat: false})
    const paint = {"stroke-width": "6", opacity: "0.5"}
    expect(command.mock.calls.map(([event]) => event.detail)).toEqual([
      {shape: "text-box", paint: {}},
    ])
    const data = new DataTransfer()
    const event = new Event("dragstart", {bubbles: true, composed: true})
    Object.assign(event, {dataTransfer: data})
    vi.spyOn(data, "setDragImage").mockImplementation(() => undefined)
    button.dispatchEvent(event)
    expect(JSON.parse(data.getData(graphicShapeDragType))).toEqual({shape: "text-box", paint: {}})
    expect(keyboard.paint).toEqual({fill: "red", stroke: "blue", "stroke-width": "6", opacity: "0.5"})
  })

  it("uses the configured fill but default brush stroke for icons and shape insertion", async () => {
    const keyboard = await mountKeyboard()
    keyboard.paint = {fill: "#12ab34", stroke: "#ab1234", "stroke-width": "6", opacity: "0.5"}
    await keyboard.updateComplete

    const preview = keyboard.shadowRoot!.querySelector(".grid svg g")!
    expect(preview.getAttribute("fill")).toBe("#12ab34")
    expect(preview.getAttribute("stroke")).toBe("#334155")
    expect(preview.getAttribute("stroke-width")).toBe("5")
    expect(preview.getAttribute("opacity")).toBe("1")

    let detail: {shape: string; paint: Record<string, string>} | undefined
    keyboard.addEventListener("shape-keyboard-command", event => {
      detail = (event as CustomEvent<typeof detail>).detail
    })
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.grid button[title="Ellipse"]')!.click()

    expect(detail).toEqual({
      shape: "ellipse",
      paint: {fill: "#12ab34"},
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
      expect(key.querySelector("path")!.getAttribute("fill")).toBe("#334155")
      key.click()
    }
    expect(commands).toEqual(["line-start-arrow", "line-end-arrow", "line-both-arrows"])
    const data = new DataTransfer()
    const event = new Event("dragstart", {bubbles: true, composed: true})
    Object.assign(event, {dataTransfer: data})
    vi.spyOn(data, "setDragImage").mockImplementation(() => undefined)
    keys[6].dispatchEvent(event)
    expect(JSON.parse(data.getData(graphicShapeDragType))).toEqual({shape: "line-both-arrows", paint: {fill: keyboard.paint.fill}})
  })

  it.each(["draw", "lines", "curves"] as const)("temporarily previews all forty %s brushes with the displayed physical key", async mode => {
    const keyboard = await mountKeyboard()
    keyboard.mode = mode
    await keyboard.updateComplete
    keyboard.paint = {...keyboard.paint, fill: "#123456", opacity: ".6"}
    await keyboard.updateComplete
    const codes = [
      [...Array.from({length: 9}, (_, i) => `Digit${i+1}`), "Digit0"],
      [..."QWERTYUIOP"].map(key => `Key${key}`),
      [...[..."ASDFGHJKL"].map(key => `Key${key}`), "Semicolon"],
      ["IntlBackslash", ...[..."ZXCVBNM"].map(key => `Key${key}`), "Comma", "Period"],
    ]
    const hints = ["1234567890", "qwertyuiop", "asdfghjkl;", "<zxcvbnm,."]
    const change = vi.fn(), preview = vi.fn(), insert = vi.fn()
    keyboard.addEventListener("shape-paint-change", change)
    keyboard.addEventListener("shape-brush-preview", preview)
    keyboard.addEventListener("shape-keyboard-command", insert)
    const persistentPaint = {...keyboard.paint}
    const input: ShapeKeyboardInput = {type: "keydown", key: "Dead", code: "", altKey: false, shiftKey: false, capsLock: false, repeat: false}
    const rows = [...keyboard.shadowRoot!.querySelectorAll(".brush-grid tr")]
    expect(rows.map(row => [...row.querySelectorAll(".hint")].map(hint => hint.textContent).join(""))).toEqual(hints)
    for(const [rowIndex, row] of rows.entries()) {
      for(const [column, button] of [...row.querySelectorAll<HTMLButtonElement>(".brush")].entries()) {
        expect(button.getAttribute("aria-keyshortcuts")).toBe(hints[rowIndex][column])
        expect(keyboard.handleInput({...input, code: codes[rowIndex][column]})).toBe(true)
        expect(preview.mock.calls.at(-1)![0].detail).toEqual({
          paint: {fill: "#123456", stroke: `#${themeColorColumns[column][0]}`, "stroke-width": String([1,2,4,8][rowIndex]), opacity: ".6"}, mode,
        })
        await keyboard.updateComplete
        expect(button.getAttribute("aria-pressed")).toBe("true")
        expect(keyboard.paint).toEqual(persistentPaint)
        expect(keyboard.handleInput({...input, type: "keyup", code: codes[rowIndex][column]})).toBe(true)
        expect(preview.mock.calls.at(-1)![0].detail).toEqual({paint: null, mode})
        await keyboard.updateComplete
      }
    }
    expect(change).not.toHaveBeenCalled()
    expect(keyboard.paint).toEqual(persistentPaint)
    expect(keyboard.handleInput({...input, code: "Digit1"})).toBe(true)
    expect(preview).toHaveBeenCalledTimes(81)
    expect(keyboard.handleInput({...input, code: "Digit1", repeat: true})).toBe(true)
    expect(preview).toHaveBeenCalledTimes(81)
    expect(keyboard.handleInput({...input, code: "Digit1", type: "keyup"})).toBe(true)
    expect(preview).toHaveBeenCalledTimes(82)
    for(const code of ["Backquote", "Minus", "BracketLeft", "Quote", "Slash"]) expect(keyboard.handleInput({...input, code})).toBe(false)
    keyboard.brushDialogOpen = true
    expect(keyboard.handleInput({...input, code: "Digit1"})).toBe(false)
    keyboard.brushDialogOpen = false
    keyboard.keyboardInputDisabled = true
    expect(keyboard.handleInput({...input, code: "Digit1"})).toBe(false)
    keyboard.keyboardInputDisabled = false
    keyboard.insertionDisabled = true
    expect(keyboard.handleInput({...input, code: "Digit1"})).toBe(false)
    expect(change).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it("clears a held temporary brush on its keyup, cancellation, Escape, tab change, and disconnect", async () => {
    for(const ending of ["keyup", "cancel", "escape", "tab", "disconnect"] as const) {
      const keyboard = await mountKeyboard()
      keyboard.mode = "draw"
      keyboard.paint = {fill: "#123456", stroke: "#ab1234", "stroke-width": "6", opacity: ".5"}
      await keyboard.updateComplete
      const previews: Array<{paint: Record<string, string> | null, mode: string}> = []
      keyboard.addEventListener("shape-brush-preview", event => previews.push((event as CustomEvent).detail))
      const input = (changes: Partial<ShapeKeyboardInput>) => keyboard.handleInput({
        type: "keydown", key: "1", code: "Digit1", altKey: false, shiftKey: false, capsLock: false, repeat: false, ...changes,
      })
      expect(input({})).toBe(true)
      expect(previews).toHaveLength(1)
      expect(previews[0]).toMatchObject({paint: {fill: "#123456", stroke: `#${themeColorColumns[0][0]}`, "stroke-width": "1", opacity: ".5"}, mode: "draw"})
      expect(keyboard.paint).toEqual({fill: "#123456", stroke: "#ab1234", "stroke-width": "6", opacity: ".5"})

      if(ending === "keyup") expect(input({type: "keyup", key: "a", code: "KeyA"})).toBe(false)
      if(ending === "cancel") keyboard.cancelInput()
      if(ending === "escape") expect(input({key: "Escape", code: "Escape"})).toBe(true)
      if(ending === "tab") expect(input({key: "Tab", code: "Tab"})).toBe(true)
      if(ending === "disconnect") keyboard.remove()
      if(ending === "keyup") {
        expect(previews).toHaveLength(1)
        expect(input({type: "keyup", key: "1", code: "Digit1"})).toBe(true)
      }
      expect(previews.at(-1)).toEqual({paint: null, mode: "draw"})
      if(ending !== "disconnect") keyboard.remove()
    }
  })

  it("commits a clicked brush over a temporary brush without letting its later keyup undo the choice", async () => {
    const keyboard = await mountKeyboard()
    keyboard.mode = "lines"
    keyboard.paint = {fill: "#123456", stroke: "#ab1234", "stroke-width": "6", opacity: ".5"}
    await keyboard.updateComplete
    const previews = vi.fn(), changes = vi.fn()
    keyboard.addEventListener("shape-brush-preview", previews)
    keyboard.addEventListener("shape-paint-change", changes)
    keyboard.handleInput({type: "keydown", key: "1", code: "Digit1", altKey: false, shiftKey: false, capsLock: false, repeat: false})
    expect(previews).toHaveBeenCalledOnce()

    const committed = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="#5b9bd5, 8 px brush"]')!
    committed.click()
    await keyboard.updateComplete
    expect(changes).toHaveBeenCalledOnce()
    expect(keyboard.paint).toEqual({fill: "#123456", stroke: "#5b9bd5", "stroke-width": "8", opacity: ".5"})
    expect(previews).toHaveBeenCalledOnce()
    expect(committed.getAttribute("aria-pressed")).toBe("true")

    expect(keyboard.handleInput({type: "keyup", key: "1", code: "Digit1", altKey: false, shiftKey: false, capsLock: false, repeat: false})).toBe(false)
    expect(keyboard.paint).toEqual({fill: "#123456", stroke: "#5b9bd5", "stroke-width": "8", opacity: ".5"})
    expect(previews).toHaveBeenCalledOnce()
    expect(committed.getAttribute("aria-pressed")).toBe("true")
  })

  it("maps brush labels and shortcuts through the configured keyboard layout", async () => {
    const layout = new EventTarget()
    const labels = ["§1234567890'", "qwertzuiopü", "asdfghjklöä", "yxcvbnm,.-"]
    const codes = [
      ["Backquote", ...Array.from({length: 9}, (_, i) => `Digit${i+1}`), "Digit0", "Minus"],
      [...[..."QWERTYUIOP"].map(key => `Key${key}`), "BracketLeft"],
      [...[..."ASDFGHJKL"].map(key => `Key${key}`), "Semicolon", "Quote"],
      [...[..."ZXCVBNM"].map(key => `Key${key}`), "Comma", "Period", "Slash"],
    ]
    const map = new Map(codes.flatMap((row, i) => row.map((code, j) => [code, labels[i][j]] as const)))
    Object.assign(layout, {getLayoutMap: vi.fn(async () => map)})
    Object.defineProperty(navigator, "keyboard", {configurable: true, value: layout})
    try {
      const keyboard = await mountKeyboard()
      keyboard.mode = "curves"
      await keyboard.updateComplete
      const hints = () => [...keyboard.shadowRoot!.querySelectorAll(".brush-grid tr")].map(row => [...row.querySelectorAll(".hint")].map(hint => hint.textContent).join(""))
      expect(hints()).toEqual(["1234567890", "qwertzuiop", "asdfghjklö", "yxcvbnm,.-"])
      const preview = vi.fn()
      keyboard.addEventListener("shape-brush-preview", preview)
      const input: ShapeKeyboardInput = {type: "keydown", key: "Dead", code: "Slash", altKey: false, shiftKey: false, capsLock: false, repeat: false}
      const paint = {...keyboard.paint}
      expect(keyboard.handleInput(input)).toBe(true)
      expect(keyboard.paint).toEqual(paint)
      expect(preview.mock.calls[0][0].detail).toMatchObject({paint: {stroke: "#70ad47", "stroke-width": "8"}, mode: "curves"})
      map.set("KeyY", "y")
      layout.dispatchEvent(new Event("layoutchange"))
      await Promise.resolve()
      await keyboard.updateComplete
      expect(hints()[1]).toBe("qwertyuiop")
    }
    finally { Reflect.deleteProperty(navigator, "keyboard") }
  })

  it("shows width rows and color columns, and applies a preset as one paint update", async () => {
    const keyboard = await mountKeyboard()
    keyboard.mode = "draw"
    await keyboard.updateComplete
    keyboard.paint = {fill: "#123456", stroke: "#000000", "stroke-width": "3", opacity: "0.6"}
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
    expect(keyboard.shadowRoot!.querySelector(".custom-brushes .hint, .custom-brushes [aria-keyshortcuts]")).toBeNull()

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

  it.each(["Freehand", "Lines", "Curves"])("preserves the selected brush when opening %s and across tab changes", async page => {
    const keyboard = await mountKeyboard()
    const events: string[] = []
    keyboard.addEventListener("shape-paint-change", () => events.push("paint"))
    keyboard.addEventListener("ribbon-button-click", event => {
      const label = (event as CustomEvent<{label: string}>).detail.label
      events.push(label)
      keyboard.mode = label.slice("graphic-mode:".length) as "select" | "draw" | "lines" | "curves"
    })
    const tab = (name: string) => keyboard.shadowRoot!.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!
    const selected = () => [...keyboard.shadowRoot!.querySelectorAll('.brush[aria-pressed="true"]')].map(button => button.getAttribute("aria-label"))
    keyboard.paint = {fill: "#123456", stroke: "#5b9bd5", "stroke-width": "8", opacity: ".4"}
    await keyboard.updateComplete
    tab(page).click()
    await keyboard.updateComplete
    const mode = page === "Freehand" ? "draw" : page.toLowerCase()
    expect(events).toEqual([`graphic-mode:${mode}`])
    expect(selected()).toEqual(["#5b9bd5, 8 px brush"])
    expect(keyboard.paint).toEqual({fill: "#123456", stroke: "#5b9bd5", "stroke-width": "8", opacity: ".4"})
    const chooseBrush = async () => {
      keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="#000000, 4 px brush"]')!.click()
      await keyboard.updateComplete
      expect(selected()).toEqual(["#000000, 4 px brush"])
    }
    await chooseBrush()
    expect(events).toEqual([`graphic-mode:${mode}`, "paint"])
    tab(page).click()
    await keyboard.updateComplete
    expect(selected()).toEqual(["#000000, 4 px brush"])
    tab("Advanced").click()
    await keyboard.updateComplete
    expect(keyboard.mode).toBe("select")
    expect(keyboard.paint).toEqual({fill: "#123456", stroke: "#000000", "stroke-width": "4", opacity: ".4"})
    tab(page).click()
    await keyboard.updateComplete
    expect(selected()).toEqual(["#000000, 4 px brush"])
    tab(page === "Lines" ? "Curves" : "Lines").click()
    await keyboard.updateComplete
    expect(selected()).toEqual(["#000000, 4 px brush"])
    expect(events.filter(event => event === "paint")).toHaveLength(1)
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
    expect(JSON.parse(data.getData(graphicShapeDragType))).toEqual({shape: "ellipse", paint: {fill: "red"}})
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

  it("batches preview measurements before viewport writes and reuses them across page changes", async () => {
    const keyboard = await mountKeyboard()
    const previews = [...keyboard.shadowRoot!.querySelectorAll<SVGSVGElement>(".key svg")]
    const operations: string[] = []
    const reads = previews.map(preview => {
      const measure = vi.fn(() => {
        operations.push("read")
        return {x: 10, y: 20, width: 40, height: 10}
      })
      Object.defineProperty(preview.querySelector("g")!, "getBBox", {configurable: true, value: measure})
      const set = preview.setAttribute.bind(preview)
      vi.spyOn(preview, "setAttribute").mockImplementation((name, value) => {
        if(name === "viewBox") operations.push("write")
        set(name, value)
      })
      return measure
    })
    keyboard.requestUpdate()
    await keyboard.updateComplete
    expect(operations.indexOf("write")).toBe(operations.lastIndexOf("read") + 1)
    const count = reads.reduce((sum, read) => sum + read.mock.calls.length, 0)
    keyboard.paint = {...keyboard.paint, fill: "red"}
    await keyboard.updateComplete
    expect(reads.reduce((sum, read) => sum + read.mock.calls.length, 0)).toBe(count)
    keyboard.activePage = "Advanced"
    await keyboard.updateComplete
    const advancedCount = reads.reduce((sum, read) => sum + read.mock.calls.length, 0)
    keyboard.activePage = "Basic"
    await keyboard.updateComplete
    expect(reads.reduce((sum, read) => sum + read.mock.calls.length, 0)).toBe(advancedCount)
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
