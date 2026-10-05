// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DomEditorToolbox} from "./toolbox"
import type {ElementStyleEditor} from "./element-style-editor"
import type {RibbonButton} from "./ribbon-button"
import {RibbonDrawer} from "./ribbon-drawer"
import {AIProviderStore} from "../ai-provider"
import {emptyVersionHistoryState} from "../editor-bridge"

afterEach(() => {
  document.body.replaceChildren()
})

async function mountToolbox(showStyleToolbox = true) {
  const toolbox = new DomEditorToolbox()
  toolbox.showStyleToolbox = showStyleToolbox
  document.body.append(toolbox)
  await toolbox.updateComplete
  return toolbox
}

const toolButton = (toolbox: DomEditorToolbox, label: string) =>
  toolbox.shadowRoot!.querySelector<HTMLButtonElement>(`button[data-tool="${label}"]`)!

describe("toolbox", () => {
  it("shows creation and single-edit snapshots only as versions and retains earlier changes", async () => {
    const toolbox = await mountToolbox()
    toolbox.selectTool("Review")
    const user = {clientId: 7, name: "Ada", initials: "AD", color: "#64748b"}
    const checkpoint = (id: string, timestamp: number, modified = 1) => ({
      id, timestamp, label: "Edited by Ada", user, changes: {added: 0, removed: 0, modified}, commentCount: 0,
    })
    const initial = {...checkpoint("initial", 0, 0), label: "Document created"}
    const version = {...initial, id: "unsaved", label: "Unsaved changes", checkpointIds: [initial.id],
      isUnsaved: true, isCurrent: true}
    toolbox.historyState = {...emptyVersionHistoryState(), checkpoints: [initial], versions: [version], currentCheckpointId: initial.id}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelectorAll(".history-version-card")).toHaveLength(1)
    expect(toolbox.shadowRoot!.querySelector(".history-version-changes")).toBeNull()
    expect(toolbox.shadowRoot!.querySelector(".history-change-card")).toBeNull()

    const first = checkpoint("first", 1)
    toolbox.historyState = {...toolbox.historyState, checkpoints: [first, initial],
      versions: [{...version, changes: first.changes, checkpointIds: [first.id, initial.id]}], currentCheckpointId: first.id}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".history-version-changes")).toBeNull()
    expect(toolbox.shadowRoot!.querySelector(".history-checkpoint-counts")!.getAttribute("aria-label"))
      .toBe("0 added, 0 removed, 1 changed")

    const undo = checkpoint("undo", 2, 0)
    const latest = checkpoint("latest", 3)
    toolbox.historyState = {...toolbox.historyState, checkpoints: [latest, undo, first, initial],
      versions: [{...version, checkpointIds: [latest.id, "missing", undo.id, first.id, initial.id]}], currentCheckpointId: latest.id}
    await toolbox.updateComplete
    expect(Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".history-change-card"))
      .map(card => card.dataset.checkpointId)).toEqual([undo.id, first.id])
    expect(toolbox.shadowRoot!.querySelector(".history-version-changes summary")!.textContent).toBe("2 changes")
    expect(toolbox.historyState.versions[0].checkpointIds).toEqual([latest.id, "missing", undo.id, first.id, initial.id])
  })

  it("marks Review when proofreading is unavailable and offers a retry inside the pane", async () => {
    const toolbox = await mountToolbox()
    toolbox.proofreadingError = "The local checker worker could not start."
    await toolbox.updateComplete

    const review = toolButton(toolbox, "Review")
    expect(review.getAttribute("aria-label")).toBe("Review. Spell and grammar checking unavailable")
    expect(review.title).toBe("Spell and grammar checking unavailable")
    expect(review.querySelector(".proofreading-error-badge")?.textContent).toBe("!")

    review.click()
    await toolbox.updateComplete
    const failure = toolbox.shadowRoot!.querySelector<HTMLElement>(".proofreading-error")!
    expect(failure.getAttribute("role")).toBe("alert")
    expect(failure.textContent).toContain("The local checker worker could not start.")

    const retryRequest = vi.fn()
    toolbox.addEventListener("ribbon-button-click", retryRequest)
    failure.querySelector<HTMLButtonElement>("button")!.click()
    expect(retryRequest).toHaveBeenCalledOnce()
    expect(retryRequest.mock.calls[0][0]).toMatchObject({
      detail: {label: "Spelling"},
      bubbles: true,
      composed: true,
    })

    toolbox.proofreadingError = ""
    await toolbox.updateComplete
    expect(toolButton(toolbox, "Review").querySelector(".proofreading-error-badge")).toBeNull()
    expect(toolbox.shadowRoot!.querySelector(".proofreading-error")).toBeNull()
  })

  it("reserves both scrollbar gutters in Edit without extra content side spacing", async () => {
    const toolbox = await mountToolbox()
    toolbox.documentSelected = true
    toolbox.elementAttributes = {path: [], localName: "body", namespaceURI: "http://www.w3.org/1999/xhtml", name: "Document", attributes: {}}
    toolbox.selectTool("Edit")
    await toolbox.updateComplete
    const content = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane-content")!
    expect(getComputedStyle(content).getPropertyValue("scrollbar-gutter")).toBe("stable both-edges")
    const drawers = Array.from(content.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    expect(drawers.length).toBeGreaterThan(1)
    for(const drawer of drawers) {
      await drawer.updateComplete
      const style = getComputedStyle(drawer.shadowRoot!.querySelector(".drawer")!)
      expect(style.paddingLeft).toBe("0px")
      expect(style.paddingRight).toBe("0px")
      expect(style.paddingBottom).toBe("12px")
    }
    const layouts = content.querySelector(".document-layout-controls")!
    expect(getComputedStyle(layouts).paddingLeft).toBe("0px")
    expect(getComputedStyle(layouts).paddingRight).toBe("0px")

    toolbox.selectTool("Style")
    await toolbox.updateComplete
    expect(getComputedStyle(content).getPropertyValue("scrollbar-gutter")).not.toBe("stable both-edges")
    const drawer = content.querySelector<RibbonDrawer>("ribbon-drawer")!
    await drawer.updateComplete
    expect(getComputedStyle(drawer.shadowRoot!.querySelector(".drawer")!).paddingLeft).toBe("11.2px")
    expect(getComputedStyle(drawer.shadowRoot!.querySelector(".drawer")!).paddingRight).toBe("11.2px")
  })

  it("offers the palette Style drawer for custom elements and reflects current styles", async () => {
    const toolbox = await mountToolbox(false)
    toolbox.selectTool("Edit")
    toolbox.elementAttributes = {
      path: [0], localName: "my-widget", namespaceURI: "http://www.w3.org/1999/xhtml",
      name: "Widget", attributes: {},
    }
    toolbox.elementStyle = {
      target: {localName: "my-widget", namespaceURI: "http://www.w3.org/1999/xhtml"},
      inline: {width: {value: "123px", priority: ""}}, computed: {},
      context: {display: "block", parentDisplay: "block"},
    }
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Style"]')!
    await drawer.updateComplete
    expect(drawer.shadowRoot!.querySelector(".pane-icon .icon-tabler-palette")).not.toBeNull()
    const advanced = drawer.querySelector<ElementStyleEditor>('element-style-editor[slot="more"]')!
    await advanced.updateComplete
    expect(advanced.propertyNames).toEqual(["background-color", "color", "border-width", "padding", "width", "height", "margin", "border-radius", "rotate", "scale", "box-shadow", "filter"])
    expect(advanced.shadowRoot!.querySelectorAll(".compact-toggle")).toHaveLength(8)
    expect(drawer.expandable).toBe(true)
    expect(drawer.shadowRoot!.querySelector('slot[name="more"]')!.hasAttribute("hidden")).toBe(true)
    drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.click()
    await drawer.updateComplete
    expect(drawer.shadowRoot!.querySelector('slot[name="more"]')!.hasAttribute("hidden")).toBe(false)

    const basic = drawer.querySelector<ElementStyleEditor>("element-style-editor")!
    await basic.updateComplete
    expect(basic.shadowRoot!.querySelectorAll(".style-gallery button")).toHaveLength(8)
    expect(Array.from(basic.shadowRoot!.querySelectorAll("[data-property]"), row => row.getAttribute("data-property")))
      .toEqual([])
    const editor = advanced
    expect(editor.shadowRoot!.querySelector<HTMLInputElement>("#compact-width")!.value).toBe("123")
    toolbox.elementStyle = {...toolbox.elementStyle, inline: {width: {value: "250px", priority: ""}}}
    await toolbox.updateComplete
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector<HTMLInputElement>("#compact-width")!.value).toBe("250")
  })

  it("hides Style by default and closes its panel when disabled", async () => {
    expect(new DomEditorToolbox().showStyleToolbox).toBe(false)
    const toolbox = await mountToolbox(false)
    expect(toolButton(toolbox, "Style")).toBeNull()
    toolbox.selectTool("Style")
    expect(toolbox.activeTool).toBeNull()
    toolbox.showStyleToolbox = true
    await toolbox.updateComplete
    toolButton(toolbox, "Style").click()
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBe("Style")
    toolbox.showStyleToolbox = false
    await toolbox.updateComplete
    expect(toolButton(toolbox, "Style")).toBeNull()
    expect(toolbox.activeTool).toBeNull()
    expect(toolbox.shadowRoot!.querySelector("element-style-editor")).toBeNull()
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>("#toolbox-pane")!.hidden).toBe(true)
  })

  it("renders Edit, Style, Ask AI, and Review as icon-only tabs on the breadcrumb baseline", async () => {
    const toolbox = await mountToolbox()
    const tablist = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-tabs")!
    const tabs = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".toolbox-tab"))
    const buttons = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".toolbox-tab-button"))
    const labels = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".toolbox-tab-label"))

    expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual([
      "Edit", "Style", "Ask AI", "Review",
    ])
    expect(buttons.map(button => button.getAttribute("aria-selected"))).toEqual([
      "false", "false", "false", "false",
    ])
    expect(labels.map(label => label.textContent)).toEqual(["Edit", "Style", "Ask AI", "Review"])
    expect(labels.every(label => getComputedStyle(label).opacity === "0")).toBe(true)
    expect(tabs.every(tab => getComputedStyle(tab).width === "28px")).toBe(true)
    expect(getComputedStyle(tablist).borderBottomWidth).toBe("0.5px")
    expect(getComputedStyle(tablist).borderBottomColor).toBe("#a8a8a8")
    expect(buttons[0].querySelector(".icon-tabler-pencil")).not.toBeNull()
    expect(buttons[1].querySelector(".icon-tabler-palette")).not.toBeNull()
    expect(buttons[3].querySelector(".icon-tabler-text-grammar")).not.toBeNull()
  })

  it("does not install app-only AI or resize listeners across reconnects", async () => {
    const aiListener = vi.spyOn(AIProviderStore.prototype, "addEventListener")
    const windowListener = vi.spyOn(window, "addEventListener")
    try {
      const toolbox = await mountToolbox()
      document.body.replaceChildren()
      document.body.append(toolbox)
      await toolbox.updateComplete

      expect(aiListener).not.toHaveBeenCalled()
      expect(windowListener.mock.calls.filter(([type]) => type === "resize")).toHaveLength(0)

      const styleStateRequest = vi.fn()
      const toolboxChange = vi.fn()
      toolbox.addEventListener("element-style-state-request", styleStateRequest)
      toolbox.addEventListener("toolbox-change", toolboxChange)
      toolbox.selectTool("Style")
      await toolbox.updateComplete
      expect(styleStateRequest).toHaveBeenCalledTimes(1)
      expect(toolboxChange).toHaveBeenCalledTimes(1)
    }
    finally {
      aiListener.mockRestore()
      windowListener.mockRestore()
    }
  })

  it("can hide the tabs underline without changing tab sizing", async () => {
    const toolbox = await mountToolbox()
    const tabs = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-tabs")!

    toolbox.style.setProperty("--toolbox-tabs-border-color", "transparent")
    expect(getComputedStyle(tabs).borderBottomColor).toBe("transparent")
    expect(getComputedStyle(tabs).borderBottomWidth).toBe("0.5px")
    expect(getComputedStyle(tabs).height).toBe("30px")

    toolbox.style.removeProperty("--toolbox-tabs-border-color")
    expect(getComputedStyle(tabs).borderBottomColor).toBe("#a8a8a8")
  })

  it("widens the active tab and narrows it when switching or closing", async () => {
    const toolbox = await mountToolbox()
    const edit = toolButton(toolbox, "Edit")
    const style = toolButton(toolbox, "Style")
    const tablist = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-tabs")!
    const editTab = edit.closest<HTMLElement>(".toolbox-tab")!
    const styleTab = style.closest<HTMLElement>(".toolbox-tab")!

    expect(toolbox.activeTool).toBeNull()
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!.hidden).toBe(true)

    edit.click()
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBe("Edit")
    expect(toolbox.getAttribute("active-tool")).toBe("Edit")
    expect(getComputedStyle(toolbox).width).toBe("216px")
    expect(edit.getAttribute("aria-selected")).toBe("true")
    expect(style.getAttribute("aria-selected")).toBe("false")
    expect(getComputedStyle(editTab).width).toBe("128px")
    expect(getComputedStyle(editTab).height).toBe("30px")
    expect(getComputedStyle(editTab).marginBottom).toBe("-1px")
    expect(getComputedStyle(editTab).backgroundColor).toBe("#f2f2f2")
    expect(getComputedStyle(editTab).borderLeftColor).toBe("#a8a8a8")
    expect(getComputedStyle(editTab).borderBottomColor).toBe("#f2f2f2")
    expect(getComputedStyle(edit).justifyContent).toBe("flex-start")
    expect(getComputedStyle(tablist).paddingRight).toBe("4px")
    expect(getComputedStyle(tablist).paddingLeft).toBe("0px")
    expect(Array.from(tablist.querySelectorAll<HTMLElement>(".toolbox-tab"))
      .map(tab => getComputedStyle(tab).flexGrow)).toEqual(["1", "0", "0", "0"])
    expect(getComputedStyle(style).width).toBe("28px")
    expect(getComputedStyle(editTab).transition).toContain("width")
    expect(getComputedStyle(edit.querySelector<HTMLElement>(".toolbox-tab-label")!).opacity).toBe("1")
    const editClose = editTab.querySelector<HTMLButtonElement>(".toolbox-tab-close")!
    expect(editClose.disabled).toBe(false)
    expect(getComputedStyle(editClose).width).toBe("24px")
    expect(toolbox.shadowRoot!.querySelector(".pane-header")).toBeNull()

    style.click()
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBe("Style")
    expect(edit.getAttribute("aria-selected")).toBe("false")
    expect(style.getAttribute("aria-selected")).toBe("true")
    expect(getComputedStyle(editTab).width).toBe("28px")
    expect(getComputedStyle(styleTab).width).toBe("128px")
    expect(Array.from(tablist.querySelectorAll<HTMLElement>(".toolbox-tab"))
      .map(tab => getComputedStyle(tab).flexGrow)).toEqual(["0", "1", "0", "0"])
    expect(editClose.disabled).toBe(true)

    const pane = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!
    expect(getComputedStyle(toolbox).width).toBe("216px")
    expect(getComputedStyle(pane).width).toBe("100%")

    styleTab.querySelector<HTMLButtonElement>(".toolbox-tab-close")!.click()
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBeNull()
    expect(toolbox.hasAttribute("active-tool")).toBe(false)
    expect(getComputedStyle(styleTab).width).toBe("28px")
    expect(getComputedStyle(toolbox).width).toBe("122px")
  })

  it("opens one developer console from Edit and locks its toggle during pending HTML edits", async () => {
    const toolbox = await mountToolbox()
    toolButton(toolbox, "Edit").click()
    await toolbox.updateComplete
    const footer = toolbox.shadowRoot!.querySelector(".edit-mode-footer")!
    const toggle = toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".developer-console-toggle")!
    const change = vi.fn()
    toolbox.addEventListener("developer-console-change", change)
    expect(toggle.textContent).toContain("Developer console")
    expect(toolbox.shadowRoot!.querySelector(".html-mode-toggle, .develop-mode-toggle")).toBeNull()
    toggle.click()
    expect(change).toHaveBeenCalledWith(expect.objectContaining({detail: {enabled: true}}))
    toolbox.consoleOpen = true
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".edit-mode-footer")).toBe(footer)
    expect(toggle.getAttribute("aria-pressed")).toBe("true")
    expect(toolbox.shadowRoot!.querySelector(".console-pin")).toBeNull()
    const close = toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".console-close")!
    expect(close.disabled).toBe(false)
    close.click()
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({detail: {enabled: false}}))
    expect(toolbox.shadowRoot!.querySelector("ribbon-drawer")).not.toBeNull()
    toolbox.consoleOpen = false
    toolbox.htmlPending = true
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".developer-console-toggle")!.disabled).toBe(true)
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane-content")!.inert).toBe(true)
    toolbox.selectTool("Style")
    expect(toolbox.activeTool).toBe("Edit")
  })

  it("names element-specific Edit tools in the active blue", async () => {
    const toolbox = await mountToolbox()
    const edit = toolButton(toolbox, "Edit")
    const editTab = edit.closest<HTMLElement>(".toolbox-tab")!
    const label = edit.querySelector<HTMLElement>(".toolbox-tab-label")!
    toolbox.table = {
      active: true,
      cellSelection: false,
      rows: 2,
      columns: 2,
      selectedCells: 1,
      canMerge: false,
      canSplit: false,
      hasCaption: false,
      hasHeader: false,
      hasFooter: false,
    }
    await toolbox.updateComplete
    expect(label.textContent).toBe("Table")
    expect(edit.getAttribute("aria-label")).toBe("Edit Table")
    expect(label.hasAttribute("data-contextual")).toBe(true)
    expect(getComputedStyle(label).color).toBe("#0ea5e9")
    expect(getComputedStyle(label).opacity).toBe("1")
    expect(getComputedStyle(edit).color).toBe("#0ea5e9")
    expect(getComputedStyle(editTab).width).toBe("100px")

    edit.click()
    await toolbox.updateComplete
    expect(getComputedStyle(editTab).width).toBe("128px")

    toolButton(toolbox, "Style").click()
    await toolbox.updateComplete
    expect(label.textContent).toBe("Table")
    expect(getComputedStyle(label).opacity).toBe("0")
    expect(getComputedStyle(edit).color).toBe("#0ea5e9")
    expect(getComputedStyle(editTab).width).toBe("28px")

    toolbox.table = null
    toolbox.graphic = {active: true, capture: false}
    await toolbox.updateComplete
    expect(label.textContent).toBe("Graphic")
    toolbox.graphic = null
    toolbox.selectionPath = [
      {path: [], name: "Document"},
      {path: [0], name: "Demo widget", icon: "Packages"},
    ]
    await toolbox.updateComplete
    expect(label.textContent).toBe("Widget")
    expect(edit.getAttribute("aria-label")).toBe("Edit Widget")

    toolbox.selectionPath = [{path: [], name: "Document"}, {path: [0], name: "Paragraph"}]
    await toolbox.updateComplete
    expect(label.textContent).toBe("Edit")
    expect(label.hasAttribute("data-contextual")).toBe(false)
    expect(edit.getAttribute("aria-label")).toBe("Edit")
  })

  it("offers layout switching in the Document toolbox for a selected document root", async () => {
    const toolbox = await mountToolbox()
    toolbox.selectionPath = [{path: [0], name: "Graphic", icon: "Graphic"}]
    toolbox.documentSelected = true
    await toolbox.updateComplete

    const edit = toolButton(toolbox, "Edit")
    expect(edit.getAttribute("aria-label")).toBe("Edit Document")
    expect(edit.querySelector(".toolbox-tab-label")?.textContent).toBe("Document")

    edit.click()
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Document"]')!
    const buttons = Array.from(drawer.querySelectorAll<RibbonButton>("ribbon-button"))
    expect(buttons.map(button => button.label)).toEqual(["Default"])
    expect(buttons.map(button => button.action)).toEqual(["set-document-template:body"])
  })

  it("shows the active layout as a dropdown card and emits conversion requests", async () => {
    const toolbox = await mountToolbox()
    toolbox.documentSelected = true
    toolbox.selectTool("Edit")
    await toolbox.updateComplete

    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[layout="document-layout"]')!
    const picker = drawer.querySelector<HTMLDetailsElement>("details")!
    const summary = picker.querySelector("summary")!
    expect(drawer.label).toBe("Layouts")
    expect(picker.open).toBe(false)
    expect(summary.textContent).toContain("Document")
    expect(summary.querySelector(".document-layout-preview.document")).not.toBeNull()
    expect(drawer.textContent).toContain("Zoom: 100%")
    const choices = Array.from(drawer.querySelectorAll<HTMLButtonElement>(".document-layout-change"))
    expect(choices.map(button => button.dataset.mode)).toEqual(["canvas", "slides"])
    expect(choices.every(button => button.querySelector('.document-layout-preview[aria-hidden="true"]'))).toBe(true)
    summary.click()
    expect(picker.open).toBe(true)
    const request = vi.fn()
    toolbox.addEventListener("document-layout-change", request)
    choices[0].click()
    expect(request).toHaveBeenCalledWith(expect.objectContaining({detail: {mode: "canvas"}}))
    expect(picker.open).toBe(false)

    toolbox.documentLayout = {mode: "canvas", canConvert: true, zoom: 125}
    await toolbox.updateComplete
    expect(summary.textContent).toContain("Canvas")
    expect(drawer.textContent).toContain("Zoom: 125%")
    expect(drawer.querySelector('[data-mode="canvas"]')).toBeNull()
    expect(drawer.querySelector<HTMLButtonElement>('[data-mode="slides"]')!.disabled).toBe(false)
    summary.click()
    summary.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    expect(picker.open).toBe(false)

    toolbox.documentLayout = {mode: "canvas", canConvert: false, zoom: 125}
    await toolbox.updateComplete
    expect(drawer.querySelector<HTMLButtonElement>('[data-mode="document"]')!.disabled).toBe(true)
    expect(drawer.querySelector<HTMLButtonElement>('[data-mode="slides"]')!.disabled).toBe(true)
    expect(drawer.querySelector<HTMLButtonElement>('[data-mode="slides"]')!.title).toContain("cannot be converted automatically")

    toolbox.documentLayout = {mode: "document", canConvert: true, zoom: 100, conversions: {slides: "Slides require sectioned content"}}
    await toolbox.updateComplete
    const slides = drawer.querySelector<HTMLButtonElement>('[data-mode="slides"]')!
    expect(slides.disabled).toBe(true)
    expect(slides.title).toBe("Slides require sectioned content")
    toolbox.htmlPending = true
    await toolbox.updateComplete
    expect(drawer.querySelector<HTMLButtonElement>('[data-mode="canvas"]')!.disabled).toBe(true)
  })

  it("offers universal attributes alongside specialized tools and for uncommon elements", async () => {
    const toolbox = await mountToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type: "img", attributes: {alt: "Diagram"}}
    toolbox.elementAttributes = {
      path: [0],
      localName: "img",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      name: "Image",
      icon: "Image",
      attributes: {alt: "Diagram", fetchpriority: "high"},
    }
    await toolbox.updateComplete

    expect(Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"), drawer => drawer.label))
      .toEqual(["Style", "Image", "Attributes"])
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Attributes"] element-attribute-editor')).not.toBeNull()

    toolbox.media = null
    toolbox.elementAttributes = {
      path: [1],
      localName: "blockquote",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      name: "Quote",
      icon: "Quote",
      attributes: {cite: "source.html"},
    }
    await toolbox.updateComplete
    expect(toolButton(toolbox, "Edit").getAttribute("aria-label")).toBe("Edit Quote")
    expect(toolbox.shadowRoot!.querySelectorAll("ribbon-drawer")).toHaveLength(2)
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Attributes"]')).not.toBeNull()
  })

  it("omits the specialized paragraph toolbox", async () => {
    const toolbox = await mountToolbox()
    toolbox.selectTool("Edit")
    for(const tag of ["p", "pre", "p"]) {
      toolbox.elementAttributes = {
        path: [0], localName: tag, namespaceURI: "http://www.w3.org/1999/xhtml",
        name: tag === "p" ? "Paragraph" : "Preformatted Text", attributes: {},
      }
      await toolbox.updateComplete
      expect(toolButton(toolbox, "Edit").getAttribute("aria-label")).toBe("Edit")
      expect(toolButton(toolbox, "Edit").closest(".toolbox-tab")!.hasAttribute("data-contextual")).toBe(false)
      expect(Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"), drawer => drawer.label))
        .toEqual(["Style", "Attributes"])
      expect(toolbox.shadowRoot!.querySelector('.paragraph-format-switch')).toBeNull()
    }
    toolbox.elementAttributes = {...toolbox.elementAttributes!, localName: "h1", name: "Heading"}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('input[role="switch"]')).toBeNull()
  })

  it("offers understandable disclosure and heading-group tools alongside universal attributes", async () => {
    const toolbox = await mountToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.elementAttributes = {
      path: [0],
      localName: "details",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      name: "Details",
      icon: "Details",
      attributes: {name: "faq", open: ""},
    }
    await toolbox.updateComplete

    expect(Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer")).map(drawer => drawer.label))
      .toEqual(["Style", "Attributes"])
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Disclosure"]')).toBeNull()

    toolbox.elementAttributes = null
    toolbox.headingGroup = {heading: "h2", beforeCount: 1, afterCount: 1}
    await toolbox.updateComplete
    expect(toolButton(toolbox, "Edit").getAttribute("aria-label")).toBe("Edit Heading group")
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Heading group"]')).not.toBeNull()
  })

  it("exposes a selected block quotation citation in the section tools", async () => {
    const toolbox = await mountToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.sectionSelected = true
    toolbox.sectionType = "blockquote"
    toolbox.elementAttributes = {
      path: [0],
      localName: "blockquote",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      name: "Quote",
      icon: "Quote",
      attributes: {cite: "source.html"},
    }
    await toolbox.updateComplete

    const citation = toolbox.shadowRoot!.querySelector<HTMLInputElement>(
      'ribbon-drawer[label="Section"] input[type="url"]',
    )!
    expect(citation.value).toBe("source.html")
    const changed = vi.fn()
    toolbox.addEventListener("element-attribute-change", changed)
    citation.value = "https://example.test/source"
    citation.dispatchEvent(new Event("change"))
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({name: "cite", value: "https://example.test/source"}),
    }))
  })

  it("offers caption controls for an active or breadcrumb-selected figure", async () => {
    const toolbox = await mountToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.sectionType = "figure"
    toolbox.figure = {hasCaption: false}
    await toolbox.updateComplete

    expect(toolButton(toolbox, "Edit").getAttribute("aria-label")).toBe("Edit Figure")
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Section"] ribbon-button[label="Add caption above"]'))
      .not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Section"] ribbon-button[label="Add caption below"]'))
      .not.toBeNull()

    toolbox.sectionSelected = true
    toolbox.figure = {hasCaption: true}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Section"] ribbon-button[label="Edit caption"]'))
      .not.toBeNull()
  })

  it("separates Edit, Review, Style, and Develop into their pane-specific controls", async () => {
    const toolbox = await mountToolbox()

    toolButton(toolbox, "Edit").click()
    await toolbox.updateComplete
    let drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    await Promise.all(drawers.map(drawer => drawer.updateComplete))
    expect(drawers.map(drawer => drawer.label)).toEqual(["Style", "Attributes"])
    expect(drawers.every(drawer => drawer.pane && !drawer.collapsed)).toBe(true)
    const defaultAttributes = drawers[1].querySelector("element-attribute-editor")!
    await defaultAttributes.updateComplete
    expect(defaultAttributes.disabled).toBe(true)
    expect(Array.from(defaultAttributes.shadowRoot!.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
      "input, select, button",
    )).every(control => control.disabled)).toBe(true)

    toolButton(toolbox, "Review").click()
    await toolbox.updateComplete
    drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    expect(drawers.map(drawer => drawer.label)).toEqual(["Comments", "Review", "Versions"])
    expect(drawers.every(drawer => drawer.pane && !drawer.collapsed)).toBe(true)
    const review = drawers.find(drawer => drawer.label === "Review")!
    expect(Array.from(review.querySelectorAll<RibbonButton>("ribbon-button"))
      .map(button => button.label)).toEqual([
        "Spelling", "Grammar", "Translate",
        "Track Changes", "Accept", "Reject",
      ])
    expect(drawers.find(drawer => drawer.label === "Comments")!
      .querySelector('textarea[aria-label="Comment text"]')).not.toBeNull()

    toolButton(toolbox, "Style").click()
    await toolbox.updateComplete
    drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>('ribbon-drawer[layout="element-style"]'))
    expect(drawers.map(drawer => drawer.label)).toEqual([
      "Position & Form",
      "Layout",
      "Text",
      "Color & Visibility",
      "Interaction & Motion",
      "Other",
    ])
    expect(drawers.every(drawer => drawer.querySelectorAll("element-style-editor").length === 2)).toBe(true)
    await Promise.all(drawers.map(drawer => drawer.updateComplete))
    const position = drawers[0]
    const controls = position.shadowRoot!.querySelector<HTMLElement>(".controls")!
    const basic = position.querySelector<ElementStyleEditor>("element-style-editor[mode=basic]")!
    const basicGrid = basic.shadowRoot!.querySelector<HTMLElement>(".basic-grid")!
    expect(basic.orientation).toBe("vertical")
    expect(getComputedStyle(controls).display).toBe("flex")
    expect(getComputedStyle(controls).flexDirection).toBe("column")
    expect(getComputedStyle(basicGrid).gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))")
    expect(getComputedStyle(basicGrid).gridTemplateRows).toBe("repeat(3, minmax(2.6rem, auto))")
    expect(RibbonDrawer.styles.toString()).toMatch(
      /:host\(\[pane\]\[layout="element-style"\]\) ::slotted\(element-style-editor\)\s*\{[\s\S]*?width:\s*100%;/,
    )
    const toggle = position.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!
    expect(toggle.parentElement).toBe(controls)
    expect(toggle.querySelector(".drawer-toggle-label")?.textContent).toBe("Advanced options")
    expect(toggle.nextElementSibling?.getAttribute("name")).toBe("more")
    expect(getComputedStyle(toggle).position).toBe("static")
    expect(getComputedStyle(toggle).width).toBe("100%")
    expect(getComputedStyle(toggle).backgroundColor).toBe("transparent")
    expect(getComputedStyle(toggle).borderColor).toBe("transparent")
    toggle.click()
    await position.updateComplete
    const advanced = position.querySelector<ElementStyleEditor>("element-style-editor[mode=advanced]")!
    const advancedContent = advanced.shadowRoot!.querySelector<HTMLElement>(".advanced")!
    expect(position.hasAttribute("drawer-open")).toBe(true)
    expect(toggle.querySelector(".drawer-toggle-label")?.textContent).toBe("Advanced options")
    expect(advanced.orientation).toBe("vertical")
    expect(getComputedStyle(advancedContent).overflow).toBe("visible")
    expect(getComputedStyle(advanced.shadowRoot!.querySelector<HTMLElement>(".advanced-divider")!).display).toBe("none")

    toolButton(toolbox, "Edit").click()
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".developer-console-toggle")).not.toBeNull()
    drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    expect(drawers.map(drawer => drawer.label)).toEqual(["Style", "Attributes"])
  })
})


it("limits the document Style drawer to Background", async () => {
  const toolbox = await mountToolbox()
  toolbox.documentSelected = true
  toolbox.elementStyle = {
    target: {localName: "my-document", namespaceURI: "http://www.w3.org/1999/xhtml", documentRoot: true},
    inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"},
  }
  toolbox.selectTool("Edit")
  await toolbox.updateComplete
  const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Style"]')!
  await drawer.updateComplete
  expect(drawer.expandable).toBe(true)
  const controls = drawer.querySelector<ElementStyleEditor>('element-style-editor[slot="more"]')!
  await controls.updateComplete
  expect(Array.from(controls.shadowRoot!.querySelectorAll("[data-property]"), row => row.getAttribute("data-property"))).toEqual(["background-color"])
})


it("enables heading Reset only for authored drawer styles and resets them together", async () => {
  const toolbox = await mountToolbox()
  toolbox.selectTool("Edit")
  await toolbox.updateComplete
  const reset = () => toolbox.shadowRoot!.querySelector<HTMLButtonElement>('.style-reset')!
  expect(reset().slot).toBe("heading-action")
  expect(reset().disabled).toBe(true)
  toolbox.elementStyle = {
    target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"},
    inline: {"font-family": {value: "serif", priority: ""}},
    computed: {width: "400px"}, context: {display: "block", parentDisplay: "block"},
  }
  await toolbox.updateComplete
  expect(reset().disabled).toBe(true)
  toolbox.elementStyle = {...toolbox.elementStyle, inline: {
    ...toolbox.elementStyle.inline,
    width: {value: "100px", priority: ""},
    color: {value: "red", priority: ""},
    "padding-top": {value: "4px", priority: "important"},
    "border-top-left-radius": {value: "4px", priority: ""},
    "border-left-color": {value: "blue", priority: ""},
  }}
  await toolbox.updateComplete
  expect(reset().disabled).toBe(false)
  const changes: unknown[] = []
  toolbox.addEventListener("element-style-change", event => changes.push((event as CustomEvent).detail))
  reset().click()
  expect(changes).toEqual([{styles: {color: null, width: null, padding: null, "border-radius": null, "border-color": null}}])
  toolbox.documentSelected = true
  await toolbox.updateComplete
  expect(reset().disabled).toBe(true)
  toolbox.elementStyle = {...toolbox.elementStyle, inline: {...toolbox.elementStyle.inline, "background-color": {value: "red", priority: ""}}}
  await toolbox.updateComplete
  reset().click()
  expect(changes.at(-1)).toEqual({styles: {"background-color": null}})
  toolbox.elementStyle = {...toolbox.elementStyle, inline: {}}
  await toolbox.updateComplete
  expect(reset().disabled).toBe(true)
})


it("counts authored advanced fields once each in the Advanced options pill", async () => {
  const toolbox = await mountToolbox()
  toolbox.selectTool("Edit")
  await toolbox.updateComplete
  const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Style"]')!
  await drawer.updateComplete
  expect(drawer.shadowRoot!.querySelector(".advanced-count")!.textContent).toBe("0")
  toolbox.elementStyle = {
    target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"},
    inline: {
      width: {value: "100px", priority: ""},
      "margin-top": {value: "2px", priority: ""},
      "margin-bottom": {value: "4px", priority: ""},
      "border-top-left-radius": {value: "4px", priority: ""},
      "background-color": {value: "red", priority: ""},
      "box-shadow": {value: "0 4px 8px black", priority: ""},
      filter: {value: "sepia(1)", priority: ""},
    }, computed: {height: "300px"}, context: {display: "block", parentDisplay: "block"},
  }
  await toolbox.updateComplete
  await drawer.updateComplete
  expect(drawer.shadowRoot!.querySelector(".advanced-count")!.textContent).toBe("6")
  toolbox.elementStyle = {...toolbox.elementStyle, inline: {}}
  await toolbox.updateComplete
  await drawer.updateComplete
  expect(drawer.shadowRoot!.querySelector(".advanced-count")!.textContent).toBe("0")
})

it("retains Style advanced options through selection changes and outside clicks", async () => {
  const toolbox = await mountToolbox()
  toolbox.selectTool("Edit")
  await toolbox.updateComplete
  const drawer = () => toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Style"]')!
  await drawer().updateComplete
  drawer().shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.click()
  document.body.dispatchEvent(new Event("pointerdown", {bubbles: true}))
  toolbox.elementAttributes = {
    path: [0], localName: "my-widget", namespaceURI: "http://www.w3.org/1999/xhtml", name: "Widget", attributes: {},
  }
  await toolbox.updateComplete
  await drawer().updateComplete
  await drawer().updateComplete
  expect(drawer().shadowRoot!.querySelector(".drawer-toggle")!.getAttribute("aria-expanded")).toBe("true")
  toolbox.documentSelected = true
  await toolbox.updateComplete
  await drawer().updateComplete
  toolbox.documentSelected = false
  await toolbox.updateComplete
  await drawer().updateComplete
  await drawer().updateComplete
  expect(drawer().shadowRoot!.querySelector(".drawer-toggle")!.getAttribute("aria-expanded")).toBe("true")
})

it("remembers advanced options until explicitly collapsed or the toolbox closes", async () => {
  const toolbox = await mountToolbox()
  toolbox.selectTool("Edit")
  await toolbox.updateComplete
  const drawer = () => toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Style"]')!
  const settle = async () => {
    await toolbox.updateComplete
    await drawer().updateComplete
    await drawer().updateComplete
  }
  await settle()
  const toggle = () => drawer().shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.click()
  const isOpen = () => drawer().shadowRoot!.querySelector(".drawer-toggle")!.getAttribute("aria-expanded")
  toggle()
  toolbox.dismissDrawers()
  drawer().dispatchEvent(new CustomEvent("ribbon-button-click", {detail: {}, bubbles: true}))
  toolbox.selectTool("Review")
  await toolbox.updateComplete
  toolbox.selectTool("Edit")
  await settle()
  expect(isOpen()).toBe("true")
  toggle()
  toolbox.elementStyle = {...toolbox.elementStyle, inline: {width: {value: "20px", priority: ""}}}
  await settle()
  expect(isOpen()).toBe("false")
  toggle()
  toolbox.selectTool(null)
  await toolbox.updateComplete
  toolbox.selectTool("Edit")
  await settle()
  expect(isOpen()).toBe("false")
})

describe("widget options drawer", () => {
  it("edits declared options and runs actions", async () => {
    const toolbox = await mountToolbox(false)
    toolbox.selectTool("Edit")
    toolbox.widgetOptions = {
      path: [0],
      localName: "demo-quiz",
      options: [
        {name: "count", type: "number", label: "Count", attribute: "count", value: 3, min: 0},
        {name: "shuffled", type: "boolean", label: "Shuffled", attribute: "shuffled", value: true},
        {name: "mode", type: "select", label: "Mode", attribute: "mode", value: "b", choices: [{value: "a", label: "A"}, {value: "b", label: "B"}]},
        {name: "data", type: "object", label: "Data", attribute: "data", value: {a: 1}},
      ],
      actions: [{name: "reset", label: "Reset"}],
    }
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Widget"]')!
    const changes: unknown[] = []
    toolbox.addEventListener("widget-option-change", event => changes.push((event as CustomEvent).detail))
    const actions: unknown[] = []
    toolbox.addEventListener("widget-action", event => actions.push((event as CustomEvent).detail))

    const number = drawer.querySelector<HTMLInputElement>('input[type="number"]')!
    expect(number.value).toBe("3")
    number.value = "7"
    number.dispatchEvent(new Event("change"))
    const checkbox = drawer.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(checkbox.checked).toBe(true)
    checkbox.checked = false
    checkbox.dispatchEvent(new Event("change"))
    const select = drawer.querySelector("select")!
    // happy-dom misplaces Lit's option.selected bindings; browsers show "b".
    select.value = "a"
    select.dispatchEvent(new Event("change"))
    const json = drawer.querySelector<HTMLTextAreaElement>("textarea[data-json]")!
    json.value = "{broken"
    json.dispatchEvent(new Event("change"))
    json.value = '{"a": 2}'
    json.dispatchEvent(new Event("change"))
    drawer.querySelector<HTMLButtonElement>(".widget-action")!.click()

    expect(changes).toEqual([
      {name: "count", value: 7},
      {name: "shuffled", value: false},
      {name: "mode", value: "a"},
      {name: "data", value: {a: 2}},
    ])
    expect(actions).toEqual([{name: "reset"}])
  })
})

describe("widget sharing toolbox", () => {
  it("places Share after style options, toggles sharing and removes a grouping", async () => {
    const {defaultGroupingRules} = await import("../widget-grouping.js")
    const toolbox = await mountToolbox()
    toolbox.selectTool("Edit")
    toolbox.elementAttributes = {path: [0], localName: "my-widget", namespaceURI: "http://www.w3.org/1999/xhtml", name: "Widget", attributes: {}}
    toolbox.widgetOptions = {path: [0], localName: "my-widget", options: [], actions: [], sharing: {widgetId: "widget", mode: "individual", grouping: null}}
    await toolbox.updateComplete
    const controls = toolbox.shadowRoot!.querySelector(".toolbox-pane-content")!
    const style = controls.querySelector('ribbon-drawer[label="Style"]')!
    const sharing = controls.querySelector(".widget-sharing")!
    expect(getComputedStyle(sharing).paddingLeft).toBe("0px")
    expect(getComputedStyle(sharing).paddingRight).toBe("0px")
    expect(style.compareDocumentPosition(sharing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const listener = vi.fn()
    toolbox.addEventListener("widget-sharing-change", listener)
    const toggle = sharing.querySelector<HTMLInputElement>('input[role="switch"]')!
    expect(toggle.checked).toBe(false)
    toggle.checked = true; toggle.dispatchEvent(new Event("change"))
    expect(listener.mock.calls[0][0].detail).toEqual({path: [0], localName: "my-widget", widgetId: "widget", enabled: true})
    toolbox.widgetOptions = {...toolbox.widgetOptions, sharing: {widgetId: "widget", mode: "all", grouping: null}}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".add-grouping")?.textContent).toBe("Add grouping")
    toolbox.widgetOptions = {...toolbox.widgetOptions, sharing: {widgetId: "widget", mode: "group", grouping: defaultGroupingRules("card")}}
    const removed = vi.fn(); toolbox.addEventListener("widget-grouping-change", removed)
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".grouping-summary")?.textContent).toContain("members per group")
    expect(toolbox.shadowRoot!.querySelector(".add-grouping")).toBeNull()
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Remove grouping"]')!.click()
    expect(removed.mock.calls[0][0].detail.grouping).toBeNull()
    expect(toolbox.shadowRoot!.querySelector("widget-grouping-dialog")).not.toBeNull()
  })
})
