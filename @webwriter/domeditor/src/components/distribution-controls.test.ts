// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { DistributionConfig, DistributionItem } from "../distribution.js"
import { InsertionMenu, ribbonInsertionDragType, nodeDragType } from "./insertion-menu"
import { DistributionControls, type DistributionSelectionState } from "./distribution-controls"

const inheritedConfig: DistributionConfig = {
  version: 1,
  target: "source-target",
  scope: "group",
  permissions: ["edit", "style", "insert"],
  add: ["user-snippet:quote"],
  items: [{ id: "user-snippet:quote", label: "Quote snippet", html: "<blockquote>hello</blockquote>" }],
}

const choices: DistributionItem[] = [
  { id: "element:section", label: "Section", html: "<section></section>" },
  { id: "element:paragraph", label: "Paragraph", html: "<p></p>" },
  { id: "user-snippet:quote", label: "Quote snippet", html: "<blockquote>hello</blockquote>" },
  { id: "package-member:sample/widget", label: "Sample widget", html: "<sample-widget></sample-widget>" },
]

const makeState = (overrides: Partial<DistributionSelectionState> = {}): DistributionSelectionState => ({
  target: "target-1",
  local: null,
  effective: null,
  inheritedFrom: null,
  ...overrides,
})

type DistributionChangeDetail = {
  target: string
  config: DistributionConfig | null
  general?: boolean
}

const mount = async (state: DistributionSelectionState | null, items = choices) => {
  const control = new DistributionControls()
  control.state = state
  control.items = items
  document.body.append(control)
  await control.updateComplete
  return control
}

const changes = (control: DistributionControls) => {
  const received: DistributionChangeDetail[] = []
  control.addEventListener("distribution-config-change", (event) => {
    received.push((event as CustomEvent<DistributionChangeDetail>).detail)
  })
  return received
}

const dragEvent = (type: string, dataTransfer: DataTransfer) =>
  Object.assign(new Event(type, {bubbles: true, cancelable: true}), {dataTransfer})

const addButton = (control: DistributionControls) =>
  control.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Add element"]')!

const chooseFromPicker = async (control: DistributionControls, label: string) => {
  addButton(control).click()
  await control.updateComplete
  const menu = control.shadowRoot!.querySelector<InsertionMenu>("domeditor-insertion-menu")!
  await menu.updateComplete
  const option = [...menu.shadowRoot!.querySelectorAll<HTMLButtonElement>(".item")]
    .find((button) => button.querySelector(".item-name")?.textContent === label)!
  option.click()
  await control.updateComplete
}

afterEach(() => document.body.replaceChildren())

describe("distribution controls", () => {
  it("highlights the inactive Insert card for the whole ribbon drag and clears it on dragend", async () => {
    const control = await mount(makeState())
    control.general = true
    control.insertDragActive = true
    await control.updateComplete
    expect(control.shadowRoot!.querySelectorAll(".drop-active")).toHaveLength(1)
    const card = control.shadowRoot!.querySelector('[data-permission="insert"]')!
    expect(card.classList.contains("drop-active")).toBe(true)
    expect(card.querySelector<HTMLInputElement>("input")!.checked).toBe(false)
    control.pending = true
    await control.updateComplete
    expect(card.classList.contains("drop-active")).toBe(true)
    control.insertDragActive = false
    await control.updateComplete
    expect(card.classList.contains("drop-active")).toBe(false)
    control.insertDragActive = true
    control.disabled = true
    await control.updateComplete
    expect(card.classList.contains("drop-active")).toBe(false)
  })

  it.each([ribbonInsertionDragType, nodeDragType])("accepts %s on the inactive Insert card and highlights only that card", async type => {
    const control = await mount(makeState())
    control.general = true
    await control.updateComplete
    const card = control.shadowRoot!.querySelector('[data-permission="insert"]')!
    const data = new DataTransfer()
    data.setData(type, type === nodeDragType ? "drag-token" : "element:p")
    const over = dragEvent("dragover", data)
    card.dispatchEvent(over)
    await control.updateComplete
    expect(over.defaultPrevented).toBe(true)
    expect(data.dropEffect).toBe("copy")
    expect(card.classList.contains("drop-active")).toBe(true)
    const received: unknown[] = []
    control.addEventListener("distribution-insert-drop", event => received.push((event as CustomEvent).detail))
    const drop = dragEvent("drop", data)
    card.dispatchEvent(drop)
    await control.updateComplete
    expect(drop.defaultPrevented).toBe(true)
    expect(received).toEqual([{target: "target-1", general: true, ...(type === nodeDragType ? {token: "drag-token"} : {action: "element:p"})}])
    expect(card.classList.contains("drop-active")).toBe(false)
  })

  it("ignores arbitrary HTML drops and locked cards", async () => {
    const control = await mount(makeState())
    control.general = true
    await control.updateComplete
    const card = control.shadowRoot!.querySelector('[data-permission="insert"]')!
    const data = new DataTransfer()
    data.setData("text/html", "<p>foreign</p>")
    const received: unknown[] = []
    control.addEventListener("distribution-insert-drop", event => received.push(event))
    card.dispatchEvent(dragEvent("drop", data))
    data.setData(ribbonInsertionDragType, "element:p")
    control.disabled = true
    await control.updateComplete
    const drop = dragEvent("drop", data)
    card.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(false)
    expect(received).toEqual([])
  })

  it("clears the drop highlight on exit and when its target changes", async () => {
    const control = await mount(makeState())
    control.general = true
    await control.updateComplete
    const card = control.shadowRoot!.querySelector('[data-permission="insert"]')!
    const data = new DataTransfer()
    data.setData(nodeDragType, "token")
    const over = () => card.dispatchEvent(dragEvent("dragover", data))
    over()
    await control.updateComplete
    card.dispatchEvent(new DragEvent("dragleave"))
    await control.updateComplete
    expect(card.classList.contains("drop-active")).toBe(false)
    over()
    await control.updateComplete
    control.state = makeState({target: "another"})
    await control.updateComplete
    await control.updateComplete
    expect(card.classList.contains("drop-active")).toBe(false)
  })

  it("keeps the existing default insertion choices when no supplied list is given", () => {
    const menu = new InsertionMenu()
    expect(menu.items).toBeNull()
    expect(menu.filteredItems.some((item) => item.tag === "p")).toBe(true)
  })

  it("can hide its internal heading when a surrounding ribbon drawer provides one", async () => {
    const control = await mount(makeState({ local: { version: 1, target: "target-1", scope: "individual", permissions: [], add: [], items: [] } }))
    control.heading = "Permissions for readers"
    control.hideHeading = true
    await control.updateComplete
    expect(control.shadowRoot!.querySelector("h2")).toBeNull()
    control.hideHeading = false
    await control.updateComplete
    expect(control.shadowRoot!.querySelector("h2")?.textContent).toBe("Permissions for readers")
  })

  it("renders permissions in the canonical order and uses their concise labels", async () => {
    const control = await mount(makeState({ local: { version: 1, target: "target-1", scope: "individual", permissions: [], add: [], items: [] } }))
    const labels = [...control.shadowRoot!.querySelectorAll(".permissions label")]
      .map((label) => label.textContent?.trim())
    expect(labels).toEqual(["Edit", "Move", "Delete", "Duplicate", "Style", "Insert"])
  })

  it("renders one card per permission with a leading icon and a trailing large native checkbox", async () => {
    const control = await mount(makeState({local: {...inheritedConfig, target: "target-1"}}))
    const cards = [...control.shadowRoot!.querySelectorAll<HTMLElement>(".permission-card")]
    expect(cards).toHaveLength(6)
    expect(getComputedStyle(control.shadowRoot!.querySelector(".permissions")!).gridTemplateColumns).toBe("minmax(0, 1fr)")
    for(const card of cards) {
      const label = card.querySelector(".permission")!
      expect(label.querySelector(".permission-icon")?.getAttribute("aria-hidden")).toBe("true")
      expect(label.querySelector(".permission-icon svg")).not.toBeNull()
      const checkbox = label.querySelector<HTMLInputElement>("input[type=checkbox]")!
      expect(checkbox.localName).toBe("input")
      expect(getComputedStyle(checkbox).width).toBe("20px")
    }
  })

  it("keeps allowed additions dormant until Insert is enabled and preserves them when disabled", async () => {
    const local: DistributionConfig = {...inheritedConfig, target: "target-1", permissions: []}
    const control = await mount(makeState({local}))
    const received = changes(control)
    const card = control.shadowRoot!.querySelector<HTMLElement>('[data-permission="insert"]')!
    const toggle = card.querySelector<HTMLInputElement>(".permission input")!
    expect(card.querySelector(".insert-options")).toBeNull()

    toggle.checked = true
    toggle.dispatchEvent(new Event("change", {bubbles: true}))
    expect(received[0].config?.permissions).toEqual(["insert"])
    expect(received[0].config?.add).toEqual(local.add)
    expect(received[0].config?.items).toEqual(local.items)
    control.state = {...makeState({local: received[0].config}), target: "target-1"}
    await control.updateComplete
    const list = card.querySelector('ul[aria-label="Allowed additions"]')!
    expect(list.querySelectorAll("li")).toHaveLength(1)
    expect(card.querySelector(".insert-add")?.getAttribute("aria-label")).toBe("Add element")

    card.querySelector<HTMLButtonElement>(".insert-add")!.click()
    await control.updateComplete
    expect(card.querySelector("domeditor-insertion-menu")).not.toBeNull()
    toggle.checked = false
    toggle.dispatchEvent(new Event("change", {bubbles: true}))
    expect(received[1].config?.permissions).toEqual([])
    expect(received[1].config?.add).toEqual(local.add)
    expect(received[1].config?.items).toEqual(local.items)
    control.state = {...makeState({local: received[1].config}), target: "target-1"}
    await control.updateComplete
    expect(card.querySelector(".insert-options")).toBeNull()
    expect(control.shadowRoot!.querySelector("domeditor-insertion-menu")).toBeNull()

    toggle.checked = true
    toggle.dispatchEvent(new Event("change", {bubbles: true}))
    control.state = {...makeState({local: received[2].config}), target: "target-1"}
    await control.updateComplete
    expect(card.querySelector('ul[aria-label="Allowed additions"] li')).not.toBeNull()
  })

  it("closes the picker when external state disables Insert", async () => {
    const local: DistributionConfig = {...inheritedConfig, target: "target-1"}
    const control = await mount(makeState({local}))
    addButton(control).click()
    await control.updateComplete
    expect(control.shadowRoot!.querySelector("domeditor-insertion-menu")).not.toBeNull()
    control.state = makeState({local: {...local, permissions: ["edit", "style"]}})
    await control.updateComplete
    expect(control.shadowRoot!.querySelector("domeditor-insertion-menu")).toBeNull()
    expect(control.shadowRoot!.querySelector('[data-permission="insert"] .insert-options')).toBeNull()
  })

  it("edits inherited permissions directly, copying the complete effective policy without inheritance controls", async () => {
    const control = await mount(makeState({ effective: inheritedConfig, inheritedFrom: "group-4" }))
    const received = changes(control)
    expect(control.shadowRoot!.textContent).not.toContain("Inherited from")
    expect(control.shadowRoot!.textContent).not.toContain("configuration")
    control.shadowRoot!.querySelector<HTMLInputElement>('[data-permission="move"] input')!.click()
    expect(received).toEqual([{ target: "target-1", config: { ...inheritedConfig, target: "target-1", permissions: ["edit", "style", "insert", "move"], add: ["user-snippet:quote"], items: [{ ...inheritedConfig.items[0] }] } }])
  })

  it("creates an empty, explicit override when no configuration is effective", async () => {
    const control = await mount(makeState())
    const received = changes(control)
    expect(control.shadowRoot!.querySelectorAll("ul li")).toHaveLength(0)
    control.shadowRoot!.querySelector<HTMLInputElement>('[data-permission="edit"] input')!.click()
    expect(received[0]).toEqual({
      target: "target-1",
      config: { version: 1, target: "target-1", scope: "individual", permissions: ["edit"], add: [], items: [] },
    })
  })

  it("keeps a selected target with no authored id and uses a valid config placeholder", async () => {
    const control = await mount(makeState({ target: "" }))
    const received = changes(control)
    control.shadowRoot!.querySelector<HTMLInputElement>('[data-permission="edit"] input')!.click()
    expect(received[0].target).toBe("")
    expect(received[0].config?.target).toBe("selection")
  })

  it("renders general permissions without selection controls and edits a local-or-empty root config", async () => {
    const state = makeState({ effective: inheritedConfig, inheritedFrom: "parent-group" })
    const control = await mount(state)
    control.general = true
    control.heading = ""
    await control.updateComplete
    const received = changes(control)
    expect(control.shadowRoot!.querySelector("h2")?.textContent).toBe("Permissions for readers")
    expect(control.shadowRoot!.querySelector("select")).toBeNull()
    expect([...control.shadowRoot!.querySelectorAll("button")].map((button) => button.textContent?.trim())).toEqual([])
    expect([...control.shadowRoot!.querySelectorAll<HTMLInputElement>("input")].every((input) => !input.disabled)).toBe(true)

    const edit = control.shadowRoot!.querySelector<HTMLInputElement>(".permissions input[type=checkbox]")!
    edit.checked = true
    edit.dispatchEvent(new Event("change", { bubbles: true }))
    expect(received[0]).toEqual({
      target: "target-1",
      general: true,
      config: { version: 1, target: "target-1", scope: "individual", permissions: ["edit"], add: [], items: [] },
    })

    control.state = { ...state, local: received[0].config }
    await control.updateComplete
    const insertPermission = control.shadowRoot!.querySelector<HTMLInputElement>('[data-permission="insert"] input')!
    expect(addButton(control)).toBeNull()
    insertPermission.checked = true
    insertPermission.dispatchEvent(new Event("change", { bubbles: true }))
    control.state = { ...state, local: received[1].config }
    await control.updateComplete
    addButton(control).click()
    await control.updateComplete
    const search = control.shadowRoot!.querySelector<HTMLInputElement>(".picker-search")!
    expect(search.placeholder).toBe("++ Search elements")
    expect(search.getAttribute("aria-label")).toBe("Search elements to allow")
    const menu = control.shadowRoot!.querySelector<InsertionMenu>("domeditor-insertion-menu")!
    await menu.updateComplete
    expect(menu.inline).toBe(true)
    expect(menu.items?.map((item) => item.id)).toEqual(["element:*", ...choices.map((item) => item.id)])
    expect(menu.filteredItems.some((item) => item.tag === "p")).toBe(false)
    const snippet = [...menu.shadowRoot!.querySelectorAll<HTMLButtonElement>(".item")].find((button) => button.textContent?.includes("Quote snippet"))!
    snippet.click()
    expect(received[1].general).toBe(true)
    expect(received[2].config?.permissions).toEqual(["edit", "insert"])
    expect(received[2].config?.add).toEqual(["user-snippet:quote"])
    expect(received[2].config?.items).toEqual([choices[2]])
  })

  it("omits inheritance and override controls for local configurations", async () => {
    const local = { ...inheritedConfig, target: "target-1" }
    const control = await mount(makeState({ local }))
    const received = changes(control)
    expect(control.shadowRoot!.textContent).not.toMatch(/Inherited from|Inherit configuration|Override|Create configuration/)
    expect(received).toEqual([])
  })

  it("emits grouping and permission edits against the current local configuration", async () => {
    const control = await mount(makeState({ local: { ...inheritedConfig, target: "target-1" } }))
    const received = changes(control)
    control.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Bigger group"]')!.click()
    const editPermission = control.shadowRoot!.querySelector<HTMLInputElement>(".permissions input[type=checkbox]")!
    editPermission.checked = false
    editPermission.dispatchEvent(new Event("change", { bubbles: true }))
    expect(received[0].config).toMatchObject({scope: "group", groupSize: 4})
    expect(received[1].config?.permissions).toEqual(["style", "insert"])
  })

  it("renders just the white bordered grouping control without a label in grouping view", async () => {
    const control = await mount(makeState({effective: inheritedConfig, inheritedFrom: "outer"}))
    const received = changes(control)
    control.view = "grouping"
    control.hideHeading = true
    await control.updateComplete
    expect(control.shadowRoot!.querySelector(".permissions, h2, label")).toBeNull()
    expect(control.shadowRoot!.textContent).not.toMatch(/Inherited|configuration|Grouping/)
    const grouping = control.shadowRoot!.querySelector(".grouping")!
    expect(getComputedStyle(grouping).backgroundColor).toBe("#fff")
    expect(getComputedStyle(grouping).borderTopColor).toBe("#c5ccd5")
    control.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Bigger group"]')!.click()
    expect(received[0].config).toMatchObject({target: "target-1", groupSize: 4, items: inheritedConfig.items, permissions: inheritedConfig.permissions})
  })

  it("renders half-height permission cards without grouping in compact permission view", async () => {
    const control = await mount(makeState({local: {...inheritedConfig, target: "target-1"}}))
    control.view = "permissions"
    control.compact = true
    await control.updateComplete
    expect(control.shadowRoot!.querySelector(".grouping")).toBeNull()
    expect(control.shadowRoot!.querySelectorAll(".permission-card")).toHaveLength(6)
    expect(getComputedStyle(control.shadowRoot!.querySelector(".permission")!).minHeight).toBe("18.4px")
    expect(getComputedStyle(control.shadowRoot!.querySelector(".permission input")!).width).toBe("12.8px")
  })

  it("keeps grouping visible but greyed out without a target", async () => {
    const control = await mount(null)
    control.view = "grouping"
    control.hideHeading = true
    await control.updateComplete
    const grouping = control.shadowRoot!.querySelector(".grouping")!
    expect(grouping.getAttribute("aria-disabled")).toBe("true")
    expect(getComputedStyle(grouping).opacity).toBe("0.5")
    expect(getComputedStyle(grouping).filter).toBe("grayscale(1)")
    expect([...grouping.querySelectorAll("button")].every(button => button.disabled)).toBe(true)
    const received = changes(control)
    grouping.querySelector<HTMLButtonElement>('[aria-label="Bigger group"]')!.click()
    expect(received).toEqual([])
  })

  it("keeps the compact permission cards visible and disabled without a target", async () => {
    const control = await mount(null)
    control.view = "permissions"
    control.compact = true
    control.hideHeading = true
    await control.updateComplete
    expect(control.shadowRoot!.querySelectorAll(".permission-card")).toHaveLength(6)
    expect([...control.shadowRoot!.querySelectorAll("input")].every(input => input.disabled)).toBe(true)
    expect(control.shadowRoot!.textContent).not.toContain("Select an element")
  })

  it("selects groups or All as separate segments while remembering and adjusting the group count", async () => {
    const control = await mount(makeState({local: {...inheritedConfig, target: "target-1", scope: "individual"}}))
    let writes = 0
    control.addEventListener("distribution-config-change", event => {
      writes++
      const config = (event as CustomEvent<DistributionChangeDetail>).detail.config!
      control.state = makeState({local: config, effective: config})
    })
    const smaller = control.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Smaller group"]')!
    const bigger = control.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Bigger group"]')!
    const output = () => control.shadowRoot!.querySelector<HTMLButtonElement>(".grouping-select")!
    expect(smaller.disabled).toBe(true)
    expect(output().textContent).toContain("single")
    expect(output().querySelectorAll("svg")).toHaveLength(1)
    for(let size = 2; size <= 7; size++) {
      bigger.click()
      await control.updateComplete
      expect(control.state!.local).toMatchObject({scope: "group", groupSize: size})
      expect(output().textContent).toContain(size === 2 ? "pair" : "groups")
      if(size > 2) expect(output().querySelector(".grouping-multiplier")?.textContent).toBe(`×${size}`)
      expect(output().querySelectorAll("svg")).toHaveLength(size === 2 ? 2 : 1)
    }
    const all = control.shadowRoot!.querySelector<HTMLButtonElement>('.grouping-all')!
    expect(all.textContent).toBe("All")
    expect(all.parentElement!.lastElementChild).toBe(all)
    expect(output().getAttribute("aria-pressed")).toBe("true")
    all.click()
    await control.updateComplete
    expect(control.state!.local!.scope).toBe("all")
    expect(control.state!.local!.groupSize).toBeUndefined()
    expect(all.getAttribute("aria-pressed")).toBe("true")
    expect(output().getAttribute("aria-pressed")).toBe("false")
    expect(output().textContent).toContain("×7")
    expect(bigger.disabled).toBe(false)
    const savedWrites = writes
    all.click()
    expect(writes).toBe(savedWrites)
    output().click()
    await control.updateComplete
    expect(control.state!.local).toMatchObject({scope: "group", groupSize: 7})
    expect(all.getAttribute("aria-pressed")).toBe("false")
    expect(output().getAttribute("aria-pressed")).toBe("true")
    all.click()
    await control.updateComplete
    const beforeIncrement = writes
    bigger.click()
    await control.updateComplete
    expect(writes).toBe(beforeIncrement + 1)
    expect(control.state!.local).toMatchObject({scope: "group", groupSize: 8})
    expect(control.state!.local!.items).toEqual(inheritedConfig.items)
    const edit = control.shadowRoot!.querySelector<HTMLInputElement>('.permission input')!
    edit.click()
    await control.updateComplete
    expect(control.state!.local!.groupSize).toBe(8)
  })

  it("adds exact widget and snippet choices, then removes them without showing action ids", async () => {
    const initialState = makeState({ local: { version: 1, target: "target-1", scope: "individual", permissions: ["insert"], add: [], items: [] } })
    const control = await mount(initialState)
    const received = changes(control)
    await chooseFromPicker(control, "Sample widget")
    expect(received[0].config?.add).toEqual(["package-member:sample/widget"])
    expect(received[0].config?.items).toEqual([choices[3]])
    control.state = { ...initialState, local: received[0].config }
    await control.updateComplete
    await chooseFromPicker(control, "Quote snippet")
    expect(received[1].config?.add).toEqual(["package-member:sample/widget", "user-snippet:quote"])
    expect(received[1].config?.items).toEqual([choices[3], choices[2]])
    control.state = { ...initialState, local: received[1].config }
    await control.updateComplete
    const list = control.shadowRoot!.querySelector("ul")!
    expect([...list.querySelectorAll(".allowed-name")].map((item) => item.textContent)).toEqual(["Sample widget", "Quote snippet"])
    expect(list.textContent).not.toContain("package-member:")
    control.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Remove Sample widget"]')!.click()
    expect(received[2].config?.add).toEqual(["user-snippet:quote"])
    expect(received[2].config?.items).toEqual([choices[2]])
  })

  it("renders accessible icon-only list buttons with element and snippet prefix icons", async () => {
    const items: DistributionItem[] = [
      {id: "element:p", label: "Paragraph", html: "<p></p>"},
      {id: "insert-graphic-shape:rectangle", label: "Rectangle", html: "<svg></svg>"},
      {id: "insert-math:fraction", label: "Fraction", html: "<math></math>"},
      choices[2],
    ]
    const local: DistributionConfig = {...inheritedConfig, target: "target-1", add: items.map(item => item.id), items}
    const control = await mount(makeState({local}), items)
    const rows = [...control.shadowRoot!.querySelectorAll("li")]
    const icons = rows.map(row => row.querySelector(".allowed-icon svg")!)
    expect(icons.map(icon => icon.getAttribute("class"))).toEqual([
      expect.stringContaining("icon-tabler-pilcrow"),
      expect.stringContaining("icon-tabler-vector"),
      expect.stringContaining("icon-tabler-math"),
      expect.stringContaining("icon-tabler-file-horizontal"),
    ])
    rows.forEach((row, index) => {
      expect(row.firstElementChild?.classList.contains("allowed-icon")).toBe(true)
      const remove = row.querySelector<HTMLButtonElement>(".remove")!
      expect(remove.getAttribute("aria-label")).toBe(`Remove ${items[index].label}`)
      expect(remove.textContent?.trim()).toBe("")
      expect(remove.querySelector(".icon-tabler-x")).not.toBeNull()
    })
    const add = addButton(control)
    expect(add.textContent?.trim()).toBe("")
    expect(add.querySelector(".icon-tabler-plus")).not.toBeNull()
    expect(getComputedStyle(add).backgroundColor).toBe("transparent")
    expect(getComputedStyle(add).borderTopStyle).toBe("solid")
  })

  it("filters the supplied choices and supports arrow, Enter, and Escape keys", async () => {
    const local: DistributionConfig = { version: 1, target: "target-1", scope: "individual", permissions: ["insert"], add: [], items: [] }
    const control = await mount(makeState({ local }))
    const received = changes(control)
    addButton(control).click()
    await control.updateComplete
    const search = control.shadowRoot!.querySelector<HTMLInputElement>(".picker-search")!
    search.value = "sample"
    search.dispatchEvent(new Event("input", { bubbles: true }))
    await control.updateComplete
    const menu = control.shadowRoot!.querySelector<InsertionMenu>("domeditor-insertion-menu")!
    await menu.updateComplete
    expect(menu.filteredItems.map((item) => item.id)).toEqual(["package-member:sample/widget"])
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    await menu.updateComplete
    expect(menu.activeItem?.id).toBe("package-member:sample/widget")
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    expect(received[0].config?.add).toEqual(["package-member:sample/widget"])
    addButton(control).click()
    await control.updateComplete
    control.shadowRoot!.querySelector<HTMLInputElement>(".picker-search")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await control.updateComplete
    expect(control.shadowRoot!.querySelector("domeditor-insertion-menu")).toBeNull()
    addButton(control).click()
    await control.updateComplete
    control.shadowRoot!.querySelector<InsertionMenu>("domeditor-insertion-menu")!
      .shadowRoot!.querySelector<HTMLButtonElement>(".close")!.click()
    await control.updateComplete
    expect(control.shadowRoot!.querySelector("domeditor-insertion-menu")).toBeNull()
  })

  it("offers All standard elements in the picker and never offers a wildcard for packages", async () => {
    const initialState = makeState({ local: { version: 1, target: "target-1", scope: "individual", permissions: ["insert"], add: ["user-snippet:quote"], items: [choices[2]] } })
    const control = await mount(initialState)
    const received = changes(control)
    await chooseFromPicker(control, "All standard elements")
    expect(received[0].config?.add).toEqual(["user-snippet:quote", "element:*"])
    expect(received[0].config?.items).toEqual([choices[2], choices[0], choices[1]])
    control.state = { ...initialState, local: received[0].config }
    await control.updateComplete
    expect([...control.shadowRoot!.querySelectorAll(".allowed-name")].map((item) => item.textContent)).toEqual(["Quote snippet", "All standard elements"])
    await chooseFromPicker(control, "Sample widget")
    expect(received[1].config?.add).toEqual(["user-snippet:quote", "element:*", "package-member:sample/widget"])
    expect(received[1].config?.items).toContainEqual(choices[3])
    expect(received[1].config?.add).not.toContain("package-member:*")
  })

  it("keeps inherited fields editable and disables all controls while locked", async () => {
    const inherited = await mount(makeState({ effective: inheritedConfig, inheritedFrom: "group-4" }))
    expect([...inherited.shadowRoot!.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")].every((field) => !field.disabled)).toBe(true)
    inherited.remove()

    const local = await mount(makeState({ local: { ...inheritedConfig, target: "target-1" } }))
    local.disabled = true
    await local.updateComplete
    expect([...local.shadowRoot!.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button")].every((field) => field.disabled)).toBe(true)
  })

  it("renders an empty state with no target and emits no edits", async () => {
    const control = await mount(null)
    const received = changes(control)
    expect(control.shadowRoot!.textContent).toContain("Select an element")
    expect(control.shadowRoot!.querySelectorAll("button, input, select")).toHaveLength(0)
    expect(received).toEqual([])
  })
})
