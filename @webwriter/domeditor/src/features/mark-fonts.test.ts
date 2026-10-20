// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {DOMEditor} from "../domeditor"
import {bunnyFontStylesheet} from "../fonts"
import {$} from "../utility"
import * as Y from "yjs"
import type {XmlElement} from "yjs"
import {SharedDOMDoc} from "../domdoc"
import {fontCSSDataURL, embeddedFontRules} from "../local-fonts"

const href = bunnyFontStylesheet({familyName: "Alegreya", category: "serif", weights: [400, 700], styles: ["normal", "italic"]})
const embedded = fontCSSDataURL('@font-face {font-family: "Alegreya"; font-weight: 400; src: url("data:font/woff2;base64,AQID");}')
let editor: DOMEditor
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)) }
const links = () => document.head.querySelectorAll<HTMLLinkElement>('link[href^="https://fonts.bunny.net/css"], link[href^="data:text/css;base64,"]')
beforeEach(() => {
  document.body.innerHTML = "<p>One</p><p>Two</p>"
  editor = new DOMEditor()
})
afterEach(() => { editor.destroy(); links().forEach(link => link.remove()); document.body.replaceChildren() })
function selectParagraph(index = 0) {
  const paragraph = document.querySelectorAll("p")[index]
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
  const first = walker.nextNode() as Text
  let last = first
  while(walker.nextNode()) last = walker.currentNode as Text
  $.selectRange(first, 0, last, last.length)
}

describe("document font lifecycle", () => {
  it.each([href, embedded])("synchronizes font usage and stylesheet additions and removals to a coauthor (%#)", async href => {
    await settle()
    const owner = document.implementation.createHTMLDocument("")
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(editor.doc.doc))
    const peer = new SharedDOMDoc(undefined, undefined, ["contenteditable", "spellcheck"], ["◆"], {root: owner.body, ydoc})
    try {
      selectParagraph()
      editor.features.mark.setStyleMark("font-family", '"Alegreya", serif', href)
      await settle()
      editor.doc.syncFromDOM()
      Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(editor.doc.doc), "remote")
      expect(owner.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')!.href).toBe(href)
      expect(owner.querySelector("span")!.style.fontFamily).toContain("Alegreya")
      selectParagraph()
      editor.features.mark.setStyleMark("font-family", "")
      await settle()
      editor.doc.syncFromDOM()
      Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(editor.doc.doc), "remote")
      expect(owner.querySelector('link[rel="stylesheet"]')).toBeNull()
      expect(owner.body.innerHTML).toBe("<p>One</p><p>Two</p>")
    }
    finally { peer.destroy() }
  })

  it.each([href, embedded])("loads once, retains another use and cleans up direct or remote last-use removal (%#)", async href => {
    for(const index of [0, 1]) {
      selectParagraph(index)
      expect(editor.features.mark.setStyleMark("font-family", '"Alegreya", serif', href)).toBe(true)
    }
    await settle()
    expect(links()).toHaveLength(1)
    expect(editor.toHTML()).toContain(href.replaceAll("&", "&amp;"))
    expect(editor.toHTML()).not.toContain("font-combobox")
    document.querySelector("p")!.remove()
    await settle()
    expect(links()).toHaveLength(1)
    editor.doc.syncFromDOM()
    const paragraph = editor.doc.body.get(0) as XmlElement
    editor.doc.doc.transact(() => paragraph.delete(0, paragraph.length), "remote-test")
    await settle()
    expect(links()).toHaveLength(0)
  })

  it.each([href, embedded])("restores both font usage and its stylesheet through undo and redo (%#)", async href => {
    await settle()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    selectParagraph()
    editor.features.mark.setStyleMark("font-family", '"Alegreya", serif', href)
    await settle()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    selectParagraph()
    editor.features.mark.setStyleMark("font-family", "Arial")
    await settle()
    editor.doc.syncFromDOM()
    expect(document.querySelector("span")!.style.fontFamily).toBe("Arial, sans-serif")
    expect(links()).toHaveLength(0)
    editor.doc.undo()
    await settle()
    expect(document.querySelector("span")!.style.fontFamily).toContain("Alegreya")
    expect(links()).toHaveLength(1)
    editor.doc.redo()
    await settle()
    expect(document.querySelector("span")!.style.fontFamily).toBe("Arial, sans-serif")
    expect(links()).toHaveLength(0)
  })

  it.each([href, embedded])("keeps a pending caret font until the caret moves and safely rejects a disconnected selection (%#)", async href => {
    $.move(document.querySelector("p")!.firstChild!, 1)
    expect(editor.features.mark.setStyleMark("font-family", '"Alegreya", serif', href)).toBe(true)
    expect(links()).toHaveLength(1)
    expect(editor.features.mark.removeMarks()).toBe(true)
    expect(links()).toHaveLength(0)
    editor.features.mark.setStyleMark("font-family", '"Alegreya", serif', href)
    expect(links()).toHaveLength(1)
    $.move(document.querySelectorAll("p")[1].firstChild!, 1)
    document.dispatchEvent(new Event("selectionchange"))
    await settle()
    expect(links()).toHaveLength(0)
    document.body.replaceChildren()
    document.getSelection()!.removeAllRanges()
    expect(editor.features.mark.setStyleMark("font-family", '"Alegreya", serif', href)).toBe(false)
    expect(links()).toHaveLength(0)
  })

  it("combines imported faces of one family while replacing only the matching face", async () => {
    selectParagraph()
    editor.features.mark.setStyleMark("font-family", '"Alegreya", serif', embedded)
    const bold = fontCSSDataURL('@font-face {font-family: "Alegreya"; font-weight: 700; src: url("data:font/woff2;base64,BAUG");}')
    editor.features.mark.setStyleMark("font-family", '"Alegreya", serif', bold)
    await settle()
    expect(links()).toHaveLength(1)
    expect(embeddedFontRules(links()[0].href)).toHaveLength(2)
    const replacement = fontCSSDataURL('@font-face {font-family: "Alegreya"; font-weight: 400; src: url("data:font/woff2;base64,BwgJ");}')
    editor.features.mark.setStyleMark("font-family", '"Alegreya", serif', replacement)
    await settle()
    const faces = embeddedFontRules(links()[0].href)!
    expect(faces).toHaveLength(2)
    expect(faces.find(face => face.style.fontWeight === "400")!.style.getPropertyValue("src")).toContain("BwgJ")
  })
})
