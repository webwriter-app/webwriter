// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {SelectionFeature} from "./features/selection"
import {ManipulationFeature} from "./features/manipulation"
import {$} from "./utility"
import {DOMEditor} from "./domeditor"
import {mountDistributionReader} from "./distribution-reader"
import {installInsert} from "./distribution-reader-actions"
import {writeDistributionConfig} from "./distribution-dom"
import {emptyDistributionConfig} from "./distribution.js"
import type {DistributionConfig} from "./distribution.js"
import type {DistributionReaderContext} from "./distribution-reader"

let context: DistributionReaderContext | null = null
let rootId = ""
const waitForReady = async (context: DistributionReaderContext, element: Element) => {
  for(let attempt = 0; attempt < 50 && !context.allows("edit", element); attempt++) {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
  expect(context.allows("edit", element), context.controls.parentElement?.querySelector("[role=status]")?.textContent ?? "Reader not initialized").toBe(true)
  for(let attempt = 0; attempt < 50 && !context.editor; attempt++) await new Promise<void>(resolve => setTimeout(resolve, 0))
  expect(context.editor, context.controls.parentElement?.querySelector("[role=status]")?.textContent).not.toBeNull()
}
const button = (context: DistributionReaderContext, label: string) =>
  Array.from(context.controls.querySelectorAll<HTMLButtonElement>("button")).find(item => item.textContent === label)!
const click = (target: Element) => {
  const event = new MouseEvent("click", {bubbles: true, cancelable: true, composed: true})
  target.dispatchEvent(event)
  return event
}
const config = (target: string, permissions: DistributionConfig["permissions"], add: string[] = [], items: DistributionConfig["items"] = []) => ({
  ...emptyDistributionConfig(target), permissions, add, items,
})
const setup = (markup: string, permissions: DistributionConfig["permissions"] = ["edit", "style", "delete", "insert"], extraConfigs: DistributionConfig[] = [], widgets: import("./schema").WidgetSchemaDefinition[] = [], layout?: "canvas" | "slides" | "board", item = {id: "element:span", label: "Approved span", html: '<span data-approved="yes">Approved</span>'}) => {
  rootId = `reader-${crypto.randomUUID()}`
  document.designMode = "off"
  document.head.replaceChildren()
  document.body.replaceChildren()
  if(document.body.shadowRoot) document.body.shadowRoot.replaceChildren()
  document.documentElement.id = rootId
  document.body.removeAttribute("class")
  document.body.removeAttribute("style")
  document.body.innerHTML = markup
  if(layout) document.body.className = `ww-${layout}`
  writeDistributionConfig(document.documentElement, config(rootId, permissions, [item.id], [item]))
  for(const itemConfig of extraConfigs) {
    const target = document.getElementById(itemConfig.target)!
    writeDistributionConfig(target, itemConfig)
  }
  context = mountDistributionReader(document, {widgets})
  expect(context).not.toBeNull()
  installInsert(context!)
  return {context: context!, item}
}

beforeEach(() => {
  context = null
  document.designMode = "off"
  document.head.replaceChildren()
  document.body.replaceChildren()
  if(document.body.shadowRoot) document.body.shadowRoot.replaceChildren()
})

afterEach(() => {
  context?.destroy()
  context = null
  document.head.replaceChildren()
  document.body.replaceChildren()
  if(document.body.shadowRoot) document.body.shadowRoot.replaceChildren()
  document.documentElement.removeAttribute("id")
  document.body.removeAttribute("class")
  document.body.removeAttribute("style")
  document.designMode = "off"
})

describe("distribution reader runtime", () => {
  it("uses the actual editing features and appendix affordances without a separate select switch or text dialog", async () => {
    const {context} = setup('<p id="editable">Before<!--keep--></p><x-widget><button id="widget-action">Widget action</button></x-widget>')
    const paragraph = document.querySelector<HTMLParagraphElement>("#editable")!
    await waitForReady(context, paragraph)
    expect(context.editor!.features.selection).toBeInstanceOf(SelectionFeature)
    expect(context.editor!.features.manipulation).toBeInstanceOf(ManipulationFeature)
    expect(button(context, "Select")).toBeUndefined()
    expect(button(context, "Edit text")).toBeUndefined()
    expect(button(context, "Delete")).toBeUndefined()
    expect(document.body.shadowRoot!.querySelector(".◆distribution-outline")).toBeNull()
    context.editor!.features.selection.selectElement(paragraph)
    expect(context.selected()).toBe(paragraph)
    const overlay = context.editor!.features.transformation.overlay
    expect(overlay.getRootNode()).toBe(document.body.shadowRoot)
    expect(overlay.querySelector<HTMLButtonElement>('[aria-label="Delete"]')!.hidden).toBe(false)
    expect(overlay.querySelector<HTMLButtonElement>('[aria-label="Move"]')!.hidden).toBe(true)
    const comment = paragraph.childNodes[1]
    $.move(paragraph.firstChild!, 3)
    context.editor!.features.selection.processSelection()
    paragraph.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true}))
    expect(document.designMode).toBe("on")
    const input = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "!"})
    paragraph.dispatchEvent(input)
    expect(input.defaultPrevented).toBe(false)
    ;(paragraph.firstChild as Text).insertData(3, "!")
    paragraph.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText", data: "!"}))
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(paragraph.textContent).toBe("Bef!ore")
    expect(paragraph.childNodes[1]).toBe(comment)
    expect(comment.nodeValue).toBe("keep")
    expect(click(document.querySelector("#widget-action")!).defaultPrevented).toBe(false)
    context.destroy()
    expect(document.designMode).toBe("off")
    expect(document.body.shadowRoot!.querySelector('[part~="transform-overlay"]')).toBeNull()
    expect(document.body.querySelector('[class*="◆"]')).toBeNull()
    expect(Array.from(document.body.shadowRoot!.children).map(element => element.localName)).toEqual(["slot"])
  })

  it("applies resize styles and restores unsafe direct presentation changes", async () => {
    const {context} = setup('<p id="box" style="width: 100px">Resizable</p>')
    const box = document.querySelector<HTMLParagraphElement>("#box")!
    await waitForReady(context, box)
    context.editor!.features.selection.selectElement(box)

    expect(context.selected()).toBe(box)
    expect(button(context, "Size")).toBeUndefined()
    expect(button(context, "Style")).toBeUndefined()
    const corner = context.editor!.features.transformation.overlay.querySelector<HTMLElement>('[data-resize-direction="down-right"]')!
    expect(corner.hidden).toBe(false)
    context.editor!.features.manipulation.setElementStyles(box, {width: "240px", height: "80px"})
    expect(box.style.width).toBe("240px")
    expect(box.style.height).toBe("80px")

    await new Promise<void>(resolve => setTimeout(resolve, 0))
    box.setAttribute("style", "width: 240px; height: 80px; background-image: url(javascript:alert(1))")
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(box.style.width).toBe("240px")
    expect(box.style.height).toBe("80px")
    expect(box.style.backgroundImage).toBe("")
  })

  it("inserts only the exact approved template without adding authored wrappers or editor attributes", async () => {
    const {context, item} = setup('<p id="container">Start<!--keep--></p>')
    const paragraph = document.querySelector<HTMLParagraphElement>("#container")!
    await waitForReady(context, paragraph)
    context.editor!.features.selection.selectElement(paragraph)
    const picker = context.controls.querySelector<HTMLSelectElement>('select[aria-label="Reader palette"]')!
    expect(Array.from(picker.options).map(option => option.value)).toContain(item.id)
    picker.value = item.id
    button(context, "Insert").click()

    expect(paragraph.querySelector("span")?.outerHTML).toBe(item.html)
    expect(paragraph.firstChild?.nodeType).toBe(Node.TEXT_NODE)
    expect(paragraph.childNodes[1]?.nodeType).toBe(Node.COMMENT_NODE)
    expect(context.editor!.toHTML(true, false)).toBe('<p id="container">Start<!--keep--><span data-approved="yes">Approved</span></p>')
    expect(document.body.querySelector("[data-webwriter-editor-only], [contenteditable]")).toBeNull()
  })

  it("remaps references across all roots of each inserted approved template", async () => {
    const item = {
      id: "element:input",
      label: "Name field",
      html: '<!--start--><label for="name">Name</label><input id="name" aria-describedby="help"><span id="help">Help</span><svg xmlns="http://www.w3.org/2000/svg"><use href="#help"></use></svg><!--end-->',
    }
    const {context} = setup('<p id="container">Start</p>', undefined, [], [], undefined, item)
    const paragraph = document.querySelector<HTMLParagraphElement>("#container")!
    await waitForReady(context, paragraph)
    context.editor!.features.selection.selectElement(paragraph)
    const picker = context.controls.querySelector<HTMLSelectElement>('select[aria-label="Reader palette"]')!
    picker.value = item.id
    button(context, "Insert").click()
    button(context, "Insert").click()

    const labels = Array.from(paragraph.querySelectorAll("label"))
    const inputs = Array.from(paragraph.querySelectorAll("input"))
    const helps = Array.from(paragraph.querySelectorAll("span"))
    expect(labels).toHaveLength(2)
    expect(inputs).toHaveLength(2)
    expect(helps).toHaveLength(2)
    expect(new Set(inputs.map(input => input.id)).size).toBe(2)
    for(let index = 0; index < 2; index++) {
      expect(labels[index].htmlFor).toBe(inputs[index].id)
      expect(inputs[index].getAttribute("aria-describedby")).toBe(helps[index].id)
      expect(paragraph.querySelector(`use[href="#${helps[index].id}"]`)).not.toBeNull()
    }
    expect(paragraph.childNodes[1]?.nodeType).toBe(Node.COMMENT_NODE)
    expect(paragraph.childNodes[2]?.nodeType).toBe(Node.ELEMENT_NODE)
    expect(paragraph.querySelector("svg")?.namespaceURI).toBe("http://www.w3.org/2000/svg")
  })

  it("does not insert a dormant template when insert permission is absent", async () => {
    const {context} = setup('<p id="container">Start</p>', ["edit"])
    const paragraph = document.querySelector<HTMLParagraphElement>("#container")!
    await waitForReady(context, paragraph)
    const picker = context.controls.querySelector<HTMLSelectElement>('select[aria-label="Reader palette"]')
    const insert = button(context, "Insert")
    expect(picker?.hidden ?? true).toBe(true)
    expect(insert.hidden || insert.disabled).toBe(true)
    picker?.dispatchEvent(new Event("change", {bubbles: true}))
    click(insert)
    expect(paragraph.innerHTML).toBe("Start")
  })

  it("refreshes insertion controls when selection enters a denying descendant override", async () => {
    const restricted = {...emptyDistributionConfig("restricted"), add: ["element:span"], items: [
      {id: "element:span", label: "Approved span", html: '<span data-approved="yes">Approved</span>'},
    ]}
    const {context} = setup('<p id="container">Start</p><section id="restricted"><p id="inside">Private</p></section>', ["edit", "insert"], [restricted])
    const container = document.querySelector<HTMLParagraphElement>("#container")!
    const inside = document.querySelector<HTMLParagraphElement>("#inside")!
    await waitForReady(context, container)
    context.editor!.features.selection.selectElement(container)
    const picker = context.controls.querySelector<HTMLSelectElement>('select[aria-label="Reader palette"]')!
    const insert = button(context, "Insert")
    expect(picker.hidden).toBe(false)
    expect(insert.disabled).toBe(false)

    $.move(inside.firstChild!, 0)
    context.editor!.features.selection.processSelection()
    window.dispatchEvent(new Event("webwriter-distribution-selection"))
    expect(context.selected()).toBeNull()
    expect(picker.hidden).toBe(true)
    expect(insert.hidden || insert.disabled).toBe(true)
    click(insert)
    expect(inside.innerHTML).toBe("Private")
    expect(container.innerHTML).toBe("Start")
  })

  it("uses the same Enter and Delete paths as authoring, with full descendant overrides", async () => {
    const {context} = setup('<section><p id="restricted">Private</p><p id="text">Before</p></section>', ["edit", "delete"], [emptyDistributionConfig("restricted")])
    const paragraph = document.querySelector<HTMLParagraphElement>("#text")!
    await waitForReady(context, paragraph)
    $.move(paragraph.firstChild!, 3)
    paragraph.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    const immediate = context.editor!.toHTML(true, false)
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(context.editor!.toHTML(true, false)).toBe(immediate)
    expect(document.querySelectorAll("section > p")).toHaveLength(3)
    const last = document.querySelector("section")!.lastElementChild!
    context.editor!.features.selection.selectElement(last)
    last.dispatchEvent(new KeyboardEvent("keydown", {key: "Delete", bubbles: true, cancelable: true}))
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(last.isConnected).toBe(false)
    const restricted = document.querySelector("#restricted")!
    context.editor!.features.selection.selectElement(restricted)
    $.selectElement(restricted)
    context.editor!.features.selection.processSelection()
    expect(context.selected()).toBeNull()
    expect(context.editor!.features.transformation.target).toBeNull()
    const denied = new KeyboardEvent("keydown", {key: "Delete", bubbles: true, cancelable: true})
    restricted.dispatchEvent(denied)
    expect(denied.defaultPrevented).toBe(true)
    expect(restricted.textContent).toBe("Private")
  })

  it.each(["move", "delete"] as const)("implicitly enables shared selection for %s without enabling typing or styling", async permission => {
    const {context} = setup('<p id="target">Read only text</p><p>Other</p>', [permission])
    for(let attempt = 0; attempt < 50 && !context.editor; attempt++) await new Promise<void>(resolve => setTimeout(resolve, 0))
    const target = document.querySelector("#target")!
    expect(context.editor).not.toBeNull()
    context.editor!.features.selection.selectElement(target)
    expect(context.selected()).toBe(target)
    const overlay = context.editor!.features.transformation.overlay
    expect(overlay.querySelector<HTMLButtonElement>('[aria-label="Delete"]')!.hidden).toBe(permission !== "delete")
    expect(overlay.querySelector<HTMLButtonElement>('[aria-label="Move"]')!.hidden).toBe(permission !== "move")
    expect(Array.from(overlay.querySelectorAll<HTMLElement>('[data-transform-mode="scale"]')).every(handle => handle.hidden || handle.getAttribute("part")?.includes("scale-hidden"))).toBe(true)
    const typing = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "forbidden"})
    target.dispatchEvent(typing)
    expect(typing.defaultPrevented).toBe(true)
    expect(target.textContent).toBe("Read only text")
    expect(target.hasAttribute("contenteditable")).toBe(false)
  })

  it("matches authoring deletion on irregular content, including undo and redo", async () => {
    const markup = '<section><!--keep--><p>Before <b>nested</b></p><x-atomic id="widget"><span>Authored fallback</span></x-atomic><p>After</p></section>'
    const {context} = setup(markup, ["edit", "move", "delete"])
    await waitForReady(context, document.querySelector("p")!)
    const engine = context.editor!
    const widget = document.querySelector("#widget")!
    engine.features.selection.selectElement(widget)
    engine.features.transformation.overlay.querySelector<HTMLButtonElement>('[aria-label="Delete"]')!.click()
    const readerHTML = engine.toHTML(true, false)
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(engine.toHTML(true, false)).toBe(readerHTML)
    expect(document.querySelector("#widget")).toBeNull()
    context.destroy()
    document.head.replaceChildren()
    document.body.innerHTML = markup
    const author = new DOMEditor()
    try {
      author.features.selection.selectElement(document.querySelector("#widget")!)
      author.features.transformation.overlay.querySelector<HTMLButtonElement>('[aria-label="Delete"]')!.click()
      expect(author.toHTML(true, false)).toBe(readerHTML)
      author.doc.undo()
      expect(document.querySelector("#widget")).not.toBeNull()
      author.doc.redo()
      expect(author.toHTML(true, false)).toBe(readerHTML)
    }
    finally { author.destroy() }
  })

  it("keeps move authorization attached to the live drag source after a drop preview changes selection", async () => {
    const {context} = setup('<p id="static">Fixed</p><p id="moving">Move</p>', [], [{...emptyDistributionConfig("moving"), permissions: ["move"]}])
    for(let attempt = 0; attempt < 50 && !context.editor; attempt++) await new Promise<void>(resolve => setTimeout(resolve, 0))
    const engine = context.editor!, source = document.querySelector("#moving")!
    engine.features.selection.selectElement(source)
    const transfer = new DataTransfer()
    transfer.setDragImage = () => {}
    const drag = new Event("dragstart", {bubbles: true, cancelable: true})
    Object.defineProperty(drag, "dataTransfer", {value: transfer})
    engine.features.manipulation.startNodeDrag(drag as DragEvent, source)
    expect(engine.features.manipulation.draggedElement).toBe(source)
    $.move(document.body, 0)
    const over = new Event("dragover", {bubbles: true, cancelable: true})
    expect(engine.allowsFeatureEvent(engine.features.manipulation, over)).toBe(true)
    source.remove()
    expect(engine.allowsFeatureEvent(engine.features.manipulation, over)).toBe(false)
    engine.features.manipulation.endNodeDrag(false)
    expect(document.body.querySelector('[class*="◆node-drag"]')).toBeNull()
  })

  it("uses saved widget editing declarations and leaves denied widget hosts in reading mode", async () => {
    const {context} = setup('<reader-widget id="editable-widget"></reader-widget><reader-widget id="locked-widget"></reader-widget>', ["edit"], [emptyDistributionConfig("locked-widget")], [{tagName: "reader-widget", editingConfig: {content: "p*"}}])
    const widget = document.querySelector("#editable-widget")!, locked = document.querySelector("#locked-widget")!
    await waitForReady(context, widget)
    expect(context.editor!.features.widget.isWidget(widget)).toBe(true)
    expect(widget.classList.contains("◆widget-editable")).toBe(true)
    expect(widget.getAttribute("contenteditable")).toBe("")
    expect(locked.hasAttribute("contenteditable")).toBe(false)
    expect(context.editor!.toHTML(true, false)).not.toContain("contenteditable")
    context.destroy()
    expect(widget.hasAttribute("contenteditable")).toBe(false)
    expect(widget.classList.contains("◆widget-editable")).toBe(false)
  })

  it.each(["canvas", "slides", "board"] as const)("uses the shared %s affordances and hides unavailable insertion and style controls", async layout => {
    const paragraph = '<p id="target" style="position: absolute; left: 20px; top: 20px">Move or delete</p><p>Keep</p>'
    const markup = layout === "board" ? '<section class="ww-board-column"><h2>Column</h2><article id="target" class="ww-board-card"><p>Move or delete</p></article></section>'
      : layout === "slides" ? `<div class="ww-slides-viewport"><section class="ww-slide">${paragraph}</section></div>` : paragraph
    const {context} = setup(markup, ["move", "delete"], [], [], layout)
    for(let attempt = 0; attempt < 50 && !context.editor; attempt++) await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(context.editor, context.controls.parentElement?.querySelector("[role=status]")?.textContent).not.toBeNull()
    const engine = context.editor!, target = document.querySelector<HTMLElement>("#target")!
    engine.features.selection.selectElement(target)
    engine.features.board.refresh()
    const overlay = layout === "board" ? engine.features.board.transformOverlay(target)! : engine.features.transformation.overlay
    expect(overlay).not.toBeNull()
    expect(overlay.getRootNode()).toBe(document.body.shadowRoot)
    const remove = overlay.querySelector<HTMLButtonElement>('[part~="transform-overlay-delete"]')!
    expect(remove.hidden).toBe(false)
    expect(Array.from(overlay.querySelectorAll<HTMLElement>('[data-transform-mode="scale"]')).every(handle => handle.hidden)).toBe(true)
    expect(Array.from(document.body.shadowRoot!.querySelectorAll<HTMLButtonElement>('button[aria-label="Add text"], button[aria-label="Add slide"], [part="board-actions"] button')).every(button => button.hidden || button.disabled)).toBe(true)
    remove.click()
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(target.isConnected).toBe(false)
  })

  it("restores unauthorized direct DOM mutations", async () => {
    const {context} = setup('<p id="editable">Original</p>')
    const paragraph = document.querySelector<HTMLParagraphElement>("#editable")!
    await waitForReady(context, paragraph)
    paragraph.setAttribute("onclick", "alert(1)")
    paragraph.textContent = "Forged"
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(paragraph.hasAttribute("onclick")).toBe(false)
    expect(paragraph.textContent).toBe("Original")
  })
})
