// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {markStateChangeEvent} from "../editor-bridge"
import {DomEditor} from "./dom-editor"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonCombobox} from "./ribbon-combobox"
import type {RibbonDrawer} from "./ribbon-drawer"
import type {RibbonMenu} from "./ribbon-menu"

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

  it("keeps the marks drawer fixed with grouped controls on the right", async () => {
    const {ribbon, drawer} = await mountRibbon()
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    const moreSlot = drawer.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="more"]')!
    const buttons = primaryButtons(drawer)
    const comboboxes = Array.from(drawer.querySelectorAll<RibbonCombobox>("ribbon-combobox"))

    expect(ribbon.shadowRoot!.querySelector("mark-ribbon-drawer")).toBeNull()
    expect(drawer.layout).toBe("marks")
    expect(drawer.expandable).toBe(false)
    expect(drawer.shadowRoot!.querySelector(".drawer-toggle")).toBeNull()
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
      "Remove formatting",
      "Link",
      "More",
    ])
    expect(drawer.querySelectorAll('ribbon-button[slot="more"]')).toHaveLength(0)
    expect(buttons.slice(2, 8).every(button => button.compact && button.toggle)).toBe(true)
    expect(buttons[8].compact).toBe(true)
    expect(buttons[8].toggle).toBe(false)
    expect(buttons.slice(9).every(button => !button.compact)).toBe(true)
    expect(buttons.slice(9).every(button => button.toggle)).toBe(true)
    expect(buttons.every(button => button.disabled)).toBe(true)
    expect(comboboxes.every(combobox => combobox.disabled)).toBe(true)
    expect(getComputedStyle(controls).gridAutoFlow).toBe("row")
    expect(getComputedStyle(controls).gridTemplateColumns).toBe("repeat(8, 1.75rem) 4rem")
    expect(getComputedStyle(controls).gridTemplateRows).toBe("repeat(2, minmax(0, 1fr))")
    expect(getComputedStyle(controls).gap).toBe("0.2rem")
    for(const action of ["mark:code", "mark:kbd", "mark:q"]) {
      expect(drawer.querySelector(`ribbon-button[action="${action}"]`)).toBeNull()
    }

    expect(getComputedStyle(comboboxes[2]).gridColumn).toBe("1")
    expect(getComputedStyle(comboboxes[2]).gridRow).toBe("2")
    expect(getComputedStyle(comboboxes[3]).gridColumn).toBe("2")
    expect(getComputedStyle(comboboxes[3]).gridRow).toBe("2")
    expect(getComputedStyle(buttons[8]).gridColumn).toBe("8")
    expect(getComputedStyle(buttons[8]).gridRow).toBe("1")

    for(const action of ["mark:a", "mark:span"]) {
      const button = drawer.querySelector<RibbonButton>(`ribbon-button[action="${action}"]`)!
      expect(getComputedStyle(button).gridColumn).toBe("9")
      expect(getComputedStyle(button).gridRow).toBe(action === "mark:a" ? "1" : "2")
      expect(button.shadowRoot!.querySelector(".submenu-trigger")).not.toBeNull()
    }

    await buttons[2].updateComplete
    expect(buttons[2].shadowRoot!.querySelector("button")!.getAttribute("aria-label")).toBe("Bold")
    expect(buttons[2].shadowRoot!.querySelector("button")!.getAttribute("aria-pressed")).toBe("false")
    expect(buttons[2].shadowRoot!.querySelector(".icon-tabler-bold")).not.toBeNull()
    expect(getComputedStyle(buttons[2].shadowRoot!.querySelector<HTMLElement>(".button-label")!).display).toBe("none")
  })

  it("uses the standard ribbon button and menu path for Link and Span", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.canMark = true
    await ribbon.updateComplete
    await drawer.updateComplete

    const textDrawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Text"]')!
    const paragraph = Array.from(textDrawer.querySelectorAll<RibbonButton>("ribbon-button"))
      .find(button => button.action === "Paragraph")!
    const standardButtons = [
      drawer.querySelector<RibbonButton>('ribbon-button[action="mark:a"]')!,
      drawer.querySelector<RibbonButton>('ribbon-button[action="mark:span"]')!,
    ]
    await Promise.all([paragraph.updateComplete, ...standardButtons.map(button => button.updateComplete)])

    const paragraphRow = paragraph.shadowRoot!.querySelector<HTMLElement>(".button-row")!
    const paragraphTrigger = paragraph.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
    const paragraphMenu = paragraph.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!

    for(const button of standardButtons) {
      const row = button.shadowRoot!.querySelector<HTMLElement>(".button-row")!
      const trigger = button.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
      const menu = button.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!

      expect(button.constructor).toBe(paragraph.constructor)
      expect(row.className).toBe(paragraphRow.className)
      expect(trigger.className).toBe(paragraphTrigger.className)
      expect(menu.constructor).toBe(paragraphMenu.constructor)
      expect(menu.variant).toBe("button")
      expect(menu.customContent).toBe(true)
      expect(button.shadowRoot!.querySelector(".button-dropdown")).toBeNull()

      trigger.click()
      await button.updateComplete
      expect(menu.hidden).toBe(false)
    }

    paragraphTrigger.click()
    await paragraph.updateComplete
    expect(paragraphMenu.hidden).toBe(false)
    expect(paragraphMenu.customContent).toBe(false)

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
    await Promise.all([paragraph.updateComplete, ...standardButtons.map(button => button.updateComplete)])
    expect(paragraphMenu.hidden).toBe(true)
    expect(standardButtons.every(button => button.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!.hidden)).toBe(true)
  })

  it("shows the span multiselect with icons, attributes, and a count", async () => {
    const {ribbon, drawer} = await mountRibbon()
    const changed = vi.fn()
    ribbon.addEventListener("ribbon-combobox-change", changed)
    ribbon.canMark = true
    ribbon.marks = ["time", "var"]
    await ribbon.updateComplete
    await drawer.updateComplete

    const span = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:span"]')!
    expect(span.active).toBe(true)
    expect(span.label).toBe("Date/Time Annotation")
    expect(span.selectionCount).toBe(1)
    await span.updateComplete
    const trigger = span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
    trigger.click()
    await span.updateComplete

    const dropdown = span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    expect(dropdown.hidden).toBe(false)
    expect(dropdown.querySelector('[role="listbox"]')?.getAttribute("aria-multiselectable")).toBe("true")
    expect(Array.from(dropdown.querySelectorAll<HTMLElement>(".mark-dropdown-option-name")).map(option => option.textContent))
      .toEqual([
        "Span",
        "Side Comment",
        "Code",
        "Keyboard Shortcut",
        "Quotation",
        "Abbreviation",
        "Bidirectional Isolate",
        "Bidirectional Override",
        "Citation Source",
        "Data Annotation",
        "Defined Term",
        "Ruby Annotation",
        "Sample Output",
        "Date/Time Annotation",
        "Variable",
        "Deletion",
        "Insertion",
      ])
    expect(dropdown.querySelector('[role="option"] .mark-dropdown-option-icon svg')).not.toBeNull()
    expect(dropdown.querySelector('[role="option"] .mark-dropdown-option-name')?.textContent).toBe("Span")
    expect(dropdown.querySelector('input[aria-label="Abbreviation: Title"]')).not.toBeNull()
    expect(dropdown.querySelector('input[aria-label="Quotation: Source"]')).not.toBeNull()
    expect(dropdown.querySelector('input[aria-label="Data Annotation: Value"]')).not.toBeNull()
    expect(dropdown.querySelector('input[aria-label="Date/Time Annotation: Date/time"]')).not.toBeNull()

    dropdown.querySelector<HTMLInputElement>('[role="option"] input[aria-label="Select Data Annotation"]')!.click()
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {name: "mark-types", value: "time", values: ["time", "var", "data"]},
    }))
    await ribbon.updateComplete
    expect(span.selectionCount).toBe(2)
    await span.updateComplete
    expect(span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!.hidden).toBe(false)
    expect(span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
      .getAttribute("aria-expanded")).toBe("true")
    const label = span.shadowRoot!.querySelector<HTMLElement>(".button-label")!
    const labelText = span.shadowRoot!.querySelector<HTMLElement>(".button-label-text")!
    const count = span.shadowRoot!.querySelector<HTMLElement>(".selection-count")!
    expect(count.textContent).toBe("+2")
    expect(getComputedStyle(label).display).toBe("flex")
    expect(getComputedStyle(labelText).overflow).toBe("hidden")
    expect(getComputedStyle(count).flexShrink).toBe("0")
  })

  it("keeps an empty span multiselect open and presents it as More", async () => {
    const {ribbon, drawer} = await mountRibbon()
    const changed = vi.fn()
    ribbon.addEventListener("ribbon-combobox-change", changed)
    ribbon.canMark = true
    ribbon.marks = ["span"]
    await ribbon.updateComplete
    await drawer.updateComplete

    const span = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:span"]')!
    span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await span.updateComplete
    span.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Select Span"]')!.click()
    await ribbon.updateComplete
    await span.updateComplete

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {name: "mark-types", value: "", values: []},
    }))
    expect(span.label).toBe("More")
    expect(span.icon).toBe("More")
    expect(span.selectionCount).toBe(0)
    expect(span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!.hidden).toBe(false)
    expect(span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
      .getAttribute("aria-expanded")).toBe("true")
  })

  it("shows secondary mark attributes inside the span dropdown", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.canMark = true
    ribbon.marks = ["abbr", "data", "time"]
    ribbon.markAttributes = {
      abbr: {title: "Hypertext Markup Language"},
      data: {value: "42"},
      time: {datetime: "2026-08-13"},
    }
    await ribbon.updateComplete
    await drawer.updateComplete

    const span = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:span"]')!
    span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await span.updateComplete
    const dropdown = span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    expect(dropdown.querySelector<HTMLInputElement>('input[aria-label="Abbreviation: Title"]')!.value)
      .toBe("Hypertext Markup Language")
    expect(dropdown.querySelector<HTMLInputElement>('input[aria-label="Data Annotation: Value"]')!.value).toBe("42")
    expect(dropdown.querySelector<HTMLInputElement>('input[aria-label="Date/Time Annotation: Date/time"]')!.value)
      .toBe("2026-08-13")

    const quotation = dropdown.querySelector<HTMLInputElement>('input[aria-label="Quotation: Source"]')!
    expect(quotation.disabled).toBe(true)
    expect(quotation.parentElement!.getAttribute("aria-hidden")).toBe("true")
    expect(getComputedStyle(quotation.parentElement!).visibility).toBe("hidden")

    dropdown.querySelector<HTMLInputElement>('input[aria-label="Select Quotation"]')!.click()
    await ribbon.updateComplete
    await span.updateComplete
    const openDropdown = span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    const activeQuotation = openDropdown.querySelector<HTMLInputElement>('input[aria-label="Quotation: Source"]')!
    expect(openDropdown.hidden).toBe(false)
    expect(activeQuotation.disabled).toBe(false)
    expect(activeQuotation.parentElement!.getAttribute("aria-hidden")).toBe("false")
    expect(getComputedStyle(activeQuotation.parentElement!).visibility).not.toBe("hidden")
  })

  it("keeps link attributes in the link dropdown", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.canMark = true
    ribbon.marks = ["a"]
    ribbon.markAttributes = {a: {href: "/page", target: "_blank"}}
    await ribbon.updateComplete
    await drawer.updateComplete

    const link = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:a"]')!
    link.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await link.updateComplete
    const dropdown = link.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    const inputs = Array.from(dropdown.querySelectorAll<HTMLInputElement>(".mark-attribute input"))
    expect(inputs.map(input => input.getAttribute("aria-label"))).toEqual(["Link: Link"])
    expect(inputs[0].value).toBe("/page")

    const more = link.shadowRoot!.querySelector<HTMLButtonElement>(".button-dropdown-more")!
    expect(more.getAttribute("aria-expanded")).toBe("false")
    more.click()
    await ribbon.updateComplete
    await link.updateComplete

    const openMore = link.shadowRoot!.querySelector<HTMLButtonElement>(".button-dropdown-more")!
    expect(openMore.getAttribute("aria-expanded")).toBe("true")
    const advanced = link.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-advanced")!
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

    openMore.click()
    await ribbon.updateComplete
    await link.updateComplete
    expect(link.shadowRoot!.querySelector<HTMLButtonElement>(".button-dropdown-more")!
      .getAttribute("aria-expanded")).toBe("false")

    ribbon.marks = []
    await ribbon.updateComplete
    await link.updateComplete
    expect(link.shadowRoot!.querySelector(".button-dropdown-advanced")).toBeNull()
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
    const size = drawer.querySelector<RibbonCombobox>('ribbon-combobox[name="font-size"]')!
    await Promise.all([family.updateComplete, size.updateComplete])

    expect(family.shadowRoot!.querySelector<HTMLElement>(".value")!.textContent!.trim()).toBe("Font")
    expect(size.shadowRoot!.querySelector<HTMLElement>(".value")!.textContent!.trim()).toBe("Size")

    family.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.click()
    await family.updateComplete
    expect(family.shadowRoot!.querySelector("[role=listbox]")).not.toBeNull()
    expect(family.shadowRoot!.querySelector<HTMLButtonElement>('.option[aria-label="Default font"]')!.textContent)
      .toContain("Default font")
    family.shadowRoot!.querySelector<HTMLButtonElement>('.option[aria-label="Arial"]')!.click()

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {name: "font-family", value: "Arial, sans-serif"},
    }))

    size.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.click()
    await size.updateComplete
    expect(size.shadowRoot!.querySelector<HTMLButtonElement>('.option[aria-label="Default size"]')!.textContent)
      .toContain("Default size")
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

  it("routes span dropdown selections and detail-attribute changes", async () => {
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
    const span = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:span"]')!
    await span.updateComplete

    span.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await span.updateComplete
    const dropdown = span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    dropdown.querySelector<HTMLInputElement>('[role="option"] input[aria-label="Select Data Annotation"]')!.click()
    const datetime = dropdown.querySelector<HTMLInputElement>(
      'input[aria-label="Date/Time Annotation: Date/time"]',
    )!
    datetime.value = "2026-08-14"
    datetime.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(execute).toHaveBeenNthCalledWith(1, {type: "toggleMarkGroup", mark: "span"})
    expect(execute).toHaveBeenNthCalledWith(2, {
      type: "setMarkGroup",
      primary: "span",
      marks: ["time", "data"],
    })
    expect(execute).toHaveBeenNthCalledWith(3, {
      type: "setMarkAttribute",
      mark: "time",
      attribute: "datetime",
      value: "2026-08-14",
    })

    ribbon.dispatchEvent(new CustomEvent("ribbon-combobox-change", {
      detail: {name: "mark-types", value: "", values: []},
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenNthCalledWith(4, {
      type: "setMarkGroup",
      primary: "span",
      marks: [],
    })
  })
})
