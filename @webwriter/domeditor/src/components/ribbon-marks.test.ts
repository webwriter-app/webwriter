// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {markStateChangeEvent} from "../editor-bridge"
import {mergedMarkGroupFor, primaryMarkOptions, secondaryMarkOptions} from "../marks"
import {DomEditor} from "./dom-editor"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonCombobox} from "./ribbon-combobox"
import type {RibbonDrawer} from "./ribbon-drawer"

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

async function mountRibbon() {
  const ribbon = new AppRibbon()
  document.body.append(ribbon)
  await ribbon.updateComplete
  const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Marks"]')!
  await drawer.updateComplete
  return {ribbon, drawer}
}

async function mountEditor() {
  const editor = new DomEditor()
  document.body.append(editor)
  await editor.updateComplete
  const iframe = editor.shadowRoot!.querySelector("iframe")!
  iframe.dispatchEvent(new Event("load"))
  return {editor, iframe, editorWindow: iframe.contentWindow!}
}

const primaryButtons = (drawer: RibbonDrawer) => Array.from(
  drawer.querySelectorAll<RibbonButton>('ribbon-button:not([slot="more"])'),
)

const moreMarkOptions = [...primaryMarkOptions, ...secondaryMarkOptions].filter(option => {
  if(["b", "i", "u", "s", "sup", "sub", "a", "code"].includes(option.name)) return false
  const group = mergedMarkGroupFor(option.name)
  return !group || group.primary === option.name
})

describe("mark ribbon controls", () => {
  it("keeps Format in the main ribbon and groups Marks with the layout drawers", async () => {
    const {ribbon} = await mountRibbon()
    const tabs = Array.from(ribbon.shadowRoot!.querySelectorAll("ribbon-tab"))

    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(".ribbon-content > ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label")))
      .toEqual(["Marks", "Text", "Lists", "Media", "Packages"])

    expect(tabs.map(tab => tab.label)).toEqual([
      "File",
      "Insert",
      "Format",
      "Review",
      "Settings",
    ])

    tabs.find(tab => tab.label === "Format")!.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete

    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(".ribbon-content > ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label")))
      .toEqual(["Marks", "Styles", "Font", "Effects", "Page", "Arrange", "View"])

    tabs.find(tab => tab.label === "Review")!.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(".ribbon-content > ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label")))
      .toEqual(["Proofing", "Comments", "Changes"])

    tabs.find(tab => tab.label === "Settings")!.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(".ribbon-content > ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label")))
      .toEqual(["Editor", "Appearance", "Advanced"])
  })

  it("uses a ribbon drawer with two fixed primary rows and optional more marks", async () => {
    const {ribbon, drawer} = await mountRibbon()
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    const moreSlot = drawer.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="more"]')!
    const buttons = primaryButtons(drawer)
    const comboboxes = Array.from(drawer.querySelectorAll<RibbonCombobox>("ribbon-combobox"))

    expect(ribbon.shadowRoot!.querySelector("mark-ribbon-drawer")).toBeNull()
    expect(ribbon.shadowRoot!.querySelectorAll("ribbon-drawer")).toHaveLength(5)
    expect(drawer.layout).toBe("marks")
    expect(drawer.expandable).toBe(true)
    expect(moreSlot.hidden).toBe(true)
    expect(comboboxes.map(combobox => combobox.name)).toEqual([
      "font-family",
      "font-size",
      "color",
      "background-color",
    ])
    expect(buttons.map(button => button.label)).toEqual([
      "Increase font size",
      "Decrease font size",
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Superscript",
      "Subscript",
      "Link",
      "Code",
      "Remove formatting",
    ])
    expect(buttons.slice(2, 10).every(button => button.compact && button.toggle)).toBe(true)
    expect(buttons.every(button => button.disabled)).toBe(true)
    expect(comboboxes.every(combobox => combobox.disabled)).toBe(true)
    expect(getComputedStyle(controls).gridAutoFlow).toBe("row")
    expect(getComputedStyle(controls).gridTemplateColumns).toBe("repeat(9, 1.75rem)")
    expect(getComputedStyle(drawer.shadowRoot!.querySelector<HTMLElement>(".drawer")!).borderLeftColor)
      .toBe("#d8dee6")
    expect(drawer.querySelector('ribbon-button[action="mark:sup"]')!.slot).toBe("")
    expect(drawer.querySelector('ribbon-button[action="mark:kbd"]')!.slot).toBe("more")
    expect(drawer.querySelector('ribbon-button[action="mark:ruby"]')!.slot).toBe("more")
    expect(drawer.querySelector('ribbon-button[action="mark:time"]')).toBeNull()

    await buttons[2].updateComplete
    expect(buttons[2].shadowRoot!.querySelector("button")!.getAttribute("aria-label")).toBe("Bold")
    expect(buttons[2].shadowRoot!.querySelector("button")!.getAttribute("aria-pressed")).toBe("false")
    expect(buttons[2].shadowRoot!.querySelector(".icon-tabler-bold")).not.toBeNull()
    expect(getComputedStyle(buttons[2].shadowRoot!.querySelector<HTMLElement>(".button-label")!).display).toBe("none")
  })

  it("flows all marks through the same drawer grid without shifting the primary rows", async () => {
    const {ribbon, drawer} = await mountRibbon()
    const toggle = drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    const moreSlot = drawer.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="more"]')!
    const chevron = drawer.shadowRoot!.querySelector<HTMLElement>(".drawer-icon")!
    const collapsedChevronTransform = getComputedStyle(chevron).transform

    toggle.click()
    await drawer.updateComplete

    const buttons = Array.from(drawer.querySelectorAll<RibbonButton>("ribbon-button"))
    const section = drawer.shadowRoot!.querySelector<HTMLElement>(".drawer")!
    const ribbonContent = ribbon.shadowRoot!.querySelector<HTMLElement>(".ribbon-content")!
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(toggle.getAttribute("aria-label")).toBe("More marks")
    expect(section.classList.contains("expanded")).toBe(true)
    expect(moreSlot.hidden).toBe(false)
    expect(getComputedStyle(drawer).minWidth).toBe("297.2px")
    expect(getComputedStyle(controls).alignContent).toBe("start")
    expect(getComputedStyle(controls).paddingTop).toBe("0px")
    expect(getComputedStyle(controls).paddingBottom).toBe("6px")
    expect(getComputedStyle(controls).gap).toBe("0.2rem")
    expect(getComputedStyle(controls).overflowX).toBe("hidden")
    expect(getComputedStyle(ribbonContent).justifyContent).toBe("flex-start")
    expect(getComputedStyle(ribbonContent).overflowX).toBe("clip")
    expect(getComputedStyle(ribbonContent).overflowY).toBe("visible")
    const sectionStyle = getComputedStyle(section)
    expect(sectionStyle.backgroundColor).toBe("#f2f2f2")
    expect(sectionStyle.height).toBe("auto")
    expect(sectionStyle.maxHeight).toBe("calc(100% + 62.4px)")
    expect(sectionStyle.transition).toContain("max-height 180ms ease")
    expect(sectionStyle.marginLeft).toBe("")
    expect(sectionStyle.paddingLeft).toBe("8px")
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
    expect(sectionStyle.boxShadow).not.toBe("none")
    expect(sectionStyle.clipPath).not.toBe("none")
    expect(getComputedStyle(toggle).position).toBe("absolute")
    expect(getComputedStyle(toggle).left).toBe("calc(50% + 1px)")
    expect(getComputedStyle(toggle).bottom).toBe("-10px")
    expect(getComputedStyle(toggle).width).toBe("80px")
    expect(getComputedStyle(toggle).padding).toBe("0px")
    expect(getComputedStyle(drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!).gap).toBe("0.2rem")
    expect(collapsedChevronTransform).toBe("rotate(45deg)")
    expect(getComputedStyle(chevron).transform).toBe("rotate(225deg)")
    expect(buttons.map(button => button.label)).toEqual([
      "Increase font size",
      "Decrease font size",
      ...primaryMarkOptions.slice(0, 4).map(option => option.label),
      "Superscript",
      "Subscript",
      "Link",
      "Code",
      "Remove formatting",
      ...moreMarkOptions.map(option => option.label),
    ])
    expect(buttons.every(button => button.compact)).toBe(true)
    expect(buttons.filter(button => button.action.startsWith("mark:")).every(button => button.toggle)).toBe(true)
  })

  it("reuses the complete marks grid in a fixed-width drawer when horizontally collapsed", async () => {
    const {ribbon, drawer} = await mountRibbon()
    drawer.collapsed = true
    await drawer.updateComplete

    const section = drawer.shadowRoot!.querySelector<HTMLElement>(".drawer")!
    const summary = drawer.shadowRoot!.querySelector<HTMLElement>(".summary")!
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    const moreSlot = drawer.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="more"]')!
    const toggle = drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!

    expect(drawer.layoutWidths).toEqual({collapsed: 80, expanded: 297.2})
    expect(getComputedStyle(drawer).minWidth).toBe("80px")
    expect(getComputedStyle(summary).display).toBe("flex")
    expect(summary.textContent).toContain("Marks")
    expect(toggle.getAttribute("aria-label")).toBe("Show Marks controls")

    toggle.click()
    await drawer.updateComplete

    expect(toggle.getAttribute("aria-label")).toBe("Hide Marks controls")
    expect(getComputedStyle(section).maxHeight).toBe("100%")
    expect(getComputedStyle(section).boxShadow).toBe("none")
    expect(getComputedStyle(controls).width).toBe("297.2px")
    expect(getComputedStyle(controls).boxShadow).not.toBe("none")
    expect(getComputedStyle(controls).borderColor).toBe("#d8dee6")
    expect(getComputedStyle(controls).paddingTop).toBe("6px")
    expect(getComputedStyle(controls).paddingBottom).toBe("6px")
    expect(getComputedStyle(controls).visibility).toBe("visible")
    expect(getComputedStyle(controls).transition).not.toContain("opacity")
    expect(moreSlot.hidden).toBe(false)
    expect(getComputedStyle(ribbon).height).toBe("130px")

    toggle.click()
    await drawer.updateComplete

    expect(drawer.hasAttribute("drawer-open")).toBe(false)
    expect(drawer.hasAttribute("drawer-visible")).toBe(true)
    expect(getComputedStyle(controls).maxHeight).toBe("0")
    expect(getComputedStyle(controls).visibility).toBe("visible")
    expect(getComputedStyle(controls).paddingTop).toBe("0px")
    expect(getComputedStyle(controls).paddingBottom).toBe("0px")
  })

  it("keeps more controls mounted until the closing slide completes", async () => {
    const {drawer} = await mountRibbon()
    const toggle = drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!
    const moreSlot = drawer.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="more"]')!

    toggle.click()
    await drawer.updateComplete
    toggle.click()
    await drawer.updateComplete

    const section = drawer.shadowRoot!.querySelector<HTMLElement>(".drawer")!
    expect(drawer.hasAttribute("drawer-open")).toBe(false)
    expect(drawer.hasAttribute("drawer-visible")).toBe(true)
    expect(section.classList.contains("closing")).toBe(true)
    expect(getComputedStyle(section).maxHeight).toBe("100%")
    expect(moreSlot.hidden).toBe(false)

    const transitionEnd = new Event("transitionend", {bubbles: true})
    Object.defineProperty(transitionEnd, "propertyName", {value: "max-height"})
    section.dispatchEvent(transitionEnd)
    await drawer.updateComplete

    expect(drawer.hasAttribute("drawer-visible")).toBe(false)
    expect(moreSlot.hidden).toBe(true)
  })

  it("keeps mark toggles open and opens the drawer for configurable marks", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.canMark = true
    await ribbon.updateComplete
    await drawer.updateComplete
    const toggle = drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!
    const bold = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:b"]')!
    const link = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:a"]')!

    toggle.click()
    await drawer.updateComplete
    bold.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-open")).toBe(true)

    drawer.closeDrawer()
    await drawer.updateComplete
    bold.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-open")).toBe(false)

    link.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-open")).toBe(true)
  })

  it("automatically opens merged-mark details even when the mark has no attributes", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.canMark = true
    ribbon.marks = ["ruby"]
    await ribbon.updateComplete
    await drawer.updateComplete

    expect(drawer.hasAttribute("drawer-open")).toBe(true)
    const variants = Array.from(drawer.querySelectorAll<RibbonButton>(
      '.mark-details ribbon-button[action^="mark-detail:"]',
    ))
    expect(variants.map(button => button.action)).toEqual([
      "mark-detail:ruby",
      "mark-detail:bdi",
      "mark-detail:bdo",
    ])
    expect(variants.map(button => button.active)).toEqual([true, false, false])
  })

  it("keeps forced mark details open while their controls take focus", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.canMark = true
    ribbon.marks = ["a"]
    await ribbon.updateComplete
    await drawer.updateComplete

    document.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true}))
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-open")).toBe(true)

    drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.click()
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-open")).toBe(false)
  })

  it("reflects DOM-derived enabled and active state on primary and secondary buttons", async () => {
    const {ribbon} = await mountRibbon()
    ribbon.canMark = true
    ribbon.marks = ["b", "time"]
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Marks"]')!
    await drawer.updateComplete

    const bold = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:b"]')!
    expect(bold.disabled).toBe(false)
    expect(bold.active).toBe(true)
    await bold.updateComplete
    expect(bold.shadowRoot!.querySelector("button")!.getAttribute("aria-pressed")).toBe("true")

    expect(drawer.hasAttribute("drawer-open")).toBe(true)
    const time = drawer.querySelector<RibbonButton>('ribbon-button[action="mark-detail:time"]')!
    const variable = drawer.querySelector<RibbonButton>('ribbon-button[action="mark-detail:var"]')!
    const code = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:code"]')!
    const exactCode = drawer.querySelector<RibbonButton>('ribbon-button[action="mark-detail:code"]')!
    expect(time.active).toBe(true)
    expect(variable.active).toBe(false)
    expect(code.active).toBe(true)
    expect(exactCode.active).toBe(false)
    expect(time.disabled).toBe(false)
  })

  it("shows contextual merged-type buttons and mark-specific inputs in the expanded detail row", async () => {
    const {ribbon, drawer} = await mountRibbon()
    const detailSlot = drawer.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="detail"]')!
    expect(detailSlot.hidden).toBe(true)

    ribbon.canMark = true
    ribbon.marks = ["time"]
    ribbon.markAttributes = {time: {datetime: "2026-08-13"}}
    await ribbon.updateComplete
    await drawer.updateComplete

    expect(drawer.hasAttribute("drawer-open")).toBe(true)
    expect(detailSlot.hidden).toBe(false)
    const variants = Array.from(drawer.querySelectorAll<RibbonButton>(
      '.mark-details ribbon-button[action^="mark-detail:"]',
    ))
    expect(variants.map(button => button.action)).toEqual([
      "mark-detail:code",
      "mark-detail:samp",
      "mark-detail:time",
      "mark-detail:data",
      "mark-detail:var",
    ])
    expect(variants.find(button => button.action === "mark-detail:code")!.active).toBe(false)
    expect(variants.find(button => button.action === "mark-detail:time")!.active).toBe(true)
    expect(drawer.textContent).not.toContain("Details")
    expect(drawer.textContent).not.toContain("Select a configurable mark")
    const timeInput = drawer.querySelector<HTMLInputElement>('input[aria-label="Date/Time Annotation: Date/time"]')!
    expect(timeInput.value).toBe("2026-08-13")

    ribbon.marks = ["code", "time", "var"]
    await ribbon.updateComplete
    const selected = Array.from(drawer.querySelectorAll<RibbonButton>(
      '.mark-details ribbon-button[action^="mark-detail:"][active]',
    ))
    expect(selected.map(button => button.action)).toEqual([
      "mark-detail:code",
      "mark-detail:time",
      "mark-detail:var",
    ])

    ribbon.marks = ["data"]
    ribbon.markAttributes = {data: {value: "42"}}
    await ribbon.updateComplete
    const dataInput = drawer.querySelector<HTMLInputElement>('input[aria-label="Data Annotation: Value"]')!
    expect(dataInput.value).toBe("42")
  })

  it("automatically expands for links and exposes only anchor-specific attributes", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.canMark = true
    ribbon.marks = ["a"]
    ribbon.markAttributes = {a: {href: "/page", target: "_blank"}}
    await ribbon.updateComplete
    await drawer.updateComplete

    expect(drawer.hasAttribute("drawer-open")).toBe(true)
    const inputs = Array.from(drawer.querySelectorAll<HTMLInputElement>(
      ".mark-details > .mark-attribute input",
    ))
    expect(inputs.map(input => input.getAttribute("aria-label"))).toEqual(["Link: Link"])
    expect(inputs[0].value).toBe("/page")

    const more = drawer.querySelector<HTMLButtonElement>(".mark-attribute-more")!
    const advanced = ribbon.shadowRoot!.querySelector<HTMLElement>(".link-attribute-menu")!
    expect(more.getAttribute("aria-expanded")).toBe("false")
    more.dispatchEvent(new MouseEvent("mouseenter"))
    await ribbon.updateComplete

    expect(more.getAttribute("aria-expanded")).toBe("false")
    more.click()
    await ribbon.updateComplete

    expect(more.getAttribute("aria-expanded")).toBe("true")
    const advancedInputs = Array.from(advanced.querySelectorAll<HTMLInputElement>("input"))
    expect(advancedInputs.map(input => input.getAttribute("aria-label"))).toEqual([
      "Link: Target",
      "Link: Download",
      "Link: Ping",
      "Link: Relationship",
      "Link: Language",
      "Link: Media type",
      "Link: Referrer policy",
    ])
    expect(advancedInputs[0].value).toBe("_blank")

    more.click()
    await ribbon.updateComplete
    expect(more.getAttribute("aria-expanded")).toBe("false")

    more.click()
    await ribbon.updateComplete
    drawer.closeDrawer()
    await Promise.all([ribbon.updateComplete, drawer.updateComplete])
    expect(more.getAttribute("aria-expanded")).toBe("false")

    ribbon.marks = []
    await ribbon.updateComplete
    expect(ribbon.shadowRoot!.querySelector(".link-attribute-menu")).toBeNull()
  })

  it("uses platform-native shortcut notation in button tooltips", async () => {
    const originalPlatform = navigator.platform
    try {
      Object.defineProperty(navigator, "platform", {value: "MacIntel", configurable: true})
      let mounted = await mountRibbon()
      let bold = mounted.drawer.querySelector<RibbonButton>('ribbon-button[action="mark:b"]')!
      await bold.updateComplete
      expect(bold.shadowRoot!.querySelector("button")!.title).toBe("Bold (⌥⇧B)")

      mounted.ribbon.remove()
      Object.defineProperty(navigator, "platform", {value: "Win32", configurable: true})
      mounted = await mountRibbon()
      bold = mounted.drawer.querySelector<RibbonButton>('ribbon-button[action="mark:b"]')!
      await bold.updateComplete
      expect(bold.shadowRoot!.querySelector("button")!.title).toBe("Bold (Alt+Shift+B)")
    }
    finally {
      Object.defineProperty(navigator, "platform", {value: originalPlatform, configurable: true})
    }
  })

  it("opens custom listboxes and emits the selected style mark", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.canMark = true
    await ribbon.updateComplete
    await drawer.updateComplete
    const changed = vi.fn()
    drawer.addEventListener("ribbon-combobox-change", changed)
    const family = drawer.querySelector<RibbonCombobox>('ribbon-combobox[name="font-family"]')!
    await family.updateComplete

    family.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.click()
    await family.updateComplete
    expect(family.shadowRoot!.querySelector("[role=listbox]")).not.toBeNull()
    family.shadowRoot!.querySelector<HTMLButtonElement>('.option[aria-label="Arial"]')!.click()

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {name: "font-family", value: "Arial, sans-serif"},
    }))
  })
})

describe("mark ribbon bridge", () => {
  it("updates controls from selection messages and routes style, toggle, size, and clear commands", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: markStateChangeEvent,
        detail: {
          canMark: true,
          marks: ["b"],
          styles: {"font-size": "18px"},
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Marks"]')!
    await drawer.updateComplete
    const bold = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:b"]')!
    const clear = drawer.querySelector<RibbonButton>('ribbon-button[action="removeMarks"]')!
    const increase = drawer.querySelector<RibbonButton>('ribbon-button[action="increaseFontSize"]')!
    const size = drawer.querySelector<RibbonCombobox>('ribbon-combobox[name="font-size"]')!
    await Promise.all([bold.updateComplete, clear.updateComplete, increase.updateComplete, size.updateComplete])

    expect(bold.active).toBe(true)
    expect(bold.disabled).toBe(false)
    expect(size.value).toBe("18px")
    bold.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    increase.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    size.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.click()
    await size.updateComplete
    size.shadowRoot!.querySelector<HTMLButtonElement>('.option[aria-label="24 px"]')!.click()
    clear.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()

    expect(execute).toHaveBeenNthCalledWith(1, {type: "toggleMark", mark: "b"})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "increaseFontSize"})
    expect(execute).toHaveBeenNthCalledWith(3, {type: "setStyleMark", property: "font-size", value: "24px"})
    expect(execute).toHaveBeenNthCalledWith(4, {type: "removeMarks"})
  })

  it("routes merged subtype and detail-attribute changes", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: markStateChangeEvent,
        detail: {
          canMark: true,
          marks: ["time"],
          attributes: {time: {datetime: "2026-08-13"}},
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Marks"]')!
    await drawer.updateComplete
    const code = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:code"]')!
    const exactCode = drawer.querySelector<RibbonButton>('ribbon-button[action="mark-detail:code"]')!
    const variable = drawer.querySelector<RibbonButton>('ribbon-button[action="mark-detail:var"]')!
    const datetime = drawer.querySelector<HTMLInputElement>(
      'input[aria-label="Date/Time Annotation: Date/time"]',
    )!
    await Promise.all([code.updateComplete, exactCode.updateComplete, variable.updateComplete])

    code.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    exactCode.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    variable.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    datetime.value = "2026-08-14"
    datetime.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(execute).toHaveBeenNthCalledWith(1, {type: "toggleMarkGroup", mark: "code"})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "toggleMark", mark: "code"})
    expect(execute).toHaveBeenNthCalledWith(3, {type: "toggleMark", mark: "var"})
    expect(execute).toHaveBeenNthCalledWith(4, {
      type: "setMarkAttribute",
      mark: "time",
      attribute: "datetime",
      value: "2026-08-14",
    })
  })
})
