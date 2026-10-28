// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {mountDistributionReader} from "./distribution-reader"
import {installDelete, installEdit, installInsert, installStyle} from "./distribution-reader-actions"
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
const setup = (markup: string, permissions: DistributionConfig["permissions"] = ["edit", "style", "delete"], extraConfigs: DistributionConfig[] = []) => {
  rootId = `reader-${crypto.randomUUID()}`
  document.designMode = "off"
  document.head.replaceChildren()
  document.body.replaceChildren()
  if(document.body.shadowRoot) document.body.shadowRoot.replaceChildren()
  document.documentElement.id = rootId
  document.body.innerHTML = markup
  const item = {id: "element:span", label: "Approved span", html: '<span data-approved="yes">Approved</span>'}
  writeDistributionConfig(document.documentElement, config(rootId, permissions, [item.id], [item]))
  for(const itemConfig of extraConfigs) {
    const target = document.getElementById(itemConfig.target)!
    writeDistributionConfig(target, itemConfig)
  }
  context = mountDistributionReader(document)
  expect(context).not.toBeNull()
  installEdit(context!)
  installStyle(context!)
  installInsert(context!)
  installDelete(context!)
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
  document.designMode = "off"
})

describe("distribution reader runtime", () => {
  it("starts with selection off, edits text in place, preserves comments, and cleans appendix UI on destroy", async () => {
    const {context} = setup('<p id="editable">Before<!--keep--></p><x-widget><button id="widget-action">Widget action</button></x-widget>')
    const paragraph = document.querySelector<HTMLParagraphElement>("#editable")!
    await waitForReady(context, paragraph)
    const select = context.controls.querySelector<HTMLButtonElement>('button[aria-pressed]')!
    expect(select.getAttribute("aria-pressed")).toBe("false")

    const untouched = click(paragraph)
    expect(untouched.defaultPrevented).toBe(false)
    expect(context.selected()).toBeNull()
    const widgetInteraction = click(document.querySelector("#widget-action")!)
    expect(widgetInteraction.defaultPrevented).toBe(false)
    expect(context.selected()).toBeNull()

    select.click()
    const selectedClick = click(paragraph)
    expect(selectedClick.defaultPrevented).toBe(true)
    expect(context.selected()).toBe(paragraph)
    const comment = paragraph.childNodes[1]
    button(context, "Edit text").click()
    const field = context.root.body.shadowRoot!.querySelector<HTMLTextAreaElement>('textarea[aria-label="Element text"]')!
    field.value = "After"
    field.parentElement!.querySelector<HTMLButtonElement>("button")!.click()

    expect(paragraph.textContent).toBe("After")
    expect(document.querySelector("#editable")).toBe(paragraph)
    expect(paragraph.childNodes[1]).toBe(comment)
    expect(comment.nodeType).toBe(Node.COMMENT_NODE)
    expect(comment.nodeValue).toBe("keep")
    expect(document.body.innerHTML).toBe('<p id="editable">After<!--keep--></p><x-widget><button id="widget-action">Widget action</button></x-widget>')

    context.destroy()
    const appendix = document.body.shadowRoot!
    expect(appendix.querySelector(".◆distribution-reader")).toBeNull()
    expect(appendix.querySelector(".◆distribution-outline")).toBeNull()
    expect(Array.from(appendix.children).map(element => element.localName)).toEqual(["slot"])
    const afterDestroy = click(paragraph)
    expect(afterDestroy.defaultPrevented).toBe(false)
  })

  it("applies resize styles and restores unsafe direct presentation changes", async () => {
    const {context} = setup('<div id="box" style="width: 100px"></div>')
    const box = document.querySelector<HTMLDivElement>("#box")!
    await waitForReady(context, box)
    context.controls.querySelector<HTMLButtonElement>('button[aria-pressed]')!.click()
    click(box)

    button(context, "Size").click()
    const fields = Array.from(context.controls.parentElement!.children).find(element =>
      element.querySelector('input[aria-label="Width (px)"]')) as HTMLElement
    const [width, height] = fields.querySelectorAll<HTMLInputElement>('input[type="number"]')
    width.value = "240"; height.value = "80"
    fields.querySelector<HTMLButtonElement>("button")!.click()
    expect(box.style.width).toBe("240px")
    expect(box.style.height).toBe("80px")

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
    context.controls.querySelector<HTMLButtonElement>('button[aria-pressed]')!.click()
    click(paragraph)
    const picker = context.controls.querySelector<HTMLSelectElement>('select[aria-label="Reader palette"]')!
    expect(Array.from(picker.options).map(option => option.value)).toContain(item.id)
    picker.value = item.id
    button(context, "Add").click()

    expect(paragraph.querySelector("span")?.outerHTML).toBe(item.html)
    expect(paragraph.firstChild?.nodeType).toBe(Node.TEXT_NODE)
    expect(paragraph.childNodes[1]?.nodeType).toBe(Node.COMMENT_NODE)
    expect(document.body.innerHTML).toBe('<p id="container">Start<!--keep--><span data-approved="yes">Approved</span></p>')
    expect(document.body.querySelector("[class^='◆'], [data-webwriter-editor-only]")).toBeNull()
  })

  it("blocks a denied descendant override and makes stale text edits a no-op", async () => {
    const restricted = emptyDistributionConfig("restricted")
    const {context} = setup('<section><p id="restricted">Private</p><p id="stale">Current</p></section>', ["edit", "style", "delete"], [restricted])
    const privateText = document.querySelector<HTMLParagraphElement>("#restricted")!
    const stale = document.querySelector<HTMLParagraphElement>("#stale")!
    await waitForReady(context, stale)
    // The descendant config is fully initialized before its permission is relied on.
    for(let attempt = 0; attempt < 50 && !button(context, "Edit text").disabled; attempt++) await new Promise<void>(resolve => setTimeout(resolve, 0))
    context.controls.querySelector<HTMLButtonElement>('button[aria-pressed]')!.click()
    click(privateText)
    expect(context.policy(privateText)?.permissions).toEqual([])
    expect(button(context, "Edit text").disabled).toBe(true)
    expect(privateText.textContent).toBe("Private")

    click(stale)
    expect(context.selected()).toBe(stale)
    button(context, "Edit text").click()
    const field = context.root.body.shadowRoot!.querySelector<HTMLTextAreaElement>('textarea[aria-label="Element text"]')!
    field.value = "Should not apply"
    stale.remove()
    field.parentElement!.querySelector<HTMLButtonElement>("button")!.click()
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(stale.textContent).not.toBe("Should not apply")
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
