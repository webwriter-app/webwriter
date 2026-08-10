// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {markStateChangeEvent} from "../editor-bridge"
import {primaryMarkOptions, secondaryMarkOptions} from "../marks"
import {AppRibbon} from "./ribbon"
import {DomEditor} from "./dom-editor"
import type {MarkRibbonGroup} from "./mark-ribbon-group"
import type {RibbonButton} from "./ribbon-button"

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

async function mountRibbon() {
  const ribbon = new AppRibbon()
  document.body.append(ribbon)
  await ribbon.updateComplete
  const group = ribbon.shadowRoot!.querySelector<MarkRibbonGroup>("mark-ribbon-group")!
  await group.updateComplete
  return {ribbon, group}
}

async function mountEditor() {
  const editor = new DomEditor()
  document.body.append(editor)
  await editor.updateComplete
  const iframe = editor.shadowRoot!.querySelector("iframe")!
  iframe.dispatchEvent(new Event("load"))
  return {editor, iframe, editorWindow: iframe.contentWindow!}
}

describe("mark ribbon controls", () => {
  it("renders every primary mark as a compact, unlabelled icon toggle", async () => {
    const {group} = await mountRibbon()
    const controls = group.shadowRoot!.querySelector(".controls")!
    const buttons = Array.from(controls.querySelectorAll<RibbonButton>("ribbon-button"))

    expect(buttons.slice(0, primaryMarkOptions.length).map(button => button.label))
      .toEqual(primaryMarkOptions.map(option => option.label))
    expect(buttons).toHaveLength(primaryMarkOptions.length + 1)
    expect(buttons.slice(0, primaryMarkOptions.length).every(button => button.compact && button.toggle)).toBe(true)
    expect(buttons.every(button => button.disabled)).toBe(true)

    await buttons[0].updateComplete
    expect(buttons[0].shadowRoot!.querySelector("button")!.getAttribute("aria-label")).toBe("Bold")
    expect(buttons[0].shadowRoot!.querySelector("button")!.getAttribute("aria-pressed")).toBe("false")
    expect(buttons[0].shadowRoot!.querySelector(".icon-tabler-bold")).not.toBeNull()
    expect(getComputedStyle(buttons[0].shadowRoot!.querySelector<HTMLElement>(".button-label")!).display).toBe("none")
  })

  it("opens a vertical drawer containing the same compact toggles for every secondary mark", async () => {
    const {group} = await mountRibbon()
    const toggle = group.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!

    toggle.click()
    await group.updateComplete

    const drawer = group.shadowRoot!.querySelector<HTMLElement>(".drawer")!
    const buttons = Array.from(drawer.querySelectorAll<RibbonButton>("ribbon-button"))
    expect(drawer.hidden).toBe(false)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(getComputedStyle(drawer).position).toBe("fixed")
    expect(getComputedStyle(drawer).gridTemplateRows).toBe("repeat(6, 1.75rem)")
    expect(buttons.map(button => button.label)).toEqual(secondaryMarkOptions.map(option => option.label))
    expect(buttons.every(button => button.compact && button.toggle)).toBe(true)
  })

  it("reflects DOM-derived enabled and active state on primary and secondary buttons", async () => {
    const {ribbon} = await mountRibbon()
    ribbon.canMark = true
    ribbon.marks = ["b", "time"]
    await ribbon.updateComplete
    const group = ribbon.shadowRoot!.querySelector<MarkRibbonGroup>("mark-ribbon-group")!
    await group.updateComplete

    const bold = group.shadowRoot!.querySelector<RibbonButton>('ribbon-button[action="mark:b"]')!
    expect(bold.disabled).toBe(false)
    expect(bold.active).toBe(true)
    await bold.updateComplete
    expect(bold.shadowRoot!.querySelector("button")!.getAttribute("aria-pressed")).toBe("true")

    group.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.click()
    await group.updateComplete
    const time = group.shadowRoot!.querySelector<RibbonButton>('.drawer ribbon-button[action="mark:time"]')!
    const variable = group.shadowRoot!.querySelector<RibbonButton>('.drawer ribbon-button[action="mark:var"]')!
    expect(time.active).toBe(true)
    expect(variable.active).toBe(false)
    expect(time.disabled).toBe(false)
  })

  it("uses platform-native shortcut notation in button tooltips", async () => {
    const originalPlatform = navigator.platform
    try {
      Object.defineProperty(navigator, "platform", {value: "MacIntel", configurable: true})
      let mounted = await mountRibbon()
      let bold = mounted.group.shadowRoot!.querySelector<RibbonButton>('ribbon-button[action="mark:b"]')!
      await bold.updateComplete
      expect(bold.shadowRoot!.querySelector("button")!.title).toBe("Bold (⌥⇧B)")

      mounted.ribbon.remove()
      Object.defineProperty(navigator, "platform", {value: "Win32", configurable: true})
      mounted = await mountRibbon()
      bold = mounted.group.shadowRoot!.querySelector<RibbonButton>('ribbon-button[action="mark:b"]')!
      await bold.updateComplete
      expect(bold.shadowRoot!.querySelector("button")!.title).toBe("Bold (Alt+Shift+B)")
    }
    finally {
      Object.defineProperty(navigator, "platform", {value: originalPlatform, configurable: true})
    }
  })
})

describe("mark ribbon bridge", () => {
  it("updates controls from selection messages and routes toggle and clear commands", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: markStateChangeEvent,
        detail: {
          canMark: true,
          marks: ["b"],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    const group = ribbon.shadowRoot!.querySelector<MarkRibbonGroup>("mark-ribbon-group")!
    await group.updateComplete
    const bold = group.shadowRoot!.querySelector<RibbonButton>('ribbon-button[action="mark:b"]')!
    const clear = group.shadowRoot!.querySelector<RibbonButton>('ribbon-button[action="removeMarks"]')!
    await Promise.all([bold.updateComplete, clear.updateComplete])

    expect(bold.active).toBe(true)
    expect(bold.disabled).toBe(false)
    bold.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    clear.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()

    expect(execute).toHaveBeenNthCalledWith(1, {type: "toggleMark", mark: "b"})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "removeMarks"})
  })
})
