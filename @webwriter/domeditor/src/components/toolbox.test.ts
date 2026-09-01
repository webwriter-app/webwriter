// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {DomEditorToolbox} from "./toolbox"
import type {ElementStyleEditor} from "./element-style-editor"
import type {RibbonButton} from "./ribbon-button"
import {RibbonDrawer} from "./ribbon-drawer"

afterEach(() => {
  document.body.replaceChildren()
})

async function mountToolbox() {
  const toolbox = new DomEditorToolbox()
  document.body.append(toolbox)
  await toolbox.updateComplete
  return toolbox
}

const toolButton = (toolbox: DomEditorToolbox, label: string) =>
  toolbox.shadowRoot!.querySelector<HTMLButtonElement>(`button[data-tool="${label}"]`)!

describe("toolbox", () => {
  it("renders Edit, Style, Review, and Develop as icon-only tabs on the breadcrumb baseline", async () => {
    const toolbox = await mountToolbox()
    const tablist = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-tabs")!
    const tabs = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".toolbox-tab"))
    const buttons = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".toolbox-tab-button"))
    const labels = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".toolbox-tab-label"))

    expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual([
      "Edit", "Style", "Review", "Develop",
    ])
    expect(buttons.map(button => button.getAttribute("aria-selected"))).toEqual([
      "false", "false", "false", "false",
    ])
    expect(labels.map(label => label.textContent)).toEqual(["Edit", "Style", "Review", "Develop"])
    expect(labels.every(label => getComputedStyle(label).opacity === "0")).toBe(true)
    expect(tabs.every(tab => getComputedStyle(tab).width === "28px")).toBe(true)
    expect(getComputedStyle(tablist).borderBottomWidth).toBe("0.5px")
    expect(getComputedStyle(tablist).borderBottomColor).toBe("#a8a8a8")
    expect(buttons[0].querySelector(".icon-tabler-pencil")).not.toBeNull()
    expect(buttons[1].querySelector(".icon-tabler-palette")).not.toBeNull()
    expect(buttons[2].querySelector(".icon-tabler-text-grammar")).not.toBeNull()
    expect(buttons[3].querySelector(".icon-tabler-terminal-2")).not.toBeNull()
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
    expect(getComputedStyle(toolbox).width).toBe("200px")
    expect(edit.getAttribute("aria-selected")).toBe("true")
    expect(style.getAttribute("aria-selected")).toBe("false")
    expect(getComputedStyle(editTab).width).toBe("108px")
    expect(getComputedStyle(editTab).height).toBe("30px")
    expect(getComputedStyle(editTab).marginBottom).toBe("-1px")
    expect(getComputedStyle(editTab).backgroundColor).toBe("#f2f2f2")
    expect(getComputedStyle(editTab).borderLeftColor).toBe("#a8a8a8")
    expect(getComputedStyle(editTab).borderBottomColor).toBe("#f2f2f2")
    expect(getComputedStyle(edit).justifyContent).toBe("flex-start")
    expect(getComputedStyle(tablist).paddingRight).toBe("4px")
    const tabWidth = Array.from(tablist.querySelectorAll<HTMLElement>(".toolbox-tab"))
      .reduce((width, tab) => width + Number.parseFloat(getComputedStyle(tab).width), 0)
    expect(tabWidth + 8).toBe(200)
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
    expect(getComputedStyle(styleTab).width).toBe("108px")
    expect(editClose.disabled).toBe(true)

    const pane = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!
    expect(getComputedStyle(toolbox).width).toBe("200px")
    expect(getComputedStyle(pane).width).toBe("100%")

    styleTab.querySelector<HTMLButtonElement>(".toolbox-tab-close")!.click()
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBeNull()
    expect(toolbox.hasAttribute("active-tool")).toBe(false)
    expect(getComputedStyle(styleTab).width).toBe("28px")
    expect(getComputedStyle(toolbox).width).toBe("122px")
  })

  it("keeps an HTML toggle at the bottom of Edit and doubles the toolbox width in HTML mode", async () => {
    const toolbox = await mountToolbox()
    toolButton(toolbox, "Edit").click()
    await toolbox.updateComplete
    const toggle = toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".html-mode-toggle")!
    let requestedMode: boolean | undefined
    toolbox.addEventListener("html-mode-change", event => {
      requestedMode = (event as CustomEvent<{enabled: boolean}>).detail.enabled
    })

    expect(toggle.querySelector(".icon-tabler-code")).not.toBeNull()
    expect(toggle.getAttribute("aria-pressed")).toBe("false")
    expect(toolbox.shadowRoot!.querySelector(".edit-mode-footer")).not.toBeNull()
    toggle.click()
    expect(requestedMode).toBe(true)

    toolbox.htmlMode = true
    toolbox.htmlSource = "<p>Hello</p>"
    await toolbox.updateComplete
    const pane = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!
    const input = toolbox.shadowRoot!.querySelector<HTMLTextAreaElement>(".html-source-input")!
    expect(getComputedStyle(toolbox).width).toBe("400px")
    expect(getComputedStyle(pane).width).toBe("100%")
    expect(input.value).toBe("<p>Hello</p>")
    expect(toolbox.shadowRoot!.querySelector("ribbon-drawer")).toBeNull()

    let source = ""
    toolbox.addEventListener("html-source-change", event => {
      source = (event as CustomEvent<{value: string}>).detail.value
    })
    input.value = "<p>Changed</p>"
    input.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    expect(source).toBe("<p>Changed</p>")

    toolbox.htmlPending = true
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".html-source-status")?.textContent).toBe("Pending change")
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".html-mode-toggle")!.disabled).toBe(true)
    expect(toolbox.shadowRoot!.querySelector(".html-source-action.apply")).not.toBeNull()
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
    }
    await toolbox.updateComplete
    expect(label.textContent).toBe("Table")
    expect(edit.getAttribute("aria-label")).toBe("Edit Table")
    expect(label.hasAttribute("data-contextual")).toBe(true)
    expect(getComputedStyle(label).color).toBe("#3977c7")
    expect(getComputedStyle(label).opacity).toBe("1")
    expect(getComputedStyle(edit).color).toBe("#3977c7")
    expect(getComputedStyle(editTab).width).toBe("88px")

    edit.click()
    await toolbox.updateComplete
    expect(getComputedStyle(editTab).width).toBe("108px")

    toolButton(toolbox, "Style").click()
    await toolbox.updateComplete
    expect(label.textContent).toBe("Table")
    expect(getComputedStyle(label).opacity).toBe("1")
    expect(getComputedStyle(edit).color).toBe("#3977c7")
    expect(getComputedStyle(editTab).width).toBe("88px")

    toolbox.table = null
    toolbox.graphic = {active: true, capture: false}
    await toolbox.updateComplete
    expect(label.textContent).toBe("Graphic")

    toolbox.graphic = null
    toolbox.form = {type: "input", attributes: {placeholder: "Name"}}
    await toolbox.updateComplete
    expect(label.textContent).toBe("Input")
    expect(edit.getAttribute("aria-label")).toBe("Edit Input")

    toolbox.form = null
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

  it("offers template switching in the Document toolbox for a selected document root", async () => {
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

  it("separates Edit, Review, Style, and Develop into their pane-specific controls", async () => {
    const toolbox = await mountToolbox()

    toolButton(toolbox, "Edit").click()
    await toolbox.updateComplete
    let drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    await Promise.all(drawers.map(drawer => drawer.updateComplete))
    expect(drawers.map(drawer => drawer.label)).toEqual(["Layout", "Borders", "Background"])
    expect(drawers.every(drawer => drawer.pane && !drawer.collapsed)).toBe(true)

    toolButton(toolbox, "Review").click()
    await toolbox.updateComplete
    drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    expect(drawers.map(drawer => drawer.label)).toEqual(["Comments", "Review"])
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

    toolButton(toolbox, "Develop").click()
    await toolbox.updateComplete
    drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    expect(drawers.map(drawer => drawer.label)).toEqual([
      "Local packages", "Metadata", "Development", "Exports",
    ])
  })
})
