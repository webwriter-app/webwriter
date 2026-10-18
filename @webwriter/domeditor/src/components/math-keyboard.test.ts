// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {mathKeyboardLayouts} from "../math-input"
import {MathKeyboard} from "./math-keyboard"

const recognition = vi.hoisted(() => ({load: vi.fn(), recognize: vi.fn(), dispose: vi.fn(), create: vi.fn()}))
vi.mock("../math-handwriting", () => ({MathHandwritingRecognizer: class {
  constructor() { recognition.create() }
  load = recognition.load
  recognize = recognition.recognize
  dispose = recognition.dispose
}}))

async function mountKeyboard() {
  const keyboard = new MathKeyboard()
  document.body.append(keyboard)
  await keyboard.updateComplete
  return keyboard
}

afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); vi.clearAllMocks() })

async function openHandwriting(keyboard: MathKeyboard) {
  keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Handwriting"]')!.click()
  await keyboard.updateComplete
  await vi.waitFor(() => expect(recognition.load).toHaveBeenCalled())
  return keyboard.shadowRoot!.querySelector<SVGSVGElement>(".drawing-surface")!
}

function draw(surface: SVGSVGElement, id = 1) {
  surface.setPointerCapture = vi.fn()
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({left: 0, top: 0, width: 600, height: 200} as DOMRect)
  for(const [type, x, y] of [["pointerdown", 40, 40], ["pointermove", 80, 100], ["pointerup", 80, 100]] as const) {
    surface.dispatchEvent(new PointerEvent(type, {pointerId: id, isPrimary: true, button: 0, clientX: x, clientY: y, cancelable: true}))
  }
}

const ink = (...points: [number, number][]) => points.map(([x, y], t) => ({x: x / 600 * 1000, y: y / 200 * 300, t}))
function erase(surface: SVGSVGElement, points: [number, number][], pointerType = "mouse", button = 2, buttons = 2) {
  points.forEach(([clientX, clientY], index) => surface.dispatchEvent(new PointerEvent(index ? "pointermove" : "pointerdown", {
    pointerId: 10, isPrimary: true, pointerType, button: index ? -1 : button, buttons, clientX, clientY, cancelable: true,
  })))
  const [clientX, clientY] = points.at(-1)!
  surface.dispatchEvent(new PointerEvent("pointerup", {pointerId: 10, pointerType, button, buttons: 0, clientX, clientY}))
}

describe("formula keyboard", () => {
  it("erases a stroke on right click, preserves unrelated ink, and recognizes what remains", async () => {
    recognition.recognize.mockResolvedValue('<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>y</mi></math>')
    const keyboard = await mountKeyboard()
    const surface = await openHandwriting(keyboard)
    vi.useFakeTimers()
    draw(surface)
    const untouched = ink([160, 40], [200, 100])
    keyboard.strokes = [...keyboard.strokes, untouched]
    keyboard.handwritingFragment = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>old</mi></math>'
    const focused = document.createElement("input")
    document.body.append(focused)
    focused.focus()
    erase(surface, [[60, 70]])
    expect(keyboard.strokes).toEqual([untouched])
    expect(keyboard.handwritingFragment).toBe("")
    expect(document.activeElement).toBe(focused)
    await vi.advanceTimersByTimeAsync(800)
    expect(recognition.recognize.mock.calls.at(-1)![0]).toEqual([[{x: 160, y: 40, t: 0}, {x: 200, y: 100, t: 1}]])
    expect(keyboard.handwritingFragment).toContain("<mi>y</mi>")
    const menu = new MouseEvent("contextmenu", {bubbles: true, cancelable: true, button: 2})
    surface.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
  })

  it("erases across sparse pointer moves without bridging gaps or creating ink", async () => {
    const keyboard = await mountKeyboard()
    const surface = await openHandwriting(keyboard)
    vi.useFakeTimers()
    draw(surface)
    keyboard.strokes = [ink([100, 40], [100, 100]), ink([180, 40], [180, 100]), ink([100, 150], [200, 150])]
    const untouched = keyboard.strokes[2]
    erase(surface, [[50, 70], [250, 70]])
    expect(keyboard.strokes).toEqual([untouched])
    // Collinear but distant segments do not intersect.
    erase(surface, [[300, 150], [400, 150]])
    expect(keyboard.strokes).toEqual([untouched])
    erase(surface, [[150, 150]])
    expect(keyboard.strokes).toEqual([])
    await vi.advanceTimersByTimeAsync(800)
    expect(recognition.recognize).not.toHaveBeenCalled()
  })

  it.each([
    [5, 32], // Inverted pen eraser.
    [0, 33], // Eraser flag reported alongside contact.
    [2, 2], // Pen barrel button.
  ])("accepts digital pen erase input (button %i, buttons %i)", async (button, buttons) => {
    const keyboard = await mountKeyboard()
    const surface = await openHandwriting(keyboard)
    vi.useFakeTimers()
    draw(surface)
    erase(surface, [[60, 70]], "pen", button, buttons)
    expect(keyboard.strokes).toEqual([])
    await vi.advanceTimersByTimeAsync(800)
    expect(recognition.recognize).not.toHaveBeenCalled()
  })

  it("switches a pen between drawing and erasing during the same contact", async () => {
    const keyboard = await mountKeyboard()
    const surface = await openHandwriting(keyboard)
    vi.useFakeTimers()
    draw(surface)
    const pointer = (type: string, button: number, buttons: number, clientX: number, clientY: number) =>
      surface.dispatchEvent(new PointerEvent(type, {pointerId: 20, isPrimary: true, pointerType: "pen", button, buttons, clientX, clientY}))
    pointer("pointerdown", 0, 1, 250, 40)
    pointer("pointermove", -1, 1, 250, 100)
    pointer("pointermove", 2, 3, 60, 70)
    expect(keyboard.strokes).toHaveLength(1)
    expect(keyboard.strokes[0].map(({x, y}) => [x, y])).toEqual([[250 / 600 * 1000, 60], [250 / 600 * 1000, 150]])
    pointer("pointermove", 2, 1, 350, 40)
    pointer("pointermove", -1, 1, 350, 100)
    pointer("pointerup", 0, 0, 350, 100)
    expect(keyboard.strokes).toHaveLength(2)
    expect(keyboard.strokes[1].map(point => point.x)).toEqual([350 / 600 * 1000, 350 / 600 * 1000])
  })

  it("discards an in-flight recognition after erasing and cleans up a canceled eraser", async () => {
    let finish!: (value: string) => void
    recognition.recognize.mockImplementation(() => new Promise<string>(resolve => finish = resolve))
    const keyboard = await mountKeyboard()
    const surface = await openHandwriting(keyboard)
    vi.useFakeTimers()
    draw(surface)
    await vi.advanceTimersByTimeAsync(800)
    surface.dispatchEvent(new PointerEvent("pointerdown", {pointerId: 10, isPrimary: true, pointerType: "mouse", button: 2, buttons: 2, clientX: 60, clientY: 70}))
    finish('<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>stale</mi></math>')
    await Promise.resolve()
    expect(keyboard.handwritingFragment).toBe("")
    surface.dispatchEvent(new PointerEvent("pointercancel", {pointerId: 10}))
    draw(surface, 11)
    expect(keyboard.strokes).toHaveLength(1)
    keyboard.remove()
    surface.dispatchEvent(new PointerEvent("pointermove", {pointerId: 10, pointerType: "mouse", buttons: 2, clientX: 60, clientY: 70}))
    await vi.advanceTimersByTimeAsync(800)
    expect(recognition.recognize).toHaveBeenCalledOnce()
  })

  it("loads handwriting only on opening its separate tab and terminates it on leaving", async () => {
    const keyboard = await mountKeyboard()
    expect(recognition.create).not.toHaveBeenCalled()
    const surface = await openHandwriting(keyboard)
    expect(surface).not.toBeNull()
    expect(keyboard.shadowRoot!.querySelector(".grid")).toBeNull()
    expect(keyboard.shadowRoot!.querySelectorAll('.tabs button[aria-pressed="true"]')).toHaveLength(0)
    expect(keyboard.shadowRoot!.querySelector('.freehand svg')).not.toBeNull()
    expect(keyboard.shadowRoot!.querySelector('.freehand')!.parentElement).toBe(keyboard.shadowRoot!.querySelector('.header'))
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.tabs button')!.click()
    await keyboard.updateComplete
    expect(recognition.dispose).toHaveBeenCalledOnce()
    expect(keyboard.shadowRoot!.querySelector(".drawing-surface")).toBeNull()
    expect(keyboard.shadowRoot!.querySelector(".grid")).not.toBeNull()
  })

  it("offers a recognized fragment as a button that inserts when clicked", async () => {
    const mathml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>x</mi><mn>2</mn></mfrac></math>'
    recognition.recognize.mockResolvedValue(mathml)
    const keyboard = await mountKeyboard()
    const commands = vi.fn()
    keyboard.addEventListener("math-keyboard-command", commands)
    const surface = await openHandwriting(keyboard)
    vi.useFakeTimers()
    draw(surface)
    await vi.advanceTimersByTimeAsync(800)
    await keyboard.updateComplete
    expect(recognition.recognize).toHaveBeenCalledOnce()
    expect(keyboard.shadowRoot!.querySelector('.recognition mfrac')).not.toBeNull()
    expect(commands).not.toHaveBeenCalled()
    const insert = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.recognition-option')!
    expect(insert.querySelector("mfrac")).not.toBeNull()
    expect(insert.getAttribute("aria-label")).toBe("Insert recognized formula")
    expect(insert.disabled).toBe(false)
    expect(getComputedStyle(insert).overflowY).toBe("hidden")
    expect(getComputedStyle(insert.parentElement!).overflowY).toBe("hidden")
    insert.click()
    expect(commands.mock.calls[0][0].detail.command).toBe(`mathml:${mathml}`)
    expect(keyboard.strokes).toEqual([])
    expect(keyboard.handwritingFragment).toBe("")
  })

  it("discards delayed results after clearing, changing strokes, or disconnecting", async () => {
    let finish!: (value: string) => void
    recognition.recognize.mockImplementation(() => new Promise<string>(resolve => finish = resolve))
    const keyboard = await mountKeyboard()
    const surface = await openHandwriting(keyboard)
    vi.useFakeTimers()
    draw(surface)
    await vi.advanceTimersByTimeAsync(800)
    draw(surface, 2)
    finish('<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>stale</mi></math>')
    await Promise.resolve()
    expect(keyboard.handwritingFragment).toBe("")
    const clear = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Clear drawing"]')!
    await keyboard.updateComplete
    clear.click()
    await vi.advanceTimersByTimeAsync(800)
    expect(keyboard.strokes).toEqual([])
    expect(recognition.recognize).toHaveBeenCalledOnce()
    keyboard.remove()
    expect(recognition.dispose).toHaveBeenCalledOnce()
  })

  it("overlays a trash button on the drawing area and clears ink and options without inserting", async () => {
    recognition.recognize.mockResolvedValue('<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>')
    const keyboard = await mountKeyboard()
    const surface = await openHandwriting(keyboard)
    const commands = vi.fn()
    keyboard.addEventListener("math-keyboard-command", commands)
    const root = keyboard.shadowRoot!
    const buttons = [...root.querySelectorAll("button")]
    expect(buttons.some(button => ["Undo stroke", "Insert"].includes(button.textContent!.trim()))).toBe(false)
    const clear = root.querySelector<HTMLButtonElement>('[aria-label="Clear drawing"]')!
    expect(clear.parentElement).toBe(surface.parentElement)
    expect(clear.querySelector("svg")).not.toBeNull()
    expect(clear.textContent!.trim()).toBe("")
    expect(clear.disabled).toBe(true)

    vi.useFakeTimers()
    draw(surface)
    await vi.advanceTimersByTimeAsync(800)
    await keyboard.updateComplete
    expect(clear.disabled).toBe(false)
    expect(root.querySelector(".recognition-option")).not.toBeNull()
    clear.click()
    await keyboard.updateComplete
    expect(keyboard.strokes).toEqual([])
    expect(root.querySelector(".recognition-option")).toBeNull()
    expect(clear.disabled).toBe(true)
    expect(commands).not.toHaveBeenCalled()
  })

  it("keeps unreadable ink for correction and excludes canceled strokes", async () => {
    recognition.recognize.mockRejectedValue(new Error("Unreadable"))
    const keyboard = await mountKeyboard()
    const surface = await openHandwriting(keyboard)
    vi.useFakeTimers()
    draw(surface)
    await vi.advanceTimersByTimeAsync(800)
    expect(keyboard.handwritingError).toContain("Could not recognize")
    expect(keyboard.strokes).toHaveLength(1)
    surface.dispatchEvent(new PointerEvent("pointerdown", {pointerId: 2, isPrimary: true, button: 0}))
    surface.dispatchEvent(new PointerEvent("pointercancel", {pointerId: 2}))
    expect(keyboard.strokes).toHaveLength(1)
    keyboard.remove()
    await vi.advanceTimersByTimeAsync(800)
    expect(recognition.recognize).toHaveBeenCalledOnce()
  })
  it("shows layout tabs in the header without a visible heading", async () => {
    const keyboard = await mountKeyboard()
    const root = keyboard.shadowRoot!
    const tabs = [...root.querySelectorAll<HTMLButtonElement>(".header .tabs button")]

    expect(root.querySelector("h2")).toBeNull()
    expect(root.querySelector("section")!.getAttribute("aria-label")).toBe("Formula keyboard")
    expect(root.querySelector(".header .tabs")).not.toBeNull()
    expect(root.querySelector(".tabs")!.parentElement).toBe(root.querySelector(".header"))
    expect(root.querySelector(".controls")!.parentElement).toBe(root.querySelector(".header"))
    expect(tabs.map(tab => tab.getAttribute("aria-label"))).toEqual(
      mathKeyboardLayouts.map(layout => layout.label),
    )
    expect(tabs).toHaveLength(4)
    expect(tabs.filter(tab => tab.getAttribute("aria-pressed") === "true")).toHaveLength(1)

    tabs[1].click()
    await keyboard.updateComplete
    expect(tabs[1].getAttribute("aria-pressed")).toBe("true")
    expect(keyboard.shadowRoot!.querySelector(".grid")!.getAttribute("aria-label"))
      .toBe(mathKeyboardLayouts[1].label)
  })

  it("emits key commands and closes from the accessible × button", async () => {
    const keyboard = await mountKeyboard()
    const focusedInput = document.createElement("input")
    document.body.append(focusedInput)
    focusedInput.focus()
    const commands: string[] = []
    const commandEvents: Event[] = []
    let closeEvent: Event | undefined
    keyboard.addEventListener("math-keyboard-command", event => {
      commands.push((event as CustomEvent<{command: string}>).detail.command)
      commandEvents.push(event)
    })
    keyboard.addEventListener("math-keyboard-close", event => closeEvent = event)

    const firstKey = keyboard.shadowRoot!.querySelector<HTMLButtonElement>(".grid button")!
    firstKey.click()
    const hide = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Hide formula keyboard"]')!
    expect(hide.querySelector("svg")).not.toBeNull()
    expect(getComputedStyle(hide).backgroundColor).toBe("transparent")
    hide.dispatchEvent(new Event("pointerdown", {bubbles: true, cancelable: true}))
    expect(document.activeElement).toBe(focusedInput)
    hide.click()

    expect(commands).toEqual([mathKeyboardLayouts[0].rows.flat().find(key => key.command)!.command])
    expect(commandEvents.every(event => event.bubbles && event.composed)).toBe(true)
    expect(closeEvent).toMatchObject({bubbles: true, composed: true})
    expect(document.activeElement).toBe(focusedInput)
  })

  it("keeps pointerdown from taking focus and provides key titles and labels", async () => {
    const keyboard = await mountKeyboard()
    const key = keyboard.shadowRoot!.querySelector<HTMLButtonElement>(".grid button")!
    const pointerdown = new Event("pointerdown", {bubbles: true, cancelable: true})

    key.dispatchEvent(pointerdown)

    expect(pointerdown.defaultPrevented).toBe(true)
    expect(key.title).toBeTruthy()
    expect(key.getAttribute("aria-label")).toBe(key.title)
    expect(key.tabIndex).toBe(0)
  })

  it("uses shift for one command and keeps it only for extended movement", async () => {
    const keyboard = await mountKeyboard()
    const commands: string[] = []
    keyboard.addEventListener("math-keyboard-command", event => {
      commands.push((event as CustomEvent<{command: string}>).detail.command)
    })

    const press = async (title: string) => {
      [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".grid button")]
        .find(button => button.title === title)!.click()
      await keyboard.updateComplete
    }
    const main = mathKeyboardLayouts[0]
    const shift = main.rows.flat().find(key => key.command === "shift")!
    const ordinary = main.rows.flat().find(key => key.command.startsWith("text:") && key.title === "x")!
    await press(shift.title)
    expect(keyboard.shadowRoot!.querySelector<HTMLButtonElement>(".grid button[aria-pressed='true']"))
      .not.toBeNull()
    await press(ordinary.shift!.title)
    expect(commands.at(-1)).toBe(ordinary.shift!.command)
    expect(keyboard.shadowRoot!.querySelector(".grid button[aria-pressed='true']")).toBeNull()

    await press(shift.title)
    for (const direction of ["left", "right"]) {
      const move = main.rows.flat().find(key => key.command === `move:${direction}`)!
      await press(move.title)
      expect(commands.at(-1)).toBe(`move-extend:${direction}`)
      expect(keyboard.shadowRoot!.querySelector(".grid button[aria-pressed='true']")).not.toBeNull()
    }
  })

  it("uses shifted variants for uppercase letters and Greek capitals", async () => {
    const keyboard = await mountKeyboard()
    const commands: string[] = []
    keyboard.addEventListener("math-keyboard-command", event => {
      commands.push((event as CustomEvent<{command: string}>).detail.command)
    })
    const clickTitle = async (title: string) => {
      [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.title === title)!.click()
      await keyboard.updateComplete
    }

    await clickTitle("ABC")
    await clickTitle("Shift")
    await clickTitle("A")
    expect(commands.at(-1)).toBe("text:A")
    expect(keyboard.shadowRoot!.querySelector(".grid button[aria-pressed='true']")).toBeNull()

    await clickTitle("αβγ")
    await clickTitle("Shift")
    await clickTitle("Capital alpha")
    expect(commands.at(-1)).toBe("text:Α")
    expect(keyboard.shadowRoot!.querySelector(".grid button[aria-pressed='true']")).toBeNull()
  })

  it("fits keys to ten logical columns without a horizontal scroll container", async () => {
    const keyboard = await mountKeyboard()
    const grid = keyboard.shadowRoot!.querySelector<HTMLElement>(".grid")!

    expect(getComputedStyle(grid).gridTemplateColumns).toContain("repeat(20")
    expect(getComputedStyle(keyboard).maxHeight).toContain("280px")
    expect(MathKeyboard.styles.cssText).toContain("760px")
    expect(MathKeyboard.styles.cssText).toContain("overflow-x: hidden")
    expect(MathKeyboard.styles.cssText).toContain("opacity: 0.9")
    expect(MathKeyboard.styles.cssText).toContain("height: 280px")
    expect(MathKeyboard.styles.cssText).toContain("box-shadow:")
    expect(MathKeyboard.styles.cssText).not.toContain("overflow-y: auto")
  })
})
