// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import type {ElementStyleState} from "../editor-bridge"
import type {LayoutSelectionState} from "../layouts"
import {LayoutEditor, type LayoutAction} from "./layout-editor"
import type {ElementStyleEditor} from "./element-style-editor"

const styleState = (inline: ElementStyleState["inline"] = {}): ElementStyleState => ({
  target: {localName: "section", namespaceURI: "http://www.w3.org/1999/xhtml"},
  inline,
  computed: {display: "grid", gap: "16px", padding: "0px"},
  context: {display: "grid", parentDisplay: "block"},
})

const gridState = (item = false): LayoutSelectionState => ({
  kind: "grid",
  item,
  columns: {tracks: ["minmax(0, 1fr)", "2fr"], automatic: 1, reason: null},
  rows: {tracks: ["auto"], automatic: 2, reason: null},
  style: styleState(),
})

const mount = async (state = gridState(), itemStyle?: ElementStyleState) => {
  const editor = new LayoutEditor()
  editor.state = itemStyle ? {...state, itemStyle} as LayoutSelectionState : state
  editor.styleState = styleState()
  document.body.append(editor)
  await editor.updateComplete
  await customElements.whenDefined("element-style-editor")
  await Promise.all(Array.from(editor.shadowRoot!.querySelectorAll<ElementStyleEditor>("element-style-editor"), child => child.updateComplete))
  return editor
}

afterEach(() => document.body.replaceChildren())

describe("layout editor", () => {
  it("renders explicit and automatic grid tracks", async () => {
    const editor = await mount()
    const root = editor.shadowRoot!

    expect(root.querySelector('[data-axis="column"]')).not.toBeNull()
    expect(root.querySelectorAll('[data-axis="column"] [data-track-index]')).toHaveLength(2)
    expect(root.querySelector('[data-axis="row"]')).not.toBeNull()
    expect(root.textContent).toContain("1 automatic column")
    expect(root.textContent).toContain("2 automatic rows")
    expect(root.querySelector('[data-axis="column"] input')!.getAttribute("aria-label")).toBe("Column 1 size")
  })

  it("emits track insertion, removal, sizing, and reset actions", async () => {
    const editor = await mount()
    const actions: LayoutAction[] = []
    editor.addEventListener("layout-action", event => actions.push((event as CustomEvent<LayoutAction>).detail))
    const column = editor.shadowRoot!.querySelector<HTMLElement>('[data-axis="column"][data-track-index="0"]')!

    column.querySelector<HTMLButtonElement>(".track-button")!.click()
    column.querySelectorAll<HTMLButtonElement>(".track-button")[1].click()
    column.querySelector<HTMLButtonElement>(".remove")!.click()
    const input = column.querySelector<HTMLInputElement>("input")!
    input.value = "minmax(120px, auto)"
    input.dispatchEvent(new Event("change", {bubbles: true}))
    column.querySelector<HTMLButtonElement>(".reset-button")!.click()

    expect(actions).toEqual([
      {type: "insertLayoutTrack", axis: "column", index: 0},
      {type: "insertLayoutTrack", axis: "column", index: 1},
      {type: "removeLayoutTrack", axis: "column", index: 0},
      {type: "setLayoutTrackSize", axis: "column", index: 0, value: "minmax(120px, auto)"},
      {type: "setLayoutTrackSize", axis: "column", index: 0, value: "auto"},
    ])
  })

  it("translates style editor changes and only shows item controls for an item", async () => {
    const editor = await mount(gridState(true), styleState({"grid-column": {value: "1 / 3", priority: ""}}))
    const actions: LayoutAction[] = []
    editor.addEventListener("layout-action", event => actions.push((event as CustomEvent<LayoutAction>).detail))
    const editors = editor.shadowRoot!.querySelectorAll<ElementStyleEditor>("element-style-editor")
    const itemEditor = Array.from(editors).find(child => child.state.inline["grid-column"])
    expect(itemEditor).toBeDefined()
    expect(itemEditor!.shadowRoot!.querySelector('[data-property="grid-column"]')).not.toBeNull()
    expect(editor.shadowRoot!.querySelector(".item-panel")).not.toBeNull()

    itemEditor!.dispatchEvent(new CustomEvent("element-style-change", {
      detail: {property: "grid-column", mutation: {value: "2 / 4", priority: ""}},
      bubbles: true,
      composed: true,
    }))
    expect(actions.at(-1)).toEqual({
      type: "setLayoutStyles",
      styles: {"grid-column": {value: "2 / 4", priority: ""}},
      target: "item",
    })

    editor.state = gridState(false)
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".item-panel")).toBeNull()
  })

  it("disables structural editing with the supplied capability reason", async () => {
    const editor = await mount({
      kind: "grid",
      item: false,
      columns: {tracks: null, automatic: 3, reason: "Variable track topology cannot be edited as a list."},
      rows: {tracks: null, automatic: 1, reason: "Subgrid rows are controlled by the parent."},
      style: styleState(),
    })

    expect(editor.shadowRoot!.querySelector('[data-axis="column"] .capability')!.textContent).toContain("Variable track topology")
    expect(editor.shadowRoot!.querySelector('[data-axis="column"] .track-list')).toBeNull()
    expect(editor.shadowRoot!.querySelector('[data-axis="row"] .capability')!.textContent).toContain("Subgrid rows")
    expect(editor.shadowRoot!.querySelector('[data-axis="column"] .automatic')!.textContent).toContain("3 automatic columns")
  })

  it("disables unsupported and boundary structural operations", async () => {
    const editor = await mount({
      kind: "grid",
      item: false,
      columns: {tracks: ["1fr"], automatic: 0, reason: null},
      rows: {tracks: Array.from({length: 100}, () => "auto"), automatic: 0, reason: null},
      style: styleState(),
    })
    const column = editor.shadowRoot!.querySelector('[data-axis="column"]')!
    const row = editor.shadowRoot!.querySelector('[data-axis="row"]')!
    expect(column.querySelector<HTMLButtonElement>(".remove")!.disabled).toBe(true)
    expect(Array.from(row.querySelectorAll<HTMLButtonElement>(".track-button:not(.remove)")).every(button => button.disabled)).toBe(true)
  })

  it("switches modes through the layout action contract", async () => {
    const editor = await mount()
    const actions: LayoutAction[] = []
    editor.addEventListener("layout-action", event => actions.push((event as CustomEvent<LayoutAction>).detail))
    editor.shadowRoot!.querySelector<HTMLButtonElement>('.mode-switch button[aria-pressed="false"]')!.click()

    expect(actions).toEqual([{type: "setLayoutStyles", styles: {display: "flex"}, target: "container"}])
  })
})
