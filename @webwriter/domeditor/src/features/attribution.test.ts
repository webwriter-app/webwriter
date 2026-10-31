// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import type {Window as TestWindow} from "happy-dom"
import {DOMEditor} from "../domeditor"
import {SharedDOMDoc} from "../domdoc"
import {$, cloneWithoutEditorMarkers} from "../utility"
import {attributionAttributes, mountAttributionReader, type AttributionController} from "../attribution.js"
import {creativeCommonsLicenses} from "../document-head"
import type {AttributionLicensePicker} from "../components/attribution-license-picker"

let editor: DOMEditor | undefined
let reader: AttributionController | null
const ui = () => document.body.shadowRoot!.querySelector<HTMLElement>(".◆attribution-ui")!
const button = () => ui().querySelector<HTMLButtonElement>(".copyright")!
const popup = () => ui().querySelector<HTMLElement>(".popup")!
const input = (key: string) => ui().querySelector<HTMLInputElement>(`input[name="${key}"]`)!
const licensePicker = () => ui().querySelector<AttributionLicensePicker>("attribution-license-picker")!
const creditType = (type: string) => ui().querySelector<HTMLButtonElement>(`.credit-types button[value="${type}"]`)!
const notes = () => Array.from(ui().querySelectorAll<HTMLElement>(".attribution-note"))
const submit = () => ui().querySelector("form")!.dispatchEvent(new Event("submit", {cancelable: true, bubbles: true}))
const hover = (element: Element) => element.dispatchEvent(new PointerEvent("pointerover", {bubbles: true, composed: true}))
const select = (element: Element) => { $.selectElement(element); document.dispatchEvent(new Event("selectionchange")) }
const settle = () => new Promise(resolve => setTimeout(resolve, 40))
const bounds = (element: Element, left = 16) => vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
  left, top: 50, right: 300, bottom: 150, width: 300 - left, height: 100,
} as DOMRect)
const start = () => { editor = new DOMEditor(); return document.querySelector("p")! }

beforeEach(() => {
  document.designMode = "off"
  document.head.replaceChildren()
  document.body.innerHTML = '<p class="authored"><em>Hello</em><!--keep--></p><p>Other</p>'
  document.body.shadowRoot?.replaceChildren(document.createElement("slot"))
})
afterEach(() => {
  reader?.destroy(); reader = null
  editor?.destroy(); editor = undefined
  document.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
  document.body.shadowRoot?.replaceChildren(document.createElement("slot"))
  vi.restoreAllMocks()
})

describe("element attribution editing", () => {
  it("defaults to attribution and saves the selected type through undo, redo and reopening", async () => {
    const element = start()
    const child = element.firstChild
    bounds(element); select(element); button().click()
    expect(creditType("attribution").getAttribute("aria-pressed")).toBe("true")
    expect(creditType("copyright").getAttribute("aria-pressed")).toBe("false")
    input("name").value = "Ada"
    submit()
    expect(notes()[0].textContent).toBe("Ada")
    notes()[0].click()
    creditType("copyright").click()
    expect(creditType("copyright").getAttribute("aria-pressed")).toBe("true")
    expect(element.hasAttribute(attributionAttributes.type)).toBe(false)
    submit()
    expect(element.getAttribute(attributionAttributes.type)).toBe("copyright")
    expect(notes()[0].textContent).toBe("© Ada")
    expect(editor!.toHTML(true)).toContain('data-ww-attribution-type="copyright"')
    expect(editor!.doc.body.toString()).toContain('data-ww-attribution-type="copyright"')
    notes()[0].click()
    expect(creditType("copyright").getAttribute("aria-pressed")).toBe("true")
    creditType("attribution").click()
    submit()
    expect(notes()[0].textContent).toBe("Ada")
    expect(element.getAttribute(attributionAttributes.type)).toBe("attribution")
    expect(element.firstChild).toBe(child)
    editor!.doc.undo()
    await settle()
    expect(notes()[0].textContent).toBe("© Ada")
    editor!.doc.redo()
    await settle()
    expect(notes()[0].textContent).toBe("Ada")
  })

  it("cancels type changes and rejects a concurrent change to the same field", () => {
    const element = start()
    element.setAttribute(attributionAttributes.name, "Ada")
    bounds(element); select(element); notes()[0].click()
    creditType("copyright").click()
    ui().querySelector<HTMLButtonElement>(".close")!.click()
    expect(element.hasAttribute(attributionAttributes.type)).toBe(false)
    notes()[0].click()
    expect(creditType("attribution").getAttribute("aria-pressed")).toBe("true")
    creditType("copyright").click()
    element.setAttribute(attributionAttributes.type, "attribution")
    submit()
    expect(popup().hidden).toBe(false)
    expect(ui().querySelector<HTMLElement>(".error")!.hidden).toBe(false)
    expect(element.getAttribute(attributionAttributes.type)).toBe("attribution")
  })

  it("applies an explicit attribution choice to selections with mixed credit types", () => {
    start()
    const elements = Array.from(document.querySelectorAll("p"))
    elements.forEach(element => { bounds(element); element.setAttribute(attributionAttributes.name, "Ada") })
    elements[0].setAttribute(attributionAttributes.type, "copyright")
    document.getSelection()!.setBaseAndExtent(elements[0].firstChild!, 0, elements[1].firstChild!, 3)
    editor!.features.attribution.actions.openAttribution({type: "openAttribution"})
    creditType("attribution").click()
    submit()
    expect(elements.map(element => element.getAttribute(attributionAttributes.type))).toEqual(["attribution", "attribution"])
    expect(notes().every(note => !note.textContent!.includes("©"))).toBe(true)
  })

  it.each(["click", "Enter"])("deletes all metadata with %s without changing content and restores it with one undo", activation => {
    const element = start()
    const original = element.innerHTML
    const metadata = {name: "Ada", year: "2026", license: "CC-BY-4.0", contact: "mailto:ada@example.com", type: "copyright"}
    for(const [key, value] of Object.entries(metadata)) element.setAttribute(attributionAttributes[key as keyof typeof metadata], value)
    editor!.doc.syncFromDOM(); editor!.doc.stopCapturing()
    bounds(element); select(element); notes()[0].click()
    input("year").value = "invalid unsaved value"
    const remove = ui().querySelector<HTMLButtonElement>(".delete")!
    if(activation === "Enter") remove.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    else remove.click()
    expect(popup().hidden).toBe(true)
    for(const name of Object.values(attributionAttributes)) expect(element.hasAttribute(name)).toBe(false)
    expect(element.innerHTML).toBe(original)
    editor!.doc.syncFromDOM()
    expect(editor!.toHTML(true)).not.toMatch(/data-ww-attribution|data-ww-license|◆/)
    editor!.doc.undo()
    for(const [key, value] of Object.entries(metadata)) expect(document.querySelector("p")!.getAttribute(attributionAttributes[key as keyof typeof metadata])).toBe(value)
    editor!.doc.redo()
    for(const name of Object.values(attributionAttributes)) expect(document.querySelector("p")!.hasAttribute(name)).toBe(false)
  })

  it.each(["document", "canvas", "slides"] as const)("applies toolbox attribution to multiple %s elements in one undo item", mode => {
    start()
    if(mode !== "document") editor!.setDocumentLayout(mode, "document")
    const elements = Array.from(document.querySelectorAll("p"))
    elements[0].setAttribute(attributionAttributes.name, "First")
    elements[1].setAttribute(attributionAttributes.name, "Second")
    editor!.doc.syncFromDOM(); editor!.doc.stopCapturing()
    const selectAll = (elements: Element[]) => mode === "document"
      ? document.getSelection()!.setBaseAndExtent(elements[0].firstChild!, 0, elements[1].firstChild!, 3)
      : $.selectElements(elements)
    selectAll(elements)
    expect(editor!.features.attribution.actions.openAttribution({type: "openAttribution"})).toBe(true)
    expect(input("name").value).toBe("")
    input("license").value = "CC-BY-4.0"
    submit()
    expect(elements.map(element => element.getAttribute(attributionAttributes.license))).toEqual(["CC-BY-4.0", "CC-BY-4.0"])
    expect(elements.map(element => element.getAttribute(attributionAttributes.name))).toEqual(["First", "Second"])
    editor!.doc.syncFromDOM()
    editor!.doc.undo()
    expect(Array.from(document.querySelectorAll("p"), element => element.hasAttribute(attributionAttributes.license))).toEqual([false, false])
    editor!.doc.redo()
    const restored = Array.from(document.querySelectorAll("p"))
    selectAll(restored)
    editor!.features.attribution.actions.openAttribution({type: "openAttribution"})
    ui().querySelector<HTMLButtonElement>(".delete")!.click()
    expect(restored.every(element => Object.values(attributionAttributes).every(name => !element.hasAttribute(name)))).toBe(true)
    if(mode !== "document") editor!.setDocumentLayout("document", mode)
  })

  it.each(["conflict", "replaced", "locked"])("refuses attribution deletion after a %s change", change => {
    const element = start()
    element.setAttribute(attributionAttributes.name, "Ada")
    bounds(element); select(element); notes()[0].click()
    if(change === "conflict") element.setAttribute(attributionAttributes.name, "Remote")
    if(change === "replaced") element.replaceWith(element.cloneNode(true))
    if(change === "locked") editor!.lockEditing("delete-test")
    ui().querySelector<HTMLButtonElement>(".delete")!.click()
    expect(document.querySelector("p")!.getAttribute(attributionAttributes.name)).toBe(change === "conflict" ? "Remote" : "Ada")
    if(change === "locked") editor!.unlockEditing("delete-test")
  })

  it("rejects a conflicting batch edit before updating any element", () => {
    start()
    const elements = Array.from(document.querySelectorAll("p"))
    for(const element of elements) element.setAttribute(attributionAttributes.name, "Original")
    document.getSelection()!.setBaseAndExtent(elements[0].firstChild!, 0, elements[1].firstChild!, 3)
    editor!.features.attribution.actions.openAttribution({type: "openAttribution"})
    elements[1].setAttribute(attributionAttributes.name, "Remote")
    input("name").value = "Local"
    submit()
    expect(elements.map(element => element.getAttribute(attributionAttributes.name))).toEqual(["Original", "Remote"])
    expect(ui().querySelector<HTMLElement>(".error")!.hidden).toBe(false)
  })

  it.each([false, true])("cycles through dialog controls with Tab and Shift+Tab (capture: %s)", async captured => {
    const element = start()
    element.setAttribute(attributionAttributes.name, "Ada")
    bounds(element)
    if(captured) editor!.features.selection.captureElement(element)
    else select(element)
    document.dispatchEvent(new Event("selectionchange"))
    notes()[0].click()
    const picker = licensePicker()
    await picker.updateComplete
    const controls = [input("name"), input("year"), picker.shadowRoot!.querySelector<HTMLInputElement>("input")!,
      input("contact"), ui().querySelector<HTMLButtonElement>(".delete")!, ui().querySelector<HTMLButtonElement>(".save")!, ...Array.from(ui().querySelectorAll<HTMLButtonElement>(".credit-types button")), ui().querySelector<HTMLButtonElement>(".close")!]
    const checkFocus = (control: HTMLElement) => expect((control.getRootNode() as ShadowRoot).activeElement).toBe(control)
    checkFocus(controls[0])
    for(const shiftKey of [false, true]) {
      for(let step = 0; step < controls.length; step++) {
        const index = shiftKey ? (controls.length - step) % controls.length : step
        const event = new KeyboardEvent("keydown", {key: "Tab", shiftKey, bubbles: true, composed: true, cancelable: true})
        controls[index].dispatchEvent(event)
        expect(event.defaultPrevented).toBe(true)
        checkFocus(controls[(index + (shiftKey ? -1 : 1) + controls.length) % controls.length])
        expect(popup().hidden).toBe(false)
      }
    }
    picker.focus()
    picker.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await picker.updateComplete
    controls[2].dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", bubbles: true, composed: true, cancelable: true}))
    await picker.updateComplete
    checkFocus(input("contact"))
    expect(picker.shadowRoot!.querySelector(".listbox")).toBeNull()
    expect(element.getAttribute(attributionAttributes.name)).toBe("Ada")
    expect(document.body.classList.contains("◆node-selection-active")).toBe(true)
  })

  it("offers only current CC licenses with separate, wrapping component definitions", async () => {
    const element = start()
    bounds(element); select(element); button().click()
    const picker = licensePicker()
    await picker.updateComplete
    expect(picker.editable).toBe(false)
    expect(picker.shadowRoot!.querySelector("input")!.readOnly).toBe(true)
    picker.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await picker.updateComplete
    const choices = Array.from(picker.shadowRoot!.querySelectorAll<HTMLButtonElement>(".option"))
    const licenses = choices.slice(0, -1)
    expect(licenses.map(choice => choice.querySelector(".option-code")!.textContent)).toEqual(creativeCommonsLicenses.map(license => license.code))
    expect(licenses.map(choice => choice.querySelector(".option-name")!.textContent)).toEqual(creativeCommonsLicenses.map(license => license.name))
    expect(licenses.map(choice => choice.querySelector(".option-description")!.textContent)).toEqual(creativeCommonsLicenses.map(license => license.description))
    for(const choice of licenses) expect(choice.children[2].className).toBe("option-description")
    expect(picker.options.some(option => option.value === "MIT")).toBe(false)
    expect(picker.shadowRoot!.textContent).not.toContain("Noncommercial means")
    licenses[3].click()
    expect(input("license").value).toBe("CC-BY-NC-4.0")
    expect(popup().hidden).toBe(false)
    submit()
    expect(element.getAttribute(attributionAttributes.license)).toBe("CC-BY-NC-4.0")
    notes()[0].click()
    await picker.updateComplete
    expect(picker.value).toBe("CC-BY-NC-4.0")
    picker.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await picker.updateComplete
    const remove = Array.from(picker.shadowRoot!.querySelectorAll<HTMLButtonElement>(".option")).at(-1)!
    expect(remove.textContent).toContain("No license")
    expect(remove.querySelector(".option-description")!.textContent).toBe("All rights reserved")
    remove.click(); submit()
    expect(element.hasAttribute(attributionAttributes.license)).toBe(false)
    expect(ui().querySelector("datalist")).toBeNull()
  })

  it("dismisses the license choices before the form and preserves existing metadata on cancellation", async () => {
    const element = start()
    element.setAttribute(attributionAttributes.license, "MIT")
    bounds(element); select(element); notes()[0].click()
    const picker = licensePicker()
    await picker.updateComplete
    expect(picker.value).toBe("MIT")
    const field = picker.shadowRoot!.querySelector<HTMLInputElement>("input")!
    picker.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await picker.updateComplete
    field.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, composed: true, cancelable: true}))
    await picker.updateComplete
    expect(picker.shadowRoot!.querySelector(".listbox")).toBeNull()
    expect(popup().hidden).toBe(false)
    field.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, composed: true, cancelable: true}))
    expect(popup().hidden).toBe(true)
    expect(element.getAttribute(attributionAttributes.license)).toBe("MIT")
    notes()[0].click()
    await picker.updateComplete
    picker.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await picker.updateComplete
    ui().querySelector<HTMLButtonElement>(".close")!.click()
    await picker.updateComplete
    expect(picker.shadowRoot!.querySelector(".listbox")).toBeNull()
    expect(element.getAttribute(attributionAttributes.license)).toBe("MIT")
  })

  it.each([false, true])("aligns the copyright affordance at the document element's top-left corner (capture: %s)", captured => {
    const element = start()
    bounds(element)
    const original = element.innerHTML
    hover(element)
    const bridge = ui().querySelector<HTMLElement>(".bridge")!
    expect(bridge.hidden).toBe(true)
    const text = element.querySelector("em")!.firstChild!
    document.getSelection()!.setPosition(text, 1)
    document.dispatchEvent(new Event("selectionchange"))
    expect(bridge.hidden).toBe(true)
    document.getSelection()!.setBaseAndExtent(text, 0, text, 3)
    document.dispatchEvent(new Event("selectionchange"))
    expect(bridge.hidden).toBe(true)
    if(captured) editor!.features.selection.captureElement(element)
    else select(element)
    document.dispatchEvent(new Event("selectionchange"))
    expect(bridge.hidden).toBe(false)
    expect(bridge.style.left).toBe("")
    expect(bridge.style.top).toBe("")
    expect(bridge.style.width).toBe("")
    expect(bridge.style.height).toBe("")
    expect(bridge.getAttribute("part")).toContain("anchor-control-")
    const state = (document as any)[Symbol.for("webwriter.anchor-positioning")]
    expect(state.sheets.get(document).source).toContain("anchor(left) - 10px")
    expect(state.sheets.get(document).source).toContain("anchor(top) - 13px")
    expect(button().getAttribute("part")).toBe("transform-overlay-button transform-overlay-attribution")
    expect(button().querySelector("svg")!.hasAttribute("hidden")).toBe(true)
    expect(button().classList.contains("empty-attribution")).toBe(true)
    expect(document.body.querySelector("button, input, .◆attribution-ui")).toBeNull()
    expect(element.innerHTML).toBe(original)
    expect(document.body.shadowRoot!.querySelector('slot:not([name])')).toBeTruthy()

    $.selectElement(element)
    document.dispatchEvent(new Event("selectionchange"))
    button().click()
    expect(popup().hidden).toBe(false)
    expect(input("name").value).toBe("")
  })

  it.each(["pointerup", "pointercancel"] as const)("hides the copyright affordance while a drag range includes one whole element until %s", eventType => {
    const element = start()
    bounds(element)
    const original = element.innerHTML
    select(element)
    expect(button().hidden).toBe(false)

    editor!.features.selection.isInDragSelection = true
    document.dispatchEvent(new Event("selectionchange"))
    expect(button().hidden).toBe(true)
    editor!.features.attribution.refresh()
    expect(button().hidden).toBe(true)

    document.dispatchEvent(new PointerEvent(eventType, {bubbles: true}))
    expect(editor!.features.selection.isInDragSelection).toBe(false)
    expect(button().hidden).toBe(false)
    expect(element.innerHTML).toBe(original)
    expect(editor!.toHTML(true)).not.toContain("◆attribution-ui")
  })

  it("compensates the Firefox document gutter when anchoring the copyright affordance", () => {
    const element = start()
    bounds(element)
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Firefox")
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(window.innerWidth - 30)
    document.documentElement.style.scrollbarGutter = "stable both-edges"
    try {
      select(element)
      const state = (document as any)[Symbol.for("webwriter.anchor-positioning")]
      expect(state.sheets.get(document).source).toContain("anchor(left) - 25px")
    }
    finally { document.documentElement.style.removeProperty("scrollbar-gutter") }
  })

  describe.each(["canvas", "slides"] as const)("%s copyright affordance", mode => {
    it.each([false, true])("uses the live transform overlay and returns to document positioning (capture: %s)", async captured => {
      const element = start()
      expect(editor!.setDocumentLayout(mode, "document")).toBe(true)
      bounds(element)
      if(captured) editor!.features.selection.captureElement(element)
      else $.selectElement(element)
      editor!.features.selection.processSelection()
      document.dispatchEvent(new Event("selectionchange"))
      await settle()
      const control = editor!.appendix.querySelector<HTMLButtonElement>(".copyright")!
      expect(control.parentElement).toBe(editor!.features.transformation.overlay)
      expect(control.getAttribute("part")).toContain("transform-overlay-attribution-freeform")
      expect(control.hidden).toBe(false)
      control.click()
      expect(popup().hidden).toBe(false)
      ui().querySelector<HTMLButtonElement>(".close")!.click()

      expect(editor!.setDocumentLayout("document", mode)).toBe(true)
      $.selectElement(element)
      editor!.features.selection.processSelection()
      document.dispatchEvent(new Event("selectionchange"))
      await settle()
      expect(control.parentElement).toBe(ui().querySelector(".bridge"))
      expect(control.getAttribute("part")).not.toContain("transform-overlay-attribution-freeform")
      expect(editor!.toHTML(true)).not.toMatch(/◆|transform-overlay|copyright/)
      editor!.features.attribution.disable()
      expect(control.isConnected).toBe(false)
    })

    it("keeps saved metadata on its content element through reconciliation and undo", async () => {
      const element = start()
      expect(editor!.setDocumentLayout(mode, "document")).toBe(true)
      bounds(element)
      $.selectElement(element)
      editor!.features.selection.processSelection()
      document.dispatchEvent(new Event("selectionchange"))
      await settle()
      editor!.doc.syncFromDOM()
      editor!.doc.stopCapturing()
      editor!.appendix.querySelector<HTMLButtonElement>(".copyright")!.click()
      input("name").value = "Ada"
      submit()
      editor!.doc.syncFromDOM()
      expect(element.getAttribute(attributionAttributes.name)).toBe("Ada")
      expect(element.parentElement!.hasAttribute(attributionAttributes.name)).toBe(false)
      editor!.doc.undo()
      expect(document.querySelector("p")!.hasAttribute(attributionAttributes.name)).toBe(false)
      editor!.doc.redo()
      expect(document.querySelector("p")!.getAttribute(attributionAttributes.name)).toBe("Ada")
      expect(editor!.setDocumentLayout("document", mode)).toBe(true)
    })
  })

  it("places the copyright affordance on the selected board column frame", async () => {
    start()
    expect(editor!.setDocumentLayout("board", "document")).toBe(true)
    const column = editor!.features.board.columns()[0]
    bounds(column)
    editor!.features.selection.selectElement(column)
    editor!.features.board.refresh()
    await settle()
    const overlay = editor!.features.board.transformOverlay(column)!
    const control = editor!.appendix.querySelector<HTMLButtonElement>(".copyright")!
    expect(control.parentElement).toBe(overlay)
    expect(control.getAttribute("part")).toContain("transform-overlay-attribution-board")
    expect(control.hidden).toBe(false)
    editor!.features.board.refresh()
    expect(control.getAttribute("aria-label")).toBe("Copyright and attribution")
    control.click()
    expect(popup().hidden).toBe(false)
    ui().querySelector<HTMLButtonElement>(".close")!.click()
    expect(editor!.setDocumentLayout("document", "board")).toBe(true)
    await settle()
    expect(control.parentElement).toBe(ui().querySelector(".bridge"))
    expect(editor!.toHTML(true)).not.toMatch(/◆|transform-overlay|copyright/)
  })

  it.each(["card", "grouped column"] as const)("edits attribution on a %s board frame", async role => {
    start()
    expect(editor!.setDocumentLayout("board", "document")).toBe(true)
    const board = editor!.features.board, column = board.columns()[0], card = board.cards(column)[0]
    if(role === "grouped column") board.setGrouping("new", column)
    const target = role === "card" ? card : column
    const other = role === "card" ? column : column.parentElement!
    bounds(target)
    other.setAttribute(attributionAttributes.name, "Other author")
    editor!.features.selection.selectElement(target)
    document.dispatchEvent(new Event("selectionchange"))
    board.refresh()
    await settle()
    const overlay = board.transformOverlay(target)!
    const control = editor!.appendix.querySelector<HTMLButtonElement>(".copyright")!
    expect(control.parentElement).toBe(overlay)
    expect(control.getAttribute("part")).toContain("transform-overlay-attribution-board")
    expect(control.hidden).toBe(false)
    editor!.doc.syncFromDOM(); editor!.doc.stopCapturing()
    control.click()
    input("name").value = "Frame author"
    submit()
    editor!.doc.syncFromDOM()
    expect(target.getAttribute(attributionAttributes.name)).toBe("Frame author")
    expect(other.getAttribute(attributionAttributes.name)).toBe("Other author")
    expect(editor!.toHTML(true)).toContain('data-ww-attribution-name="Frame author"')
    expect(editor!.doc.body.toString()).not.toMatch(/◆|transform-overlay/)
    editor!.doc.undo()
    expect(document.querySelector(role === "card" ? ".ww-board-card" : ".ww-board-column")!.hasAttribute(attributionAttributes.name)).toBe(false)
    editor!.doc.redo()
    const restored = document.querySelector(role === "card" ? ".ww-board-card" : ".ww-board-column")!
    expect(restored.getAttribute(attributionAttributes.name)).toBe("Frame author")
    for(const layout of ["document", "canvas", "slides"] as const) {
      expect(editor!.getDocumentLayoutState().conversions?.[layout]).toContain("overlapping board attributions")
      expect(editor!.setDocumentLayout(layout, "board")).toBe(false)
    }
    expect(restored.getAttribute(attributionAttributes.name)).toBe("Frame author")
    restored.removeAttribute(attributionAttributes.name)
    expect(editor!.setDocumentLayout("document", "board")).toBe(true)
  })

  it.each([false, true])("keeps native input carets visible while the element remains selected (capture: %s)", captured => {
    const element = start()
    element.setAttribute(attributionAttributes.name, "Ada")
    bounds(element)
    if(captured) editor!.features.selection.captureElement(element)
    else editor!.features.selection.selectElement(element)
    document.dispatchEvent(new Event("selectionchange"))
    notes()[0].click()
    expect(popup().hidden).toBe(false)
    expect(document.body.classList.contains("◆node-selection-active")).toBe(true)
    expect(element.classList.contains("◆element-capture-selected")).toBe(captured)
    for(const key of ["name", "year", "contact"]) {
      const field = input(key)
      field.focus()
      field.setSelectionRange(field.value.length, field.value.length)
      expect(document.body.shadowRoot!.activeElement).toBe(field)
      expect(getComputedStyle(field).caretColor).toBe("auto")
      expect(document.body.classList.contains("◆node-selection-active")).toBe(true)
    }
    expect(element.getAttribute(attributionAttributes.name)).toBe("Ada")
  })

  it("puts existing attribution to the right, stays on the selected element during hover, and follows live metadata", () => {
    const element = start()
    bounds(element)
    element.setAttribute(attributionAttributes.name, "Ada")
    select(element)
    const bridge = ui().querySelector<HTMLElement>(".bridge")!
    expect(bridge.hidden).toBe(true)
    expect(notes()[0].textContent).toBe("Ada")
    expect(button().classList.contains("empty-attribution")).toBe(false)
    hover(document.querySelectorAll("p")[1])
    notes()[0].click()
    expect(input("name").value).toBe("Ada")
    ui().querySelector<HTMLButtonElement>(".close")!.click()
    element.removeAttribute(attributionAttributes.name)
    document.dispatchEvent(new Event("selectionchange"))
    expect(bridge.style.left).toBe("")
    expect(button().classList.contains("empty-attribution")).toBe(true)
    document.getSelection()!.removeAllRanges()
    document.dispatchEvent(new Event("selectionchange"))
    hover(element)
    expect(bridge.hidden).toBe(true)
  })

  it("reserves the layout gutter for equal horizontal spacing around saved attribution", () => {
    const element = start()
    bounds(element)
    element.setAttribute(attributionAttributes.name, "Ada")
    const bridge = ui().querySelector<HTMLElement>(".bridge")!
    vi.spyOn(bridge, "getBoundingClientRect").mockReturnValue({width: 24} as DOMRect)
    select(element)
    expect(bridge.style.left).toBe("")
    expect(bridge.style.top).toBe("")
    vi.stubGlobal("innerWidth", 320)
    try {
      document.dispatchEvent(new Event("selectionchange"))
      expect(bridge.style.left).toBe("")
    }
    finally { vi.unstubAllGlobals() }
  })

  it("always shows full attribution while editing and opens its form from the vertical text", () => {
    const element = start()
    const name = "A long author name that must be shown in full"
    const contact = "https://example.com/a/complete/contact/address"
    element.setAttribute(attributionAttributes.name, name)
    element.setAttribute(attributionAttributes.year, "2026")
    element.setAttribute(attributionAttributes.license, "CC-BY-4.0")
    element.setAttribute(attributionAttributes.contact, contact)
    document.getSelection()!.removeAllRanges()
    document.dispatchEvent(new Event("selectionchange"))
    expect(notes()).toHaveLength(1)
    expect(notes()[0].textContent).toBe(`2026 ${name} CC-BY-4.0${contact}`)
    expect(notes()[0].children).toHaveLength(2)
    expect(notes()[0].getAttribute("role")).toBe("button")
    expect(ui().querySelector<HTMLElement>(".bridge")!.hidden).toBe(true)
    notes()[0].click()
    expect(popup().hidden).toBe(false)
    expect(input("name").value).toBe(name)
    expect(input("contact").value).toBe(contact)
    input("name").value = "Updated author"
    submit()
    expect(notes()[0].textContent).toContain("Updated author")
    expect(notes()[0].textContent).toContain(contact)
  })

  it("saves separate metadata attributes without rebuilding irregular content, with one undo item", async () => {
    const element = start()
    const child = element.firstChild
    bounds(element); select(element); button().click()
    input("name").value = 'Ada <Lovelace> & Co'
    input("year").value = "2026"
    input("license").value = "CC-BY-4.0"
    input("contact").value = "ada@example.com"
    ui().querySelector<HTMLButtonElement>(".save")!.click()
    expect(popup().hidden).toBe(true)
    expect(element.getAttribute(attributionAttributes.name)).toBe('Ada <Lovelace> & Co')
    expect(element.getAttribute(attributionAttributes.year)).toBe("2026")
    expect(element.getAttribute(attributionAttributes.license)).toBe("CC-BY-4.0")
    expect(element.getAttribute(attributionAttributes.contact)).toBe("mailto:ada@example.com")
    expect(element.firstChild).toBe(child)
    const serialized = editor!.toHTML(false, false)
    expect(serialized).toContain('data-ww-license="CC-BY-4.0"')
    expect(serialized).not.toContain("◆attribution-ui")
    expect(editor!.doc.body.toString()).toContain("data-ww-license")
    expect(editor!.doc.body.toString()).not.toContain("◆attribution-ui")
    editor!.doc.undo()
    expect(document.querySelector("p")!.hasAttribute(attributionAttributes.name)).toBe(false)
    editor!.doc.redo()
    expect(document.querySelector("p")!.getAttribute(attributionAttributes.name)).toBe('Ada <Lovelace> & Co')
    await settle()
  })

  it("cancels without changing content and removes fields when cleared", () => {
    const element = start()
    element.setAttribute(attributionAttributes.name, "Ada")
    bounds(element); select(element); button().click()
    input("name").value = "Cancelled"
    input("name").dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    expect(popup().hidden).toBe(true)
    expect(element.getAttribute(attributionAttributes.name)).toBe("Ada")
    button().click()
    input("name").value = ""
    input("name").dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}))
    expect(element.hasAttribute(attributionAttributes.name)).toBe(false)
  })

  it("shows a selection control without hover, preserves a website URL, and refuses locked saves", () => {
    const element = start()
    bounds(element)
    $.selectElement(element)
    document.dispatchEvent(new Event("selectionchange"))
    expect(ui().querySelector<HTMLElement>(".bridge")!.hidden).toBe(false)
    button().click()
    input("contact").value = "https://example.com/author"
    submit()
    expect(element.getAttribute(attributionAttributes.contact)).toBe("https://example.com/author")
    hover(element); button().click()
    input("name").value = "Locked"
    editor!.lockEditing("attribution-test")
    try {
      submit()
      expect(element.hasAttribute(attributionAttributes.name)).toBe(false)
    }
    finally { editor!.unlockEditing("attribution-test") }
  })

  it.each(["javascript:alert(1)", "data:text/html,hi", "ftp://example.com", "invalid", "https://example.com/a b"])("rejects unsafe or invalid contacts: %s", value => {
    const element = start()
    bounds(element); select(element); button().click()
    input("contact").value = value
    submit()
    expect(element.hasAttribute(attributionAttributes.contact)).toBe(false)
    expect(popup().hidden).toBe(false)
    expect(input("contact").validationMessage).toContain("website URL")
  })

  it("pins the opened element and rejects conflicting live edits while retaining untouched fields", () => {
    const element = start()
    bounds(element); select(element); button().click()
    input("name").value = "Ada"
    element.setAttribute(attributionAttributes.year, "2025")
    hover(document.querySelectorAll("p")[1])
    submit()
    expect(element.getAttribute(attributionAttributes.name)).toBe("Ada")
    expect(element.getAttribute(attributionAttributes.year)).toBe("2025")
    expect(document.querySelectorAll("p")[1].hasAttribute(attributionAttributes.name)).toBe(false)
    hover(element); button().click()
    input("name").value = "Local"
    element.setAttribute(attributionAttributes.name, "Remote")
    submit()
    expect(element.getAttribute(attributionAttributes.name)).toBe("Remote")
    expect(ui().querySelector<HTMLElement>(".error")!.hidden).toBe(false)
  })

  it("ignores replaced targets and removes UI and sheets when disabled", async () => {
    const element = start()
    bounds(element); select(element); button().click()
    input("name").value = "Stale"
    const replacement = element.cloneNode(true) as Element
    element.replaceWith(replacement)
    submit()
    expect(replacement.hasAttribute(attributionAttributes.name)).toBe(false)
    await settle()
    expect(popup().hidden).toBe(true)
    const sheets = [...document.body.shadowRoot!.adoptedStyleSheets]
    editor!.features.attribution.disable()
    expect(ui()).toBeNull()
    expect(document.body.shadowRoot!.adoptedStyleSheets.length).toBe(sheets.length - 1)
    expect(document.body.innerHTML).not.toContain("attribution")
    hover(replacement)
    expect(ui()).toBeNull()
  })

  it("targets a widget host and leaves its authored light and shadow children alone", () => {
    start()
    const widget = document.createElement("attribution-widget")
    widget.innerHTML = "<p>Light content</p>"
    const shadow = widget.attachShadow({mode: "open"})
    shadow.innerHTML = "<button>Widget control</button>"
    document.body.append(widget)
    bounds(widget); editor!.features.selection.captureElement(widget); document.dispatchEvent(new Event("selectionchange")); button().click()
    input("name").value = "Widget author"
    submit()
    expect(widget.getAttribute(attributionAttributes.name)).toBe("Widget author")
    expect(widget.querySelector("p")!.attributes.length).toBe(0)
    expect(shadow.innerHTML).toBe("<button>Widget control</button>")
  })

  it("edits content inside a document template according to its public contract", () => {
    document.body.innerHTML = '<attribution-template role="document"><section><p>Nested</p></section></attribution-template>'
    editor = new DOMEditor()
    const element = document.querySelector("section")!
    bounds(element); editor!.features.selection.selectSectionElement(element)
    document.dispatchEvent(new Event("selectionchange")); button().click()
    input("name").value = "Section author"
    submit()
    expect(element.getAttribute(attributionAttributes.name)).toBe("Section author")
    select(element.querySelector("p")!)
    expect(ui().querySelector<HTMLElement>(".bridge")!.hidden).toBe(true)
    expect(document.querySelector("attribution-template")!.hasAttribute(attributionAttributes.name)).toBe(false)
  })

  it("receives attributes from collaboration and shows their current values", async () => {
    start()
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(editor!.doc.doc))
    const owner = document.implementation.createHTMLDocument()
    const peer = new SharedDOMDoc(undefined, undefined, [], ["◆"], {root: owner.body, ydoc, connect: false})
    try {
      owner.querySelector("p")!.setAttribute(attributionAttributes.name, "Remote author")
      peer.syncFromDOM()
      Y.applyUpdate(editor!.doc.doc, Y.encodeStateAsUpdate(ydoc), "remote-attribution")
      await vi.waitFor(() => expect(notes()).toHaveLength(1))
      expect(notes()[0].textContent).toBe("Remote author")
      const element = document.querySelector("p")!
      bounds(element); notes()[0].click()
      expect(input("name").value).toBe("Remote author")
      ui().querySelector<HTMLButtonElement>(".close")!.click()
      owner.querySelector("p")!.setAttribute(attributionAttributes.type, "copyright")
      peer.syncFromDOM()
      Y.applyUpdate(editor!.doc.doc, Y.encodeStateAsUpdate(ydoc), "remote-attribution-type")
      await vi.waitFor(() => expect(notes()[0].textContent).toBe("© Remote author"))
      notes()[0].click()
      expect(creditType("copyright").getAttribute("aria-pressed")).toBe("true")
    }
    finally { peer.destroy() }
  })
})

describe("top-level attribution", () => {
  const metadata = {name: "Ada", year: "2026", license: "MIT", contact: "mailto:ada@example.com"}
  const write = (element: Element) => {
    for(const [key, value] of Object.entries(metadata)) element.setAttribute(attributionAttributes[key as keyof typeof metadata], value)
  }
  const expectEmpty = (element: Element) => {
    for(const name of Object.values(attributionAttributes)) expect(element.hasAttribute(name)).toBe(false)
  }
  const expectMetadata = (element: Element) => {
    for(const [key, value] of Object.entries(metadata)) expect(element.getAttribute(attributionAttributes[key as keyof typeof metadata])).toBe(value)
  }

  it.each([false, true])("keeps attribution available after adding a caption (capture: %s)", captured => {
    const element = start()
    if(captured) editor!.features.selection.captureElement(element)
    else editor!.features.selection.selectElement(element)
    expect(editor!.features.manipulation.setCaption("below", "left", {preserveSelection: true})).toBe(true)
    const figure = element.parentElement!
    expect(figure.localName).toBe("figure")
    bounds(figure)
    document.dispatchEvent(new Event("selectionchange"))
    expect(ui().querySelector<HTMLElement>(".bridge")!.hidden).toBe(false)
    button().click()
    expect(popup().hidden).toBe(false)
    input("name").value = "Figure author"
    submit()
    expect(figure.getAttribute(attributionAttributes.name)).toBe("Figure author")
    expectEmpty(element)
    expect(figure.querySelector("figcaption")).toBeTruthy()
    expect(editor!.toHTML(true)).not.toContain("◆attribution-ui")
    expect(editor!.doc.body.toString()).not.toContain("◆attribution-ui")
    editor!.doc.undo()
    expectEmpty(document.querySelector("figure")!)
    editor!.doc.redo()
    expect(document.querySelector("figure")!.getAttribute(attributionAttributes.name)).toBe("Figure author")
  })

  it.each([
    '<p><em>Content</em></p>',
    '<picture><img alt="Content"></picture>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"></rect></svg>',
    '<attribution-widget><p>Widget content</p></attribution-widget>',
  ])("resolves captioned content to its figure inside a document template: %s", content => {
    document.body.innerHTML = `<attribution-template role="document"><figure><!--keep--><figcaption><em>Caption above</em></figcaption>${content}</figure></attribution-template>`
    start()
    const figure = document.querySelector("figure")!
    const element = figure.lastElementChild!
    const descendant = element.lastElementChild ?? element
    const original = cloneWithoutEditorMarkers(figure, true).innerHTML
    bounds(figure)
    editor!.features.selection.captureElement(descendant)
    document.dispatchEvent(new Event("selectionchange"))
    expect(ui().querySelector<HTMLElement>(".bridge")!.hidden).toBe(false)
    button().click()
    input("license").value = "CC-BY-4.0"
    submit()
    expect(figure.getAttribute(attributionAttributes.license)).toBe("CC-BY-4.0")
    expectEmpty(element)
    expectEmpty(descendant)
    expect(cloneWithoutEditorMarkers(figure, true).innerHTML).toBe(original)
    const captionText = figure.querySelector("figcaption em")!
    editor!.features.selection.selectElement(captionText)
    document.dispatchEvent(new Event("selectionchange"))
    expect(ui().querySelector<HTMLElement>(".bridge")!.hidden).toBe(true)
    button().click()
    expect(popup().hidden).toBe(true)
  })

  it.each([false, true])("offers attribution only on direct document children (capture: %s)", captured => {
    document.body.innerHTML = '<section><!--keep--><p><em>Nested</em></p></section><p>Other</p>'
    start()
    const top = document.querySelector("section")!, nested = document.querySelector("em")!
    const child = top.querySelector("p")!
    bounds(top); bounds(nested)
    if(captured) editor!.features.selection.captureElement(nested)
    else editor!.features.selection.selectElement(nested)
    document.dispatchEvent(new Event("selectionchange"))
    expect(ui().querySelector<HTMLElement>(".bridge")!.hidden).toBe(true)
    button().click(); submit()
    expect(popup().hidden).toBe(true)
    expectEmpty(nested)
    editor!.features.selection.selectSectionElement(top)
    document.dispatchEvent(new Event("selectionchange")); button().click()
    expect(popup().hidden).toBe(false)
    input("license").value = "MIT"
    submit()
    expect(top.getAttribute(attributionAttributes.license)).toBe("MIT")
    expect(top.querySelector("p")).toBe(child)
    expectEmpty(child)
    expect(top.firstChild!.nodeType).toBe(Node.COMMENT_NODE)
  })

  it.each([false, true])("transfers a nested attribution in the same undo group as its move (template: %s)", template => {
    document.body.innerHTML = '<p id="source"><em>Licensed</em><!--keep--></p><section title="Keep"><blockquote><p>Container</p></blockquote></section>'
    if(template) {
      const template = document.createElement("attribution-template")
      template.setAttribute("role", "document")
      template.append(...Array.from(document.body.childNodes))
      document.body.append(template)
    }
    const root = document.querySelector("attribution-template") ?? document.body
    const source = document.querySelector("p")!, top = document.querySelector("section")!
    write(source)
    const child = source.firstChild
    start()
    expect(editor!.doc.canUndo).toBe(false)
    const end = editor!.doc.beginUndoGroup()
    top.querySelector("blockquote")!.append(source)
    end()
    expectMetadata(top)
    expectEmpty(source)
    expect(source.firstChild).toBe(child)
    expect(source.lastChild!.nodeType).toBe(Node.COMMENT_NODE)
    expect(top.getAttribute("title")).toBe("Keep")
    expect(editor!.toHTML(true)).toContain('<section title="Keep" data-ww-attribution-name="Ada"')
    editor!.doc.undo()
    expectMetadata(document.querySelector("#source")!)
    expectEmpty(document.querySelector("section")!)
    expect(document.querySelector("#source")!.parentElement).toBe(root)
    editor!.doc.redo()
    expectMetadata(document.querySelector("section")!)
    expectEmpty(document.querySelector("#source")!)
  })

  it.each(["license", "name"] as const)("preserves an existing top-level %s and discards the entire nested attribution", key => {
    document.body.innerHTML = '<section><p>Keep</p></section><custom-widget><p>Owned content</p></custom-widget>'
    const top = document.querySelector("section")!, source = document.querySelector("custom-widget")!
    top.setAttribute(attributionAttributes[key], "Existing")
    write(source)
    const shadow = source.attachShadow({mode: "open"})
    shadow.innerHTML = '<span data-ww-license="Private">Private content</span>'
    start()
    top.append(source)
    editor!.doc.syncFromDOM()
    expect(top.getAttribute(attributionAttributes[key])).toBe("Existing")
    for(const other of Object.keys(metadata).filter(other => other !== key)) expect(top.hasAttribute(attributionAttributes[other as keyof typeof metadata])).toBe(false)
    expectEmpty(source)
    expect(source.querySelector("p")!.textContent).toBe("Owned content")
    expect(shadow.querySelector("span")!.getAttribute(attributionAttributes.license)).toBe("Private")
  })

  it("normalizes legacy nested metadata deterministically when the document opens", () => {
    document.body.innerHTML = '<section data-ww-license=""><article data-ww-attribution-name="First" data-ww-license="MIT"><p data-ww-attribution-name="Deeper" data-ww-license="CC0-1.0">Text</p></article><p data-ww-attribution-name="Second">Other</p></section>'
    start()
    const top = document.querySelector("section")!
    expect(top.getAttribute(attributionAttributes.name)).toBe("First")
    expect(top.getAttribute(attributionAttributes.license)).toBe("MIT")
    for(const element of top.querySelectorAll("*")) expectEmpty(element)
    expect(editor!.doc.canUndo).toBe(false)
  })

  it("handles direct and widget DOM edits without an explicit synchronization call", async () => {
    document.body.innerHTML = '<section><custom-widget><p>Content</p></custom-widget></section>'
    start()
    const top = document.querySelector("section")!, nested = document.querySelector("p")!
    write(nested)
    await vi.waitFor(() => { expectMetadata(top); expectEmpty(nested) })
    await vi.waitFor(() => expect(notes().map(note => note.textContent)).toEqual(["2026 Ada MITada@example.com"]))
    nested.setAttribute(attributionAttributes.license, "CC0-1.0")
    await vi.waitFor(() => expectEmpty(nested))
    expectMetadata(top)
  })

  it("closes an open form if its element becomes nested before saving", () => {
    document.body.innerHTML = '<p>Source</p><section data-ww-license="CC0-1.0"><p>Destination</p></section>'
    const source = document.querySelector("p")!, top = document.querySelector("section")!
    write(source)
    start()
    bounds(source); select(source); notes()[0].click()
    input("name").value = "Stale edit"
    top.append(source)
    submit()
    expect(popup().hidden).toBe(true)
    editor!.doc.syncFromDOM()
    expectEmpty(source)
    expect(top.getAttribute(attributionAttributes.license)).toBe("CC0-1.0")
    expect(top.hasAttribute(attributionAttributes.name)).toBe(false)
  })

  it("normalizes a direct move before an immediate serialization", () => {
    document.body.innerHTML = '<p>Source</p><section><p>Destination</p></section>'
    const source = document.querySelector("p")!, top = document.querySelector("section")!
    write(source)
    start()
    top.append(source)
    const html = editor!.toHTML(true)
    expectMetadata(top)
    expectEmpty(source)
    expect(html).toContain('<section data-ww-attribution-name="Ada"')
    expect(html.match(/data-ww-license=/g)).toHaveLength(1)
  })

  it.each([false, true])("normalizes remote nesting and converges without a local undo item (locked: %s)", locked => {
    document.body.innerHTML = '<p>Source</p><section><p>Destination</p></section>'
    write(document.querySelector("p")!)
    start()
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(editor!.doc.doc))
    const owner = document.implementation.createHTMLDocument()
    const peer = new SharedDOMDoc(undefined, undefined, [], ["◆"], {root: owner.body, ydoc, connect: false})
    if(locked) editor!.lockEditing("attribution-remote-test")
    try {
      owner.querySelector("section")!.append(owner.querySelector("p")!)
      peer.syncFromDOM()
      Y.applyUpdate(editor!.doc.doc, Y.encodeStateAsUpdate(ydoc), "remote-nesting")
      expectMetadata(document.querySelector("section")!)
      expectEmpty(document.querySelector("section > p:last-child")!)
      expect(editor!.doc.canUndo).toBe(false)
      Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(editor!.doc.doc), "attribution-policy")
      expectMetadata(owner.querySelector("section")!)
      expectEmpty(owner.querySelector("section > p:last-child")!)
    }
    finally {
      if(locked) editor!.unlockEditing("attribution-remote-test")
      peer.destroy()
    }
  })
})

describe("reading attribution", () => {
  it.each(["", "attribution", "copyright"])("uses the saved credit type in notes and reader details (%s)", type => {
    const element = document.querySelector("p")!
    element.setAttribute(attributionAttributes.name, "Ada")
    element.setAttribute(attributionAttributes.year, "2026")
    if(type) element.setAttribute(attributionAttributes.type, type)
    bounds(element)
    reader = mountAttributionReader()
    const text = `${type === "copyright" ? "© " : ""}2026 Ada`
    expect(notes()[0].textContent).toBe(text)
    notes()[0].click()
    expect(ui().querySelector(".details")!.textContent).toBe(text)
    expect(creditType(type || "attribution").getAttribute("aria-pressed")).toBe("true")
    expect(creditType("copyright").disabled).toBe(true)
    expect(creditType("attribution").disabled).toBe(true)
  })

  it.each([false, true])("uses grey underlined SPDX and contact links without a visible mailto prefix (editing: %s)", editing => {
    const element = document.querySelector("p")!
    element.setAttribute(attributionAttributes.name, "Ada")
    element.setAttribute(attributionAttributes.license, "CC-BY-4.0")
    element.setAttribute(attributionAttributes.contact, "mailto:ada@example.com")
    if(editing) start()
    else reader = mountAttributionReader(creativeCommonsLicenses)
    const label = notes()[0]
    const license = label.querySelector<HTMLElement>(".attribution-text .attribution-link")!
    const contact = label.querySelector<HTMLElement>(".attribution-contact .attribution-link")!
    expect(license.textContent).toBe("CC-BY-4.0")
    expect(contact.textContent).toBe("ada@example.com")
    expect(label.textContent).not.toContain("mailto:")
    expect(getComputedStyle(label).color).toBe("#777")
    expect(getComputedStyle(label).userSelect).toBe("none")
    expect(getComputedStyle(label).getPropertyValue("-webkit-user-select")).toBe("none")
    for(const link of [license, contact]) {
      expect(getComputedStyle(link).textDecoration).toContain("underline")
      if(!editing) {
        expect((link as HTMLAnchorElement).target).toBe("_blank")
        expect((link as HTMLAnchorElement).rel).toBe("noopener noreferrer")
        const event = new MouseEvent("click", {bubbles: true, cancelable: true})
        expect(link.dispatchEvent(event)).toBe(false)
        expect(popup().hidden).toBe(false)
        ui().querySelector<HTMLButtonElement>(".close")!.click()
      }
    }
    if(editing) {
      expect(label.querySelector("a")).toBeNull()
      contact.click()
      expect(popup().hidden).toBe(false)
    }
    else {
      expect((license as HTMLAnchorElement).href).toBe("https://spdx.org/licenses/CC-BY-4.0.html")
      expect((contact as HTMLAnchorElement).href).toBe("mailto:ada@example.com")
    }
  })

  it.each(["https://example.com/author", "mailto:ada@example.com"])("opens the reading popup from inline links while leaving popup links native (%s)", contact => {
    const element = document.querySelector("p")!
    element.setAttribute(attributionAttributes.name, "Ada")
    element.setAttribute(attributionAttributes.license, "MIT")
    element.setAttribute(attributionAttributes.contact, contact)
    reader = mountAttributionReader()
    const links = Array.from(ui().querySelectorAll<HTMLAnchorElement>(".attribution-note a"))
    expect(links).toHaveLength(2)
    for(const link of links) {
      for(const event of [
        new MouseEvent("click", {bubbles: true, cancelable: true, ctrlKey: true, metaKey: true}),
        new MouseEvent("auxclick", {bubbles: true, cancelable: true, button: 1}),
        ...["Enter", " "].map(key => new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true})),
      ]) {
        expect(link.dispatchEvent(event)).toBe(false)
        expect(popup().hidden).toBe(false)
        expect(ui().querySelector(".details")!.textContent).toContain("Ada")
        ui().querySelector<HTMLButtonElement>(".close")!.click()
      }
    }
    links[0].click()
    const popupLinks = Array.from(popup().querySelectorAll<HTMLAnchorElement>(".details a"))
    expect(popupLinks.map(link => link.href)).toEqual(["https://spdx.org/licenses/MIT.html", contact])
    for(const link of popupLinks) {
      let canceledBeforeTest = true
      // Observe native activation without opening an external browser tab in the test.
      popup().addEventListener("click", event => {
        canceledBeforeTest = event.defaultPrevented
        event.preventDefault()
      }, {once: true})
      link.click()
      expect(canceledBeforeTest).toBe(false)
      expect(popup().hidden).toBe(false)
    }
  })

  it.each([false, true])("uses a compact copyright when either part cannot fit two lines, then restores it (editing: %s)", async editing => {
    const element = document.querySelector<HTMLElement>("p")!
    element.setAttribute(attributionAttributes.name, "Full author")
    element.setAttribute(attributionAttributes.type, "copyright")
    element.setAttribute(attributionAttributes.license, "MIT")
    element.setAttribute(attributionAttributes.contact, "mailto:author@example.com")
    let available = 40
    let longPart = "attribution-text"
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      const part = this.matches(".attribution-text, .attribution-contact")
      const natural = this.classList.contains(longPart) ? 180 : 30
      const height = part ? this.classList.contains("wrapped") ? available : natural : available
      const width = part ? this.classList.contains("wrapped") ? Math.ceil(natural / available) * 8 : 8 : 200
      return {left: 0, top: 0, right: width, bottom: height, width, height} as DOMRect
    })
    if(editing) start()
    else reader = mountAttributionReader()
    const label = notes()[0]
    expect(label.classList.contains("compact-attribution")).toBe(true)
    expect(label.querySelector(".attribution-symbol")!.textContent).toBe("©")
    expect(label.querySelector<HTMLElement>(".attribution-text")!.hidden).toBe(true)
    expect(notes()).toHaveLength(1)
    expect(parseFloat(getComputedStyle(label).fontSize)).toBeCloseTo(12, 0)
    expect(getComputedStyle(label).color).toBe("#777")
    expect(label.tabIndex).toBe(0)
    element.setAttribute(attributionAttributes.type, "attribution")
    if(editing) editor!.doc.syncFromDOM()
    await vi.waitFor(() => expect(label.querySelector(".attribution-symbol")!.textContent).toBe("ⓘ"))
    expect(ui().querySelector(".attribution-footnotes")!.textContent).not.toContain("©")
    label.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}))
    expect(popup().hidden).toBe(false)
    if(editing) expect(input("name").value).toBe("Full author")
    else {
      expect(ui().querySelector(".details")!.textContent).toContain("Full author")
      expect(ui().querySelector<HTMLAnchorElement>('.details a[href^="mailto:"]')!.textContent).toBe("author@example.com")
    }
    ui().querySelector<HTMLButtonElement>(".close")!.click()
    available = 100
    window.dispatchEvent(new Event("resize"))
    await vi.waitFor(() => expect(label.classList.contains("compact-attribution")).toBe(false))
    expect(notes()).toHaveLength(2)
    expect(label.querySelector<HTMLElement>(".attribution-text")!.style.height).toBe("100px")
    longPart = "attribution-contact"
    available = 40
    window.dispatchEvent(new Event("resize"))
    await vi.waitFor(() => expect(label.classList.contains("compact-attribution")).toBe(true))
    expect(notes()).toHaveLength(1)
    available = 100
    window.dispatchEvent(new Event("resize"))
    await vi.waitFor(() => expect(label.classList.contains("compact-attribution")).toBe(false))
    expect(ui().querySelector<HTMLElement>(".attribution-contact")!.style.height).toBe("100px")
    label.click()
    expect(popup().hidden).toBe(false)
    expect(element.getAttribute(attributionAttributes.name)).toBe("Full author")
  })

  it.each(["CC-BY-4.0", "https://creativecommons.org/licenses/by/4.0/", "Creative Commons Attribution 4.0 International", "MIT"])("links the license %s to its SPDX page", value => {
    document.querySelector("p")!.setAttribute(attributionAttributes.license, value)
    reader = mountAttributionReader(creativeCommonsLicenses)
    const code = value === "MIT" ? "MIT" : "CC-BY-4.0"
    expect(notes()[0].querySelector<HTMLAnchorElement>("a")!.href).toBe(`https://spdx.org/licenses/${code}.html`)
  })

  it.each([
    {html: '<figure style="float:right"><p>Body</p><figcaption>Below</figcaption></figure>', below: false},
    {html: '<figure style="float:right"><figcaption>Above</figcaption><p>Body</p></figure>', below: true},
    {html: '<figure style="float:right"><p>No caption</p></figure>', below: false},
    {html: '<table style="float:right"><caption>Above</caption><tbody><tr><td>Body</td></tr></tbody></table>', below: true},
    {html: '<table style="float:right"><caption style="caption-side:bottom">Below</caption><tbody><tr><td>Body</td></tr></tbody></table>', below: false},
  ])("puts long float credits opposite their caption: $html", async ({html, below}) => {
    document.body.innerHTML = html
    const element = document.body.firstElementChild!
    element.setAttribute(attributionAttributes.name, "Long float author")
    element.setAttribute(attributionAttributes.contact, "https://example.com")
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      const text = this.classList.contains("attribution-text")
      const horizontal = this.closest(".horizontal-attribution")
      const height = text ? horizontal ? 16 : this.classList.contains("wrapped") ? 100 : 180 : 100
      return {left: 0, top: 0, right: 200, bottom: height, width: text && !horizontal ? 16 : 200, height} as DOMRect
    })
    const sheets = vi.spyOn(CSSStyleSheet.prototype, "replaceSync")
    reader = mountAttributionReader()
    expect(notes()[0].classList.contains("horizontal-attribution")).toBe(true)
    expect(notes()[0].textContent).toBe("Long float author")
    expect(notes()[1].classList.contains("left-attribution")).toBe(false)
    const rules = () => sheets.mock.calls.map(([source]) => source).filter(source => source.includes("position-anchor:")).at(-1)!
    expect(rules()).toContain(below ? "top: calc(anchor(bottom) + 2px)" : "bottom: calc(anchor(top) + 2px)")
    expect(rules()).toContain(below ? "--ww-attribution-after: 18px" : "--ww-float-attribution-before: 18px")
    ;(element as HTMLElement).style.float = "none"
    await settle()
    expect(notes()[0].classList.contains("horizontal-attribution")).toBe(false)
    expect(notes()[1].classList.contains("left-attribution")).toBe(true)
  })

  it.each([false, true])("flips content-column attribution only while a single right gutter is reserved (editing: %s)", async editing => {
    document.body.innerHTML = '<section><p data-ww-attribution-name="Column">Content</p></section><aside style="float:right" data-ww-attribution-name="Float"><p data-ww-attribution-name="Inside float">Nested</p></aside>'
    document.body.style.cssText = "--ww-responsive-float:right; padding-left:16px; padding-right:200px"
    try {
      if(editing) start()
      else reader = mountAttributionReader()
      const column = notes().find(note => note.textContent === "Column")!
      const float = notes().find(note => note.textContent === "Float")!
      const nested = notes().find(note => note.textContent === "Inside float")!
      expect(column.classList.contains("left-attribution")).toBe(true)
      expect(float.classList.contains("left-attribution")).toBe(false)
      if(editing) expect(nested).toBeUndefined()
      else expect(nested.classList.contains("left-attribution")).toBe(false)
      document.body.style.paddingLeft = "200px"
      await vi.waitFor(() => expect(column.classList.contains("left-attribution")).toBe(false))
      document.body.style.paddingLeft = "16px"
      await vi.waitFor(() => expect(column.classList.contains("left-attribution")).toBe(true))
      document.body.style.setProperty("--ww-responsive-float", "none")
      await vi.waitFor(() => expect(column.classList.contains("left-attribution")).toBe(false))
      document.body.style.setProperty("--ww-responsive-float", "right")
      document.body.classList.add("ww-board")
      await vi.waitFor(() => expect(column.classList.contains("left-attribution")).toBe(false))
    }
    finally { document.body.removeAttribute("style"); document.body.classList.remove("ww-board") }
  })

  it.each([false, true])("moves contact to the opposite side when text wraps and restores it after an edit (editing: %s)", async editing => {
    const element = document.querySelector<HTMLElement>("p")!
    element.setAttribute(attributionAttributes.name, "Long author")
    element.setAttribute(attributionAttributes.contact, "https://example.com")
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      const text = this.classList.contains("attribution-text")
      const height = text ? this.classList.contains("wrapped") ? parseFloat(this.style.height) : this.textContent!.includes("Long") ? 240 : 40 : 100
      return {left: 0, top: 0, right: text ? 16 : 300, bottom: height, width: text ? 16 : 300, height, x: 0, y: 0, toJSON() { return {} }} as DOMRect
    })
    if(editing) start()
    else reader = mountAttributionReader()
    expect(element.isConnected).toBe(true)
    expect(notes()).toHaveLength(2)
    const secondary = ui().querySelector<HTMLElement>(".attribution-contact-note")!
    expect(secondary.parentElement).toBe(notes()[0].parentElement)
    expect(secondary.parentElement!.classList.contains("attribution-group")).toBe(true)
    expect(notes()[0].textContent).toBe("Long author")
    expect(secondary.textContent).toBe("https://example.com")
    expect(secondary.classList.contains("left-attribution")).toBe(true)
    expect(getComputedStyle(secondary).color).toBe("#777")
    expect(getComputedStyle(secondary).cursor).toBe("pointer")
    if(editing) expect(getComputedStyle(secondary.querySelector("span")!).cursor).toBe("pointer")
    if(editing) {
      secondary.click()
      expect(input("name").value).toBe("Long author")
      ui().querySelector<HTMLButtonElement>(".close")!.click()
      await settle()
    }
    element.setAttribute(attributionAttributes.name, "Short")
    await vi.waitFor(() => expect(notes().map(note => note.textContent)).toEqual(["Shorthttps://example.com"]))
    expect(element.isConnected).toBe(true)
    expect(element.getAttribute(attributionAttributes.name)).toBe("Short")
    element.setAttribute(attributionAttributes.name, "Long again")
    await vi.waitFor(() => expect(notes()).toHaveLength(2))
    element.removeAttribute(attributionAttributes.contact)
    await vi.waitFor(() => expect(notes()).toHaveLength(1))
    expect(notes()[0].textContent).toBe("Long again")
    if(editing) editor!.features.attribution.disable()
    else reader!.destroy()
    expect(ui()?.querySelector(".attribution-note")).toBeUndefined()
    expect(element.className).not.toContain("◆attribution-")
  })

  it.each([false, true])("places attribution outside the current computed float side (editing: %s)", async editing => {
    const element = document.querySelector<HTMLElement>("p")!
    element.classList.add("ww-float-left")
    element.style.float = "left"
    element.setAttribute(attributionAttributes.name, "Float author")
    const sheets = vi.spyOn(CSSStyleSheet.prototype, "replaceSync")
    if(editing) start()
    else reader = mountAttributionReader()
    const positioning = () => sheets.mock.calls.map(([source]) => source).filter(source => source.includes("position-anchor:")).at(-1)
    expect(positioning()).toContain("left: anchor(left)")
    const label = notes()[0]
    expect(label.classList.contains("left-attribution")).toBe(true)
    for(const side of ["right", "none", "left"]) {
      // A responsive stylesheet can override the authored choice without a DOM edit.
      const style = document.createElement("style")
      style.textContent = `.ww-float-left { float: ${side} !important }`
      document.head.append(style)
      window.dispatchEvent(new Event("resize"))
      await vi.waitFor(() => expect(label.classList.contains("left-attribution")).toBe(side === "left"))
      expect(notes()[0]).toBe(label)
      expect(label.textContent).toBe("Float author")
      expect(label.classList.contains("left-attribution")).toBe(side === "left")
      expect(positioning()).toContain(side === "left" ? "left: anchor(left)" : "left: anchor(right)")
      style.remove()
    }
  })

  it("shows vertical attribution with safe links, without hover or selection", async () => {
    const element = document.querySelector("p")!
    const name = "Ada <Lovelace> " + "A very long author name ".repeat(12)
    const contact = "https://example.com/" + "long-contact-path/".repeat(15)
    element.setAttribute(attributionAttributes.name, name)
    element.setAttribute(attributionAttributes.year, "2026")
    element.setAttribute(attributionAttributes.license, "CC-BY-4.0")
    element.setAttribute(attributionAttributes.contact, contact)
    const original = document.body.innerHTML
    reader = mountAttributionReader(creativeCommonsLicenses)
    expect(notes()).toHaveLength(1)
    expect(notes()[0].textContent).toBe(`2026 ${name} CC-BY-4.0${contact}`)
    expect(notes()[0].children).toHaveLength(2)
    expect(ui().querySelector<HTMLElement>(".bridge")!.hidden).toBe(true)
    expect(notes()[0].querySelector(`a[href="${contact}"]`)).toBeTruthy()
    expect(notes()[0].querySelector('a[href="https://spdx.org/licenses/CC-BY-4.0.html"]')).toBeTruthy()
    expect(cloneWithoutEditorMarkers(document.body, true).innerHTML).toBe(original)
    hover(element)
    element.dispatchEvent(new PointerEvent("pointerout", {bubbles: true, relatedTarget: null}))
    await settle()
    expect(notes()).toHaveLength(1)
    element.setAttribute(attributionAttributes.contact, "javascript:alert(1)")
    reader!.refresh()
    expect(notes()[0].textContent).toContain("javascript:alert(1)")
    expect(notes()[0].querySelector('a[href^="javascript:"]')).toBeNull()
    reader!.destroy()
    expect(document.body.innerHTML).not.toContain("◆attribution-")
  })

  it("follows direct changes, removal, and replacement without leaving stale labels", async () => {
    const element = document.querySelector("p")!
    reader = mountAttributionReader()
    expect(notes()).toHaveLength(0)
    element.setAttribute(attributionAttributes.license, "Custom license")
    await settle()
    expect(notes()[0].textContent).toBe("Custom license")
    const label = notes()[0]
    element.setAttribute(attributionAttributes.name, "Updated author")
    await settle()
    expect(notes()[0]).toBe(label)
    expect(label.textContent).toBe("Updated author Custom license")
    const replacement = element.cloneNode(true) as Element
    element.replaceWith(replacement)
    await settle()
    expect(notes()).toHaveLength(1)
    expect(notes()[0]).not.toBe(label)
    replacement.remove()
    await settle()
    expect(notes()).toHaveLength(0)
    expect(Array.from(element.classList).some(name => name.startsWith("◆attribution-"))).toBe(false)
  })

  it("reads authored attribution inside custom-element light DOM without entering private shadows", () => {
    document.body.innerHTML = '<attribution-template role="document"><p data-ww-attribution-name="Nested author">Text</p></attribution-template>'
    reader = mountAttributionReader()
    expect(notes()[0].textContent).toBe("Nested author")
  })
})

describe("printed attribution", () => {
  const beforePrint = () => window.dispatchEvent(new Event("beforeprint"))
  const afterPrint = () => window.dispatchEvent(new Event("afterprint"))
  const labels = () => Array.from(ui().querySelectorAll<HTMLElement>(".attribution-note"))

  it.each([false, true])("prints circular white references above elements, including two-digit numbers (editing: %s)", editing => {
    const settings = (window as unknown as TestWindow).happyDOM.settings.device
    const previous = settings.mediaType
    settings.mediaType = "print"
    try {
      document.body.innerHTML = Array.from({length: 12}, (_, index) => `<p style="float:${index % 2 ? "right" : "left"}" data-ww-attribution-name="Long author ${index + 1}">Element</p>`).join("")
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
        const height = this.classList.contains("attribution-text") ? 200 : 24
        return {left: 0, top: 0, right: 200, bottom: height, width: 200, height} as DOMRect
      })
      if(editing) start()
      else reader = mountAttributionReader()
      beforePrint()
      const references = Array.from(ui().querySelectorAll<HTMLElement>(".attribution-reference"))
      expect(references).toHaveLength(12)
      expect(references.slice(9).map(node => node.textContent)).toEqual(["10", "11", "12"])
      for(const reference of references) {
        const style = getComputedStyle(reference)
        expect(style.display).toBe("flex")
        expect(style.width).toBe(style.height)
        expect(parseFloat(style.width)).toBeGreaterThan(12)
        expect(style.borderRadius).toBe("50%")
        expect(style.borderTopStyle).toBe("solid")
        expect(style.backgroundColor).toMatch(/^(?:#fff(?:fff)?|white|rgb\(255, 255, 255\))$/)
        const label = reference.closest<HTMLElement>(".attribution-note")!
        expect(getComputedStyle(label).transform).toBe("translateX(-50%)")
        expect(parseInt(getComputedStyle(label).zIndex)).toBeGreaterThan(0)
      }
    }
    finally { settings.mediaType = previous }
  })

  it.each([false, true])("numbers only insufficient-space attributions in document order and keeps full notes in the appendix (editing: %s)", async editing => {
    document.body.innerHTML = '<section><p data-ww-attribution-name="Long author" data-ww-attribution-year="2026" data-ww-license="CC-BY-4.0" data-ww-attribution-contact="mailto:author@example.com">First</p></section><custom-widget data-ww-attribution-name="Widget author">Second</custom-widget><p id="tall" data-ww-attribution-name="Fits">Sufficient space</p><p hidden data-ww-attribution-name="Hidden">Hidden</p>'
    const first = document.querySelector(editing ? "section" : "p")!, widget = document.querySelector("custom-widget")!
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      const text = this.matches(".attribution-text, .attribution-contact")
      const height = text ? this.classList.contains("wrapped") ? parseFloat(this.style.height) : 200 : this.id === "tall" ? 300 : 40
      const width = text ? this.classList.contains("wrapped") ? 40 : 8 : 300
      return {left: 0, top: 0, right: width, bottom: height, width, height} as DOMRect
    })
    if(editing) start()
    else reader = mountAttributionReader(creativeCommonsLicenses)
    const original = cloneWithoutEditorMarkers(document.body, true).innerHTML
    const list = () => Array.from(ui().querySelectorAll<HTMLElement>(".attribution-footnotes li"))
    const references = () => Array.from(ui().querySelectorAll<HTMLElement>(".attribution-reference"))
    beforePrint()
    expect(references().map(note => note.textContent)).toEqual(["1", "2"])
    expect(list().map(note => note.textContent)).toEqual(["2026 Long author CC-BY-4.0 author@example.com", "Widget author"])
    expect(getComputedStyle(ui().querySelector(".attribution-footnotes")!).display).toBe("none")
    expect(references().every(note => getComputedStyle(note).display === "none")).toBe(true)
    expect(list()[0].textContent).not.toContain("mailto:")
    if(editing) {
      expect(list()[0].querySelector("a")).toBeNull()
      expect(editor!.toHTML(false, false)).not.toContain("attribution-footnotes")
      editor!.doc.syncFromDOM()
      expect(editor!.doc.body.toString()).not.toContain("attribution-footnotes")
    }
    else {
      expect(list()[0].querySelector<HTMLAnchorElement>('a[href^="https://spdx.org/"]')!.href).toBe("https://spdx.org/licenses/CC-BY-4.0.html")
      expect(list()[0].querySelector<HTMLAnchorElement>('a[href^="mailto:"]')!.href).toBe("mailto:author@example.com")
    }
    expect(cloneWithoutEditorMarkers(document.body, true).innerHTML).toBe(original)
    document.body.prepend(widget)
    first.setAttribute(attributionAttributes.name, "Remote author")
    beforePrint()
    expect(list().map(note => note.textContent)).toEqual(["Widget author", "2026 Remote author CC-BY-4.0 author@example.com"])
    expect(notes().find(note => note.textContent!.includes("Remote author"))!.querySelector(".attribution-reference")!.textContent).toBe("2")
    widget.remove()
    beforePrint()
    expect(list()).toHaveLength(1)
    expect(references().map(note => note.textContent)).toEqual(["1"])
    afterPrint()
    await settle()
    expect(ui().querySelectorAll(".attribution-symbol")).toHaveLength(1)
    expect(list()).toHaveLength(1)
    if(editing) editor!.features.attribution.disable()
    else reader!.destroy()
    expect(document.body.shadowRoot!.querySelector(".attribution-footnotes")).toBeNull()
  })

  it("prints all current attributions in at most two lines, including media and widgets", () => {
    document.body.innerHTML = '<img data-ww-attribution-name="Ada &lt;Lovelace&gt;" data-ww-attribution-year="2026" data-ww-license="https://creativecommons.org/licenses/by/4.0/" data-ww-attribution-contact="mailto:ada@example.com"><custom-widget class="keep" data-ww-license="CC0-1.0"></custom-widget><p data-ww-attribution-name="">Empty</p><p hidden data-ww-attribution-name="Hidden author">Hidden</p>'
    const original = document.body.innerHTML
    reader = mountAttributionReader(creativeCommonsLicenses)
    const sheets = [...document.adoptedStyleSheets]
    beforePrint()
    expect(labels()).toHaveLength(2)
    expect(Array.from(labels()[0].children).map(line => line.textContent)).toEqual(["2026 Ada <Lovelace> CC-BY-4.0", "ada@example.com"])
    expect(labels()[1].children).toHaveLength(1)
    expect(labels()[1].textContent).toBe("CC0-1.0")
    expect(document.body.querySelector(".attribution-note")).toBeNull()
    expect(document.adoptedStyleSheets).toHaveLength(sheets.length)
    afterPrint()
    expect(labels()).toHaveLength(2)
    reader!.destroy()
    expect(document.body.innerHTML).toBe(original)
  })

  it("refreshes remote or direct changes on every print and removes temporary markers from shared HTML", () => {
    const element = start()
    element.setAttribute(attributionAttributes.name, "First author")
    beforePrint()
    expect(labels()[0].textContent).toBe("First author")
    expect(editor!.toHTML(false, false)).not.toContain("◆attribution-")
    editor!.doc.syncFromDOM()
    expect(editor!.doc.body.toString()).not.toContain("◆attribution-")
    element.setAttribute(attributionAttributes.name, "Updated author")
    beforePrint()
    expect(labels()).toHaveLength(1)
    expect(labels()[0].textContent).toBe("Updated author")
    editor!.features.attribution.disable()
    expect(document.body.innerHTML).not.toContain("◆attribution-")
    expect(document.body.shadowRoot!.querySelector(".attribution-note")).toBeNull()
    beforePrint()
    expect(document.body.shadowRoot!.querySelector(".attribution-note")).toBeNull()
  })

  it.each(["ww-canvas", "ww-slides", "ww-board"])("leaves the %s print layout alone", mode => {
    document.body.className = mode
    document.querySelector("p")!.setAttribute(attributionAttributes.name, "Ada")
    reader = mountAttributionReader()
    try {
      beforePrint()
      expect(labels()).toHaveLength(1)
      expect(ui().classList.contains("non-document-layout")).toBe(true)
    }
    finally { document.body.className = "" }
  })
})
