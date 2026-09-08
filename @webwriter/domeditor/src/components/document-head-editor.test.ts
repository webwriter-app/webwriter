// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import {AppRibbon} from "./ribbon"
import {DocumentHeadEditor, officialLanguageOptions, orderedLanguageOptions} from "./document-head-editor"
import {DomEditorToolbox} from "./toolbox"
import type {RibbonMenu} from "./ribbon-menu"
import type {RibbonDrawer} from "./ribbon-drawer"
import {
  WEBWRITER_GENERATOR,
  creativeCommonsLicenses,
  emptyDocumentHeadState,
  type DocumentHeadAction,
  type DocumentHeadElementState,
  type DocumentHeadState,
} from "../document-head"

const state = (values: Partial<DocumentHeadState> = {}): DocumentHeadState => ({
  ...emptyDocumentHeadState(),
  ...values,
})

const element = (values: Partial<DocumentHeadElementState> = {}): DocumentHeadElementState => ({
  id: "head-1",
  tagName: "meta",
  label: "Metadata",
  attributes: [],
  canMoveUp: false,
  canMoveDown: false,
  ...values,
})

const originalShowPopover = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "showPopover")

async function mount(
  mode: "common" | "advanced",
  documentHead = state(),
  options: {expanded?: boolean, attributeEditorId?: string} = {},
) {
  const editor = new DocumentHeadEditor()
  editor.mode = mode
  editor.state = documentHead
  editor.expanded = options.expanded ?? false
  editor.attributeEditorId = options.attributeEditorId ?? ""
  document.body.append(editor)
  await editor.updateComplete
  return editor
}

afterEach(() => {
  document.body.replaceChildren()
  if(originalShowPopover) Object.defineProperty(HTMLElement.prototype, "showPopover", originalShowPopover)
  else delete (HTMLElement.prototype as unknown as Record<string, unknown>).showPopover
  vi.restoreAllMocks()
})

describe("document head form", () => {
  it("suggests only nationally official languages and promotes browser languages", () => {
    const official = officialLanguageOptions()
    const ordered = orderedLanguageOptions(["de-DE", "fr", "eo", "en-US"])

    expect(official).toHaveLength(119)
    expect(official.find(option => option.value === "de")?.label).toBe("German (Deutsch)")
    expect(official.find(option => option.value === "ar")).toBeDefined()
    expect(official.find(option => option.value === "ceb")).toBeUndefined()
    expect(ordered.promoted.map(option => option.value)).toEqual(["de", "fr", "en"])
    expect(ordered.alphabetical.some(option => option.value === "fr")).toBe(false)
    expect(ordered.alphabetical.map(option => option.sortLabel)).toEqual(
      [...ordered.alphabetical]
        .sort((a, b) => a.sortLabel.localeCompare(b.sortLabel, "en", {sensitivity: "base"}) || a.value.localeCompare(b.value))
        .map(option => option.sortLabel),
    )
  })

  it("uses editable language suggestions without offering authored themes", async () => {
    const editor = await mount("common", state({
      title: "Old",
      generator: WEBWRITER_GENERATOR,
      language: "de",
    }))
    const actions: DocumentHeadAction[] = []
    editor.addEventListener("document-head-action", event => actions.push((event as CustomEvent<DocumentHeadAction>).detail))

    const title = editor.shadowRoot!.querySelector<HTMLInputElement>('input[name="title"]')!
    title.value = "New title"
    title.dispatchEvent(new Event("change", {bubbles: true}))

    const language = Array.from(editor.shadowRoot!.querySelectorAll("document-head-combobox"))
      .find(combobox => combobox.label === "Language")!
    await language.updateComplete
    const languageInput = language.shadowRoot!.querySelector<HTMLInputElement>("input")!
    languageInput.value = "x-klingon"
    languageInput.dispatchEvent(new InputEvent("input", {bubbles: true}))
    languageInput.dispatchEvent(new Event("change", {bubbles: true}))

    expect(editor.shadowRoot!.querySelector("document-theme-picker")).toBeNull()
    expect(actions).toContainEqual({type: "setDocumentHeadField", field: "title", value: "New title"})
    expect(actions).toContainEqual({type: "setDocumentHeadField", field: "language", value: "x-klingon"})
    expect(editor.shadowRoot!.querySelector('input[name="description"]')).toBeNull()
    expect(editor.shadowRoot!.querySelector('input[name="keywords"]')).toBeNull()
    expect(editor.shadowRoot!.querySelector(".generator-control")).toBeNull()
  })

  it("moves long-form metadata under more and keeps Generator read-only", async () => {
    const editor = await mount("advanced", state({
      description: "A short lesson",
      keywords: "math, geometry",
      generator: WEBWRITER_GENERATOR,
      elements: [
        element({id: "head-description", preset: "description", attributes: [
          {name: "name", value: "description"},
          {name: "content", value: "A short lesson"},
        ]}),
        element({id: "head-keywords", preset: "keywords", attributes: [
          {name: "name", value: "keywords"},
          {name: "content", value: "math, geometry"},
        ]}),
        element({id: "head-generator", preset: "generator", attributes: [
          {name: "name", value: "generator"},
          {name: "content", value: WEBWRITER_GENERATOR},
        ]}),
      ],
    }))
    const actions: DocumentHeadAction[] = []
    editor.addEventListener("document-head-action", event => actions.push((event as CustomEvent<DocumentHeadAction>).detail))

    const description = editor.shadowRoot!.querySelector<HTMLInputElement>('input[name="description"]')!
    const keywords = editor.shadowRoot!.querySelector<HTMLInputElement>('input[name="keywords"]')!
    const generator = editor.shadowRoot!.querySelector<HTMLElement>(".generator-entry")!
    description.value = "Updated lesson"
    description.dispatchEvent(new Event("change", {bubbles: true}))

    expect(keywords.value).toBe("math, geometry")
    expect(generator.querySelector("code")?.textContent).toBe(WEBWRITER_GENERATOR)
    expect(generator.querySelector("input, button")).toBeNull()
    expect(generator.querySelector(".generator-control")).toHaveAttribute("aria-readonly", "true")
    expect(editor.shadowRoot!.querySelector('option[value="generator"]')).toBeNull()
    expect(actions).toContainEqual({
      type: "setDocumentHeadField",
      field: "description",
      value: "Updated lesson",
    })
    expect(DocumentHeadEditor.styles.toString()).toMatch(
      /\.add-toolbar\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\) 4\.25rem;/,
    )
    expect(DocumentHeadEditor.styles.toString()).toMatch(
      /\.more-chevron\s*\{[\s\S]*?right:\s*0\.7rem;/,
    )
    expect(editor.shadowRoot!.querySelector(".more-select > .more-chevron")).not.toBeNull()
  })

  it("offers rich license suggestions while accepting a custom license", async () => {
    const editor = await mount("common")
    const actions: DocumentHeadAction[] = []
    editor.addEventListener("document-head-action", event => actions.push((event as CustomEvent<DocumentHeadAction>).detail))
    const picker = Array.from(editor.shadowRoot!.querySelectorAll("document-head-combobox"))
      .find(combobox => combobox.label === "License")!
    await picker.updateComplete

    picker.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await picker.updateComplete
    const choices = Array.from(picker.shadowRoot!.querySelectorAll<HTMLButtonElement>(".option"))
    expect(choices).toHaveLength(creativeCommonsLicenses.length)
    expect(choices[0].querySelector(".option-code")?.textContent).toBe("CC0-1.0")
    expect(choices[0].querySelector(".option-name")?.textContent).toBe("Creative Commons Zero 1.0 Universal")

    choices[1].click()
    expect(actions).toContainEqual({
      type: "setDocumentHeadField",
      field: "license",
      value: creativeCommonsLicenses[1].url,
    })

    const input = picker.shadowRoot!.querySelector<HTMLInputElement>("input")!
    input.value = "https://example.test/license"
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    input.dispatchEvent(new Event("change", {bubbles: true}))
    expect(actions).toContainEqual({
      type: "setDocumentHeadField",
      field: "license",
      value: "https://example.test/license",
    })
  })

  it("opens the language popup with a matching anchor and closes it on choice or Escape", async () => {
    const showPopover = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "showPopover", {
      configurable: true,
      value: showPopover,
    })
    const editor = await mount("common")
    const picker = Array.from(editor.shadowRoot!.querySelectorAll("document-head-combobox"))
      .find(combobox => combobox.label === "Language")!
    await picker.updateComplete

    const input = picker.shadowRoot!.querySelector<HTMLInputElement>("input")!
    let toggle = picker.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!
    input.focus()
    await picker.updateComplete
    await Promise.resolve()

    const listbox = picker.shadowRoot!.querySelector<HTMLElement>(".listbox")!
    const control = picker.shadowRoot!.querySelector<HTMLElement>(".control")!
    const listboxId = input.getAttribute("aria-controls")!
    expect(showPopover).toHaveBeenCalledOnce()
    expect(listbox).toHaveAttribute("popover", "manual")
    expect(control.getAttribute("style")).toContain(`anchor-name: --${listboxId}`)
    expect(listbox.getAttribute("style")).toContain(`position-anchor: --${listboxId}`)
    expect((picker.constructor as typeof DocumentHeadEditor).styles.toString()).toMatch(/width:\s*anchor-size\(width\)/)

    listbox.querySelectorAll<HTMLButtonElement>(".option")[1].click()
    await picker.updateComplete
    await Promise.resolve()
    await picker.updateComplete
    expect(picker.shadowRoot!.querySelector(".listbox")).toBeNull()

    toggle = picker.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!
    toggle.click()
    await picker.updateComplete
    await Promise.resolve()
    expect(picker.shadowRoot!.querySelector(".listbox")).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
    await picker.updateComplete
    await Promise.resolve()
    await picker.updateComplete
    expect(picker.shadowRoot!.querySelector(".listbox")).toBeNull()
  })

  it("does not show a popup after opening is cancelled before the async render completes", async () => {
    const showPopover = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "showPopover", {
      configurable: true,
      value: showPopover,
    })
    const editor = await mount("common")
    const picker = Array.from(editor.shadowRoot!.querySelectorAll("document-head-combobox"))
      .find(combobox => combobox.label === "Language")!
    await picker.updateComplete

    const input = picker.shadowRoot!.querySelector<HTMLInputElement>("input")!
    input.dispatchEvent(new Event("focus"))
    picker.close(true)
    await picker.updateComplete
    await Promise.resolve()

    expect(showPopover).not.toHaveBeenCalled()
    expect(picker.shadowRoot!.querySelector(".listbox")).toBeNull()
  })

  it("shows attribute and remove icon buttons beside populated common fields when expanded", async () => {
    const title = element({
      id: "head-title",
      tagName: "title",
      label: "Title",
      preset: "title",
      content: "Lesson",
    })
    const editor = await mount("common", state({title: "Lesson", elements: [title]}), {expanded: true})
    const actions: DocumentHeadAction[] = []
    const requests: string[] = []
    editor.addEventListener("document-head-action", event => actions.push((event as CustomEvent<DocumentHeadAction>).detail))
    editor.addEventListener("document-head-element-options-request", event => requests.push((event as CustomEvent<{id: string}>).detail.id))

    editor.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Edit extra title attributes"]')!.click()
    editor.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Remove title"]')!.click()

    expect(requests).toEqual(["head-title"])
    expect(actions).toContainEqual({type: "removeDocumentHeadElement", id: "head-title"})
  })

  it("omits common values from the advanced list and keeps full controls for other elements", async () => {
    const editor = await mount("advanced", state({
      title: "Lesson",
      elements: [
        element({id: "head-title", tagName: "title", label: "Title", preset: "title", content: "Lesson", canMoveDown: true}),
        element({id: "head-title-duplicate", tagName: "title", label: "Title", preset: "title", content: "Alternate", canMoveUp: true, canMoveDown: true}),
        element({
          id: "head-script",
          tagName: "script",
          label: "Script",
          preset: "script",
          attributes: [{name: "type", value: "module"}],
          content: "start()",
          contentLabel: "JavaScript",
          canMoveUp: true,
        }),
      ],
    }))
    const actions: DocumentHeadAction[] = []
    editor.addEventListener("document-head-action", event => actions.push((event as CustomEvent<DocumentHeadAction>).detail))

    expect(editor.shadowRoot!.querySelector('[data-head-id="head-title"]')).toBeNull()
    expect(editor.shadowRoot!.querySelector('[data-head-id="head-title-duplicate"]')).not.toBeNull()
    expect(editor.shadowRoot!.querySelectorAll(".entry")).toHaveLength(2)
    expect(editor.shadowRoot!.querySelector('[data-head-id="head-script"] .content')).toBeNull()
    expect(editor.shadowRoot!.querySelector('[data-head-id="head-script"] .blocked-content')).not.toBeNull()
    editor.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Remove Script"]')!.click()

    expect(actions).toEqual([{type: "removeDocumentHeadElement", id: "head-script"}])
  })

  it("opens only the extra attributes for a common field", async () => {
    const title = element({
      id: "head-title",
      tagName: "title",
      label: "Title",
      preset: "title",
      attributes: [{name: "data-kind", value: "lesson"}],
      content: "Lesson",
    })
    const editor = await mount("advanced", state({title: "Lesson", elements: [title]}), {
      attributeEditorId: "head-title",
    })

    const panel = editor.shadowRoot!.querySelector<HTMLElement>(".common-attributes")!
    expect(panel).not.toBeNull()
    expect(panel.querySelector<HTMLInputElement>('input[aria-label="Attribute name"]')?.value).toBe("data-kind")
    expect(panel.querySelector("textarea")).toBeNull()
  })

  it("opens metadata in the selected document Edit toolbox", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "File"
    document.body.append(ribbon)
    await ribbon.updateComplete
    const fileMenu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await fileMenu.updateComplete
    expect(fileMenu.groups.flatMap(group => group.buttons)
      .some(button => typeof button === "string" ? button === "Metadata" : button.label === "Metadata")).toBe(false)
    expect(ribbon.shadowRoot!.querySelector("#metadata-dialog")).toBeNull()

    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.documentSelected = true
    toolbox.documentHead = state({
      title: "Lesson",
      generator: WEBWRITER_GENERATOR,
      elements: [element({
        id: "head-title",
        tagName: "title",
        label: "Title",
        preset: "title",
        attributes: [{name: "data-kind", value: "lesson"}],
        content: "Lesson",
      })],
    })
    document.body.append(toolbox)
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Metadata"]')!
    expect(drawer).not.toBeNull()
    await drawer.updateComplete
    expect(drawer.pane).toBe(true)
    const common = drawer.querySelector<DocumentHeadEditor>('document-head-editor[mode="common"]')!
    const advanced = drawer.querySelector<DocumentHeadEditor>('document-head-editor[mode="advanced"]')!
    expect(common.expanded).toBe(true)
    expect(advanced).not.toBeNull()

    await common.updateComplete
    common.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Edit extra title attributes"]')!.click()
    await toolbox.updateComplete
    await advanced.updateComplete
    expect(advanced.shadowRoot!.querySelector(".common-attributes")).not.toBeNull()

    toolbox.documentSelected = false
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Metadata"]')).toBeNull()

    toolbox.documentSelected = true
    await toolbox.updateComplete
    const reopened = toolbox.shadowRoot!.querySelector<DocumentHeadEditor>('document-head-editor[mode="advanced"]')!
    await reopened.updateComplete
    expect(reopened.shadowRoot!.querySelector(".common-attributes")).toBeNull()
  })
})
