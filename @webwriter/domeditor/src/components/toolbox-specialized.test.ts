// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DomEditorToolbox} from "./toolbox"
import type {ElementAttributeState} from "../element-attributes"
import type {ElementStyleState, SelectedElementTypeState} from "../editor-bridge"
import type {ElementStyleEditor} from "./element-style-editor"
import type {ElementAttributeEditor} from "./element-attribute-editor"
import type {RibbonDrawer} from "./ribbon-drawer"
import type {RibbonButton} from "./ribbon-button"
import type {WidgetOptionsState} from "../widget-options"
import {markNames} from "../marks"
import {getElementPresentation} from "../element-names"

afterEach(() => document.body.replaceChildren())

function selectedElement(localName: string, attributes: Record<string, string> = {}): ElementAttributeState {
  return {path: [0], localName, namespaceURI: "http://www.w3.org/1999/xhtml", name: localName, attributes}
}

function styleState(localName: string, inline: Record<string, string> = {}): ElementStyleState {
  return {
    target: {localName, namespaceURI: "http://www.w3.org/1999/xhtml"},
    inline: Object.fromEntries(Object.entries(inline).map(([name, value]) => [name, {value, priority: ""}])),
    computed: {},
    context: {display: "block", parentDisplay: "block"},
  }
}

async function mountElement(localName: string, attributes: Record<string, string> = {}, inline: Record<string, string> = {}) {
  const toolbox = new DomEditorToolbox()
  toolbox.activeTool = "Edit"
  toolbox.activeMenu = "Edit"
  toolbox.elementAttributes = selectedElement(localName, attributes)
  toolbox.elementStyle = styleState(localName, inline)
  document.body.append(toolbox)
  await toolbox.updateComplete
  await toolbox.updateComplete
  await Promise.all(Array.from(toolbox.shadowRoot!.querySelectorAll<ElementStyleEditor>("element-style-editor"), editor => editor.updateComplete))
  await Promise.all(Array.from(toolbox.shadowRoot!.querySelectorAll<ElementAttributeEditor>("element-attribute-editor"), editor => editor.updateComplete))
  return toolbox
}

describe("specialized element toolbox", () => {
  it("labels a child widget drawer with its readable name and package icon", async () => {
    const toolbox = await mountElement("webwriter-task-prompt")
    toolbox.elementAttributes = {...toolbox.elementAttributes!, ...getElementPresentation("webwriter-task-prompt", [{
      section: "Packages", kind: "widget", packageName: "@webwriter/quiz", name: "Task Prompt", tag: "webwriter-task-prompt", iconUrl: "https://example.test/quiz.svg", insertable: false,
    }])}
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('[data-specialized="webwriter-task-prompt"]')!
    await drawer.updateComplete
    expect(drawer.label).toBe("Task Prompt")
    expect(drawer.iconUrl).toBe("https://example.test/quiz.svg")
    expect(drawer.shadowRoot!.querySelector('img[src="https://example.test/quiz.svg"]')).not.toBeNull()
  })

  it.each(["ul", "ol"])("uses the shared List toolbox with a type switch for %s", async localName => {
    const toolbox = await mountElement(localName)
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>(`[data-specialized="${localName}"]`)!
    expect(drawer.label).toBe("List")
    const type = drawer.querySelector<HTMLElement>(".list-type")!
    expect(drawer.querySelector("element-style-editor")!.compareDocumentPosition(type) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    const group = type.querySelector<HTMLElement>('[role="group"]')!
    expect(group.style.getPropertyValue("--choice-columns")).toBe("2")
    expect(getComputedStyle(group).borderTopWidth).toBe("1px")
    const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>("button"))
    expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual(["List", "Enumeration"])
    expect(buttons.every(button => button.querySelector("svg"))).toBe(true)
    expect(buttons.map(button => button.getAttribute("aria-pressed"))).toEqual(localName === "ul" ? ["true", "false"] : ["false", "true"])
    const changes = vi.fn()
    toolbox.addEventListener("list-type-change", changes)
    buttons[localName === "ul" ? 1 : 0].click()
    expect(changes.mock.calls[0][0].detail).toEqual({listType: localName === "ul" ? "ol" : "ul",
      selectionTypes: [{localName, namespaceURI: "http://www.w3.org/1999/xhtml"}]})
  })

  it("combines selected lists and enumerations into one scoped toolbox", async () => {
    const toolbox = await mountElement("ul")
    toolbox.selectedElementTypes = ["ul", "ol", "p"].map(localName => ({
      element: selectedElement(localName), style: styleState(localName), count: 1,
      styleProperties: [], configuredWidgetOptions: [],
    }))
    await toolbox.updateComplete
    const drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer[data-specialized]"))
    expect(drawers.map(drawer => drawer.label)).toEqual(["List", "p"])
    expect(drawers[0].elementCount).toBe(2)
    const buttons = Array.from(drawers[0].querySelectorAll<HTMLButtonElement>(".list-type button"))
    expect(buttons.every(button => button.getAttribute("aria-pressed") === "false")).toBe(true)
    const changes = vi.fn()
    toolbox.addEventListener("list-type-change", changes)
    buttons[1].click()
    expect(changes.mock.calls[0][0].detail).toEqual({listType: "ol", selectionTypes: [
      {localName: "ul", namespaceURI: "http://www.w3.org/1999/xhtml"},
      {localName: "ol", namespaceURI: "http://www.w3.org/1999/xhtml"},
    ]})
  })

  it.each(["ul", "ol", "menu"])("offers compact marker icons and moves marker position into Options for %s", async localName => {
    const toolbox = await mountElement(localName, {}, {"list-style-type": localName === "ol" ? "lower-roman" : "square"})
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>(`[data-specialized="${localName}"]`)!
    const primary = drawer.querySelector<ElementStyleEditor>('element-style-editor:not([slot="more"])')!
    const advanced = drawer.querySelector<ElementStyleEditor>('.specialized-options element-style-editor')!
    expect(primary.propertyNames).toEqual(["list-style-type", "list-style-image"])
    expect(advanced.propertyNames).not.toContain("list-style-image")
    expect(primary.shadowRoot!.querySelector('[data-property="list-style-image"]')).toBeNull()
    expect(advanced.propertyNames).toContain("list-style-position")
    expect(primary.shadowRoot!.querySelector('[data-property="list-style-position"]')).toBeNull()
    expect(advanced.shadowRoot!.querySelector('[data-property="list-style-position"]')).not.toBeNull()
    const root = primary.shadowRoot!
    expect(root.querySelector('[data-property="list-style-type"] select')).toBeNull()
    const group = root.querySelector('.marker-control > .specialized-choice-group')!
    const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>("button"))
    expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual(localName === "ol"
      ? ["Decimal", "Lower alpha", "Upper alpha", "Lower roman", "More markers"]
      : ["Disc", "Circle", "Square", "More markers"])
    expect(buttons.every(button => !button.textContent!.trim())).toBe(true)
    expect(buttons.slice(0, -1).map(button => button.querySelector<HTMLOListElement>("ol")!.style.listStyleType)).toEqual(localName === "ol"
      ? ["decimal", "lower-alpha", "upper-alpha", "lower-roman"] : ["disc", "circle", "square"])
    expect(buttons.slice(0, -1).every(button => button.querySelectorAll("li").length === 1)).toBe(true)
    for(const button of buttons) {
      expect(getComputedStyle(button).display).toBe("grid")
      expect(getComputedStyle(button).placeItems).toBe("center")
    }
    for(const preview of group.querySelectorAll<HTMLElement>(".marker-preview")) {
      expect(getComputedStyle(preview).listStylePosition).toBe("inside")
      expect(getComputedStyle(preview.querySelector("li")!).display).toBe("list-item")
      expect(preview.style.getPropertyValue("--marker-style")).toBe("")
      expect(preview.style.getPropertyValue("--marker-suffix")).toBe("")
    }
    const more = buttons.at(-1)!
    const popup = root.querySelector<HTMLElement>("#marker-options")!
    expect(popup.hidden).toBe(true)
    expect(more.getAttribute("aria-pressed")).toBe("false")
    more.click()
    await primary.updateComplete
    expect(more.getAttribute("aria-expanded")).toBe("true")
    expect(popup.hidden).toBe(false)
    expect(primary.hasAttribute("popup-open")).toBe(true)
    const extra = Array.from(popup.querySelectorAll<HTMLButtonElement>("button"))
    expect(extra.map(button => button.getAttribute("aria-label"))).toEqual(localName === "ol"
      ? ["Decimal leading zero", "Upper roman", "Lower greek", "Armenian", "Georgian", "Hebrew", "Cjk decimal", "Hiragana", "Katakana", "None", "Image marker"]
      : ["Disclosure closed", "Disclosure open", "Dash", "Diamond", "Checkmark", "Arrow", "Star", "None", "Image marker"])
    expect(extra.every(button => button.querySelector('[aria-hidden="true"]') && !button.textContent!.trim())).toBe(true)
    const symbols = Array.from(root.querySelectorAll<HTMLElement>(".marker-preview[data-symbolic]"))
    expect(symbols.map(preview => preview.style.listStyleType)).toEqual(localName === "ol" ? [] : ["disc", "circle", "square"])
    for(const symbol of symbols) {
      expect(getComputedStyle(symbol).fontSize).toBe("20px")
      expect(getComputedStyle(symbol).transform).toBe("translateX(calc(.5em - 3px))")
      expect(getComputedStyle(symbol).listStylePosition).toBe("inside")
    }
    const decimal = root.querySelector<HTMLElement>('.marker-preview[style="list-style-type: decimal"]')
    if(localName === "ol") expect(getComputedStyle(decimal!).fontSize).toBe("12px")
    else expect(decimal).toBeNull()
    for(const button of extra) {
      expect(getComputedStyle(button).display).toBe("grid")
      expect(getComputedStyle(button).placeItems).toBe("center")
    }
    expect(buttons[localName === "ol" ? 3 : 2].getAttribute("aria-pressed")).toBe("true")
    const changes = vi.fn()
    toolbox.addEventListener("element-style-change", changes)
    const pointer = new PointerEvent("pointerdown", {button: 0, bubbles: true, composed: true, cancelable: true})
    const noMarker = extra.find(button => button.getAttribute("aria-label") === "None")!
    noMarker.dispatchEvent(pointer)
    expect(pointer.defaultPrevented).toBe(true)
    expect(popup.hidden).toBe(false)
    noMarker.click()
    await primary.updateComplete
    expect(changes.mock.calls[0][0].detail).toMatchObject({property: "list-style-type", mutation: {value: "none", priority: ""}})
    expect(popup.hidden).toBe(true)
    expect(primary.hasAttribute("popup-open")).toBe(false)
    buttons[2].click()
    expect(changes.mock.calls[1][0].detail).toMatchObject({property: "list-style-type", mutation: {value: localName === "ol" ? "upper-alpha" : "square", priority: ""}})
  })

  it("dismisses marker choices with Escape, outside interaction, and focus changes", async () => {
    const toolbox = await mountElement("ol")
    const editor = toolbox.shadowRoot!.querySelector<ElementStyleEditor>('[data-specialized="ol"] element-style-editor')!
    const root = editor.shadowRoot!
    const more = root.querySelector<HTMLButtonElement>(".marker-more")!
    const popup = root.querySelector<HTMLElement>("#marker-options")!
    const option = popup.querySelector<HTMLButtonElement>("button")!
    more.click()
    await editor.updateComplete
    option.focus()
    option.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, composed: true, cancelable: true}))
    await editor.updateComplete
    expect(popup.hidden).toBe(true)
    expect(root.activeElement).toBe(more)
    more.blur()
    more.click()
    await editor.updateComplete
    document.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true}))
    await editor.updateComplete
    expect(popup.hidden).toBe(true)
    more.click()
    await editor.updateComplete
    const outside = document.createElement("button")
    document.body.append(outside)
    outside.focus()
    await editor.updateComplete
    expect(popup.hidden).toBe(true)
    more.click()
    await editor.updateComplete
    option.focus()
    option.click()
    await editor.updateComplete
    expect(popup.hidden).toBe(true)
    expect(root.activeElement).toBe(more)
  })

  it.each(["h1", "h2", "h3", "h4", "h5", "h6"])("shows a Heading drawer and matching level button group for %s", async localName => {
    const toolbox = await mountElement(localName)
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>(`[data-specialized="${localName}"]`)!
    expect(drawer.label).toBe("Heading")
    expect(drawer.icon).toBe("Heading")
    expect(drawer.iconUrl).toBe("")
    const group = drawer.querySelector<HTMLElement>(".heading-level .specialized-choice-group")!
    expect(getComputedStyle(group).overflow).toBe("hidden")
    expect(getComputedStyle(group).gap).toBe("1px")
    expect(group.getAttribute("role")).toBe("group")
    expect(group.style.getPropertyValue("--choice-columns")).toBe("3")
    const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>("button"))
    expect(buttons.every(button => getComputedStyle(button).borderTopWidth === "0px" && getComputedStyle(button).margin === "0px")).toBe(true)
    expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual(["Heading 1", "Heading 2", "Heading 3", "Heading 4", "Heading 5", "Heading 6"])
    expect(buttons.every(button => button.querySelector("svg"))).toBe(true)
    expect(buttons.filter(button => button.getAttribute("aria-pressed") === "true").map(button => button.getAttribute("aria-label"))).toEqual([`Heading ${localName.slice(1)}`])
    expect(buttons[2].hasAttribute("data-top-right")).toBe(true)
    expect(buttons[3].hasAttribute("data-bottom-left")).toBe(true)
    const headingBorder = getComputedStyle(group)
    for(const side of ["Top", "Right", "Bottom", "Left"] as const) {
      expect(headingBorder[`border${side}Width`]).toBe("1px")
    }
    expect(headingBorder.borderRadius).toBe("4px")
    const changes = vi.fn()
    toolbox.addEventListener("heading-level-change", changes)
    buttons[5].click()
    expect(changes.mock.calls[0][0].detail).toEqual({level: "h6", selectionType: {
      localName, namespaceURI: "http://www.w3.org/1999/xhtml",
    }})
    toolbox.elementAttributes = selectedElement("h3")
    toolbox.elementStyle = styleState("h3")
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('.heading-level button[aria-pressed="true"]')!.getAttribute("aria-label")).toBe("Heading 3")
  })

  it("scopes a heading level change to its drawer in a mixed selection", async () => {
    const toolbox = await mountElement("h1")
    toolbox.selectedElementTypes = ["h1", "h2", "p"].map(localName => ({
      element: selectedElement(localName), style: styleState(localName), count: 2,
      styleProperties: [], configuredWidgetOptions: [],
    }))
    await toolbox.updateComplete
    const changes = vi.fn()
    toolbox.addEventListener("heading-level-change", changes)
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[data-specialized="h2"] .heading-level button[aria-label="Heading 4"]')!.click()
    expect(changes.mock.calls[0][0].detail).toEqual({level: "h4", selectionType: {
      localName: "h2", namespaceURI: "http://www.w3.org/1999/xhtml",
    }})
    expect(toolbox.shadowRoot!.querySelector('[data-specialized="p"] .heading-level')).toBeNull()
  })

  it("shows one scoped drawer for each selected type and updates them when the selection changes", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    const group = (localName: string, count: number, inline: Record<string, string> = {}): SelectedElementTypeState => ({
      element: {...selectedElement(localName, {lang: "en"}), path: null},
      style: styleState(localName, inline), count, styleProperties: Object.keys(inline), configuredWidgetOptions: [],
    })
    toolbox.elementStyle = styleState("section", {"text-align": "center"})
    toolbox.selectedElementTypes = [group("p", 2, {"text-align": "center"}), group("img", 1), group("unfamiliar-element", 1)]
    document.body.append(toolbox)
    await toolbox.updateComplete
    await toolbox.updateComplete
    const drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer[data-specialized]"))
    expect(drawers.map(drawer => drawer.label)).toEqual(["p", "img", "unfamiliar-element"])
    await Promise.all(drawers.map(drawer => drawer.updateComplete))
    expect(drawers[0].shadowRoot!.querySelector(".pane-label .element-count")?.textContent).toBe("2")
    expect(drawers[1].shadowRoot!.querySelector(".element-count")).toBeNull()
    expect(drawers[2].expandable).toBe(true)
    expect(drawers[2].querySelector('[slot="more"]')).not.toBeNull()
    expect(drawers[2].shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.hidden).toBe(false)
    const styleChanges = vi.fn(), attributeChanges = vi.fn()
    toolbox.addEventListener("element-style-change", styleChanges)
    toolbox.addEventListener("element-attribute-change", attributeChanges)
    const paragraphStyles = drawers[0].querySelector("element-style-editor")!
    expect(paragraphStyles.state.target?.localName).toBe("section")
    paragraphStyles.dispatchEvent(new CustomEvent("element-style-change", {
      detail: {property: "text-align", mutation: "right"}, bubbles: true, composed: true,
    }))
    expect(styleChanges.mock.calls[0][0].detail).toMatchObject({
      selectionType: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"}, mutation: "right",
    })
    drawers[0].querySelector<HTMLButtonElement>(".style-reset")!.click()
    expect(styleChanges.mock.calls[1][0].detail).toMatchObject({
      selectionType: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"}, styles: {"text-align": null},
    })
    const imageAttributes = drawers[1].querySelector("element-attribute-editor")!
    await imageAttributes.updateComplete
    expect(imageAttributes.mediaOwned).toBe(false)
    expect(imageAttributes.closest('[slot="more"]')).not.toBeNull()
    const languages = imageAttributes.shadowRoot!.querySelector("style-combobox")!
    languages.dispatchEvent(new CustomEvent("combobox-change", {detail: {value: "de"}}))
    expect(attributeChanges.mock.calls[0][0].detail).toMatchObject({
      selectionType: {localName: "img", namespaceURI: "http://www.w3.org/1999/xhtml"}, name: "lang", value: "de",
    })
    toolbox.selectedElementTypes = [group("img", 3)]
    await toolbox.updateComplete
    expect(Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer[data-specialized]"), drawer => drawer.label)).toEqual(["img"])
  })

  it("renders individual widget drawers with package icons and instance-scoped options and actions", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.selectedElementTypes = ["first", "second"].map((id, index) => ({
      element: {...selectedElement("course-quiz", {id}), path: [index], name: "Quiz", icon: "Packages", iconUrl: "https://example.com/quiz.svg"},
      style: styleState("course-quiz"), count: 1, styleProperties: [], configuredWidgetOptions: [],
      widget: {path: [index], localName: "course-quiz", actions: [{name: "reset", label: "Reset"}], options: [
        {name: "enabled", label: "Enabled", type: "boolean", attribute: "enabled", value: index === 0},
      ]},
    }))
    document.body.append(toolbox)
    await toolbox.updateComplete
    const drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>('[data-specialized="course-quiz"]'))
    expect(drawers).toHaveLength(2)
    await Promise.all(drawers.map(drawer => drawer.updateComplete))
    for(const drawer of drawers) {
      expect(drawer.shadowRoot!.querySelector<HTMLImageElement>(".pane-icon img")!.getAttribute("src")).toBe("https://example.com/quiz.svg")
      expect(drawer.shadowRoot!.querySelector<HTMLImageElement>(".summary-icon img")!.getAttribute("src")).toBe("https://example.com/quiz.svg")
      expect(drawer.shadowRoot!.querySelector(".element-count")).toBeNull()
      expect(drawer.querySelector(".widget-action")).not.toBeNull()
    }
    const options = vi.fn(), actions = vi.fn(), attributes = vi.fn()
    toolbox.addEventListener("widget-option-change", options)
    toolbox.addEventListener("widget-action", actions)
    toolbox.addEventListener("element-attribute-change", attributes)
    const checkbox = drawers[1].querySelector<HTMLInputElement>('input[type="checkbox"]')!
    checkbox.checked = true
    checkbox.dispatchEvent(new Event("change", {bubbles: true}))
    const button = drawers[1].querySelector<RibbonButton>(".widget-action")!
    await button.updateComplete
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    drawers[1].querySelector("element-attribute-editor")!.dispatchEvent(new CustomEvent("element-attribute-change", {detail: {name: "lang", value: "de"}, bubbles: true, composed: true}))
    const selectionType = {localName: "course-quiz", namespaceURI: "http://www.w3.org/1999/xhtml", id: "second"}
    expect(options.mock.calls[0][0].detail.selectionType).toEqual(selectionType)
    expect(actions.mock.calls[0][0].detail).toEqual({name: "reset", selectionType})
    expect(attributes.mock.calls[0][0].detail.selectionType).toEqual(selectionType)
  })

  it("omits list items, table internals, summary, and foreign subelements while retaining their main containers", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    const selectedType = (localName: string, namespaceURI = "http://www.w3.org/1999/xhtml"): SelectedElementTypeState => ({
      element: {...selectedElement(localName), namespaceURI},
      style: {...styleState(localName), target: {localName, namespaceURI}},
      count: 1, styleProperties: [], configuredWidgetOptions: [],
    })
    toolbox.selectedElementTypes = [
      ...["ul", "ol", "li", "dt", "dd", "table", "td", "th", "caption", "colgroup", "col", "thead", "tbody", "tfoot", "tr", "details", "summary", "figure", "figcaption"].map(name => selectedType(name)),
      ...["math", "mrow", "mi", "mo", "mfrac"].map(name => selectedType(name, "http://www.w3.org/1998/Math/MathML")),
      ...["svg", "g", "path", "circle", "text"].map(name => selectedType(name, "http://www.w3.org/2000/svg")),
    ]
    document.body.append(toolbox)
    await toolbox.updateComplete
    expect(Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>("[data-specialized]"), drawer => drawer.dataset.specialized))
      .toEqual(["ul", "table", "td", "th", "details", "math", "svg"])
    toolbox.selectedElementTypes = []
    toolbox.elementAttributes = selectedElement("figcaption")
    toolbox.elementStyle = styleState("figcaption")
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('[data-specialized="figcaption"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Attributes"]')).toBeNull()
  })

  it("omits drawers for every mark and its aliases while retaining containing elements", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.selectedElementTypes = [...markNames, "strong", "em", "p"].map(localName => ({
      element: selectedElement(localName), style: styleState(localName), count: 1,
      styleProperties: [], configuredWidgetOptions: [],
    }))
    document.body.append(toolbox)
    await toolbox.updateComplete
    expect(Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>("[data-specialized]"), drawer => drawer.dataset.specialized)).toEqual(["p"])
    expect(toolbox.shadowRoot!.querySelector('[data-tool="Edit"]')?.getAttribute("aria-label")).not.toBe("Edit Selection")

    toolbox.selectedElementTypes = []
    for(const localName of ["span", "a", "strong", "em", "ruby"]) {
      toolbox.elementAttributes = selectedElement(localName)
      toolbox.elementStyle = styleState(localName)
      await toolbox.updateComplete
      expect(toolbox.shadowRoot!.querySelector("[data-specialized]")).toBeNull()
      expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Attributes"]')).toBeNull()
      expect(toolbox.shadowRoot!.querySelector('[data-tool="Edit"]')?.getAttribute("aria-label")).toBe("Edit")
    }
  })

  it("offers collapsible Options for Language even without other advanced controls", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.selectedElementTypes = ["p", "audio", "iframe", "plain-element"].map(localName => ({
      element: selectedElement(localName), style: styleState(localName), count: 1,
      styleProperties: [], configuredWidgetOptions: [],
    }))
    document.body.append(toolbox)
    await toolbox.updateComplete
    const drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("[data-specialized]"))
    await Promise.all(drawers.map(drawer => drawer.updateComplete))
    expect(drawers.every(drawer => drawer.expandable)).toBe(true)
    expect(drawers.every(drawer => drawer.querySelector('[slot="more"] element-attribute-editor'))).toBe(true)
    expect(drawers.every(drawer => !drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.hidden)).toBe(true)
  })

  it("scopes widget option changes and resets to the selected widget type", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.selectedElementTypes = [{
      element: {...selectedElement("course-quiz"), path: null}, style: styleState("course-quiz"), count: 2,
      styleProperties: [], configuredWidgetOptions: ["enabled"],
      widget: {path: [0], localName: "course-quiz", actions: [], options: [
        {name: "enabled", label: "Enabled", type: "boolean", attribute: "enabled", value: null},
      ]},
    }]
    document.body.append(toolbox)
    await toolbox.updateComplete
    const changes = vi.fn()
    toolbox.addEventListener("widget-option-change", changes)
    const input = toolbox.shadowRoot!.querySelector<HTMLInputElement>('[data-specialized="course-quiz"] .widget-option-checkbox input[type="checkbox"]')!
    input.checked = true
    input.dispatchEvent(new Event("change", {bubbles: true}))
    expect(changes.mock.calls[0][0].detail).toEqual({name: "enabled", value: true,
      selectionType: {localName: "course-quiz", namespaceURI: "http://www.w3.org/1999/xhtml"}})
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[data-specialized] .style-reset')!.click()
    expect(changes.mock.calls[1][0].detail.value).toBeNull()
  })

  it.each([
    "p", "h2", "ul", "img", "video", "audio", "iframe", "details", "table", "math", "svg",
  ])("renders a compact %s profile without a preset gallery", async localName => {
    const toolbox = await mountElement(localName)
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>(`ribbon-drawer[data-specialized="${localName}"]`)!
    expect(drawer).not.toBeNull()
    const primary = drawer.querySelector<ElementStyleEditor>('element-style-editor:not([slot="more"])')!
    expect(primary).not.toBeNull()
    expect(primary.shadowRoot!.querySelectorAll(".compact-row").length).toBeLessThanOrEqual(4)
    expect(drawer.querySelector('element-style-editor[show-presets]')).toBeNull()
    expect(drawer.querySelector(".specialized-gallery, .widget-preset-gallery")).toBeNull()
    expect(drawer.querySelector('ribbon-drawer[label="Style"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Attributes"]')).toBeNull()
  })

  it("uses button choices for compact CSS enums and shared comboboxes for complex values", async () => {
    const math = await mountElement("math")
    math.elementStyle = {...math.elementStyle, inline: {"math-style": {value: "compact", priority: "important"}}}
    await math.updateComplete
    await Promise.all(Array.from(math.shadowRoot!.querySelectorAll<ElementStyleEditor>("element-style-editor"), editor => editor.updateComplete))
    const mathPrimary = math.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="math"]')!
      .querySelector<ElementStyleEditor>('element-style-editor:not([slot="more"])')!
    const mathStyle = mathPrimary.shadowRoot!.querySelector<HTMLElement>('[data-property="math-style"]')!
    expect(mathStyle.querySelector("select")).toBeNull()
    expect(mathStyle.querySelectorAll('button[aria-pressed]')).toHaveLength(2)
    const styleChanges = vi.fn()
    math.addEventListener("element-style-change", styleChanges)
    mathStyle.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')!.click()
    expect(styleChanges.mock.calls[0][0].detail).toMatchObject({property: "math-style", mutation: {value: "normal", priority: "important"}})

    const paragraph = await mountElement("p")
    const paragraphPrimary = paragraph.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="p"]')!
      .querySelector<ElementStyleEditor>('element-style-editor:not([slot="more"])')!
    const alignment = paragraphPrimary.shadowRoot!.querySelector<HTMLElement>('[data-property="text-align"]')!
    expect(Array.from(alignment.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'), button => button.getAttribute("aria-label")))
      .toEqual(["Left", "Center", "Right", "Justify"])
    paragraph.elementStyle = {...paragraph.elementStyle, inline: {"text-align": {value: "start", priority: ""}}, computed: {direction: "rtl"}}
    await paragraph.updateComplete
    await paragraphPrimary.updateComplete
    expect(alignment.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.getAttribute("aria-label")).toBe("Right")

    const paragraphOptions = paragraph.shadowRoot!.querySelector('.specialized-options')!
      .querySelector<ElementStyleEditor>('element-style-editor')!
    const lastLine = paragraphOptions.shadowRoot!.querySelector<HTMLElement>('[data-property="text-align-last"] .specialized-choice-group')!
    expect(lastLine.style.getPropertyValue("--choice-columns")).toBe("3")
    const lastLineButtons = lastLine.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')
    expect(lastLineButtons).toHaveLength(5)
    expect(lastLineButtons[2].hasAttribute("data-top-right")).toBe(true)
    expect(lastLineButtons[3].hasAttribute("data-bottom-left")).toBe(true)
    expect(lastLine.children).toHaveLength(5)
    expect(getComputedStyle(lastLine).backgroundColor).toBe(getComputedStyle(lastLineButtons[1]).backgroundColor)
    expect(getComputedStyle(lastLineButtons[1]).boxShadow).toBe("0 0 0 1px #c5ccd5")

    const cell = await mountElement("td")
    const cellPrimary = cell.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="td"]')!
      .querySelector<ElementStyleEditor>('element-style-editor:not([slot="more"])')!
    const vertical = cellPrimary.shadowRoot!.querySelector<HTMLElement>('[data-property="vertical-align"]')!
    const verticalGroup = vertical.querySelector<HTMLElement>(".specialized-choice-group")!
    expect(verticalGroup.querySelectorAll('button[aria-pressed]')).toHaveLength(8)
    expect(verticalGroup.style.getPropertyValue("--choice-columns")).toBe("4")

    const graphic = await mountElement("svg")
    const advanced = graphic.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="svg"]')!
      .querySelector<HTMLElement>(".specialized-options")!
    const paintOrder = advanced.querySelectorAll<ElementStyleEditor>("element-style-editor")[0]!
      .shadowRoot!.querySelector<HTMLElement>('[data-property="paint-order"]')!
    const paintOrderCombo = paintOrder.querySelector<HTMLElement>("style-combobox")!
    expect(paintOrderCombo).not.toBeNull()
    expect((paintOrderCombo as HTMLElement & {editable: boolean}).editable).toBe(false)
  })

  it("shows compact fields first and places Language and extra CSS controls under Options", async () => {
    const toolbox = await mountElement("p", {id: "intro", class: "lead", title: "Intro", style: "color:red"}, {"text-indent": "1em"})
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="p"]')!
    const primary = drawer.querySelector<ElementStyleEditor>('element-style-editor:not([slot="more"])')!
    expect(primary.shadowRoot!.querySelectorAll(".compact-row").length).toBeLessThanOrEqual(4)
    expect(primary.shadowRoot!.querySelector('[data-property="text-indent"]')).toBeNull()
    const options = drawer.querySelector<HTMLElement>(".specialized-options")!
    expect(options.hasAttribute("popover")).toBe(false)
    expect(drawer.expandable).toBe(true)
    expect(options.slot).toBe("more")
    expect(options.querySelector("element-style-editor")).not.toBeNull()
    const advancedEditor = options.querySelector<ElementStyleEditor>("element-style-editor")!
    expect(advancedEditor.shadowRoot!.querySelector('[data-property="text-align"]')).toBeNull()
    expect(advancedEditor.shadowRoot!.querySelector('[data-property="text-indent"]')).not.toBeNull()
    const attributeEditor = drawer.querySelector<ElementAttributeEditor>("element-attribute-editor")!
    expect(attributeEditor).not.toBeNull()
    expect(attributeEditor.hasAttribute("expanded")).toBe(true)
    expect(attributeEditor.closest("[slot=more]")).toBe(options)
    expect(attributeEditor.shadowRoot!.querySelector("dialog")).toBeNull()
    expect(attributeEditor.shadowRoot!.querySelector(".language-row style-combobox")).not.toBeNull()
    expect(attributeEditor.shadowRoot!.querySelector('[aria-label="Other attributes"]')).toBeNull()
    expect(drawer.advancedCount).toBe(1)
    expect(drawer.shadowRoot!.querySelector(".advanced-count")?.textContent).toBe("1")
    expect(drawer.shadowRoot!.querySelector(".drawer-toggle-label")?.textContent).toContain("Options")
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Attributes"]')).toBeNull()
  })

  it.each(["p", "h2", "img", "table", "course-quiz", "unfamiliar-element"])("keeps Language behind advanced options for %s", async localName => {
    const toolbox = await mountElement(localName, {lang: "de"})
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>(`ribbon-drawer[data-specialized="${localName}"]`)
      ?? toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Attributes"]')!
    const attributes = drawer.querySelector<ElementAttributeEditor>("element-attribute-editor")!
    expect(attributes.closest('[slot="more"]')).not.toBeNull()
    expect(drawer.expandable).toBe(true)
    expect(drawer.advancedCount).toBeGreaterThanOrEqual(1)
    await drawer.updateComplete
    const toggle = drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    toggle.click()
    await drawer.updateComplete
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    const change = vi.fn()
    toolbox.addEventListener("element-attribute-change", change)
    attributes.shadowRoot!.querySelector("style-combobox")!.dispatchEvent(new CustomEvent("combobox-change", {detail: {value: "fr"}}))
    expect(change.mock.calls[0][0].detail).toMatchObject({localName, name: "lang", value: "fr"})
  })

  it("resets all specialized style options while preserving universal styles and authored attributes", async () => {
    const toolbox = await mountElement("p", {id: "intro"}, {"text-align": "center", "text-indent": "1em", color: "red", padding: "8px"})
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="p"]')!
    const reset = drawer.querySelector<HTMLButtonElement>('.style-reset')!
    const changes = vi.fn()
    const attributeChanges = vi.fn()
    toolbox.addEventListener("element-style-change", changes)
    toolbox.addEventListener("element-attribute-change", attributeChanges)
    expect(reset.slot).toBe("heading-action")
    expect(reset.disabled).toBe(false)
    expect(drawer.advancedCount).toBe(1)
    reset.click()
    expect(changes.mock.calls[0][0].detail).toEqual({styles: {"text-align": null, "text-indent": null}})
    expect(attributeChanges).not.toHaveBeenCalled()
    toolbox.elementStyle = styleState("p", {color: "red"})
    await toolbox.updateComplete
    expect(reset.disabled).toBe(true)
  })

  it("puts clear actions beside field labels only for authored values", async () => {
    const toolbox = await mountElement("p", {}, {"text-align": "center", "line-height": "1.5"})
    const editor = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="p"]')!
      .querySelector<ElementStyleEditor>("element-style-editor")!
    for(const name of ["text-align", "line-height"]) {
      const row = editor.shadowRoot!.querySelector(`[data-property="${name}"]`)!
      expect(row.querySelector(".field-label .property-action")).not.toBeNull()
      expect(row.querySelector(".compact-controls .property-action")).toBeNull()
    }
    const changes = vi.fn()
    toolbox.addEventListener("element-style-change", changes)
    editor.shadowRoot!.querySelector<HTMLButtonElement>('[data-property="text-align"] .property-action')!.click()
    expect(changes.mock.calls[0][0].detail).toMatchObject({property: "text-align", mutation: null})
    toolbox.elementStyle = {...styleState("p"), computed: {"text-align": "center", "line-height": "1.5"}}
    await toolbox.updateComplete
    await editor.updateComplete
    expect(Array.from(editor.shadowRoot!.querySelectorAll<HTMLButtonElement>(".property-action"))
      .every(button => button.style.visibility === "hidden")).toBe(true)
  })

  it("keeps specialized controls inert during a history preview", async () => {
    const toolbox = await mountElement("math")
    toolbox.historyState = {...toolbox.historyState, preview: {
      checkpointId: "older", isCurrent: false, added: 0, removed: 0, modified: 1,
    }}
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="math"]')!
    expect(drawer.inert).toBe(true)
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane-content")!.inert).toBe(true)
  })

  it("groups short widget choices and uses shared comboboxes for long or multiple choices", async () => {
    const toolbox = await mountElement("demo-widget")
    toolbox.widgetOptions = {
      path: [0], localName: "demo-widget", actions: [], options: [
        {name: "density", type: "select", label: "Density", attribute: "density", value: "comfortable", choices: [
          {value: "comfortable", label: "Comfortable"}, {value: "compact", label: "Compact"},
        ]},
        {name: "theme", type: "select", label: "Theme", attribute: "theme", value: "a", choices: Array.from({length: 9}, (_, index) => ({value: String.fromCharCode(97 + index), label: `Choice ${index + 1}`}))},
        {name: "tags", type: "select", label: "Tags", attribute: "tags", value: ["a"], multiple: true, choices: [
          {value: "a", label: "First"}, {value: "b", label: "Second"},
        ]},
      ],
    } satisfies WidgetOptionsState
    await toolbox.updateComplete
    const primary = toolbox.shadowRoot!.querySelector<HTMLElement>(".specialized-widget-primary")!
    expect(primary.querySelector('[aria-labelledby="widget-label-density"]')?.querySelectorAll("button")).toHaveLength(2)
    const combos = Array.from(primary.querySelectorAll<HTMLElement>("style-combobox")) as Array<HTMLElement & {multiple: boolean, values: readonly string[]}>
    expect(combos).toHaveLength(2)
    expect(combos.map(combo => combo.multiple)).toEqual([false, true])
    expect(combos[1].values).toEqual(["a"])
    const changes = vi.fn()
    toolbox.addEventListener("widget-option-change", changes)
    primary.querySelector<HTMLButtonElement>('[aria-labelledby="widget-label-density"] button[aria-pressed="true"]')!.click()
    expect(changes.mock.calls[0][0].detail).toEqual({name: "density", value: "comfortable"})
  })
})


it("shows the single-lane explanation when clicking left placement and only badges a selected left float", async () => {
  const toolbox = await mountElement("img", {}, {float: "right"})
  toolbox.elementStyle = {...toolbox.elementStyle, context: {...toolbox.elementStyle.context, floatLeftForcedRight: true}}
  await toolbox.updateComplete
  const button = toolbox.shadowRoot!.querySelector<HTMLButtonElement>('.float-button-group [aria-label="Float left"]')!
  const info = button.querySelector<import("./float-info").FloatInfo>("float-info")!
  await info.updateComplete
  expect(info.badge).toBe(false)
  button.click()
  await info.updateComplete
  expect(info.open).toBe(true)
  expect(info.shadowRoot!.querySelector('[role="tooltip"]')!.textContent).toBe("Element will be placed left on wider screens.")
  document.dispatchEvent(new Event("pointerdown"))
  expect(info.open).toBe(false)
  toolbox.elementStyle = {...toolbox.elementStyle, target: {...toolbox.elementStyle.target!, float: "far-left"}}
  await toolbox.updateComplete
  expect(info.badge).toBe(true)
  toolbox.elementStyle = {...toolbox.elementStyle, context: {...toolbox.elementStyle.context, floatLeftForcedRight: false}}
  await toolbox.updateComplete
  expect(button.querySelector("float-info")).toBeNull()
})


it("explains right placement without side lanes and shows it briefly on click", async () => {
  const toolbox = await mountElement("custom-widget", {}, {float: "right"})
  toolbox.elementStyle = {...toolbox.elementStyle, context: {...toolbox.elementStyle.context, floatRightInFlow: true}}
  await toolbox.updateComplete
  const button = toolbox.shadowRoot!.querySelector<HTMLButtonElement>('.float-button-group [aria-label="Float right"]')!
  const info = button.querySelector<import("./float-info").FloatInfo>("float-info")!
  await info.updateComplete
  expect(info.badge).toBe(true)
  expect(info.side).toBe("right")
  expect(info.shadowRoot!.querySelector('[role="tooltip"]')!.textContent).toBe("Element will be placed right on wider screens.")
  button.click()
  await info.updateComplete
  expect(info.open).toBe(true)
  document.dispatchEvent(new Event("keydown"))
  expect(info.open).toBe(false)
  toolbox.elementStyle = {...toolbox.elementStyle, context: {...toolbox.elementStyle.context, floatRightInFlow: false}}
  await toolbox.updateComplete
  expect(button.querySelector("float-info")).toBeNull()
})
