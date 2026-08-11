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
    expect(buttons).toHaveLength(primaryMarkOptions.length + 4)
    expect(buttons.slice(primaryMarkOptions.length + 1).map(button => button.label))
      .toEqual(secondaryMarkOptions.slice(0, 3).map(option => option.label))
    expect(buttons.slice(0, primaryMarkOptions.length).every(button => button.compact && button.toggle)).toBe(true)
    expect(buttons.every(button => button.disabled)).toBe(true)

    await buttons[0].updateComplete
    expect(buttons[0].shadowRoot!.querySelector("button")!.getAttribute("aria-label")).toBe("Bold")
    expect(buttons[0].shadowRoot!.querySelector("button")!.getAttribute("aria-pressed")).toBe("false")
    expect(buttons[0].shadowRoot!.querySelector(".icon-tabler-bold")).not.toBeNull()
    expect(getComputedStyle(buttons[0].shadowRoot!.querySelector<HTMLElement>(".button-label")!).display).toBe("none")
  })

  it("flows all marks through one expanding grid without shifting the primary rows", async () => {
    const {ribbon, group} = await mountRibbon()
    const toggle = group.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!
    const controls = group.shadowRoot!.querySelector<HTMLElement>(".controls")!
    const chevron = group.shadowRoot!.querySelector<HTMLElement>(".drawer-icon")!
    const collapsedChevronTransform = getComputedStyle(chevron).transform

    toggle.click()
    await group.updateComplete

    const buttons = Array.from(controls.querySelectorAll<RibbonButton>("ribbon-button"))
    const section = group.shadowRoot!.querySelector<HTMLElement>(".group")!
    const ribbonContent = ribbon.shadowRoot!.querySelector<HTMLElement>(".ribbon-content")!
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(section.classList.contains("expanded")).toBe(true)
    expect(group.shadowRoot!.querySelector(".drawer")).toBeNull()
    expect(getComputedStyle(controls).gridAutoFlow).toBe("row")
    expect(getComputedStyle(controls).gridTemplateColumns).toBe("repeat(8, 1.75rem)")
    expect(getComputedStyle(group).minWidth).toBe("266px")
    expect(getComputedStyle(controls).alignContent).toBe("start")
    expect(getComputedStyle(controls).paddingTop).toBe("0px")
    expect(getComputedStyle(controls).paddingBottom).toBe("6px")
    expect(getComputedStyle(controls).gap).toBe("0.2rem")
    expect(getComputedStyle(controls).overflowX).toBe("hidden")
    expect(getComputedStyle(ribbonContent).overflowX).toBe("clip")
    expect(getComputedStyle(ribbonContent).overflowY).toBe("visible")
    const sectionStyle = getComputedStyle(section)
    expect(sectionStyle.backgroundColor).toBe("#f2f2f2")
    expect(sectionStyle.maxHeight).toBe("calc(100% + 60.8px)")
    expect(sectionStyle.transition).toContain("max-height 180ms ease")
    expect(sectionStyle.marginLeft).toBe("-1px")
    expect(sectionStyle.paddingLeft).toBe("calc(8px + 1px)")
    expect([
      sectionStyle.borderTopWidth,
      sectionStyle.borderRightWidth,
      sectionStyle.borderBottomWidth,
      sectionStyle.borderLeftWidth,
    ]).toEqual(["1px", "1px", "1px", "1px"])
    expect([
      sectionStyle.borderTopColor,
      sectionStyle.borderRightColor,
      sectionStyle.borderBottomColor,
      sectionStyle.borderLeftColor,
    ]).toEqual([
      "transparent",
      "#d8dee6",
      "#d8dee6",
      "#d8dee6",
    ])
    expect(getComputedStyle(section).boxShadow).not.toBe("none")
    expect(getComputedStyle(section).clipPath).not.toBe("none")
    expect(getComputedStyle(toggle).position).toBe("absolute")
    expect(getComputedStyle(toggle).left).toBe("calc(50% + 1px)")
    expect(getComputedStyle(toggle).bottom).toBe("-9px")
    expect(getComputedStyle(toggle).width).toBe("80px")
    expect(getComputedStyle(toggle).padding).toBe("0px")
    expect(collapsedChevronTransform).toBe("rotate(45deg)")
    expect(getComputedStyle(chevron).transform).toBe("rotate(225deg)")
    expect(buttons.map(button => button.label)).toEqual([
      ...primaryMarkOptions.map(option => option.label),
      "Remove marks",
      ...secondaryMarkOptions.map(option => option.label),
    ])
    expect(buttons.every(button => button.compact)).toBe(true)
    expect(buttons.filter(button => button.action.startsWith("mark:")).every(button => button.toggle)).toBe(true)
  })

  it("animates closing before removing the expanded controls", async () => {
    const {group} = await mountRibbon()
    const toggle = group.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!

    toggle.click()
    await group.updateComplete
    toggle.click()
    await group.updateComplete

    const section = group.shadowRoot!.querySelector<HTMLElement>(".group")!
    const controls = group.shadowRoot!.querySelector<HTMLElement>(".controls")!
    expect(group.hasAttribute("drawer-open")).toBe(false)
    expect(group.hasAttribute("drawer-visible")).toBe(true)
    expect(section.classList.contains("closing")).toBe(true)
    expect(getComputedStyle(section).maxHeight).toBe("100%")
    expect(controls.querySelector('ribbon-button[action="mark:time"]')).not.toBeNull()

    const transitionEnd = new Event("transitionend", {bubbles: true})
    Object.defineProperty(transitionEnd, "propertyName", {value: "max-height"})
    section.dispatchEvent(transitionEnd)
    await group.updateComplete

    expect(group.hasAttribute("drawer-visible")).toBe(false)
    expect(controls.querySelector('ribbon-button[action="mark:time"]')).toBeNull()
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
    const time = group.shadowRoot!.querySelector<RibbonButton>('ribbon-button[action="mark:time"]')!
    const variable = group.shadowRoot!.querySelector<RibbonButton>('ribbon-button[action="mark:var"]')!
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
