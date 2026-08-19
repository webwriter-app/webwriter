// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import {AppRibbon} from "./ribbon"
import {DocumentHeadEditor, officialLanguageOptions, orderedLanguageOptions} from "./document-head-editor"
import {
  WEBWRITER_GENERATOR,
  creativeCommonsLicenses,
  emptyDocumentHeadState,
  type DocumentHeadAction,
  type DocumentHeadElementState,
  type DocumentHeadState,
} from "../document-head"
import {documentThemes} from "../document-themes"
import type {RibbonDrawer} from "./ribbon-drawer"

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

  it("uses editable language suggestions and a true theme select", async () => {
    const editor = await mount("common", state({
      title: "Old",
      generator: WEBWRITER_GENERATOR,
      language: "de",
      theme: "base",
    }))
    const actions: DocumentHeadAction[] = []
    editor.addEventListener("document-head-action", event => actions.push((event as CustomEvent<DocumentHeadAction>).detail))

    const title = editor.shadowRoot!.querySelector<HTMLInputElement>('input[name="title"]')!
    title.value = "New title"
    title.dispatchEvent(new Event("change", {bubbles: true}))

    const language = Array.from(editor.shadowRoot!.querySelectorAll<any>("document-head-combobox"))
      .find(combobox => combobox.label === "Language")!
    await language.updateComplete
    const languageInput = language.shadowRoot!.querySelector<HTMLInputElement>("input")!
    languageInput.value = "x-klingon"
    languageInput.dispatchEvent(new InputEvent("input", {bubbles: true}))
    languageInput.dispatchEvent(new Event("change", {bubbles: true}))

    const theme = editor.shadowRoot!.querySelector<HTMLSelectElement>('select[name="theme"]')!
    theme.value = "water"
    theme.dispatchEvent(new Event("change", {bubbles: true}))

    expect(theme.options).toHaveLength(documentThemes.length + 1)
    expect(actions).toContainEqual({type: "setDocumentHeadField", field: "title", value: "New title"})
    expect(actions).toContainEqual({type: "setDocumentHeadField", field: "language", value: "x-klingon"})
    expect(actions).toContainEqual({type: "setDocumentHeadField", field: "theme", value: "water"})
    expect(editor.shadowRoot!.querySelector(".generator-control code")?.textContent).toBe(WEBWRITER_GENERATOR)
  })

  it("offers rich license suggestions while accepting a custom license", async () => {
    const editor = await mount("common")
    const actions: DocumentHeadAction[] = []
    editor.addEventListener("document-head-action", event => actions.push((event as CustomEvent<DocumentHeadAction>).detail))
    const picker = Array.from(editor.shadowRoot!.querySelectorAll<any>("document-head-combobox"))
      .find(combobox => combobox.label === "License")!
    await picker.updateComplete

    picker.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await picker.updateComplete
    const choices = Array.from(picker.shadowRoot!.querySelectorAll<HTMLButtonElement>(".option"))
    expect(choices).toHaveLength(creativeCommonsLicenses.length)
    expect(choices[0].querySelector(".option-code")?.textContent).toBe("CC0-1.0")
    expect(choices[0].querySelector(".option-name")?.textContent).toBe("Creative Commons Zero 1.0 Universal")

    choices[1].dispatchEvent(new MouseEvent("mousedown", {bubbles: true}))
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
    const content = editor.shadowRoot!.querySelector<HTMLTextAreaElement>('[data-head-id="head-script"] .content')!
    content.value = "updated()"
    content.dispatchEvent(new Event("change", {bubbles: true}))
    editor.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Remove Script"]')!.click()

    expect(actions).toEqual([
      {type: "setDocumentHeadElementContent", id: "head-script", value: "updated()"},
      {type: "removeDocumentHeadElement", id: "head-script"},
    ])
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

  it("places common metadata in the closed File drawer and advanced controls in its expanded tier", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "File"
    ribbon.documentHead = state({
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
    document.body.append(ribbon)
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Metadata"]')!
    await drawer.updateComplete

    expect(drawer).not.toBeNull()
    expect(drawer.expandable).toBe(true)
    const common = drawer.querySelector<DocumentHeadEditor>('document-head-editor[mode="common"]')!
    expect(common.expanded).toBe(false)
    const advanced = drawer.querySelector<DocumentHeadEditor>('document-head-editor[mode="advanced"][slot="more"]')!
    expect(advanced).not.toBeNull()

    drawer.openDrawer()
    await ribbon.updateComplete
    expect(common.expanded).toBe(true)

    await common.updateComplete
    common.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Edit extra title attributes"]')!.click()
    await ribbon.updateComplete
    await advanced.updateComplete
    expect(advanced.shadowRoot!.querySelector(".common-attributes")).not.toBeNull()
  })
})
