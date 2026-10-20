// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DomEditorToolbox} from "./toolbox"
import {RibbonDrawer} from "./ribbon-drawer"
import type {StyleCombobox} from "./style-combobox"
import type {RibbonButton} from "./ribbon-button"
import type {WidgetActionState, WidgetOptionGroupState, WidgetOptionState, WidgetOptionsState} from "../widget-options"

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals() })

async function mountToolbox() {
  const toolbox = new DomEditorToolbox()
  toolbox.showStyleToolbox = false
  document.body.append(toolbox)
  await toolbox.updateComplete
  toolbox.selectTool("Edit")
  return toolbox
}

const drawerFor = (toolbox: DomEditorToolbox) => toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Widget"]')!
const settleChildren = async (root: ParentNode) => {
  await Promise.all(Array.from(root.querySelectorAll<HTMLElement>("style-combobox, ribbon-combobox, ribbon-button"), element =>
    (element as HTMLElement & {updateComplete?: Promise<unknown>}).updateComplete ?? Promise.resolve()))
}
const comboOption = (element: HTMLElement, selector = ".option") => element.shadowRoot!.querySelector<HTMLButtonElement>(selector)!
const widgetState = (options: Omit<WidgetOptionState, "attribute">[], actions: WidgetActionState[] = [], groups?: WidgetOptionGroupState[]): WidgetOptionsState => ({
  path: [0], localName: "demo-controls", options: options.map(option => ({attribute: option.name, ...option})), actions, ...(groups ? {groups} : {}),
})

describe("rich widget options drawer", () => {
  it("renders grouped controls, preserves typed values, and omits hidden options", async () => {
    const toolbox = await mountToolbox()
    toolbox.widgetOptions = widgetState([
      {name: "enabled", label: "Enabled", type: "boolean", value: true, control: "switch", group: "general"},
      {name: "layout", label: "Layout", type: "select", value: "wide", control: "radio", group: "general",
        choices: [{value: "wide", label: "Wide"}, {value: "compact", label: "Compact"}]},
      {name: "secret", label: "Secret", type: "string", value: "hidden", hidden: true, group: "general"},
    ], [], [{name: "general", label: "General", description: "Primary settings"}])
    await toolbox.updateComplete
    const drawer = drawerFor(toolbox)
    const group = drawer.querySelector<HTMLElement>(".widget-option-group")!
    expect(group.textContent).toContain("Primary settings")
    expect(group.querySelector("details")).toBeNull()
    expect(group.querySelector<HTMLInputElement>('input[type="checkbox"][role="switch"]')?.checked).toBe(true)
    expect(group.querySelector('input[type="radio"]')).not.toBeNull()
    expect(drawer.textContent).not.toContain("Secret")

    const changes = vi.fn()
    toolbox.addEventListener("widget-option-change", changes)
    const enabled = group.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    enabled.checked = false
    enabled.dispatchEvent(new Event("change", {bubbles: true}))
    const compact = group.querySelector<HTMLInputElement>('input[type="radio"][value="compact"]')!
    compact.checked = true
    compact.dispatchEvent(new Event("change", {bubbles: true}))
    expect(changes.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      {name: "enabled", value: false}, {name: "layout", value: "compact"},
    ])
  })

  it("uses sorted discrete values for ranges and shows the value unit", async () => {
    const toolbox = await mountToolbox()
    toolbox.widgetOptions = widgetState([
      {name: "spacing", label: "Spacing", type: "number", value: 5, control: "range", steps: [10, 1, 5], unit: "px"},
    ])
    await toolbox.updateComplete
    const drawer = drawerFor(toolbox)
    const range = drawer.querySelector<HTMLInputElement>('input[type="range"]')!
    expect(range.min).toBe("0")
    expect(range.max).toBe("2")
    expect(range.value).toBe("1")
    expect(drawer.querySelector(".widget-option-unit")?.textContent).toContain("px")
    const changes = vi.fn()
    toolbox.addEventListener("widget-option-change", changes)
    range.value = "2"
    range.dispatchEvent(new Event("input", {bubbles: true}))
    expect(changes.mock.calls[0][0].detail).toEqual({name: "spacing", value: 10})
  })

  it("locks unavailable controls and renders group and action states", async () => {
    const toolbox = await mountToolbox()
    toolbox.widgetOptions = widgetState([
      {name: "locked", label: "Locked", type: "boolean", value: true, control: "checkbox", disabled: true},
      {name: "fixed", label: "Fixed", type: "string", value: "initial", readOnly: true},
      {name: "invisible", label: "Invisible", type: "string", value: "x", hidden: true},
    ], [
      {name: "dangerous", label: "Dangerous", intent: "danger", confirm: "Really?"},
      {name: "pending", label: "Pending", busy: true, error: "Try again"},
      {name: "hidden-action", label: "Hidden action", hidden: true},
    ], [{name: "advanced", label: "Advanced", collapsible: true, collapsed: true}])
    await toolbox.updateComplete
    const drawer = drawerFor(toolbox)
    expect(drawer.querySelector(".widget-option-group details[open]")).toBeNull()
    expect(drawer.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true)
    expect(drawer.querySelector('input[readonly]')).not.toBeNull()
    expect(drawer.textContent).not.toContain("Invisible")
    expect(drawer.textContent).not.toContain("Hidden action")
    expect(drawer.querySelector('.widget-action-error[role="alert"]')?.textContent).toContain("Try again")
    expect(drawer.querySelector<HTMLButtonElement>('.widget-action[data-intent="danger"]')?.disabled).toBe(false)
    expect(drawer.querySelector<HTMLElement>('.widget-action[loading]')?.shadowRoot?.querySelector<HTMLButtonElement>(".main-button")?.disabled).toBe(true)

    const changes = vi.fn()
    toolbox.addEventListener("widget-option-change", changes)
    drawer.querySelector<HTMLInputElement>('input[type="checkbox"]')!.dispatchEvent(new Event("change", {bubbles: true}))
    drawer.querySelector<HTMLInputElement>("input[readonly]")!.dispatchEvent(new Event("input", {bubbles: true}))
    expect(changes).not.toHaveBeenCalled()
    expect(drawer.querySelectorAll(".widget-action")).toHaveLength(2)
  })

  it("confirms metadata actions and emits no event when confirmation is declined", async () => {
    const confirm = vi.fn()
    vi.stubGlobal("confirm", confirm)
    const toolbox = await mountToolbox()
    toolbox.widgetOptions = widgetState([], [
      {name: "dangerous", label: "Dangerous", intent: "danger", confirm: "Really?"},
      {name: "legacy", label: "Legacy"},
    ])
    await toolbox.updateComplete
    const actions = vi.fn()
    toolbox.addEventListener("widget-action", actions)
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true)
    const dangerous = () => drawerFor(toolbox).querySelector<HTMLElement>('.widget-action[data-intent="danger"]')!
    dangerous().shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(confirm).toHaveBeenCalledWith("Really?")
    expect(actions).not.toHaveBeenCalled()
    dangerous().shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    drawerFor(toolbox).querySelector<HTMLElement>('.widget-action:not([data-intent])')!.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(actions.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      {name: "dangerous", confirmed: true}, {name: "legacy"},
    ])
  })

  it("keeps complete groups together and preserves a user's expanded state across refreshes", async () => {
    const toolbox = await mountToolbox()
    const groups = [{name: "advanced", label: "Advanced", collapsible: true, collapsed: true}]
    toolbox.widgetOptions = widgetState(
      Array.from({length: 5}, (_, i) => ({name: `field${i}`, label: `Field ${i}`, type: "string" as const, value: "value", group: "advanced"})),
      [{name: "reset", label: "Reset", group: "advanced"}], groups,
    )
    await toolbox.updateComplete
    const group = drawerFor(toolbox).querySelector(".widget-option-group")!
    const details = group.querySelector("details")!
    expect(details.open).toBe(false)
    expect(group.querySelectorAll("input")).toHaveLength(5)
    expect(group.querySelector<RibbonButton>(".widget-action")?.label).toBe("Reset")
    details.open = true
    toolbox.widgetOptions = {...toolbox.widgetOptions!, options: toolbox.widgetOptions!.options.map(option => ({...option, value: "updated"}))}
    await toolbox.updateComplete
    expect(drawerFor(toolbox).querySelector("details")).toBe(details)
    expect(details.open).toBe(true)
  })

  it("honors explicit segmented, input, and select hints instead of toolbox heuristics", async () => {
    const toolbox = await mountToolbox()
    const choices = [{value: "a", label: "A"}, {value: "b", label: "B"}]
    toolbox.widgetOptions = widgetState([
      {name: "alignment", label: "Alignment", type: "select", control: "segmented", choices, value: "a"},
      {name: "count", label: "Count", type: "number", control: "input", value: 3, min: 1, max: 10, unit: "px"},
      {name: "mode", label: "Mode", type: "select", control: "select", choices, value: "a", disabled: true},
    ])
    await toolbox.updateComplete
    const drawer = drawerFor(toolbox)
    const changes = vi.fn()
    toolbox.addEventListener("widget-option-change", changes)
    const buttons = drawer.querySelectorAll<HTMLButtonElement>(".widget-option-segmented button")
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true")
    buttons[1].click()
    const input = drawer.querySelector<HTMLInputElement>('input[type="number"]')!
    input.value = "7"
    input.dispatchEvent(new Event("change"))
    const select = drawer.querySelector<StyleCombobox>("style-combobox")!
    await settleChildren(drawer)
    expect(select.disabled).toBe(true)
    expect(select.options.slice(1)).toEqual(choices)
    expect(changes.mock.calls.map(([event]) => event.detail)).toEqual([
      {name: "alignment", value: "b"}, {name: "count", value: 7},
    ])
  })

  it("formats duration values and validates edits as seconds", async () => {
    const toolbox = await mountToolbox()
    toolbox.widgetOptions = widgetState([
      {name: "duration", label: "Duration", type: "number", value: 65.25, control: "duration", min: 0, max: 7200, step: 0.25} as WidgetOptionState,
    ])
    await toolbox.updateComplete
    const drawer = drawerFor(toolbox)
    const input = drawer.querySelector<HTMLInputElement>("input[data-duration]")!
    expect(input.value).toBe("1:05.25")
    expect(input.min).toBe("0")
    expect(input.max).toBe("7200")
    expect(input.step).toBe("0.25")
    const changes = vi.fn()
    toolbox.addEventListener("widget-option-change", changes)

    input.value = "2:03.5"
    input.dispatchEvent(new Event("change", {bubbles: true}))
    input.value = "1:02:03"
    input.dispatchEvent(new Event("change", {bubbles: true}))
    input.value = ""
    input.dispatchEvent(new Event("change", {bubbles: true}))
    expect(changes.mock.calls.map(([event]) => event.detail.value)).toEqual([123.5, 3723, null])

    for(const invalid of ["not a time", "-0:01"]) {
      input.value = invalid
      input.dispatchEvent(new Event("change", {bubbles: true}))
      expect(input.validity.valid).toBe(false)
    }
    expect(changes).toHaveBeenCalledTimes(3)

    input.value = "2:00:01"
    input.dispatchEvent(new Event("change", {bubbles: true}))
    expect(input.validity.valid).toBe(false)
    expect(changes).toHaveBeenCalledTimes(3)
  })

  it("renders a selectable tree from leaf choices and toggles only known descendants", async () => {
    const toolbox = await mountToolbox()
    toolbox.widgetOptions = widgetState([
      {name: "tree", label: "Tree", type: "select", value: ["a", "unknown"], control: "tree", multiple: true,
        choices: [{value: "a", label: "A"}, {value: "b", label: "B"}],
        tree: [{label: "Group", children: [{label: "A", value: "a"}, {label: "Nested", children: [{label: "B", value: "b"}]}]}]} as WidgetOptionState,
    ])
    await toolbox.updateComplete
    const drawer = drawerFor(toolbox)
    const changes = vi.fn()
    toolbox.addEventListener("widget-option-change", changes)
    const tree = drawer.querySelector(".widget-option-tree")!
    const branch = tree.querySelector<HTMLInputElement>('input[data-tree-group="Group"]')!
    expect(branch.indeterminate).toBe(true)
    expect(tree.querySelector<HTMLInputElement>('input[data-value="a"]')?.checked).toBe(true)

    branch.checked = true
    branch.dispatchEvent(new Event("change", {bubbles: true}))
    expect(changes.mock.calls.at(-1)?.[0].detail).toEqual({name: "tree", value: ["a", "unknown", "b"]})
    const selectAll = tree.querySelector<HTMLInputElement>('input[data-tree-select-all]')!
    selectAll.checked = false
    selectAll.dispatchEvent(new Event("change", {bubbles: true}))
    expect(changes.mock.calls.at(-1)?.[0].detail).toEqual({name: "tree", value: ["unknown"]})
  })

  it("shows missing references without silently changing the stored value", async () => {
    const toolbox = await mountToolbox()
    toolbox.widgetOptions = widgetState([
      {name: "source", label: "Source", type: "reference", value: "gone", referenceMissing: true,
        choices: [{value: "live", label: "Source #live"}]} as WidgetOptionState,
    ])
    await toolbox.updateComplete
    const drawer = drawerFor(toolbox)
    const select = drawer.querySelector<StyleCombobox>("style-combobox")!
    await settleChildren(drawer)
    expect(select.disabled).toBe(false)
    expect(select.options.map(option => option.value)).toEqual(["", "gone", "live"])
    const changes = vi.fn()
    toolbox.addEventListener("widget-option-change", changes)
    expect(changes).not.toHaveBeenCalled()
    select.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await select.updateComplete
    const missing = select.shadowRoot!.querySelector<HTMLButtonElement>('.option:disabled')
    expect(missing?.textContent).toContain("Missing reference: #gone")
    Array.from(select.shadowRoot!.querySelectorAll<HTMLButtonElement>(".option")).find(option => option.textContent?.includes("Source #live"))!.click()
    expect(changes.mock.calls.map(([event]) => event.detail)).toEqual([{name: "source", value: "live"}])
    select.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await select.updateComplete
    Array.from(select.shadowRoot!.querySelectorAll<HTMLButtonElement>(".option")).find(option => option.textContent?.includes("Default"))!.click()
    expect(changes.mock.calls.at(-1)?.[0].detail).toEqual({name: "source", value: null})
  })

  it("uses shared pickers with lock guards, multiple values, and validated numeric presets", async () => {
    const toolbox = await mountToolbox()
    toolbox.widgetOptions = widgetState([
      {name: "locked", label: "Locked", type: "select", value: "a", choices: [{value: "a", label: "A"}], readOnly: true},
      {name: "many", label: "Many", type: "select", value: ["a", "removed"], multiple: true, choices: [{value: "a", label: "A"}, {value: "b", label: "B"}]},
      {name: "size", label: "Size", type: "number", value: 2, min: 1, max: 4, steps: [1, 2, 4], unit: "px"},
    ])
    await toolbox.updateComplete
    const drawer = drawerFor(toolbox)
    await settleChildren(drawer)
    const combos = Array.from(drawer.querySelectorAll<StyleCombobox>("style-combobox"))
    const changes = vi.fn()
    toolbox.addEventListener("widget-option-change", changes)
    expect(combos[0].disabled).toBe(true)
    combos[0].dispatchEvent(new CustomEvent("combobox-change", {detail: {value: "x"}, bubbles: true, composed: true}))
    expect(combos[2].unit).toBe("px")
    expect(combos[2].label).toBe("Size (px)")
    combos[1].dispatchEvent(new CustomEvent("combobox-change", {detail: {value: "b", values: ["a", "removed", "b"]}, bubbles: true, composed: true}))
    expect(changes.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([{name: "many", value: ["a", "b"]}])
    await toolbox.updateComplete
    const size = drawerFor(toolbox).querySelectorAll<StyleCombobox>("style-combobox")[2]
    size.dispatchEvent(new CustomEvent("combobox-change", {detail: {value: "99"}, bubbles: true, composed: true}))
    expect(changes).toHaveBeenCalledTimes(1)
    expect(changes.mock.calls[0][0].detail).toEqual({name: "many", value: ["a", "b"]})
  })

  it("routes color picks only through widget-option-change", async () => {
    const toolbox = await mountToolbox()
    toolbox.widgetOptions = widgetState([{name: "tone", label: "Tone", type: "color", value: "#112233", swatches: ["#445566"]}])
    await toolbox.updateComplete
    const drawer = drawerFor(toolbox)
    await settleChildren(drawer)
    const color = drawer.querySelector<HTMLElement>('ribbon-combobox[variant="color"]')!
    const widgetChanges = vi.fn()
    const ribbonChanges = vi.fn()
    toolbox.addEventListener("widget-option-change", widgetChanges)
    toolbox.addEventListener("ribbon-combobox-change", ribbonChanges)
    color.dispatchEvent(new CustomEvent("ribbon-combobox-change", {detail: {value: "#445566"}, bubbles: true, composed: true}))
    expect(widgetChanges.mock.calls[0][0].detail).toEqual({name: "tone", value: "#445566"})
    expect(ribbonChanges).not.toHaveBeenCalled()
  })

  it("keeps numeric step constraints when using the shared value picker", async () => {
    const toolbox = await mountToolbox()
    toolbox.widgetOptions = widgetState([{name: "size", label: "Size", type: "number", value: 1, min: 0, max: 3, step: .25, unit: "px"}])
    await toolbox.updateComplete
    const combo = drawerFor(toolbox).querySelector<StyleCombobox>("style-combobox")!
    await combo.updateComplete
    const changes = vi.fn()
    toolbox.addEventListener("widget-option-change", changes)
    for(const value of [".6", "0x10", "Infinity", "4"]) {
      combo.dispatchEvent(new CustomEvent("combobox-change", {detail: {value}}))
    }
    expect(changes).not.toHaveBeenCalled()
    combo.dispatchEvent(new CustomEvent("combobox-change", {detail: {value: ".75"}}))
    expect(changes.mock.calls[0][0].detail).toEqual({name: "size", value: .75})
  })

  it("closes an open widget picker when menus are dismissed", async () => {
    const toolbox = await mountToolbox()
    toolbox.widgetOptions = widgetState([{name: "layout", label: "Layout", type: "select", control: "select", value: "a", choices: [{value: "a", label: "A"}]}])
    await toolbox.updateComplete
    const drawer = drawerFor(toolbox)
    await settleChildren(drawer)
    const combo = drawerFor(toolbox).querySelector<StyleCombobox>("style-combobox")!
    combo.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await combo.updateComplete
    expect(combo.hasAttribute("popup-open")).toBe(true)
    toolbox.dismissMenus()
    await combo.updateComplete
    expect(combo.hasAttribute("popup-open")).toBe(false)
  })

  it("clears number and reference widget values while guarding locked fields", async () => {
    const toolbox = await mountToolbox()
    toolbox.widgetOptions = widgetState([
      {name: "size", label: "Size", type: "number", value: 3, min: 1, max: 5},
      {name: "source", label: "Source", type: "reference", value: "live", choices: [{value: "live", label: "Live"}]},
      {name: "fixed", label: "Fixed", type: "string", value: "keep", readOnly: true},
    ])
    await toolbox.updateComplete
    const drawer = drawerFor(toolbox)
    const changes = vi.fn()
    toolbox.addEventListener("widget-option-change", changes)
    const clear = (label: string) => drawer.querySelector<HTMLButtonElement>(`.field-clear[aria-label="Clear ${label}"]`)!
    expect(clear("Size").disabled).toBe(false)
    clear("Size").click()
    clear("Source").click()
    expect(clear("Fixed").disabled).toBe(true)
    clear("Fixed").click()
    expect(changes.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      {name: "size", value: null}, {name: "source", value: null},
    ])
  })

  it("keeps file action metadata in the action button and emits only its legacy action event", async () => {
    const toolbox = await mountToolbox()
    toolbox.widgetOptions = widgetState([], [
      {name: "import", label: "Import", input: {type: "file", accept: ".ggb", multiple: true}} as WidgetActionState,
    ])
    await toolbox.updateComplete
    const drawer = drawerFor(toolbox)
    expect(drawer.querySelector('input[type="file"]')).toBeNull()
    const action = drawer.querySelector<HTMLElement>("ribbon-button.widget-action")!
    const events = vi.fn()
    toolbox.addEventListener("widget-action", events)
    await settleChildren(drawer)
    action.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(events.mock.calls[0][0].detail).toEqual({name: "import"})
    expect(events.mock.calls[0][0].detail).not.toHaveProperty("files")
  })

})
