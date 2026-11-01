// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
import {DocumentThemeOptions} from "./document-theme-options"
import {DocumentThemePresets} from "./document-theme-presets"
import {defaultDocumentThemes, documentThemeStorageKey, loadDocumentThemes} from "../document-theme-options"
import {themeAccentProperties} from "../css-color"

afterEach(() => { document.body.replaceChildren(); localStorage.removeItem(documentThemeStorageKey); vi.restoreAllMocks() })

it("saves, applies and deletes named document overrides", async () => {
  const control = new DocumentThemePresets()
  control.state = {target: {localName: "html", namespaceURI: "http://www.w3.org/1999/xhtml", documentRoot: true}, inline: {
    "background-color": {value: "red", priority: ""}, "--ww-prose-max": {value: "60rem", priority: "important"},
    "--ww-font-family": {value: "serif", priority: ""}, "--ww-link-color": {value: "blue", priority: ""},
    "--ww-theme-accent-1": {value: "#123456", priority: ""}, "--ww-text-color": {value: "#334455", priority: ""},
    color: {value: "blue", priority: ""},
  }, computed: {}, context: {display: "", parentDisplay: ""}}
  document.body.append(control)
  await control.updateComplete
  control.shadowRoot!.querySelector<HTMLButtonElement>('.trigger')!.click()
  await control.updateComplete
  control.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Save theme"]')!.click()
  await control.updateComplete
  const input = control.shadowRoot!.querySelector<HTMLInputElement>("#theme-name")!
  input.value = "Reading"
  control.shadowRoot!.querySelector("form")!.dispatchEvent(new Event("submit", {cancelable: true}))
  await control.updateComplete
  expect(loadDocumentThemes()).toEqual([{name: "Reading", styles: {
    "background-color": {value: "red", priority: ""}, "--ww-prose-max": {value: "60rem", priority: "important"},
    "--ww-font-family": {value: "serif", priority: ""}, "--ww-link-color": {value: "blue", priority: ""},
    "--ww-theme-accent-1": {value: "#123456", priority: ""}, "--ww-text-color": {value: "#334455", priority: ""},
  }}])
  const saved = control.shadowRoot!.querySelector('[aria-label="Delete Reading"]')!.closest(".theme")!
  expect(saved.querySelector(".theme-ribbon")!.querySelectorAll("span")).toHaveLength(7)
  expect(saved.querySelector<HTMLElement>(".theme-ribbon span")!.style.background).toBe("#123456")
  expect(saved.querySelector<HTMLElement>(".theme-text")!.style.color).toBe("#334455")
  expect([...control.shadowRoot!.querySelectorAll(".theme")].at(-1)).toBe(saved)
  const changes = vi.fn()
  control.addEventListener("element-style-change", changes)
  saved.querySelector<HTMLButtonElement>(".apply")!.click()
  expect(changes.mock.calls[0][0].detail.styles).toEqual({"background-color": {value: "red", priority: ""},
    "--ww-font-family": {value: "serif", priority: ""}, "--ww-font-size": null, "--ww-text-color": {value: "#334455", priority: ""},
    "--ww-link-color": {value: "blue", priority: ""}, "--ww-prose-max": {value: "60rem", priority: "important"}, "--ww-page-max": null, "--ww-page-gutter": null, "--ww-block-spacing": null,
    ...Object.fromEntries(themeAccentProperties.map((name, index) => [name, index === 0 ? {value: "#123456", priority: ""} : null]))})
  await control.updateComplete
  control.shadowRoot!.querySelector<HTMLButtonElement>('.trigger')!.click()
  await control.updateComplete
  control.shadowRoot!.querySelector<HTMLButtonElement>(".delete")!.click()
  expect(loadDocumentThemes()).toEqual([])
})

it.each([false, true])("offers built-in themes in both pickers (selectOnly: %s)", async selectOnly => {
  const control = new DocumentThemePresets()
  control.selectOnly = selectOnly
  document.body.append(control)
  await control.updateComplete
  control.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click()
  await control.updateComplete
  expect(loadDocumentThemes()).toEqual([])
  expect(control.shadowRoot!.querySelectorAll(".theme")).toHaveLength(defaultDocumentThemes.length)
  expect(control.shadowRoot!.querySelector(".empty")!.previousElementSibling).toBe(control.shadowRoot!.querySelectorAll(".theme").item(defaultDocumentThemes.length - 1))
  expect(control.shadowRoot!.querySelector(".delete")).toBeNull()
  const apply = vi.fn()
  control.addEventListener(selectOnly ? "document-theme-apply" : "element-style-change", apply)
  const standard = [...control.shadowRoot!.querySelectorAll<HTMLButtonElement>(".apply")].find(button => button.textContent?.includes("Standard"))!
  expect(standard.querySelectorAll(".theme-ribbon span")).toHaveLength(7)
  expect(standard.querySelector(".theme-text")).not.toBeNull()
  standard.click()
  const styles = apply.mock.calls[0][0].detail.styles
  expect(Object.values(styles).every(value => value === null)).toBe(true)
  expect(styles["--ww-font-size"]).toBeNull()
})

it("shows the matching theme name and updates for custom changes", async () => {
  const control = new DocumentThemePresets()
  control.selectOnly = true
  control.themeStyles = {...defaultDocumentThemes.find(theme => theme.name === "Ocean")!.styles, "background-color": {value: "rgb(247, 251, 255)", priority: ""}}
  document.body.append(control)
  await control.updateComplete
  expect(control.shadowRoot!.querySelector(".trigger-label")!.textContent).toBe("Ocean")
  control.themeStyles = {...control.themeStyles, "--ww-font-size": {value: "20px", priority: ""}}
  await control.updateComplete
  expect(control.shadowRoot!.querySelector(".trigger-label")!.textContent).toBe("Custom")
  control.themeStyles = {}
  await control.updateComplete
  expect(control.shadowRoot!.querySelector(".trigger-label")!.textContent).toBe("Theme")
  expect(defaultDocumentThemes.map(theme => theme.name)).not.toContain("Midnight")
})

it("handles damaged and unavailable browser storage", async () => {
  localStorage.setItem(documentThemeStorageKey, "not json")
  expect(loadDocumentThemes()).toEqual([])
  const control = new DocumentThemePresets()
  control.state = {target: null, inline: {}, computed: {}, context: {display: "", parentDisplay: ""}}
  document.body.append(control)
  await control.updateComplete
  control.shadowRoot!.querySelector<HTMLButtonElement>('.trigger')!.click()
  await control.updateComplete
  control.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Save theme"]')!.click()
  await control.updateComplete
  control.shadowRoot!.querySelector<HTMLInputElement>("#theme-name")!.value = "Example"
  const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("Storage full") })
  control.shadowRoot!.querySelector("form")!.dispatchEvent(new Event("submit", {cancelable: true}))
  await control.updateComplete
  expect(control.shadowRoot!.querySelector('[role="alert"]')?.textContent).toContain("browser storage")
  setItem.mockRestore()
})

it("offers a document-scoped picker without the save action", async () => {
  localStorage.setItem(documentThemeStorageKey, JSON.stringify([{name: "Reading", styles: {"--ww-font-size": {value: "20px", priority: ""}}}]))
  const control = new DocumentThemePresets()
  control.selectOnly = true
  document.body.append(control)
  await control.updateComplete
  control.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click()
  await control.updateComplete
  expect(control.shadowRoot!.querySelector('[aria-label="Save theme"]')).toBeNull()
  expect(control.shadowRoot!.querySelector("h3")).toBeNull()
  expect(control.shadowRoot!.querySelector<HTMLButtonElement>(".customize")!.textContent).toContain("Make your own theme")
  expect(control.shadowRoot!.querySelector('.customize [aria-hidden="true"] svg')).not.toBeNull()
  const apply = vi.fn()
  control.addEventListener("document-theme-apply", apply)
  control.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Delete Reading"]')!.closest(".theme")!.querySelector<HTMLButtonElement>(".apply")!.click()
  expect(apply.mock.calls[0][0].detail.styles["--ww-font-size"]).toEqual({value: "20px", priority: ""})
})

it("opens theme customization from the Layouts picker", async () => {
  const control = new DocumentThemePresets()
  control.selectOnly = true
  document.body.append(control)
  await control.updateComplete
  control.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click()
  await control.updateComplete
  const customize = vi.fn()
  control.addEventListener("document-theme-customize", customize)
  control.shadowRoot!.querySelector<HTMLButtonElement>(".customize")!.click()
  expect(customize).toHaveBeenCalledOnce()
  await control.updateComplete
  expect(control.shadowRoot!.querySelector(".popup")).toBeNull()
})

it.each(["below", "above"] as const)("connects the Layouts picker border when the list opens %s", async placement => {
  const control = new DocumentThemePresets()
  control.selectOnly = true
  document.body.append(control)
  await control.updateComplete
  const trigger = control.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!
  trigger.click()
  await control.updateComplete
  expect(control.hasAttribute("open")).toBe(true)
  const popup = control.shadowRoot!.querySelector<HTMLElement>(".popup")!
  trigger.getBoundingClientRect = () => new DOMRect(100, 100, 90, 28)
  popup.getBoundingClientRect = () => new DOMRect(100, placement === "below" ? 126 : 22, 208, 80)
  window.dispatchEvent(new Event("resize"))
  expect(trigger.dataset.connected).toBe(placement)
  expect(popup.dataset.connected).toBe(placement)
  expect(popup.style.getPropertyValue("--popup-border-radius")).toBe(placement === "below" ? "0 4px 4px 4px" : "4px 4px 4px 0")
  trigger.click()
  expect(trigger.hasAttribute("data-connected")).toBe(false)
})

it("uses specialized controls and sends CSS values through the existing style action", async () => {
  const control = new DocumentThemeOptions()
  control.state = {target: null, inline: {"--ww-font-size": {value: "1.25rem", priority: "important"}}, computed: {}, context: {display: "", parentDisplay: ""}}
  document.body.append(control)
  await control.updateComplete
  const size = [...control.shadowRoot!.querySelectorAll("style-combobox")].find(combo => combo.label === "Font size")!
  const family = [...control.shadowRoot!.querySelectorAll("style-combobox")].find(combo => combo.label === "Font family")!
  const color = [...control.shadowRoot!.querySelectorAll("ribbon-combobox")].find(combo => combo.label === "Link color")!
  expect(size.value).toBe("1.25")
  expect(size.unit).toBe("rem")
  await size.updateComplete
  expect(size.shadowRoot!.querySelector<HTMLInputElement>("input")!.placeholder).toBe("Default")
  expect(size.options[0]).toMatchObject({label: "Tiny", description: "12px"})
  expect(family.options.some(option => option.value === "Georgia, serif")).toBe(true)
  expect(family.value).toBe("")
  expect(color.variant).toBe("color")
  const colorEditor = control.shadowRoot!.querySelector("element-style-editor")!
  await colorEditor.updateComplete
  expect(colorEditor.shadowRoot!.querySelector('[role="group"][aria-labelledby="style-label-color"]')).not.toBeNull()
  expect(colorEditor.shadowRoot!.querySelector('[aria-label="Text color"]')).not.toBeNull()
  expect(colorEditor.shadowRoot!.querySelector('[aria-label="Background color"]')).not.toBeNull()
  const changes = vi.fn()
  control.addEventListener("element-style-change", changes)
  size.dispatchEvent(new CustomEvent("combobox-change", {detail: {value: "20px"}, bubbles: true, composed: true}))
  color.dispatchEvent(new CustomEvent("ribbon-combobox-change", {detail: {value: "#123456"}, bubbles: true, composed: true}))
  expect(changes.mock.calls.map(([event]) => event.detail.styles)).toEqual([
    {"--ww-font-size": {value: "20px", priority: "important"}},
    {"--ww-link-color": {value: "#123456", priority: ""}},
  ])
  vi.stubGlobal("CSS", {supports: () => false})
  size.dispatchEvent(new CustomEvent("combobox-change", {detail: {value: "invalid"}, bubbles: true, composed: true}))
  expect(changes.mock.calls.map(([event]) => event.detail.styles)).toEqual([
    {"--ww-font-size": {value: "20px", priority: "important"}},
    {"--ww-link-color": {value: "#123456", priority: ""}},
  ])
  color.dispatchEvent(new CustomEvent("ribbon-combobox-change", {detail: {value: ""}, bubbles: true, composed: true}))
  expect(changes.mock.calls[2][0].detail.styles).toEqual({"--ww-link-color": null})
  vi.unstubAllGlobals()
  size.dispatchEvent(new CustomEvent("combobox-change", {detail: {value: "2"}, bubbles: true, composed: true}))
  expect(changes.mock.calls[3][0].detail.styles).toEqual({"--ww-font-size": {value: "2rem", priority: "important"}})
  colorEditor.dispatchEvent(new CustomEvent("element-style-change", {detail: {property: "color", mutation: "red"}, bubbles: true, composed: true}))
  expect(changes.mock.calls[4][0].detail.styles).toEqual({"--ww-text-color": "red"})
  colorEditor.dispatchEvent(new CustomEvent("element-style-change", {detail: {styles: {color: null, "background-color": null}}, bubbles: true, composed: true}))
  expect(changes.mock.calls[5][0].detail.styles).toEqual({"--ww-text-color": null, "background-color": null})
})

it("edits seven palette accents and clears their overrides together", async () => {
  const control = new DocumentThemeOptions()
  control.state = {target: null, inline: {"--ww-theme-accent-1": {value: "#123456", priority: "important"}}, computed: {}, context: {display: "", parentDisplay: ""}}
  document.body.append(control)
  await control.updateComplete
  const fields = control.shadowRoot!.querySelectorAll<HTMLInputElement>('.palette-fields input[type="color"]')
  expect(control.shadowRoot!.firstElementChild?.textContent).toContain("Palette")
  expect(fields).toHaveLength(7)
  expect(fields[0].value).toBe("#123456")
  const changes = vi.fn()
  control.addEventListener("element-style-change", changes)
  fields[0].value = "#abcdef"
  fields[0].dispatchEvent(new Event("change"))
  expect(changes.mock.calls[0][0].detail.styles).toEqual({"--ww-theme-accent-1": {value: "#abcdef", priority: "important"}})
  control.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Clear palette"]')!.click()
  expect(changes.mock.calls[1][0].detail.styles).toEqual(Object.fromEntries(themeAccentProperties.map(name => [name, null])))
})

it("clears individual theme overrides without changing other properties", async () => {
  const control = new DocumentThemeOptions()
  control.state = {target: null, inline: {"--ww-font-size": {value: "20px", priority: "important"}, "--ww-link-color": {value: "red", priority: ""}}, computed: {}, context: {display: "", parentDisplay: ""}}
  document.body.append(control)
  await control.updateComplete
  const changes = vi.fn()
  control.addEventListener("element-style-change", changes)
  control.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Clear Font size"]')!.click()
  control.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Clear Link color"]')!.click()
  expect(changes.mock.calls.map(([event]) => event.detail.styles)).toEqual([
    {"--ww-font-size": null}, {"--ww-link-color": null},
  ])
  expect(control.shadowRoot!.querySelector('[aria-label="Clear Font family"]')).toBeNull()
})
