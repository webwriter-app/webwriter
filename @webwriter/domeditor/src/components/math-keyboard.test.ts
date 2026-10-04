// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {mathKeyboardLayouts} from "../math-input"
import {MathKeyboard} from "./math-keyboard"

async function mountKeyboard() {
  const keyboard = new MathKeyboard()
  document.body.append(keyboard)
  await keyboard.updateComplete
  return keyboard
}

afterEach(() => document.body.replaceChildren())

describe("formula keyboard", () => {
  it("shows four responsive layout tabs and marks the selected tab", async () => {
    const keyboard = await mountKeyboard()
    const tabs = [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tabs button")]

    expect(keyboard.shadowRoot!.querySelector("h2")!.textContent).toBe("Formula keyboard")
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
