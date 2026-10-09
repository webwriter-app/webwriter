// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {graphicShapeOptions} from "../graphic"
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
    expect(root.querySelector("h2")!.textContent).toBe("Shapes")
    expect(root.querySelector(".header")!.contains(root.querySelector('[aria-label="Shape pages"]'))).toBe(true)
    expect(root.textContent).not.toContain("Style keys, then insert")
  })

  it("shows each category catalog exactly once", async () => {
    const keyboard = await mountKeyboard()
    const tabs = [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tabs button")]

    const pages = ["Basic", "Advanced", "Flowchart"]
    const belongsTo = (category: string, page: string) => page === "Flowchart" ? category === "Flowchart"
      : page === "Basic" ? ["Lines", "Rectangles", "Basic shapes"].includes(category)
        : !["Lines", "Rectangles", "Basic shapes", "Flowchart"].includes(category)
    expect(tabs.map(tab => tab.textContent)).toEqual(pages)
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
      .find(tab => tab.textContent === "Basic")!
    basicTab.click()
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.grid button[title="Line"] svg g')!.getAttribute("fill"))
      .toBe("none")
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
