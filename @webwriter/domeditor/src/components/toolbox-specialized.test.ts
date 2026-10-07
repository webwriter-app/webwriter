// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DomEditorToolbox} from "./toolbox"
import type {ElementAttributeState} from "../element-attributes"
import type {ElementStyleState} from "../editor-bridge"
import type {ElementStyleEditor} from "./element-style-editor"
import type {ElementAttributeEditor} from "./element-attribute-editor"
import type {RibbonDrawer} from "./ribbon-drawer"
import type {WidgetOptionsState} from "../widget-options"

afterEach(() => document.body.replaceChildren())

function selectedElement(localName: string, attributes: Record<string, string> = {}): ElementAttributeState {
  return {path: [0], localName, namespaceURI: "http://www.w3.org/1999/xhtml", name: localName, attributes}
}

function styleState(localName: string, inline: Record<string, string> = {}): ElementStyleState {
  return {
    target: {localName, namespaceURI: "http://www.w3.org/1999/xhtml"},
    inline: Object.fromEntries(Object.entries(inline).map(([name, value]) => [name, {value, priority: ""}])),
    computed: {},
    context: {display: "block", parentDisplay: "block"},
  }
}

async function mountElement(localName: string, attributes: Record<string, string> = {}, inline: Record<string, string> = {}) {
  const toolbox = new DomEditorToolbox()
  toolbox.activeTool = "Edit"
  toolbox.activeMenu = "Edit"
  toolbox.elementAttributes = selectedElement(localName, attributes)
  toolbox.elementStyle = styleState(localName, inline)
  document.body.append(toolbox)
  await toolbox.updateComplete
  await toolbox.updateComplete
  await Promise.all(Array.from(toolbox.shadowRoot!.querySelectorAll<ElementStyleEditor>("element-style-editor"), editor => editor.updateComplete))
  await Promise.all(Array.from(toolbox.shadowRoot!.querySelectorAll<ElementAttributeEditor>("element-attribute-editor"), editor => editor.updateComplete))
  return toolbox
}

describe("specialized element toolbox", () => {
  it.each([
    "p", "h2", "ul", "img", "video", "audio", "iframe", "details", "table", "math", "svg",
  ])("renders a compact %s profile without a preset gallery", async localName => {
    const toolbox = await mountElement(localName)
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>(`ribbon-drawer[data-specialized="${localName}"]`)!
    expect(drawer).not.toBeNull()
    const primary = drawer.querySelector<ElementStyleEditor>('element-style-editor:not([slot="more"])')!
    expect(primary).not.toBeNull()
    expect(primary.shadowRoot!.querySelectorAll(".compact-row").length).toBeLessThanOrEqual(4)
    expect(drawer.querySelector('element-style-editor[show-presets]')).toBeNull()
    expect(drawer.querySelector(".specialized-gallery, .widget-preset-gallery")).toBeNull()
    expect(drawer.querySelector('ribbon-drawer[label="Style"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Attributes"]')).toBeNull()
  })

  it("uses button choices for compact CSS enums and retains selects for complex values", async () => {
    const math = await mountElement("math")
    math.elementStyle = {...math.elementStyle, inline: {"math-style": {value: "compact", priority: "important"}}}
    await math.updateComplete
    await Promise.all(Array.from(math.shadowRoot!.querySelectorAll<ElementStyleEditor>("element-style-editor"), editor => editor.updateComplete))
    const mathPrimary = math.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="math"]')!
      .querySelector<ElementStyleEditor>('element-style-editor:not([slot="more"])')!
    const mathStyle = mathPrimary.shadowRoot!.querySelector<HTMLElement>('[data-property="math-style"]')!
    expect(mathStyle.querySelector("select")).toBeNull()
    expect(mathStyle.querySelectorAll('button[aria-pressed]')).toHaveLength(2)
    const styleChanges = vi.fn()
    math.addEventListener("element-style-change", styleChanges)
    mathStyle.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')!.click()
    expect(styleChanges.mock.calls[0][0].detail).toMatchObject({property: "math-style", mutation: {value: "normal", priority: "important"}})

    const paragraph = await mountElement("p")
    const paragraphPrimary = paragraph.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="p"]')!
      .querySelector<ElementStyleEditor>('element-style-editor:not([slot="more"])')!
    const alignment = paragraphPrimary.shadowRoot!.querySelector<HTMLElement>('[data-property="text-align"]')!
    expect(Array.from(alignment.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'), button => button.getAttribute("aria-label")))
      .toEqual(["Left", "Center", "Right", "Justify"])
    paragraph.elementStyle = {...paragraph.elementStyle, inline: {"text-align": {value: "start", priority: ""}}, computed: {direction: "rtl"}}
    await paragraph.updateComplete
    await paragraphPrimary.updateComplete
    expect(alignment.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.getAttribute("aria-label")).toBe("Right")

    const paragraphOptions = paragraph.shadowRoot!.querySelector('.specialized-options')!
      .querySelector<ElementStyleEditor>('element-style-editor')!
    const lastLine = paragraphOptions.shadowRoot!.querySelector<HTMLElement>('[data-property="text-align-last"] .specialized-choice-group')!
    expect(lastLine.style.getPropertyValue("--choice-columns")).toBe("3")
    const lastLineButtons = lastLine.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')
    expect(lastLineButtons).toHaveLength(5)
    expect(lastLineButtons[2].hasAttribute("data-top-right")).toBe(true)
    expect(lastLineButtons[3].hasAttribute("data-bottom-left")).toBe(true)
    expect(lastLine.children).toHaveLength(5)

    const cell = await mountElement("td")
    const cellPrimary = cell.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="td"]')!
      .querySelector<ElementStyleEditor>('element-style-editor:not([slot="more"])')!
    const vertical = cellPrimary.shadowRoot!.querySelector<HTMLElement>('[data-property="vertical-align"]')!
    const verticalGroup = vertical.querySelector<HTMLElement>(".specialized-choice-group")!
    expect(verticalGroup.querySelectorAll('button[aria-pressed]')).toHaveLength(8)
    expect(verticalGroup.style.getPropertyValue("--choice-columns")).toBe("4")

    const graphic = await mountElement("svg")
    const advanced = graphic.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="svg"]')!
      .querySelector<HTMLElement>(".specialized-options")!
    const paintOrder = advanced.querySelectorAll<ElementStyleEditor>("element-style-editor")[0]!
      .shadowRoot!.querySelector<HTMLElement>('[data-property="paint-order"]')!
    expect(paintOrder.querySelector("select")).not.toBeNull()
  })

  it("shows compact fields first and places counted attributes and extra CSS controls under Options", async () => {
    const toolbox = await mountElement("p", {id: "intro", class: "lead", title: "Intro", style: "color:red"}, {"text-indent": "1em"})
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="p"]')!
    const primary = drawer.querySelector<ElementStyleEditor>('element-style-editor:not([slot="more"])')!
    expect(primary.shadowRoot!.querySelectorAll(".compact-row").length).toBeLessThanOrEqual(4)
    expect(primary.shadowRoot!.querySelector('[data-property="text-indent"]')).toBeNull()
    const options = drawer.querySelector<HTMLElement>(".specialized-options")!
    expect(options.querySelector("element-style-editor")).not.toBeNull()
    const attributeEditor = options.querySelector<ElementAttributeEditor>("element-attribute-editor")!
    expect(attributeEditor).not.toBeNull()
    expect(attributeEditor.hasAttribute("expanded")).toBe(true)
    expect(attributeEditor.shadowRoot!.querySelector("details")?.open).toBe(true)
    expect(attributeEditor.shadowRoot!.querySelector("summary")?.textContent).toContain("All attributes")
    expect(drawer.advancedCount).toBe(4)
    expect(drawer.shadowRoot!.querySelector(".advanced-count")?.textContent).toBe("4")
    expect(drawer.shadowRoot!.querySelector(".drawer-toggle-label")?.textContent).toContain("Options")
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Attributes"]')).toBeNull()
  })

  it("keeps specialized controls inert during a history preview", async () => {
    const toolbox = await mountElement("math")
    toolbox.historyState = {...toolbox.historyState, preview: {
      checkpointId: "older", isCurrent: false, added: 0, removed: 0, modified: 1,
    }}
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="math"]')!
    expect(drawer.inert).toBe(true)
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane-content")!.inert).toBe(true)
  })

  it("groups short widget choices and retains selects for long or multiple choices", async () => {
    const toolbox = await mountElement("demo-widget")
    toolbox.widgetOptions = {
      path: [0], localName: "demo-widget", actions: [], options: [
        {name: "density", type: "select", label: "Density", attribute: "density", value: "comfortable", choices: [
          {value: "comfortable", label: "Comfortable"}, {value: "compact", label: "Compact"},
        ]},
        {name: "theme", type: "select", label: "Theme", attribute: "theme", value: "a", choices: Array.from({length: 9}, (_, index) => ({value: String.fromCharCode(97 + index), label: `Choice ${index + 1}`}))},
        {name: "tags", type: "select", label: "Tags", attribute: "tags", value: ["a"], multiple: true, choices: [
          {value: "a", label: "First"}, {value: "b", label: "Second"},
        ]},
      ],
    } satisfies WidgetOptionsState
    await toolbox.updateComplete
    const primary = toolbox.shadowRoot!.querySelector<HTMLElement>(".specialized-widget-primary")!
    expect(primary.querySelector('[aria-labelledby="widget-label-density"]')?.querySelectorAll("button")).toHaveLength(2)
    expect(primary.querySelectorAll("select")).toHaveLength(2)
    const changes = vi.fn()
    toolbox.addEventListener("widget-option-change", changes)
    primary.querySelector<HTMLButtonElement>('[aria-labelledby="widget-label-density"] button[aria-pressed="true"]')!.click()
    expect(changes.mock.calls[0][0].detail).toEqual({name: "density", value: null})
  })
})
