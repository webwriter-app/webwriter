// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "./domeditor"
import {sharedDOMBody} from "./domdoc"
import {$} from "./utility"
import {hasPresentationState} from "./presentation-state.js"

let editor: DOMEditor
let fullscreenElement: Element | null
let previousFullscreen: PropertyDescriptor | undefined
let modal: Set<HTMLDialogElement>

const scope = () => editor.appendix.querySelector<HTMLDialogElement>("dialog.◆fullscreen-appendix")
const fullscreen = (element: Element | null) => {
  fullscreenElement = element
  ;(element?.isConnected ? element : document).dispatchEvent(new Event("fullscreenchange", {bubbles: true, composed: true}))
}
const settle = async () => { await Promise.resolve(); await new Promise(resolve => setTimeout(resolve)) }

beforeEach(() => {
  document.body.innerHTML = '<section id="fullscreen"><section id="nested"><p>Keep this text</p></section></section><p>Outside</p>'
  document.getSelection()?.removeAllRanges()
  fullscreenElement = null
  previousFullscreen = Object.getOwnPropertyDescriptor(document, "fullscreenElement")
  Object.defineProperty(document, "fullscreenElement", {configurable: true, get: () => fullscreenElement})
  modal = new Set()
  const matches = HTMLDialogElement.prototype.matches
  vi.spyOn(HTMLDialogElement.prototype, "matches").mockImplementation(function(this: HTMLDialogElement, selector) {
    return selector === ":modal" || selector === ":modal, :popover-open" ? modal.has(this) : matches.call(this, selector)
  })
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function(this: HTMLDialogElement) {modal.add(this); this.open = true})
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function(this: HTMLDialogElement) {modal.delete(this); this.open = false})
  editor = new DOMEditor()
})

afterEach(() => {
  fullscreenElement = null
  editor.destroy()
  vi.restoreAllMocks()
  if(previousFullscreen) Object.defineProperty(document, "fullscreenElement", previousFullscreen)
  else Reflect.deleteProperty(document, "fullscreenElement")
  document.body.shadowRoot?.replaceChildren()
  document.body.replaceChildren()
})

describe("fullscreen appendix", () => {
  it("shares one modal layer between existing appendix controls and the original default slot", () => {
    const appendix = editor.appendix
    const slot = appendix.querySelector("slot:not([name])")!
    const control = document.createElement("button")
    control.textContent = "Delete selected element"
    editor.addAppendix(control)
    const before = Array.from(appendix.childNodes)
    fullscreen(document.querySelector("#fullscreen"))
    const layer = scope()!
    expect(layer.getAttribute("aria-label")).toBe("Fullscreen editor")
    expect(modal.has(layer)).toBe(true)
    expect(layer.contains(control)).toBe(true)
    expect(layer.contains(slot)).toBe(true)
    expect(Array.from(layer.childNodes).filter(node => before.includes(node))).toEqual(before)
    expect(editor.appendix.querySelectorAll("slot:not([name])")).toHaveLength(1)
    expect(editor.appendix.querySelector("slot:not([name])")).toBe(slot)
    expect(control.hasAttribute("popover")).toBe(false)
    fullscreen(null)
    expect(scope()).toBeNull()
    expect(modal.has(layer)).toBe(false)
    expect(control.parentNode).toBe(appendix)
    expect(slot.parentNode).toBe(appendix)
    expect(Array.from(appendix.childNodes).filter(node => before.includes(node))).toEqual(before)
  })

  it("includes controls created through addAppendix and direct root appends while fullscreen", async () => {
    fullscreen(document.querySelector("#fullscreen"))
    const layer = scope()!
    const owned = document.createElement("button")
    owned.textContent = "Insert row"
    editor.addAppendix(owned)
    expect(owned.parentNode).toBe(layer)
    const direct = document.createElement("button")
    direct.textContent = "Accept change"
    const comment = document.createComment("appendix note")
    editor.appendix.append(direct, comment)
    await settle()
    expect(direct.parentNode).toBe(layer)
    expect(comment.parentNode).toBe(layer)
    expect(layer.querySelectorAll("dialog.◆fullscreen-appendix")).toHaveLength(0)
    fullscreen(null)
    expect(owned.parentNode).toBe(editor.appendix)
    expect(direct.parentNode).toBe(editor.appendix)
    expect(comment.parentNode).toBe(editor.appendix)
    expect(Array.from(editor.appendix.childNodes).indexOf(direct)).toBeLessThan(Array.from(editor.appendix.childNodes).indexOf(comment))
  })

  it("uses atomic moves only for native fullscreen controls, with ordinary slot and exit moves", () => {
    const appendix = editor.appendix
    const slot = appendix.querySelector("slot:not([name])")!
    const control = document.createElement("button")
    editor.addAppendix(control)
    const target = document.querySelector("#fullscreen")!
    const matches = target.matches.bind(target)
    vi.spyOn(target, "matches").mockImplementation(selector => selector === ":fullscreen" ? fullscreenElement === target : matches(selector))
    const elementMove = Object.getOwnPropertyDescriptor(Element.prototype, "moveBefore")
    const fragmentMove = Object.getOwnPropertyDescriptor(DocumentFragment.prototype, "moveBefore")
    const move = vi.fn(function(this: Element | DocumentFragment, node: Node, before: Node | null) {
      this.insertBefore(node, before)
    })
    Object.defineProperty(Element.prototype, "moveBefore", {configurable: true, value: move})
    Object.defineProperty(DocumentFragment.prototype, "moveBefore", {configurable: true, value: move})
    try {
      fullscreen(target)
      expect(move.mock.calls.some(([node]) => node === control)).toBe(true)
      expect(move.mock.calls.some(([node]) => node === slot)).toBe(false)
      move.mockClear()
      fullscreen(null)
      expect(move).not.toHaveBeenCalled()
      expect(move.mock.calls.some(([node]) => node === slot)).toBe(false)
      expect(slot.parentNode).toBe(appendix)
      // A document's retargeted widget host does not have a fullscreen flag.
      fullscreen(document.querySelector("#nested"))
      expect(move).not.toHaveBeenCalled()
      fullscreen(null)
    }
    finally {
      if(elementMove) Object.defineProperty(Element.prototype, "moveBefore", elementMove)
      else Reflect.deleteProperty(Element.prototype, "moveBefore")
      if(fragmentMove) Object.defineProperty(DocumentFragment.prototype, "moveBefore", fragmentMove)
      else Reflect.deleteProperty(DocumentFragment.prototype, "moveBefore")
    }
  })

  it("promotes the same modal scope again when the fullscreen target changes", () => {
    fullscreen(document.querySelector("#fullscreen"))
    const layer = scope()!
    const control = document.createElement("button")
    editor.addAppendix(control)
    const showed = vi.mocked(HTMLDialogElement.prototype.showModal).mock.calls.length
    fullscreen(document.querySelector("#nested"))
    expect(scope()).toBe(layer)
    expect(modal.has(layer)).toBe(true)
    expect(control.parentNode).toBe(layer)
    expect(vi.mocked(HTMLDialogElement.prototype.showModal).mock.calls.length).toBeGreaterThan(showed)
    expect(editor.appendix.querySelectorAll("dialog.◆fullscreen-appendix")).toHaveLength(1)
  })

  it("keeps existing nested native dialogs and popovers open across layer changes", () => {
    const host = document.createElement("div")
    const shadow = host.attachShadow({mode: "open"})
    const dialog = document.createElement("dialog")
    shadow.append(dialog)
    editor.addAppendix(host)
    dialog.showModal()
    const popup = document.createElement("div")
    popup.setAttribute("popover", "manual")
    let popupOpen = true
    const matches = popup.matches.bind(popup)
    vi.spyOn(popup, "matches").mockImplementation(selector => selector === ":popover-open" || selector === ":modal, :popover-open" ? popupOpen : matches(selector))
    const show = vi.fn(() => {popupOpen = true})
    Object.defineProperties(popup, {
      showPopover: {configurable: true, value: show},
      hidePopover: {configurable: true, value: vi.fn(() => {popupOpen = false})},
    })
    editor.addAppendix(popup)
    fullscreen(document.querySelector("#fullscreen"))
    const layer = scope()!
    expect(layer.contains(host)).toBe(true)
    expect(dialog.parentNode).toBe(shadow)
    expect(modal.has(dialog)).toBe(true)
    expect(popupOpen).toBe(true)
    expect(show).toHaveBeenCalledOnce()
    fullscreen(document.querySelector("#nested"))
    expect(modal.has(dialog)).toBe(true)
    expect(popupOpen).toBe(true)
    expect(show).toHaveBeenCalledTimes(2)
    fullscreen(null)
    expect(modal.has(dialog)).toBe(true)
    expect(popupOpen).toBe(true)
    expect(show).toHaveBeenCalledTimes(3)
    expect(host.parentNode).toBe(editor.appendix)
    expect(popup.parentNode).toBe(editor.appendix)
  })

  it.each(["body", "html"])("keeps the slotted document presentation enabled for %s fullscreen", tag => {
    const slot = editor.appendix.querySelector("slot:not([name])")!
    fullscreen(document.querySelector(tag))
    const layer = scope()!
    expect(layer.classList.contains("◆fullscreen-document")).toBe(true)
    expect(layer.contains(slot)).toBe(true)
    fullscreen(document.querySelector("#nested"))
    expect(scope()).toBe(layer)
    expect(layer.classList.contains("◆fullscreen-document")).toBe(false)
    fullscreen(null)
    expect(slot.parentNode).toBe(editor.appendix)
  })

  it("restores the appendix safely when the fullscreen target has been disconnected", () => {
    const target = document.querySelector("#fullscreen")!
    const control = document.createElement("button")
    editor.addAppendix(control)
    fullscreen(target)
    const layer = scope()!
    target.remove()
    fullscreen(target)
    expect(scope()).toBeNull()
    expect(modal.has(layer)).toBe(false)
    expect(control.parentNode).toBe(editor.appendix)
    fullscreen(null)
    expect(control.parentNode).toBe(editor.appendix)
  })

  it("updates and clears the presentation boundary without authored fullscreen markers", () => {
    const outer = document.querySelector("#fullscreen")!
    const nested = document.querySelector("#nested")!
    const authored = document.body.innerHTML
    fullscreen(outer)
    expect(hasPresentationState(document.body, "appendix-fullscreen-active")).toBe(true)
    expect(hasPresentationState(outer, "appendix-fullscreen-target")).toBe(true)
    fullscreen(nested)
    expect(hasPresentationState(outer, "appendix-fullscreen-target")).toBe(false)
    expect(hasPresentationState(nested, "appendix-fullscreen-target")).toBe(true)
    fullscreen(null)
    expect(hasPresentationState(nested, "appendix-fullscreen-target")).toBe(false)
    expect(hasPresentationState(document.body, "appendix-fullscreen-active")).toBe(false)
    expect(document.body.innerHTML).toBe(authored)
  })

  it("preserves authored DOM, selection, collaboration state, and export through entry and exit", () => {
    const target = document.querySelector("#fullscreen")!
    const paragraph = target.querySelector("p")!
    const text = paragraph.firstChild!
    $.selectRange(text, 2, text, 8)
    editor.doc.syncFromDOM()
    const authored = document.body.innerHTML
    const shared = sharedDOMBody(editor.doc.doc).toString()
    const serialized = editor.toHTML(true)
    const control = document.createElement("button")
    control.textContent = "Rotate"
    editor.addAppendix(control)
    for(const next of [target, document.querySelector("#nested"), null]) {
      fullscreen(next)
      expect(document.body.innerHTML).toBe(authored)
      expect(document.getSelection()!.anchorNode).toBe(text)
      expect(document.getSelection()!.anchorOffset).toBe(2)
      expect(document.getSelection()!.focusNode).toBe(text)
      expect(document.getSelection()!.focusOffset).toBe(8)
      editor.doc.syncFromDOM()
      expect(sharedDOMBody(editor.doc.doc).toString()).toBe(shared)
      expect(editor.toHTML(true)).toBe(serialized)
    }
    expect(document.body.querySelector("dialog, button")).toBeNull()
  })

  it.each(["before", "during"])("keeps appendix controls usable with an editing lock acquired %s fullscreen", when => {
    const control = document.createElement("button")
    editor.addAppendix(control)
    const click = vi.fn()
    control.addEventListener("click", click)
    const slot = editor.appendix.querySelector<HTMLSlotElement>("slot:not([name])")!
    const owner = {}
    if(when === "before") editor.lockEditing(owner)
    fullscreen(document.querySelector("#fullscreen"))
    if(when === "during") editor.lockEditing(owner)
    expect(editor.isEditingLocked).toBe(true)
    expect(slot.inert).toBe(true)
    expect(editor.appendix.querySelectorAll("slot:not([name])")).toHaveLength(1)
    expect(scope()!.contains(control)).toBe(true)
    const authoredInput = new InputEvent("beforeinput", {inputType: "insertText", data: "x", bubbles: true, composed: true, cancelable: true})
    document.querySelector("p")!.dispatchEvent(authoredInput)
    expect(authoredInput.defaultPrevented).toBe(true)
    control.click()
    expect(click).toHaveBeenCalledOnce()
    editor.unlockEditing(owner)
    expect(editor.isEditingLocked).toBe(false)
    expect(slot.inert).toBe(false)
    fullscreen(null)
    expect(slot.parentNode).toBe(editor.appendix)
  })

  it("restores unowned appendix nodes and stops observing after destruction", async () => {
    const appendix = editor.appendix
    const unowned = document.createElement("button")
    const note = document.createComment("retain")
    appendix.append(unowned, note)
    const owned = document.createElement("button")
    editor.addAppendix(owned)
    fullscreen(document.querySelector("#fullscreen"))
    const layer = scope()!
    editor.destroy()
    expect(layer.isConnected).toBe(false)
    expect(modal.has(layer)).toBe(false)
    expect(unowned.parentNode).toBe(appendix)
    expect(note.parentNode).toBe(appendix)
    expect(owned.isConnected).toBe(false)
    fullscreen(document.querySelector("#nested"))
    const late = document.createElement("button")
    appendix.append(late)
    await settle()
    expect(appendix.querySelector("dialog.◆fullscreen-appendix")).toBeNull()
    expect(late.parentNode).toBe(appendix)
    expect(() => editor.destroy()).not.toThrow()
  })
})
