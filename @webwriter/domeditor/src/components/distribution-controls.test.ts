// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { DistributionConfig, DistributionItem } from "../distribution.js"
import { InsertionMenu } from "./insertion-menu"
import { DistributionControls, type DistributionSelectionState } from "./distribution-controls"

const inheritedConfig: DistributionConfig = {
  version: 1,
  target: "source-target",
  scope: "group",
  permissions: ["edit", "style"],
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

const addButton = (control: DistributionControls) =>
  [...control.shadowRoot!.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent?.trim() === "Add")!

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
    expect(labels).toEqual(["Edit", "Move", "Delete", "Duplicate", "Style"])
  })

  it("renders one card per permission with a leading icon and a trailing large native checkbox", async () => {
    const control = await mount(makeState({local: {...inheritedConfig, target: "target-1"}}))
    const cards = [...control.shadowRoot!.querySelectorAll<HTMLElement>(".permission")]
    expect(cards).toHaveLength(5)
    expect(getComputedStyle(control.shadowRoot!.querySelector(".permissions")!).gridTemplateColumns).toBe("minmax(0, 1fr)")
    for(const card of cards) {
      expect(card.firstElementChild?.className).toBe("permission-icon")
      expect(card.firstElementChild?.getAttribute("aria-hidden")).toBe("true")
      expect(card.firstElementChild?.querySelector("svg")).not.toBeNull()
      expect(card.lastElementChild?.localName).toBe("input")
      expect(getComputedStyle(card.lastElementChild!).width).toBe("20px")
    }
  })

  it("shows inherited state and emits a complete override with the selected target", async () => {
    const control = await mount(makeState({ effective: inheritedConfig, inheritedFrom: "group-4" }))
    const received = changes(control)
    expect(control.shadowRoot!.textContent).toContain("Inherited from group-4")
    control.shadowRoot!.querySelector<HTMLButtonElement>('button')!.click()
    expect(received).toEqual([{ target: "target-1", config: { ...inheritedConfig, target: "target-1", permissions: ["edit", "style"], add: ["user-snippet:quote"], items: [{ ...inheritedConfig.items[0] }] } }])
  })

  it("creates an empty, explicit override when no configuration is effective", async () => {
    const control = await mount(makeState())
    const received = changes(control)
    expect(control.shadowRoot!.querySelectorAll("ul li")).toHaveLength(0)
    control.shadowRoot!.querySelector<HTMLButtonElement>('button')!.click()
    expect(received[0]).toEqual({
      target: "target-1",
      config: { version: 1, target: "target-1", scope: "individual", permissions: [], add: [], items: [] },
    })
  })

  it("keeps a selected target with no authored id and uses a valid config placeholder", async () => {
    const control = await mount(makeState({ target: "" }))
    const received = changes(control)
    control.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
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
    expect([...control.shadowRoot!.querySelectorAll("button")].map((button) => button.textContent?.trim())).toEqual(["Add"])
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
    expect(received[1].config?.permissions).toEqual(["edit"])
    expect(received[1].config?.add).toEqual(["user-snippet:quote"])
    expect(received[1].config?.items).toEqual([choices[2]])
  })

  it("emits inheritance when removing a local configuration", async () => {
    const local = { ...inheritedConfig, target: "target-1" }
    const control = await mount(makeState({ local }))
    const received = changes(control)
    const button = [...control.shadowRoot!.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes("Inherit configuration"))!
    button.click()
    expect(received).toEqual([{ target: "target-1", config: null }])
  })

  it("emits scope and permission edits against the current local configuration", async () => {
    const control = await mount(makeState({ local: { ...inheritedConfig, target: "target-1" } }))
    const received = changes(control)
    const scope = control.shadowRoot!.querySelector<HTMLSelectElement>("select")!
    scope.value = "all"
    scope.dispatchEvent(new Event("change", { bubbles: true }))
    const editPermission = control.shadowRoot!.querySelector<HTMLInputElement>(".permissions input[type=checkbox]")!
    editPermission.checked = false
    editPermission.dispatchEvent(new Event("change", { bubbles: true }))
    expect(received[0].config?.scope).toBe("all")
    expect(received[1].config?.permissions).toEqual(["style"])
  })

  it("adds exact widget and snippet choices, then removes them without showing action ids", async () => {
    const initialState = makeState({ local: { version: 1, target: "target-1", scope: "individual", permissions: [], add: [], items: [] } })
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

  it("filters the supplied choices and supports arrow, Enter, and Escape keys", async () => {
    const local: DistributionConfig = { version: 1, target: "target-1", scope: "individual", permissions: [], add: [], items: [] }
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
    const initialState = makeState({ local: { version: 1, target: "target-1", scope: "individual", permissions: [], add: ["user-snippet:quote"], items: [choices[2]] } })
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

  it("disables inherited fields and all controls while locked", async () => {
    const inherited = await mount(makeState({ effective: inheritedConfig, inheritedFrom: "group-4" }))
    expect([...inherited.shadowRoot!.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")].every((field) => field.disabled)).toBe(true)
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
