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
const advanced = graphicShapeOptions.filter(option => !basic.includes(option) && !arrows.includes(option) && option.category !== "Flowchart")
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
    keyboard.addEventListener("shape-keyboard-command", command)
    keyboard.shifted = true
    keyboard.insertionDisabled = true
    await keyboard.updateComplete
    expect(keyboard.shifted).toBe(false)
    const input = {type: "keydown" as const, key: "1", code: "Digit1", altKey: true, shiftKey: true, capsLock: true, repeat: false}
    expect(keyboard.handleInput(input)).toBe(false)
    expect(keyboard.handleInput({...input, type: "keyup"})).toBe(false)
    expect(keyboard.shifted).toBe(false)
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
    expect(command).toHaveBeenCalledOnce()
  })

  it("ignores keyboard inputs while keeping shape buttons, tabs, and dragging available", async () => {
    const keyboard = await mountKeyboard()
    const command = vi.fn()
    keyboard.addEventListener("shape-keyboard-command", command)
    keyboard.shifted = true
    keyboard.keyboardInputDisabled = true
    await keyboard.updateComplete
    expect(keyboard.shifted).toBe(false)
    const input = {type: "keydown" as const, key: "1", code: "Digit1", altKey: true, shiftKey: true, capsLock: true, repeat: false}
    expect(keyboard.handleInput(input)).toBe(false)
    expect(keyboard.handleInput({...input, type: "keyup"})).toBe(false)
    expect(keyboard.shifted).toBe(false)
    expect(command).not.toHaveBeenCalled()
    const button = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Rectangle"]')!
    expect(button.disabled).toBe(false)
    expect(button.getAttribute("draggable")).toBe("true")
    button.click()
    expect(command.mock.calls[0][0].detail).toEqual({shape: "square-rectangle", paint: keyboard.paint})
    const data = new DataTransfer()
    const drag = new Event("dragstart", {bubbles: true, cancelable: true})
    Object.assign(drag, {dataTransfer: data})
    vi.spyOn(data, "setDragImage").mockImplementation(() => undefined)
    button.dispatchEvent(drag)
    expect(drag.defaultPrevented).toBe(false)
    expect(JSON.parse(data.getData(graphicShapeDragType))).toEqual({shape: "square-rectangle", paint: keyboard.paint})
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Advanced"]')!.click()
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector('.grid[aria-label="Advanced"]')).not.toBeNull()
    keyboard.keyboardInputDisabled = false
    await keyboard.updateComplete
    expect(keyboard.handleInput({...input, shiftKey: false, capsLock: false})).toBe(true)
    expect(command.mock.calls.at(-1)![0].detail).toMatchObject({shape: "text-box", onlyIfUnselected: true})
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
    expect(first.getAttribute("aria-keyshortcuts")).toBe(`Alt+${page === "Advanced" ? "Shift+" : ""}1`)
    const commands: string[] = []
    keyboard.addEventListener("shape-keyboard-command", event => commands.push((event as CustomEvent).detail.shape))
    const input = {type: "keydown" as const, key: "`", code: "Backquote", altKey: true, shiftKey: page === "Advanced", capsLock: false, repeat: false}
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
    keyboard.addEventListener("shape-keyboard-command", event => commands.push((event as CustomEvent).detail.shape))
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
    keyboard.addEventListener("shape-keyboard-command", event => commands.push((event as CustomEvent).detail.shape))
    const input = {type: "keydown" as const, key: "q", code: "KeyQ", altKey: true, shiftKey: false, capsLock: false, repeat: false}
    keyboard.handleInput(input)
    keyboard.handleInput({...input, key: "w", code: "KeyW"})
    keyboard.handleInput({...input, key: "a", code: "KeyA"})
    keyboard.handleInput({...input, key: "'", code: "Quote"})
    keyboard.handleInput({...input, key: "!", code: "Digit1", shiftKey: true})
    expect(commands).toEqual(["square-rectangle", "rounded-rectangle", "triangle", "chord", "teardrop"])
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
    keyboard.addEventListener("shape-keyboard-command", event => commands.push((event as CustomEvent).detail.shape))
    const input = {type: "keydown" as const, key: "", code: "", altKey: true, shiftKey: page === "Advanced", capsLock: false, repeat: false}
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
    keyboard.addEventListener("shape-keyboard-command", event => commands.push((event as CustomEvent).detail.shape))
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
    expect(rows.map(row => row.querySelectorAll("button").length)).toEqual([11, 11, 11, advanced.length - 33])
    const hints = rows.map(row => [...row.querySelectorAll(".hint")].map(hint => hint.textContent).join(""))
    expect(hints).toEqual(["1234567890-", "qwertyuiop[", "asdfghjkl;'", "<zxcvbnm,./".slice(0, advanced.length - 33)])
    const keys = [...root.querySelectorAll(".main-keys button")]
    keys.forEach(key => expect(key.getAttribute("aria-keyshortcuts")).toBe(`Alt+Shift+${key.querySelector(".hint")!.textContent}`))
    expect([...root.querySelectorAll(".surplus button")].map(key => key.getAttribute("title")))
      .toEqual(advanced.slice(44).map(option => option.label))
    expect(root.querySelector(".surplus .hint")).toBeNull()
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
      expect(hints()).toEqual([labels[0].slice(1), ...labels.slice(1, 3).map(row => row.slice(0,11)), labels[3].slice(0, advanced.length - 33)])
      const commands: string[] = []
      keyboard.addEventListener("shape-keyboard-command", event => commands.push((event as CustomEvent).detail.shape))
      const last = keyboard.shadowRoot!.querySelector<HTMLButtonElement>(".key-row:last-child button:last-child")!
      const lastCode = codes.flat()[advanced.length]
      keyboard.handleInput({type: "keydown", code: lastCode, key: map.get(lastCode)!, altKey: true, shiftKey: true, capsLock: false, repeat: false})
      last.click()
      expect(commands).toHaveLength(2)
      expect(commands[0]).toBe(commands[1])
      map.set("KeyY", "y")
      map.delete("IntlBackslash")
      layout.dispatchEvent(new Event("layoutchange"))
      await Promise.resolve()
      await keyboard.updateComplete
      expect(hints()[1]).toBe("qwertyuiopü")
      expect(keyboard.shadowRoot!.querySelectorAll(".key-row:last-child button")).toHaveLength(Math.min(10, advanced.length - 33))
      keyboard.activePage = "Basic"
      keyboard.handleInput({type: "keyup", key: "Shift", code: "ShiftLeft", altKey: false, shiftKey: false, capsLock: false, repeat: false})
      await keyboard.updateComplete
      const firstStar = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.key-row:last-child button[title="3-point star"]')!
      expect(firstStar.getAttribute("aria-keyshortcuts")).toBe("Alt+y")
      expect(keyboard.shadowRoot!.querySelector('button[title="4-point star"]')!.getAttribute("aria-keyshortcuts")).toBe("Alt+x")
      expect(keyboard.shadowRoot!.querySelector('button[title="5-point star"]')!.getAttribute("aria-keyshortcuts")).toBe("Alt+c")
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

  it("shows Advanced with Shift or Caps Lock and inserts basic with Option or advanced with Option+Shift", async () => {
    const keyboard = await mountKeyboard()
    const input = (changes: Partial<ShapeKeyboardInput>) => keyboard.handleInput({
      type: "keydown", key: "Shift", code: "ShiftLeft", altKey: true, shiftKey: false, capsLock: false, repeat: false, ...changes,
    })
    const commands: string[] = []
    keyboard.addEventListener("shape-keyboard-command", event => commands.push((event as CustomEvent).detail.shape))
    input({shiftKey: true})
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector(".grid")!.getAttribute("aria-label")).toBe("Advanced")
    expect(keyboard.activePage).toBe("Basic")
    expect(input({key: "q", code: "KeyQ", altKey: false})).toBe(false)
    expect(input({key: "Q", code: "KeyQ", altKey: false, shiftKey: true})).toBe(false)
    expect(input({key: "!", code: "Digit1", shiftKey: true})).toBe(true)
    input({key: "!", code: "Digit1", shiftKey: true, repeat: true})
    input({type: "keyup", key: "!", code: "Digit1", shiftKey: true})
    expect(commands).toEqual([advanced[0].type])
    input({type: "keyup"})
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector(".grid")!.getAttribute("aria-label")).toBe("Basic")
    input({key: "1", code: "Digit1"})
    input({key: "CapsLock", code: "CapsLock", capsLock: true})
    input({type: "keyup", key: "CapsLock", code: "CapsLock", capsLock: true})
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector(".grid")!.getAttribute("aria-label")).toBe("Advanced")
    input({key: "Q", code: "KeyQ", capsLock: true, shiftKey: true})
    expect(commands).toEqual([advanced[0].type, basic[0].type, advanced[11].type])
    input({key: "CapsLock", code: "CapsLock"})
    await keyboard.updateComplete
    expect(keyboard.shifted).toBe(false)
    keyboard.activePage = "Advanced"
    input({key: "œ", code: "KeyQ"})
    expect(commands.at(-1)).toBe("square-rectangle")
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector('[aria-keyshortcuts="Alt+Shift+q"] .hint')!.textContent).toBe("q")
    keyboard.activePage = "Basic"
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector('[aria-keyshortcuts="Alt+q"] .hint')!.textContent).toBe("q")
    keyboard.activePage = "Flowchart"
    input({shiftKey: true})
    input({type: "keyup"})
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector(".grid")!.getAttribute("aria-label")).toBe("Flowchart")
    keyboard.remove()
    expect(keyboard.shifted).toBe(false)
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
    expect(titles().slice(0, originalBasic.length - 29)).toEqual(originalBasic.slice(29).map(option => option.label))
    expect(titles()).toContain("Cloud")
    expect(titles()).toContain("Right brace")
    expect(titles()).toContain("Ribbon up")
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
    keyboard.addEventListener("shape-keyboard-command", event => commands.push((event as CustomEvent).detail.shape))
    const input = {type: "keydown" as const, key: "1", code: "Digit1", altKey: true, shiftKey: false, capsLock: false, repeat: false}
    keyboard.handleInput(input)
    keyboard.handleInput({...input, key: "u", code: "KeyU"})
    keyboard.handleInput({...input, key: "!", shiftKey: true})
    keyboard.handleInput({...input, type: "keyup"})
    await keyboard.updateComplete
    expect(commands).toEqual(["arrow", "circular-arrow", advanced[0].type])
    expect(keyboard.shadowRoot!.querySelector(".grid")!.getAttribute("aria-label")).toBe("Arrows")
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
      {shape: "text-box", paint}, {shape: "text-box", paint, onlyIfUnselected: true},
    ])
    const data = new DataTransfer()
    const event = new Event("dragstart", {bubbles: true, composed: true})
    Object.assign(event, {dataTransfer: data})
    vi.spyOn(data, "setDragImage").mockImplementation(() => undefined)
    button.dispatchEvent(event)
    expect(JSON.parse(data.getData(graphicShapeDragType))).toEqual({shape: "text-box", paint})
    expect(keyboard.paint).toEqual({fill: "red", stroke: "blue", "stroke-width": "6", opacity: "0.5"})
  })

  it("slightly thickens preview strokes while preserving insertion paint and emitting an independent copy", async () => {
    const keyboard = await mountKeyboard()
    keyboard.paint = {fill: "#12ab34", stroke: "#ab1234", "stroke-width": "6", opacity: "0.5"}
    await keyboard.updateComplete

    const preview = keyboard.shadowRoot!.querySelector(".grid svg g")!
    expect(preview.getAttribute("fill")).toBe("#12ab34")
    expect(preview.getAttribute("stroke")).toBe("#ab1234")
    expect(preview.getAttribute("stroke-width")).toBe("7.5")
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

  it.each(["draw", "lines", "curves"] as const)("selects all forty %s brushes with Alt plus the displayed physical key", async mode => {
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
    const change = vi.fn(), insert = vi.fn()
    keyboard.addEventListener("shape-paint-change", change)
    keyboard.addEventListener("shape-keyboard-command", insert)
    const input: ShapeKeyboardInput = {type: "keydown", key: "Dead", code: "", altKey: true, shiftKey: false, capsLock: false, repeat: false}
    const rows = [...keyboard.shadowRoot!.querySelectorAll(".brush-grid tr")]
    expect(rows.map(row => [...row.querySelectorAll(".hint")].map(hint => hint.textContent).join(""))).toEqual(hints)
    for(const [rowIndex, row] of rows.entries()) {
      for(const [column, button] of [...row.querySelectorAll<HTMLButtonElement>(".brush")].entries()) {
        expect(button.getAttribute("aria-keyshortcuts")).toBe(`Alt+${hints[rowIndex][column]}`)
        expect(keyboard.handleInput({...input, code: codes[rowIndex][column]})).toBe(true)
        expect(change.mock.calls.at(-1)![0].detail.paint).toEqual({fill: "#123456", stroke: `#${themeColorColumns[column][0]}`, "stroke-width": String([1,2,4,8][rowIndex]), opacity: ".6"})
        await keyboard.updateComplete
        expect(button.getAttribute("aria-pressed")).toBe("true")
      }
    }
    expect(change).toHaveBeenCalledTimes(40)
    expect(keyboard.handleInput({...input, code: "Digit1", repeat: true})).toBe(true)
    expect(keyboard.handleInput({...input, code: "Digit1", altKey: false})).toBe(false)
    expect(keyboard.handleInput({...input, code: "Digit1", type: "keyup"})).toBe(false)
    for(const code of ["Backquote", "Minus", "BracketLeft", "Quote", "Slash"]) expect(keyboard.handleInput({...input, code})).toBe(false)
    keyboard.brushDialogOpen = true
    expect(keyboard.handleInput({...input, code: "Digit1"})).toBe(false)
    keyboard.brushDialogOpen = false
    keyboard.keyboardInputDisabled = true
    expect(keyboard.handleInput({...input, code: "Digit1"})).toBe(false)
    keyboard.keyboardInputDisabled = false
    keyboard.insertionDisabled = true
    expect(keyboard.handleInput({...input, code: "Digit1"})).toBe(false)
    expect(change).toHaveBeenCalledTimes(40)
    expect(insert).not.toHaveBeenCalled()
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
      const input: ShapeKeyboardInput = {type: "keydown", key: "Dead", code: "Slash", altKey: true, shiftKey: false, capsLock: false, repeat: false}
      expect(keyboard.handleInput(input)).toBe(true)
      expect(keyboard.paint).toMatchObject({stroke: "#70ad47", "stroke-width": "8"})
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

  it.each(["Freehand", "Lines", "Curves"])("selects the standard brush on opening %s and resets it on tab changes", async page => {
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
    expect(events).toEqual(["paint", `graphic-mode:${mode}`])
    expect(selected()).toEqual(["#000000, 4 px brush"])
    expect(keyboard.paint).toEqual({fill: "#123456", stroke: "#000000", "stroke-width": "4", opacity: "1"})
    const chooseBrush = async () => {
      keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="#5b9bd5, 8 px brush"]')!.click()
      await keyboard.updateComplete
      expect(selected()).toEqual(["#5b9bd5, 8 px brush"])
    }
    await chooseBrush()
    tab(page).click()
    await keyboard.updateComplete
    expect(selected()).toEqual(["#5b9bd5, 8 px brush"])
    tab("Advanced").click()
    await keyboard.updateComplete
    expect(keyboard.mode).toBe("select")
    expect(keyboard.paint).toEqual({fill: "#123456", stroke: "#000000", "stroke-width": "4", opacity: "1"})
    tab(page).click()
    await keyboard.updateComplete
    expect(selected()).toEqual(["#000000, 4 px brush"])
    await chooseBrush()
    tab(page === "Lines" ? "Curves" : "Lines").click()
    await keyboard.updateComplete
    expect(selected()).toEqual(["#000000, 4 px brush"])
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
    keyboard.shifted = true
    await keyboard.updateComplete
    const advancedCount = reads.reduce((sum, read) => sum + read.mock.calls.length, 0)
    keyboard.shifted = false
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
