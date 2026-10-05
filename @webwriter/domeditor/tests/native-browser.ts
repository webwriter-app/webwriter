type Check = {name: string, error?: string}
import {DOMEditor} from "../src/domeditor"
import type {DomEditor} from "../src/components/dom-editor"
import {$, caretRect} from "../src/utility"
import {defaultDocumentTheme} from "../src/document-themes"
import {initializeEditorMessage, replayHostDrag, executeCompleteEvent, executeFailureEvent, isProofreadingStateChangeMessage, type ProofreadingAction} from "../src/editor-bridge"
import {SharedDOMDoc} from "../src/domdoc"
import * as Y from "yjs"

const checks: Check[] = []
const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const check = async (name: string, run: () => void | Promise<void>) => {
  const filter = new URLSearchParams(location.search).get("filter")
  if(filter && !name.includes(filter)) return
  document.querySelector("#status")!.textContent = `Running: ${name}`
  try { await run(); checks.push({name}) }
  catch(error) { checks.push({name, error: String(error)}) }
}
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
const fixture = document.querySelector<HTMLElement>("#fixture")!
const layoutFrame = async () => { await nextFrame(); await nextFrame() }

await check("collaborated scripts remain inert with namespace prefixes, clones and later edits", async () => {
  const root = document.createElement("main"), result = document.createElement("output")
  result.id = "native-script-execution"
  root.innerHTML = "<p>seed</p>"
  fixture.append(root, result)
  const shared = new SharedDOMDoc("", "native-script-audit", [], ["◆"], {root, connect: false})
  const source = 'document.querySelector("#native-script-execution").textContent += "executed;"'
  try {
    // Confirm this fixture permits script execution, so CSP cannot mask a failure.
    const control = document.createElement("script")
    control.textContent = source
    root.append(control)
    assert(result.textContent === "executed;", "positive execution control failed")
    control.remove()
    result.textContent = ""
    for(const [namespace, name] of [
      ["http://www.w3.org/1999/xhtml", "script"],
      ["http://www.w3.org/1999/xhtml", "h:script"],
      ["http://www.w3.org/2000/svg", "script"],
      ["http://www.w3.org/2000/svg", "svg:script"],
    ]) {
      const script = new Y.XmlElement("script")
      script.setAttribute("__domeditor_namespace", namespace)
      script.setAttribute("__domeditor_qualified_name", name)
      script.insert(0, [new Y.XmlText(source)])
      shared.doc.transact(() => shared.body.insert(shared.body.length, [script]), "remote-client")
      const rendered = root.lastElementChild!
      assert(rendered.namespaceURI === namespace && rendered.localName === "script", "script namespace changed")
      assert(rendered.prefix === (name.includes(":") ? name.split(":")[0] : null), "script prefix changed")
      root.append(rendered.cloneNode(true))
      rendered.textContent = source
      rendered.setAttribute(namespace.includes("svg") ? "href" : "src", `data:text/javascript,${encodeURIComponent(source)}`)
      root.append(rendered.cloneNode(true))
    }
    await new Promise(resolve => setTimeout(resolve, 100))
    assert(result.textContent === "", `authored script executed: ${result.textContent}`)
  }
  finally { shared.destroy(); root.remove(); result.remove() }
})

const dragTextInside = (editor: DOMEditor, element: HTMLElement) => {
  const doc = element.ownerDocument, text = element.firstChild!, range = doc.createRange()
  editor.features.selection.selectElement(element)
  element.dispatchEvent(new PointerEvent("pointerover", {bubbles: true}))
  assert(doc.defaultView!.getComputedStyle(editor.features.selection.hoverCaret!).display === "none", "selected root retains a dotted hover outline")
  assert(!editor.appendix.querySelector('[part="node-drag-surface"]'), "item interior is covered by a node drag surface")
  range.setStart(text, 1); range.collapse(true)
  const start = range.getBoundingClientRect()
  range.setStart(text, 7)
  const end = range.getBoundingClientRect(), y = start.top + start.height / 2
  const hit = doc.elementFromPoint(start.left, y)!
  assert(element === hit || element.contains(hit), "item interior is covered by an overlay")
  const style = element.getAttribute("style")
  hit.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, pointerId: 19, clientX: start.left, clientY: y}))
  for(const [x, outsideY] of [[start.left - 2000, y], [start.left + 2000, y], [start.left, y - 2000], [start.left, y + 2000]]) {
    doc.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 19, clientX: x, clientY: outsideY}))
    const selection = doc.getSelection()!
    assert(element.contains(selection.anchorNode) && element.contains(selection.focusNode), "text drag escaped its starting canvas/slide root")
  }
  doc.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 19, clientX: end.left, clientY: y}))
  doc.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 19, clientX: end.left, clientY: y}))
  assert(!doc.getSelection()?.isCollapsed && element.contains(doc.getSelection()!.anchorNode) && element.contains(doc.getSelection()!.focusNode), "dragging inside an item did not select text")
  assert(element.getAttribute("style") === style, "dragging text moved or resized the item")
  const edge = editor.features.transformation.overlay.querySelector<HTMLElement>(".◆transform-overlay-edge")!
  assert(edge.dataset.transformMode === "move" && getComputedStyle(edge).cursor === "move", "item borders do not offer moving")
  const overlay = editor.features.transformation.overlay, box = element.getBoundingClientRect()
  for(const name of ["mover", "orderer"]) assert(getComputedStyle(overlay.querySelector(`#◆transform-overlay-${name}`)!).display === "none", "obsolete move/layers affordance is visible")
  for(const direction of ["up", "down", "left", "right"]) {
    const handle = overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${direction}-${direction}`)!, rect = handle.getBoundingClientRect()
    assert(!handle.hidden && handle.dataset.transformMode === "scale", "edge-center resize affordance is missing")
    assert(direction === "up" || direction === "down" ? Math.abs(rect.left + rect.width / 2 - (box.left + box.width / 2)) < 1
      : Math.abs(rect.top + rect.height / 2 - (box.top + box.height / 2)) < 1, "resize affordance is not centered on its edge")
  }
  const rotator = overlay.querySelector<HTMLElement>("#◆transform-overlay-rotator")!, topHandle = overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-up-up")!
  const rotateRect = rotator.getBoundingClientRect(), topRect = topHandle.getBoundingClientRect(), stem = getComputedStyle(rotator, "::after")
  const scale = rotateRect.height / parseFloat(getComputedStyle(rotator).height)
  const ends = [parseFloat(stem.top), parseFloat(stem.top) + parseFloat(stem.height)].map(y => rotateRect.top + y * scale)
  assert(Math.abs(rotateRect.left + rotateRect.width / 2 - (topRect.left + topRect.width / 2)) < 1
    && ends.some(y => y >= topRect.top - 1 && y <= topRect.bottom + 1), "rotation stem does not connect to the top resize handle")
}

const checkFreeformCapture = async (editor: DOMEditor, parent: HTMLElement) => {
  const doc = parent.ownerDocument
  const widget = doc.createElement("native-capture-parity-widget"), button = doc.createElement("button")
  button.textContent = "Widget control"
  widget.attachShadow({mode: "closed"}).append(button)
  const graphic = doc.createElementNS("http://www.w3.org/2000/svg", "svg")
  graphic.setAttribute("viewBox", "0 0 180 80")
  graphic.innerHTML = '<rect width="180" height="80" fill="blue"/>'
  for(const [element, target] of [[widget, button], [graphic, graphic.firstElementChild!]] as const) {
    const point = editor.features.canvas.active ? editor.features.canvas.clientPoint(100, 100) : {x: 100, y: 100}
    element.style.cssText = `position:absolute;left:${point.x}px;top:${point.y}px;width:180px;height:80px;margin:0`
    parent.append(element)
    try {
      editor.features.selection.selectElement(element)
      await layoutFrame()
      const box = target.getBoundingClientRect()
      target.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 81, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2}))
      if(target === button) button.focus()
      doc.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 81}))
      await layoutFrame()
      assert(editor.features.selection.captureSelectedElement === element, "freeform item did not enter capture through its content")
      const frame = editor.features.transformation.overlay
      assert(getComputedStyle(frame).outlineStyle === "solid", "captured freeform item does not have the document's solid outline")
      editor.features.selection.selectionCaret!.querySelector(".◆capture-edge")!
        .dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0}))
      assert(!editor.features.selection.isCaptureSelection, "freeform frame did not release capture")
      assert(getComputedStyle(frame).outlineStyle === "dotted", "element-selected freeform item retained a capture outline")
    }
    finally { element.remove() }
  }
}

const createLayout = (cssText: string, children: Array<{text?: string, style?: string}> = []) => {
  const section = document.createElement("section")
  section.style.cssText = cssText
  children.forEach(({text = "", style = ""}) => {
    const child = document.createElement("div")
    child.textContent = text
    child.style.cssText = style
    section.append(child)
  })
  fixture.append(section)
  editor.features.selection.selectSectionElement(section)
  return section
}

const removeLayout = (section: HTMLElement) => {
  editor.features.selection.clearSelectedSection(section)
  section.remove()
}

customElements.define("native-audit-widget", class extends HTMLElement {
  connectedCallback() { if(!this.shadowRoot) this.attachShadow({mode: "open"}).innerHTML = "<button>private</button>" }
})

const editor = new DOMEditor()

await check("new paragraphs and line breaks reveal the caret at the document end", async () => {
  const section = document.createElement("section")
  section.style.paddingTop = `${window.innerHeight}px`
  section.innerHTML = "<p>End of document</p>"
  document.body.append(section)
  try {
    for(const shiftKey of [false, true]) {
      const paragraph = section.lastElementChild!
      $.move(paragraph, paragraph.childNodes.length)
      paragraph.scrollIntoView({block: "end", behavior: "instant"})
      for(let i = 0; i < 5; i++) {
        document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", shiftKey, bubbles: true, cancelable: true}))
        await layoutFrame()
        const selection = document.getSelection()!
        const rect = caretRect(selection.focusNode!, selection.focusOffset)
        const margin = 1.25 * parseFloat(getComputedStyle(document.documentElement).fontSize)
        assert(rect.height > 0 && rect.top >= margin - 1 && rect.bottom <= window.innerHeight - margin + 1,
          `caret outside viewport after Enter (shift: ${shiftKey}): ${rect.top}–${rect.bottom}`)
      }
    }
  }
  finally {
    section.remove()
    window.scrollTo({top: 0, behavior: "instant"})
  }
})
editor.schema.extendWidgets([{tagName: "native-audit-widget"}])

await check("native MathML editing preserves inline rendering and argument hit targets", async () => {
  const paragraph = document.createElement("p")
  paragraph.innerHTML = 'Before <math><mi id="math-operand">x</mi></math> after'
  fixture.append(paragraph)
  const math = paragraph.querySelector("math")!
  $.move(math.firstChild!.firstChild!, 1)
  editor.features.math.execute("structure:frac")
  editor.features.math.execute("text:12")
  assert(math.querySelector("mfrac > mrow > #math-operand"), "operand was rebuilt")
  assert(math.querySelector("mfrac")!.children.length === 2, "fraction arity changed")
  editor.features.math.execute("move:up")
  editor.features.math.execute("structure:sup")
  await layoutFrame()
  const slot = math.querySelector(".◆math-slot")!
  assert(slot && slot.getBoundingClientRect().width > 0 && slot.getBoundingClientRect().height > 0, "empty argument has no native hit target")
  assert(editor.appendix.querySelector(".◆math-overlay"), "formula presentation missing from appendix")
  assert(!paragraph.querySelector(".◆math-overlay"), "formula UI leaked into content")
  assert(!editor.features.selection.captureSelectedElement, "inline formula has capture selection")
  assert(!math.classList.contains("◆element-selected"), "inline formula has a node outline")
  assert(getComputedStyle(math).backgroundColor === "rgb(238, 238, 238)", "editing formula background is missing")
  assert(getComputedStyle(slot).caretColor === "rgba(0, 0, 0, 0)", "native empty argument caret competes with the measured caret")
  assert(getComputedStyle(math).padding === "2px", "formula padding is not 2px on all sides")
  assert(!$.isGapSelection, "empty formula argument became a gap")
  const rect = slot.getBoundingClientRect()
  slot.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, pointerId: 8, clientX: rect.left + 2, clientY: rect.top + rect.height / 2}))
  document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 8}))
  document.dispatchEvent(new KeyboardEvent("keydown", {key: "3", bubbles: true, cancelable: true}))
  assert(math.querySelector("msup")?.textContent?.includes("3"), "clicking the argument did not place an editing caret")
  editor.features.math.execute("exit")
  assert(paragraph.textContent?.startsWith("Before ") && paragraph.textContent?.endsWith(" after"), "inline siblings changed")
  assert(!editor.appendix.querySelector(".◆math-overlay"), "formula presentation survived exit")
  assert(!editor.features.selection.captureSelectedElement, "formula retained capture after exit")
  assert(getComputedStyle(math).backgroundColor === "rgba(0, 0, 0, 0)", "formula kept its editing background after exit")
  paragraph.remove()
})

await check("whole formulas receive one blue selection layer", async () => {
  const paragraph = document.createElement("p")
  fixture.append(paragraph)
  try {
    for(const display of ["inline", "block"]) for(const content of ["<mrow><mi>rterteet</mi></mrow>", "<mrow><mfrac><mi>abc</mi><mi>d</mi></mfrac><msup><mi>x</mi><mn>2</mn></msup></mrow>"]) {
      paragraph.innerHTML = `before <math display="${display}">${content}</math> after`
      const math = paragraph.querySelector("math")!
      for(const contents of [false, true]) {
        if(contents) document.getSelection()!.setBaseAndExtent(math, 0, math, math.childNodes.length)
        else $.selectElement(math)
        editor.features.selection.processSelection(undefined, {scrollIntoView: false})
        editor.features.math.refresh()
        await layoutFrame()
        const overlays = editor.appendix.querySelectorAll<HTMLElement>('[part="atomic-selection-overlay"]')
        assert(overlays.length === 1, "whole formula has more than one selection layer")
        const selected = overlays[0].getBoundingClientRect(), bounds = math.getBoundingClientRect()
        assert(["left", "top", "width", "height"].every(key => Math.abs(selected[key as keyof DOMRect] as number - (bounds[key as keyof DOMRect] as number)) < 1), "selection layer does not fit the formula")
        assert(getComputedStyle(overlays[0]).backgroundColor === "rgba(0, 120, 215, 0.3)", "formula does not use the shared selection blue")
        assert(getComputedStyle(math).backgroundColor === "rgba(0, 0, 0, 0)", "editing background darkens the selected formula")
        for(const node of [math, ...math.querySelectorAll("*")]) assert(getComputedStyle(node, "::selection").backgroundColor === "rgba(0, 0, 0, 0)", "native descendant selection adds another blue layer")
        const text = math.querySelector("mi")!.firstChild!
        document.getSelection()!.setBaseAndExtent(text, 0, text, 1)
        editor.features.selection.processSelection(undefined, {scrollIntoView: false})
        assert(!editor.appendix.querySelector('[part="atomic-selection-overlay"]'), "partial selection retained a whole-formula overlay")
        assert(getComputedStyle(text.parentElement!, "::selection").backgroundColor !== "rgba(0, 0, 0, 0)", "partial text selection is hidden")
      }
    }
  }
  finally { paragraph.remove(); editor.features.selection.processSelection(undefined, {scrollIntoView: false}); editor.features.math.refresh() }
})

await check("empty formula carets fit their space and blink across presentation refreshes", async () => {
  const paragraph = document.createElement("p")
  fixture.append(paragraph)
  try {
    for(const content of ["", "<mrow></mrow>", "<mrow><mrow></mrow></mrow>", "<mfrac><mrow></mrow><mi>a</mi></mfrac>"]) {
      paragraph.innerHTML = `a<math>${content}</math>a`
      const math = paragraph.querySelector("math")!
      const position = math.querySelector("mrow:empty") ?? math
      $.move(position, 0)
      editor.features.selection.processSelection(undefined, {scrollIntoView: false})
      editor.features.math.refresh()
      await layoutFrame()
      const caret = editor.appendix.querySelector<HTMLElement>('[part="math-caret"]')!
      assert(caret, "empty formula has no measured caret")
      if(!content.includes("mfrac")) {
        const bounds = position.getBoundingClientRect(), rect = caret.getBoundingClientRect(), style = getComputedStyle(position)
        const top = bounds.top + (position === math ? parseFloat(style.paddingTop) : 0)
        const bottom = bounds.bottom - (position === math ? parseFloat(style.paddingBottom) : 0)
        assert(rect.top >= top - 0.5 && rect.bottom <= bottom + 0.5, "empty formula caret hangs below its space")
      }
      const animation = caret.getAnimations()[0]
      assert(animation, "caret animation cannot resolve its shadow-root keyframes")
      animation.pause()
      animation.currentTime = 750
      assert(getComputedStyle(caret).opacity === "0", "caret never enters its hidden blink phase")
      editor.features.math.refresh()
      assert(editor.appendix.querySelector('[part="math-caret"]') === caret && caret.getAnimations()[0] === animation,
        "refresh replaced the caret or restarted its blink")
      assert(getComputedStyle(caret).opacity === "0", "refresh reset the blink phase")
      animation.currentTime = 250
      assert(getComputedStyle(caret).opacity === "1", "caret never enters its visible blink phase")
      $.move(paragraph.lastChild!, 1)
      editor.features.math.refresh()
      assert(!editor.appendix.querySelector('[part="math-caret"]'), "caret survives leaving the formula")
    }
  }
  finally { paragraph.remove(); editor.features.math.refresh() }
})

await check("empty roots keep their baseline and one caret across focus and formula edges", async () => {
  const paragraph = document.createElement("p")
  fixture.append(paragraph)
  try {
    for(const direction of ["ltr", "rtl"]) for(const size of [16, 32]) {
      paragraph.innerHTML = `a<math style="direction:${direction};font-size:${size}px"><mrow><mroot><mrow></mrow><mi>a</mi></mroot></mrow></math>a`
      const math = paragraph.querySelector("math")!, row = math.firstElementChild!, root = math.querySelector("mroot")!, slot = root.firstElementChild!
      const textBounds = () => {
        const range = document.createRange()
        range.selectNodeContents(paragraph.firstChild!)
        return range.getBoundingClientRect()
      }
      const activate = (node: Node, offset: number) => {
        $.move(node, offset)
        editor.features.selection.processSelection(undefined, {scrollIntoView: false})
        editor.features.math.refresh()
      }
      activate(paragraph.lastChild!, 1)
      const unfocused = root.getBoundingClientRect(), baseline = textBounds()
      activate(slot, 0)
      const focused = root.getBoundingClientRect()
      assert(Math.abs(focused.top - textBounds().top - (unfocused.top - baseline.top)) < 1
        && Math.abs(focused.height - unfocused.height) < 1, "unfocused empty radical changes baseline or size")
      const overlayCarets = () => Array.from(editor.appendix.querySelectorAll<HTMLElement>(".◆math-overlay > span")).filter(element => element.style.background)
      const caret = overlayCarets()[0].getBoundingClientRect()
      const beforeSlot = slot.getBoundingClientRect()
      editor.features.math.execute("text:x")
      const range = document.createRange()
      range.selectNodeContents(slot.firstChild!.firstChild!)
      const character = range.getBoundingClientRect()
      range.collapse(true)
      assert(Math.abs(caret.height - Math.min(character.height, beforeSlot.height)) < 1,
        "radicand caret does not use the available character height")
      assert(caret.top >= beforeSlot.top - 0.5 && caret.bottom <= beforeSlot.bottom + 0.5
        && Math.abs((caret.top + caret.bottom) / 2 - (beforeSlot.top + beforeSlot.bottom) / 2) < 0.5,
        "radicand caret hangs below the current placeholder")
      assert(Math.abs(caret.left - beforeSlot.left - (range.getBoundingClientRect().left - slot.getBoundingClientRect().left) - 1) < 1,
        "radicand caret has the wrong horizontal position")
      slot.replaceChildren()
      for(const [node, offset] of [[math, 1], [row, 1], [paragraph.lastChild!, 0], [slot, 0]] as [Node, number][]) {
        activate(node, offset)
        await layoutFrame()
        const shared = editor.features.selection.selectionCaret
        const sharedVisible = shared?.getAttribute("part")?.includes("selection-caret-text") && getComputedStyle(shared).display !== "none"
        assert(overlayCarets().length + Number(Boolean(sharedVisible)) <= 1, "formula edge shows two appendix carets")
        if(overlayCarets().length || sharedVisible) {
          assert(getComputedStyle(paragraph).caretColor === "rgba(0, 0, 0, 0)", "native formula-edge caret can paint in the surrounding paragraph")
        }
      }
      activate(paragraph.lastChild!, 1)
      assert(!math.classList.contains("◆math-structural-caret") && !editor.appendix.querySelector(".◆math-overlay"), "leaving the formula retains its caret")
    }
  }
  finally { paragraph.remove(); editor.features.math.refresh() }
})

await check("structural formula carets match inserted text without duplicate capture carets", async () => {
  const paragraph = document.createElement("p")
  fixture.append(paragraph)
  try {
    for(const display of ["inline", "block"]) for(const direction of ["ltr", "rtl"]) {
      for(const offset of [0, 1]) for(const content of [
        "<mfrac><mi>a</mi><mi>b</mi></mfrac>",
        "<mroot><mi>x</mi><mn>3</mn></mroot>",
        "<msup><mi>x</mi><mn>2</mn></msup>",
        "<munderover><mo>∑</mo><mi>i</mi><mi>n</mi></munderover>",
        "<mfrac><mfrac><mi>a</mi><mi>b</mi></mfrac><mi>c</mi></mfrac>",
      ]) {
        paragraph.innerHTML = `<math display="${display}" style="direction:${direction};font-size:32px"><mrow>${content}<mi>z</mi></mrow></math>`
        const math = paragraph.querySelector("math")!, row = math.firstElementChild!
        $.move(row, offset)
        editor.features.selection.processSelection(undefined, {scrollIntoView: false})
        editor.features.math.refresh()
        const rootBefore = row.getBoundingClientRect()
        const baselineBefore = row.lastElementChild!.getBoundingClientRect()
        const carets = Array.from(editor.appendix.querySelectorAll<HTMLElement>(".◆math-overlay > span"))
          .filter(element => element.style.background)
        assert(carets.length === 1, "expected exactly one structural caret")
        assert(getComputedStyle(row).caretColor === "rgba(0, 0, 0, 0)", "capture restores a second native caret")
        const caret = carets[0].getBoundingClientRect()
        const before = math.innerHTML.replace(/ class="[^"]*"/g, "")
        editor.features.math.refresh()
        assert(math.innerHTML.replace(/ class="[^"]*"/g, "") === before, "measuring the caret changed authored content")
        editor.features.math.execute("text:x")
        const text = document.getSelection()!.focusNode!
        const range = document.createRange()
        range.selectNodeContents(text)
        const character = range.getBoundingClientRect()
        range.collapse(true)
        assert(Math.abs(caret.height - character.height) < 1, "caret inherits the structure height")
        assert(Math.abs(caret.top - baselineBefore.top - (character.top - row.lastElementChild!.getBoundingClientRect().top)) < 1,
          "caret does not use the inserted character baseline")
        assert(Math.abs(caret.left - rootBefore.left - (range.getBoundingClientRect().left - row.getBoundingClientRect().left)) < 1,
          "caret does not use the insertion position")
        // Populated MathML tokens also use the measured appendix caret. Check
        // ownership after typing, rather than requiring a duplicate native caret.
        assert(math.classList.contains("◆math-structural-caret")
          && editor.appendix.querySelectorAll('[part="math-caret"]').length === 1
          && getComputedStyle(text.parentElement!).caretColor === "rgba(0, 0, 0, 0)", "typed formula does not retain exactly one caret")
      }
    }
    for(const display of ["inline", "block"]) for(const inside of [false, true]) for(const start of [false, true]) for(const direction of ["ltr", "rtl"]) {
      if(display === "block" && !inside) continue // Block exteriors are paragraph gaps.
      paragraph.innerHTML = `<span>before</span><math display="${display}" style="font-size:32px;direction:${direction}"><mfrac><mi>a</mi><mfrac><mi>b</mi><mi>c</mi></mfrac></mfrac></math><span>after</span>`
      const math = paragraph.querySelector("math")!
      const index = Array.from(paragraph.childNodes).indexOf(math)
      $.move(inside ? math : paragraph, inside ? start ? 0 : math.childNodes.length : index + Number(!start))
      editor.features.selection.processSelection(undefined, {scrollIntoView: false})
      editor.features.math.refresh()
      const caret = (editor.appendix.querySelector('[part="math-caret"]') ?? editor.features.selection.selectionCaret)!.getBoundingClientRect()
      const referenceRange = document.createRange()
      referenceRange.selectNodeContents(paragraph.firstElementChild!.firstChild!)
      const reference = referenceRange.getBoundingClientRect()
      let text: Node
      if(inside) {
        editor.features.math.execute("text:x")
        text = document.getSelection()!.focusNode!
      }
      else {
        text = document.createTextNode("x")
        document.getSelection()!.getRangeAt(0).insertNode(text)
      }
      const range = document.createRange()
      range.selectNodeContents(text)
      const character = range.getBoundingClientRect()
      assert(Math.abs(caret.height - character.height) < 1, "formula edge caret inherits formula height")
      assert(Math.abs(caret.top - reference.top - (character.top - referenceRange.getBoundingClientRect().top)) < 1,
        "formula edge caret does not follow the inserted character baseline")
    }
  }
  finally { paragraph.remove(); editor.features.math.refresh() }
})

await check("formula clicks distinguish script endings and select whole formulas", async () => {
  const paragraph = document.createElement("p")
  fixture.append(paragraph)
  for(const name of ["msub", "msup", "msubsup"]) {
    paragraph.innerHTML = `Before <math><mrow><${name}><mi>x</mi><mi>ij</mi>${name === "msubsup" ? "<mi>k</mi>" : ""}</${name}><mo>+</mo><mi>y</mi></mrow></math> after`
    const math = paragraph.querySelector("math")!
    const row = math.firstElementChild!, script = row.firstElementChild!, token = script.children[1]
    await layoutFrame()
    assert(getComputedStyle(token).cursor === "text", "formula hover does not use the text cursor")
    const bounds = token.getBoundingClientRect()
    const click = (x: number, y: number, detail = 1) => {
      token.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, pointerId: 8, clientX: x, clientY: y}))
      token.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 8}))
      token.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, detail, clientX: x, clientY: y}))
    }
    click(bounds.right, bounds.top + bounds.height / 2)
    assert($.focus === token.firstChild && $.focusOffset === 2, `${name}: did not reach the script's final character`)
    click(script.getBoundingClientRect().right + 2, bounds.top + bounds.height / 2)
    assert($.focus === row && $.focusOffset === 1, `${name}: did not reach the row after the script`)
    assert(math.classList.contains("◆math-structural-caret"), "structural caret is not drawn")
    const caret = editor.appendix.querySelector<HTMLElement>(".◆math-overlay > span")!
    const baseRange = document.createRange()
    baseRange.selectNodeContents(script.firstElementChild!)
    assert(Math.abs(caret.getBoundingClientRect().top - baseRange.getBoundingClientRect().top) < 1, "structural caret uses the base text baseline")
    click(bounds.left, bounds.top + bounds.height / 2, 2)
    const selected = document.getSelection()!.getRangeAt(0)
    assert(selected.cloneContents().textContent === math.textContent && !selected.collapsed,
      `double click did not select the whole formula: ${selected.cloneContents().textContent} (${selected.startContainer.nodeName}:${selected.startOffset}–${selected.endContainer.nodeName}:${selected.endOffset})`)
    assert(!math.classList.contains("◆math-structural-caret"), "structural caret survived range selection")
  }
  paragraph.remove()
})

await check("inline formula edges use text selections and block formula edges use gaps", async () => {
  const paragraph = document.createElement("p")
  paragraph.innerHTML = '<math><mi>x</mi></math>'
  fixture.append(paragraph)
  const math = paragraph.firstElementChild!
  for(const display of ["inline", "block"]) {
    math.setAttribute("display", display)
    await layoutFrame()
    const rect = math.getBoundingClientRect()
    for(const after of [false, true]) {
      const x = display === "block" ? rect.left + rect.width / 2 : after ? rect.right - 1 : rect.left + 1
      const y = display === "block" ? after ? rect.bottom - 1 : rect.top + 1 : rect.top + rect.height / 2
      math.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, pointerId: 8, clientX: x, clientY: y}))
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 8}))
      editor.features.selection.processSelection()
      assert($.anchor === paragraph && $.anchorOffset === (after ? 1 : 0), `pointer did not reach the ${after ? "after" : "before"} ${display} boundary`)
      assert($.isGapSelection === (display === "block"), `${display} formula boundary has the wrong selection kind`)
      assert(!editor.features.selection.captureSelectedElement, "formula boundary retained capture")
      assert(!math.querySelector(".◆gap-before-selected, .◆gap-after-selected"), "gap marker leaked into formula")
      if(display === "inline") {
        await layoutFrame()
        const caret = editor.features.selection.selectionCaret!
        const height = caret.getBoundingClientRect().height
        assert(height >= parseFloat(getComputedStyle(paragraph).fontSize), `formula-only outside caret is too short: ${height}px, formula ${math.getBoundingClientRect().height}px`)
        $.move(math, 0)
        editor.features.selection.processSelection()
        await layoutFrame()
        assert(caret.getBoundingClientRect().height >= parseFloat(getComputedStyle(paragraph).fontSize), `formula-only inside start caret is too short: ${caret.getBoundingClientRect().height}px`)
        $.move(paragraph, after ? 1 : 0)
        editor.features.selection.processSelection()
        const input = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "a"})
        paragraph.dispatchEvent(input)
        if(!input.defaultPrevented) document.execCommand("insertText", false, "a")
        assert(math.textContent === "x", "typing at an inline boundary entered the formula")
        const inserted = after ? math.nextSibling : math.previousSibling
        assert(inserted?.textContent === "a", "inline boundary did not accept surrounding text")
        inserted!.remove()
      }
    }
  }
  math.setAttribute("display", "inline")
  for(const fontSize of [16, 32]) {
    paragraph.style.fontSize = `${fontSize}px`
    for(const [node, offset] of [[paragraph, 0], [math, 0], [paragraph, 1]] as const) {
      $.move(node, offset)
      editor.features.selection.processSelection()
      await layoutFrame()
      const caret = editor.features.selection.selectionCaret!.getBoundingClientRect()
      assert(caret.height >= fontSize, `formula boundary caret ignored ${fontSize}px paragraph text: ${caret.height}px`)
      // Exact height and baseline are checked against an actual insertion in
      // the structural-caret check; prose and math can use different fonts.
    }
  }
  paragraph.style.removeProperty("font-size")
  paragraph.prepend("before")
  paragraph.append("after")
  await layoutFrame()
  const before = paragraph.firstChild as Text, after = paragraph.lastChild as Text
  const token = math.querySelector("mi")!.firstChild!
  const arrow = (key: string) => document.dispatchEvent(new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true}))
  $.move(before, before.length)
  arrow("ArrowRight")
  assert($.anchor === math && $.anchorOffset === 0, "entering inline math added an outside parent stop")
  arrow("End")
  assert($.anchor === token && $.anchorOffset === 1, "End added a duplicate formula-end stop")
  assert(!editor.features.selection.selectionCaret!.style.fontSize, "formula boundary font size survived leaving the boundary")
  arrow("ArrowRight")
  assert($.anchor === after && $.anchorOffset === 0, "leaving inline math did not reuse following text")
  arrow("ArrowLeft")
  assert($.anchor === token && $.anchorOffset === 1, "backward entry added a duplicate formula-end stop")
  arrow("Home")
  arrow("ArrowLeft")
  assert($.anchor === before && $.anchorOffset === before.length, "leaving inline math did not reuse preceding text")
  const bounds = math.getBoundingClientRect()
  const outside = $.pointFromCoords(bounds.right - 1, bounds.top + bounds.height / 2, math, editor.schema)
  assert(outside?.node === after && outside.offset === 0, "pointer boundary did not reuse following text")
  paragraph.remove()
})

await check("inline formulas retain distinct inner and outer text insertion positions", async () => {
  const paragraph = document.createElement("p")
  fixture.append(paragraph)
  for(const placement of ["only", "first", "middle", "last", "marked"]) {
    for(const position of ["before", "start", "end", "after"]) {
      paragraph.innerHTML = '<math><mrow><mi>x</mi></mrow></math>'
      const math = paragraph.firstElementChild!
      if(["middle", "last", "marked"].includes(placement)) paragraph.prepend("before")
      if(["first", "middle", "marked"].includes(placement)) paragraph.append("after")
      if(placement === "marked") {
        const mark = document.createElement("em")
        math.replaceWith(mark)
        mark.append(math)
      }
      const parent = math.parentNode!
      const index = Array.from(parent.childNodes).indexOf(math)
      const inside = position === "start" || position === "end"
      const node = inside ? math : parent
      const offset = inside ? position === "start" ? 0 : math.childNodes.length : index + (position === "after" ? 1 : 0)
      $.move(node, offset)
      editor.features.selection.processSelection()
      editor.features.math.refresh()
      await layoutFrame()
      const formulaBounds = math.getBoundingClientRect()
      const contentBounds = math.firstElementChild!.getBoundingClientRect()
      const padding = [contentBounds.left - formulaBounds.left, contentBounds.top - formulaBounds.top,
        formulaBounds.right - contentBounds.right, formulaBounds.bottom - contentBounds.bottom]
      assert(padding.every(value => value >= 1.9), `filled formula has insufficient inner padding: ${JSON.stringify(padding)}`)
      assert($.anchor === node && $.anchorOffset === offset, `${placement}/${position} caret moved`)
      assert($.isTextSelection && !$.isGapSelection && !editor.features.selection.captureSelectedElement, `${placement}/${position} is not text selection`)
      assert(math.classList.contains("◆math-editing") === inside, `${placement}/${position} has the wrong editing background`)
      const caret = editor.features.selection.selectionCaret!.getBoundingClientRect()
      assert(caret.width > 0 && caret.height > 0, `${placement}/${position} caret is invisible`)
      if(inside) assert(caret.left >= formulaBounds.left + 1.9 && caret.right <= formulaBounds.right - 1.9, `${placement}/${position} caret overlaps the formula padding`)
      else if(position === "before") assert(caret.right <= formulaBounds.left - 0.9, `${placement}/before caret needs an outside margin`)
      else assert(caret.left >= formulaBounds.right + 0.9, `${placement}/after caret needs an outside margin`)
      const input = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "a"})
      paragraph.dispatchEvent(input)
      if(!input.defaultPrevented) document.execCommand("insertText", false, "a")
      assert(math.textContent === (inside ? position === "start" ? "ax" : "xa" : "x"), `${placement}/${position} inserted on the wrong side of the formula boundary`)
    }
  }
  paragraph.remove()
})

await check("typing after a formula inserted at paragraph end stays outside MathML", async () => {
  const paragraph = document.createElement("p")
  paragraph.textContent = "Before"
  fixture.append(paragraph)
  $.move(paragraph.firstChild!, 6)
  editor.features.math.insert()
  editor.features.math.execute("text:x")
  const math = paragraph.querySelector("math")!
  assert(math.nextSibling instanceof Text && !math.nextSibling.length, "insertion did not retain the split empty text node")
  document.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true, cancelable: true}))
  await layoutFrame()
  const input = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "prose"})
  paragraph.dispatchEvent(input)
  if(!input.defaultPrevented) document.execCommand("insertText", false, "prose")
  assert(math.textContent === "x", "typing after exiting appended to the formula")
  assert(math.nextSibling?.textContent === "prose", "prose was not inserted after the formula")
  paragraph.remove()
})

await check("blank space around a formula paragraph selects gaps for every click count", async () => {
  const paragraph = document.createElement("p")
  paragraph.innerHTML = 'Before <math><mi>x</mi></math>'
  paragraph.style.marginBlock = "100px"
  document.body.append(paragraph)
  const math = paragraph.querySelector("math")!
  math.after(document.createTextNode(""))
  paragraph.scrollIntoView({block: "center"})
  await layoutFrame()
  const rect = math.getBoundingClientRect()
  const x = rect.right + 40
  for(const y of [paragraph.getBoundingClientRect().top - 4, rect.top + rect.height / 2, paragraph.getBoundingClientRect().bottom + 4]) {
    const above = y < paragraph.getBoundingClientRect().top
    const below = y > paragraph.getBoundingClientRect().bottom
    const node = above || below ? document.body : paragraph
    const offset = above || below ? Array.from(document.body.childNodes).indexOf(paragraph) + (below ? 1 : 0) : 2
    for(const detail of [1, 2, 3, 1]) {
      $.move(math.firstChild!.firstChild!, 1)
      const point = $.pointFromCoords(x, y, paragraph, editor.schema)
      assert(point?.node === node && point.offset === offset && (above || below || point.overrideNative),
        `blank-space hit resolved to ${point?.node.nodeName}/${point?.offset}, override ${point?.overrideNative}`)
      const down = new PointerEvent("pointerdown", {bubbles: true, cancelable: true, clientX: x, clientY: y, detail})
      paragraph.dispatchEvent(down)
      assert(down.defaultPrevented, `${detail} click allowed native caret placement`)
      paragraph.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, cancelable: true, clientX: x, clientY: y, detail}))
      paragraph.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, clientX: x, clientY: y, detail}))
      paragraph.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, clientX: x, clientY: y, detail}))
      await layoutFrame()
      assert($.anchor === node && $.anchorOffset === offset && $.isEmpty, `${detail} click returned to the formula`)
      assert($.isGapSelection === (above || below), `${detail} click has the wrong selection kind`)
    }
  }
  paragraph.remove()
  window.scrollTo(0, 0)
})

await check("leaving an empty inline formula removes it without moving the text caret", async () => {
  const paragraph = document.createElement("p")
  paragraph.innerHTML = 'before<math><mrow></mrow></math>after'
  fixture.append(paragraph)
  const math = paragraph.querySelector("math")!
  $.move(math, 0)
  editor.features.math.refresh()
  editor.features.math.execute("exit")
  await layoutFrame()
  assert(!math.isConnected && paragraph.textContent === "beforeafter", "empty inline formula was retained or surrounding text changed")
  assert($.anchor === paragraph.lastChild && $.anchorOffset === 0, "removing an empty formula moved the surrounding text caret")
  paragraph.remove()
})

await check("editor command preserves a live selection", () => {
  const text = document.querySelector("#before")!.firstChild!
  const selection = getSelection()!
  selection.setBaseAndExtent(text, 2, text, 2)
  const inserted = document.createElement("span")
  inserted.textContent = " inserted"
  editor.features.manipulation.insert(inserted)
  assert(selection.anchorNode?.isConnected && selection.focusNode?.isConnected, "command left disconnected selection endpoints")
  assert(document.querySelector("#before > span")?.textContent === " inserted", `command did not insert at the selected caret: ${document.body.innerHTML}`)
})

await check("selection feature treats custom element as atomic", () => {
  const widget = fixture.querySelector("native-audit-widget")!
  $.selectElement(widget)
  editor.features.selection.processSelection()
  assert($.isElementSelection && $.selectedElement === widget, "selection feature did not select the widget host")
  assert(widget.classList.contains("◆element-selected"), "selection marker missing from widget host")
  assert(widget.shadowRoot!.querySelector("button"), "widget shadow DOM missing")
  assert(widget.getAttribute("contenteditable") === "false", "editor changed authored widget editability")
})

await check("node drag borders leave native text and table editing reachable", async () => {
  for(const tag of ["p", "h2", "table"]) {
    const element = document.createElement(tag)
    element.style.cssText = "width:360px;line-height:32px;padding:12px"
    element.innerHTML = tag === "table" ? "<tbody><tr><td>editable text</td></tr></tbody>" : "editable text"
    fixture.append(element)
    const block = element.querySelector("td") ?? element, text = block.firstChild!
    try {
      $.selectElement(element)
      editor.features.selection.processSelection()
      await layoutFrame()
      const surface = editor.appendix.querySelector<HTMLElement>('[part="node-drag-surface"]')!
      assert(surface?.draggable, "selected flow content lost native dragging")
      const range = document.createRange()
      range.setStart(text, 3); range.setEnd(text, 4)
      const rect = range.getBoundingClientRect()
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
      const hit = document.elementFromPoint(x, y)
      assert(hit === block || block.contains(hit), `${tag} text is covered by its drag surface`)
      hit!.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 91, clientX: x, clientY: y}))
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 91, clientX: x, clientY: y}))
      assert(document.getSelection()?.isCollapsed && block.contains($.anchor), `${tag} click did not enter text editing`)
      assert(document.execCommand("insertText", false, "X") && block.textContent?.includes("X"), `${tag} typing was blocked`)
      assert(!surface.isConnected, `${tag} retained its drag surface after entering text`)
      assert(!editor.toHTML(true).includes("clip-path"), "drag clipping leaked into authored HTML")
    }
    finally { element.remove() }
  }
})

await check("layout based hit testing returns the rendered target", async () => {
  await nextFrame()
  const target = document.querySelector<HTMLElement>("#hit-target")!
  const rect = target.getBoundingClientRect()
  assert(rect.width > 0 && rect.height > 0, "target has no rendered box")
  assert(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === target, "elementFromPoint missed target")
  const point = $.pointFromCoords(rect.left + rect.width / 2, rect.top + rect.height / 2, target, editor.schema)
  assert(point?.node, "editor hit testing returned no point")
})

await check("layout insertion retains its selected grid wrapper after two frames", async () => {
  const paragraph = document.createElement("p")
  paragraph.textContent = "insertion point"
  fixture.append(paragraph)
  try {
    $.selectRange(document.body, document.body.childNodes.length)
    editor.features.selection.processSelection()
    const inserted = editor.features.layout.actions.insertLayout({type: "insertLayout", preset: "four-panels"})
    assert(inserted === true, "layout insertion was rejected at a valid caret")
    await layoutFrame()
    const section = document.body.querySelector<HTMLElement>(":scope > section")
    assert(section, "layout insertion did not create a section")
    assert(editor.features.selection.selectedSectionElement === section, "inserted layout lost its explicit section selection")
    assert(editor.features.layout.getState()?.kind === "grid", "inserted layout did not retain grid state")
    assert(editor.appendix.querySelector<HTMLElement>(".◆layout-overlay")?.hidden === false, "inserted layout overlay was not retained")
    editor.features.selection.clearSelectedSection()
    $.move(section!.firstElementChild!, 0)
    const contents = section!.innerHTML
    assert(editor.features.layout.actions.insertLayout({type: "insertLayout", preset: "two-columns"}) === false, "nested preset was accepted")
    assert(editor.features.manipulation.placeFloat(document.createElement("img"), section!.firstElementChild!, "left") === false, "nested side-drop group was accepted")
    assert(section!.innerHTML === contents, "rejected layout operation changed existing content")
  }
  finally {
    document.body.querySelectorAll(":scope > section").forEach(section => section.remove())
    paragraph.remove()
    editor.features.selection.clearSelectedSection()
  }
})

await check("layout presets create direct paragraph children", async () => {
  const paragraph = document.createElement("p")
  paragraph.textContent = "preset insertion"
  fixture.append(paragraph)
  try {
    $.selectRange(document.body, document.body.childNodes.length)
    editor.features.selection.processSelection()
    const inserted = editor.features.layout.actions.insertLayout({type: "insertLayout", preset: "two-columns"})
    assert(inserted === true, "layout preset insertion was rejected at a valid caret")
    const section = document.body.querySelector<HTMLElement>(":scope > section")
    assert(section, "layout preset did not create a section")
    const children = Array.from(section!.children)
    assert(children.length === 2 && children.every(child => child.localName === "p"), "layout preset did not create direct paragraph children")
    assert(children.every(child => {
      const element = child as HTMLElement
      return Number.parseFloat(element.style.getPropertyValue("min-inline-size")) === 0
        && getComputedStyle(element).minInlineSize === "0px"
    }), "preset paragraphs did not receive min-inline-size")
  }
  finally {
    document.body.querySelectorAll(":scope > section").forEach(section => section.remove())
    paragraph.remove()
    editor.features.selection.clearSelectedSection()
  }
})

await check("layout geometry accounts for padding, gaps, and RTL", async () => {
  const section = createLayout(
    "display:grid;width:360px;height:140px;box-sizing:border-box;padding:10px 30px 10px 20px;border:2px solid #222;gap:20px;grid-template-columns:1fr 2fr;grid-template-rows:1fr;direction:rtl",
    [{text: "one"}, {text: "two"}],
  )
  try {
    await layoutFrame()
    const style = getComputedStyle(section)
    const rect = section.getBoundingClientRect()
    const contentWidth = rect.width
      - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth)
    const gap = parseFloat(style.columnGap)
    const expectedFirst = (contentWidth - gap) / 3
    const first = section.children[0].getBoundingClientRect()
    const second = section.children[1].getBoundingClientRect()
    assert(Math.abs(first.width - expectedFirst) < 1, `first RTL track width was ${first.width}, expected ${expectedFirst}`)
    assert(Math.abs(first.left - second.right - gap) < 1, "grid gap did not match the rendered separation")
    assert(first.left > second.left, "direction:rtl did not reverse grid placement")
  }
  finally { removeLayout(section) }
})

await check("keyboard separator resizing keeps adjacent fractions fluid", async () => {
  const section = createLayout(
    "display:grid;width:480px;height:140px;grid-template-columns:1fr 2fr;grid-template-rows:1fr;gap:16px",
    [{text: "left"}, {text: "right"}],
  )
  try {
    await layoutFrame()
    const handle = editor.appendix.querySelector<HTMLElement>('[data-axis="column"][data-operation="resize"]')
    assert(handle, "fractional grid separator was not rendered")
    handle!.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true, composed: true}))
    await layoutFrame()
    const tracks = section.style.gridTemplateColumns.trim().split(/\s+/)
    const values = tracks.map(track => Number.parseFloat(track))
    assert(tracks.length === 2 && tracks.every(track => track.endsWith("fr")), `resize changed fractions into ${tracks.join(" ")}`)
    assert(Math.abs(values[0] + values[1] - 3) < 0.01, `fraction total changed from 3: ${tracks.join(" ")}`)
    assert(values[0] > 1 && values[1] < 2, `ArrowRight did not grow the first track: ${tracks.join(" ")}`)
  }
  finally { removeLayout(section) }
})

await check("cancelled layout gestures preserve remote style ownership", async () => {
  const section = createLayout(
    "display:grid;width:480px;height:140px;grid-template-columns:1fr 2fr;grid-template-rows:1fr;gap:16px",
    [{text: "left"}, {text: "right"}],
  )
  const layout = editor.features.layout as any
  try {
    await layoutFrame()
    const handle = editor.appendix.querySelector<HTMLElement>('[data-axis="column"][data-operation="resize"]')!
    const initial = section.style.gridTemplateColumns
    layout.begin(handle, {pointerId: -1, clientX: 0, clientY: 0})
    layout.resizeBy(24)
    assert(section.style.gridTemplateColumns !== initial, "private gesture setup did not resize the grid")
    section.style.gridTemplateColumns = "2fr 1fr"
    layout.finish(true)
    assert(section.style.gridTemplateColumns === "2fr 1fr", "cancel restored over a newer remote style write")

    section.style.gridTemplateColumns = initial
    await layoutFrame()
    const nextHandle = editor.appendix.querySelector<HTMLElement>('[data-axis="column"][data-operation="resize"]')!
    layout.begin(nextHandle, {pointerId: -1, clientX: 0, clientY: 0})
    layout.resizeBy(24)
    section.append(document.createElement("div"))
    layout.resizeBy(24)
    assert(section.style.gridTemplateColumns === initial, "topology change did not cancel and restore the gesture")
  }
  finally { removeLayout(section) }
})

await check("one layout drag is one undoable operation", async () => {
  const section = createLayout(
    "display:grid;width:480px;height:140px;grid-template-columns:1fr 2fr;grid-template-rows:1fr;gap:16px",
    [{text: "left"}, {text: "right"}],
  )
  const layout = editor.features.layout as any
  try {
    await layoutFrame()
    editor.doc.syncFromDOM()
    const handle = editor.appendix.querySelector<HTMLElement>('[data-axis="column"][data-operation="resize"]')!
    const initial = section.style.gridTemplateColumns
    layout.begin(handle, {pointerId: -1, clientX: 0, clientY: 0})
    layout.resizeBy(24)
    layout.finish(false)
    await layoutFrame()
    const changed = section.style.gridTemplateColumns
    assert(changed !== initial, "drag did not change the authored track declaration")
    editor.doc.undo()
    assert(section.style.gridTemplateColumns === initial, `undo did not restore ${initial}: ${section.style.gridTemplateColumns}`)
    editor.doc.redo()
    assert(section.style.gridTemplateColumns === changed, "redo did not restore the complete drag declaration")
  }
  finally { removeLayout(section) }
})

await check("auto rows use explicit minmax sizing after a keyboard resize", async () => {
  const section = createLayout(
    "display:grid;width:360px;height:220px;grid-template-columns:1fr;grid-template-rows:auto auto;gap:12px",
    [{text: "row one", style: "min-height:30px"}, {text: "row two", style: "min-height:30px"}],
  )
  try {
    await layoutFrame()
    const handle = editor.appendix.querySelector<HTMLElement>('[data-axis="row"][data-operation="resize"]')
    assert(handle, "auto-row separator was not rendered")
    handle!.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true, composed: true}))
    await layoutFrame()
    assert(/^minmax\([^,]+, auto\) auto$/.test(section.style.gridTemplateRows), `auto row was not converted to minmax: ${section.style.gridTemplateRows}`)
  }
  finally { removeLayout(section) }
})

await check("removing an explicit row preserves content and exposes automatic tracks", async () => {
  const section = createLayout(
    "display:grid;width:320px;height:280px;grid-template-columns:1fr 1fr;grid-template-rows:100px 100px;gap:10px",
    Array.from({length: 5}, (_, index) => ({text: `content-${index}`})),
  )
  try {
    await layoutFrame()
    const children = Array.from(section.children)
    const changed = editor.features.layout.actions.removeLayoutTrack({type: "removeLayoutTrack", axis: "row", index: 0})
    assert(changed === true, "row removal was rejected")
    assert(Array.from(section.children).every((child, index) => child === children[index]), "row removal replaced authored content nodes")
    assert(section.textContent?.includes("content-4"), "row removal discarded authored content")
    const state = editor.features.layout.getState()
    assert(state?.rows.tracks?.length === 1, "remaining explicit row definition was not preserved")
    assert((state?.rows.automatic ?? 0) > 0, "implicit surviving rows were not reported as automatic")
  }
  finally { removeLayout(section) }
})

await check("empty grid cells accept authored regions and survive export reload", async () => {
  const section = createLayout(
    "display:grid;width:320px;height:180px;grid-template-columns:140px 140px;grid-template-rows:80px 80px;gap:10px",
    [{text: "existing", style: "grid-row:1 / 2;grid-column:1 / 2"}],
  )
  try {
    await layoutFrame()
    const existing = section.children[0]
    const inserted = editor.features.layout.actions.insertLayoutRegion({type: "insertLayoutRegion", row: 1, column: 1})
    assert(inserted === true, "empty explicit grid cell rejected region insertion")
    const region = section.children[1] as HTMLElement | undefined
    assert(region?.localName === "p", "region insertion did not create a direct paragraph")
    const regionStyle = getComputedStyle(region!)
    assert(regionStyle.gridRowStart === "2" && regionStyle.gridColumnStart === "2", "inserted paragraph did not inherit its empty cell placement")
    assert(section.children[0] === existing, "region insertion replaced the existing authored node")
    const exported = await editor.serializeHTML()
    const reloaded = new DOMParser().parseFromString(exported, "text/html")
    const reloadedSection = reloaded.querySelector("section")
    assert(reloadedSection?.querySelectorAll(":scope > p").length === 1, "export/reload lost the inserted paragraph")
    const reloadedRegion = reloadedSection?.querySelector<HTMLElement>(":scope > p")
    let reloadedRowStart = "", reloadedColumnStart = ""
    if(reloadedSection && reloadedRegion) {
      fixture.append(reloadedSection)
      const reloadedStyle = getComputedStyle(reloadedRegion)
      reloadedRowStart = reloadedStyle.gridRowStart
      reloadedColumnStart = reloadedStyle.gridColumnStart
      reloadedSection.remove()
    }
    assert(reloadedRegion && reloadedRowStart === "2" && reloadedColumnStart === "2", "export/reload lost the inserted paragraph placement")
    assert(!exported.includes("◆") && !reloaded.querySelector("[class*='◆']"), "editor markers leaked into exported layout HTML")
  }
  finally { removeLayout(section) }
})

await check("splitting a grid paragraph preserves column placement", async () => {
  const section = createLayout(
    "display:grid;width:360px;min-height:180px;grid-template-columns:1fr 1fr;grid-template-rows:auto auto auto;gap:10px",
    [],
  )
  const first = document.createElement("p")
  first.textContent = "split this paragraph"
  first.style.cssText = "grid-row:1 / 2;grid-column:1 / 2;min-inline-size:0"
  const other = document.createElement("p")
  other.textContent = "other column"
  other.style.cssText = "grid-row:1 / 2;grid-column:2 / 3;min-inline-size:0"
  section.append(first, other)
  try {
    await layoutFrame()
    editor.features.selection.clearSelectedSection(section)
    const text = first.firstChild!
    $.move(text, 5)
    const event = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"})
    document.dispatchEvent(event)
    await layoutFrame()
    const paragraphs = Array.from(section.children).filter((child): child is HTMLParagraphElement => child.localName === "p")
    assert(event.defaultPrevented, "Enter was not handled by the editor")
    assert(paragraphs.length === 3, "Enter did not split the grid paragraph")
    const [left, right, columnTwo] = paragraphs
    const leftStyle = getComputedStyle(left), rightStyle = getComputedStyle(right), otherStyle = getComputedStyle(columnTwo)
    assert(leftStyle.gridColumnStart === "1" && rightStyle.gridColumnStart === "1", "split paragraphs moved to different columns")
    assert(leftStyle.gridRowStart === "1" && rightStyle.gridRowStart === "2" && rightStyle.gridRowEnd === "3", "split paragraphs did not occupy successive explicit rows")
    assert(otherStyle.gridColumnStart === "2" && otherStyle.gridRowStart === "1" && otherStyle.gridRowEnd === "3", `other column lost its placement (${otherStyle.gridColumnStart}/${otherStyle.gridRowStart}/${otherStyle.gridRowEnd})`)
    const leftRect = left.getBoundingClientRect(), rightRect = right.getBoundingClientRect(), otherRect = columnTwo.getBoundingClientRect()
    assert(rightRect.top >= leftRect.bottom - 1, "split paragraphs overlap instead of occupying successive rows")
    assert(Math.abs(otherRect.top - leftRect.top) < 1, "other column moved away from the first row")
  }
  finally { removeLayout(section) }
})

await check("block widgets inherit empty grid paragraph placement", async () => {
  const section = createLayout(
    "display:grid;width:360px;min-height:120px;grid-template-columns:1fr 1fr;grid-template-rows:auto auto;gap:10px",
    [],
  )
  const paragraph = document.createElement("p")
  paragraph.style.cssText = "grid-column:2;grid-row:2;min-inline-size:0"
  section.append(paragraph)
  try {
    $.move(paragraph, 0)
    const widget = document.createElement("native-audit-widget")
    editor.features.manipulation.insert(widget)
    const replacement = section.querySelector<HTMLElement>("native-audit-widget")
    assert(replacement, "empty paragraph was not replaced by the block widget")
    const replacementStyle = getComputedStyle(replacement!)
    assert(replacementStyle.gridColumnStart === "2", "widget did not inherit grid-column")
    assert(replacementStyle.gridRowStart === "2", "widget did not inherit grid-row")
    assert(replacementStyle.minInlineSize === "0px", "widget did not inherit min-inline-size")
  }
  finally { removeLayout(section) }
})

await check("removing a track preserves independent important grid placement longhands", async () => {
  const section = createLayout(
    "display:grid;width:320px;height:180px;grid-template-columns:100px 100px;grid-template-rows:80px 80px;gap:10px",
    [{text: "spanning", style: "grid-column-start:1 !important;grid-column-end:3 !important;grid-row:1"}, {text: "other", style: "grid-column:2 / 3;grid-row:2"}],
  )
  try {
    await layoutFrame()
    const item = section.children[0] as HTMLElement
    const changed = editor.features.layout.actions.removeLayoutTrack({type: "removeLayoutTrack", axis: "column", index: 0})
    assert(changed === true, "important longhand placement made track removal fail")
    assert(item.style.getPropertyValue("grid-column-start") === "1", "unchanged important grid-column-start was lost")
    assert(item.style.getPropertyValue("grid-column-end") === "2", "grid-column-end was not remapped to the surviving line")
    assert(item.style.getPropertyPriority("grid-column-start") === "important", "grid-column-start priority was lost")
    assert(item.style.getPropertyPriority("grid-column-end") === "important", "grid-column-end priority was lost")
    assert(section.textContent?.includes("spanning") && section.textContent.includes("other"), "track removal discarded placed content")
  }
  finally { removeLayout(section) }
})

await check("flex wrapping produces a second rendered line", async () => {
  const section = createLayout(
    "display:flex;width:220px;height:100px;flex-flow:row wrap;gap:10px",
    Array.from({length: 3}, (_, index) => ({text: `card-${index}`, style: "width:100px;height:20px"})),
  )
  try {
    await layoutFrame()
    const first = section.children[0].getBoundingClientRect()
    const third = section.children[2].getBoundingClientRect()
    assert(third.top > first.bottom - 1, "flex-wrap did not move the third item to another line")
  }
  finally { removeLayout(section) }
})

await check("transformed grid geometry withholds misleading resize handles", async () => {
  const section = createLayout(
    "display:grid;width:360px;height:120px;grid-template-columns:1fr 1fr;grid-template-rows:1fr;gap:12px;transform:scale(0.8)",
    [{text: "one"}, {text: "two"}],
  )
  try {
    await layoutFrame()
    const overlay = editor.appendix.querySelector<HTMLElement>(".◆layout-overlay")
    assert(overlay && !overlay.hidden, "transformed layout did not retain its selection overlay")
    assert(!overlay!.querySelector('[data-operation="resize"]'), "transformed layout exposed a misleading separator")
  }
  finally { removeLayout(section) }
})

await check("focused AI previews preserve widgets, contextual HTML, and rendered styles", async () => {
  const paragraph = document.createElement("p")
  paragraph.id = "ai-native-paragraph"
  paragraph.textContent = "Before AI"
  const table = document.createElement("table")
  table.innerHTML = '<tbody><tr id="ai-native-row"><td>A</td></tr></tbody>'
  fixture.append(paragraph, table)
  const widget = fixture.querySelector("native-audit-widget")!
  const target = (selector: string) => (editor.features.state.actions.inspectAIElements({type: "inspectAIElements", selector})).elements[0].target
  try {
    const paragraphTarget = target("#ai-native-paragraph")
    editor.features.state.actions.previewAIOperations({type: "previewAIOperations", editId: "native-ai", summary: "Improve the exercise.", availableWidgets: ["native-audit-widget"], operations: [
      {type: "set_text", target: paragraphTarget, text: "Proposed AI"},
      {type: "set_styles", target: paragraphTarget, styles: {color: "rgb(255, 0, 0)"}},
      {type: "insert_html", target: target("#ai-native-row"), position: "append", html: "<td>B</td>"},
      {type: "insert_html", target: paragraphTarget, position: "after", html: '<native-audit-widget id="ai-native-widget"></native-audit-widget>'},
    ]})
    await layoutFrame()
    const inserted = fixture.querySelector("#ai-native-widget")!
    assert(paragraph.isConnected && widget.isConnected, "preview replaced existing nodes")
    assert(inserted.shadowRoot?.querySelector("button"), "proposed widget did not upgrade on insertion")
    assert(table.querySelectorAll("td").length === 2, "table insertion lost its parsing context")
    assert(getComputedStyle(paragraph).color === "rgb(255, 0, 0)", "proposed styles did not render")
    assert(!editor.doc.body.toString().includes("Proposed AI"), "preview leaked into collaboration")
    assert(editor.appendix.querySelector(".◆ai-review-toolbar"), "review controls are missing from the appendix")
    editor.features.state.actions.acceptAIEdit({type: "acceptAIEdit", editId: "native-ai"})
    assert(fixture.querySelector("#ai-native-widget") === inserted, "acceptance recreated the inserted widget")
    assert(paragraph.isConnected && widget.isConnected, "acceptance replaced an existing instance")
    editor.features.state.actions.previewAIOperations({type: "previewAIOperations", editId: "native-ai-reject", summary: "Revise the paragraph.", operations: [
      {type: "set_text", target: target("#ai-native-paragraph"), text: "Rejected AI"},
    ]})
    editor.features.state.actions.rejectAIEdit({type: "rejectAIEdit", editId: "native-ai-reject"})
    assert(paragraph.textContent === "Proposed AI", "rejection lost accepted content")
    editor.features.state.actions.undoAIEdit({type: "undoAIEdit", editId: "native-ai"})
    assert(paragraph.textContent === "Before AI", "selective undo did not restore the paragraph")
    assert(!editor.toHTML(true).includes("◆"), "AI markers leaked into serialization")
  }
  finally {
    for(const editId of ["native-ai", "native-ai-reject"]) {
      try { editor.features.state.actions.rejectAIEdit({type: "rejectAIEdit", editId}) }
      catch { /* A successful check has already settled both previews. */ }
    }
    fixture.querySelector("#ai-native-widget")?.remove()
    paragraph.remove()
    table.remove()
  }
})

await check("selection markers and appendix layout artifacts tear down cleanly", async () => {
  const section = createLayout(
    "display:grid;width:360px;height:120px;grid-template-columns:1fr 1fr;grid-template-rows:1fr;gap:12px",
    [{text: "one"}, {text: "two"}],
  )
  await layoutFrame()
  assert(section.classList.contains("◆layout-selected"), "layout selection marker missing")
  const overlay = editor.appendix.querySelector<HTMLElement>(".◆layout-overlay")
  assert(overlay, "layout overlay was not placed in the appendix")
  assert(getComputedStyle(overlay!).position === "fixed", `layout overlay position was ${getComputedStyle(overlay!).position}`)
  const separator = overlay!.querySelector<HTMLElement>('[data-axis="column"][data-operation="resize"]')
  assert(separator && getComputedStyle(separator).position === "absolute", `resize handle position was ${separator ? getComputedStyle(separator).position : "missing"}`)
  assert(!section.querySelector("[class*='◆']"), "editor artifacts entered authored layout content")
  editor.features.selection.clearSelectedSection(section)
  $.selectDocumentStart()
  editor.features.selection.processSelection()
  await layoutFrame()
  assert(!section.classList.contains("◆layout-selected"), "layout marker survived deselection")
  assert(editor.appendix.querySelector<HTMLElement>(".◆layout-overlay")?.hidden === true, "layout overlay stayed visible after deselection")
  editor.features.layout.disable()
  assert(!editor.appendix.querySelector(".◆layout-overlay"), "layout overlay survived feature teardown")
  section.remove()
})

await check("shape labels retain capture while typing and selecting text", async () => {
  $.selectRange(fixture, fixture.childNodes.length)
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  const graphic = $.selectedElement as SVGSVGElement
  try {
    graphic.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
    let proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
    const text = graphic.querySelector("text")!
    await layoutFrame()
    proxy.dispatchEvent(new KeyboardEvent("keydown", {key: "L", bubbles: true, cancelable: true}))
    document.execCommand("insertText", false, "Label text")
    await layoutFrame()
    assert(text.textContent === "Label text", "typing did not reach the SVG label")
    assert(editor.features.selection.captureSelectedElement === graphic, "typing lost graphic capture")
    const caret = editor.appendix.querySelector<HTMLElement>('[part="graphic-text-caret"]')!
    assert(getComputedStyle(caret).animationName === "blink", "the label caret does not blink")
    proxy.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}))
    await layoutFrame()
    assert(getComputedStyle(text).cursor === "text" && getComputedStyle(text).pointerEvents !== "none", "closed label is not a text target")
    assert(getComputedStyle(text, "::selection").backgroundColor === "rgba(0, 0, 0, 0)", "shape selection highlights its label")
    const point = (index: number) => {
      const start = text.getStartPositionOfChar(index), end = text.getEndPositionOfChar(index)
      return new DOMPoint(start.x + (end.x - start.x) * .1, (start.y + end.y) / 2).matrixTransform(text.getScreenCTM()!)
    }
    const start = point(8), end = point(2)
    text.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, pointerId: 98, clientX: start.x, clientY: start.y, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 98, clientX: end.x, clientY: end.y, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 98}))
    await layoutFrame()
    proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
    assert(proxy, "one click did not reopen label editing")
    const selected = editor.features.graphic.textEditingRange!.toString()
    assert(selected === "bel te", `drag selected the wrong text: ${selected}`)
    proxy.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true}))
    assert(editor.features.graphic.textEditingRange!.toString() === "el te", "backwards Shift selection lost its anchor")
    editor.features.selection.processSelection()
    assert(editor.features.selection.captureSelectedElement === graphic && graphic.classList.contains("◆element-capture-selected"), "text selection lost graphic capture")
    proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "!", cancelable: true}))
    assert(text.textContent === "Lab!xt", "typing did not replace the selected text")
    const word = point(5)
    text.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, pointerId: 99, clientX: word.x, clientY: word.y, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 99}))
    text.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0, cancelable: true}))
    assert(editor.features.graphic.textEditingRange!.toString() === "xt", "double-click did not select the label word")
    text.dispatchEvent(new MouseEvent("click", {bubbles: true, button: 0, detail: 3, cancelable: true}))
    assert(editor.features.graphic.textEditingRange!.toString() === "Lab!xt", "triple-click did not select the label line")
    proxy.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}))
    assert(!graphic.querySelector('[class*="◆graphic-text-editing"]'), "label editing marker was not cleaned up")
  }
  finally {
    graphic.remove()
    $.selectDocumentStart()
    editor.features.selection.processSelection()
  }
})

await check("ribbon dropdowns join their triggers without gaps at viewport edges", async () => {
  const {RibbonButton} = await import("../src/components/ribbon-button")
  for(const options of [
    {variant: "insertion", left: 42.25, top: 100.5, width: 92.5},
    {variant: "package", active: true, muted: true, iconAction: "pin-snippet", left: 40, top: 100, width: 140},
    {variant: "toolbar", dropdownOnClick: true, left: 40, top: 100, width: 320},
    {variant: "default", compact: true, left: window.innerWidth - 40, top: 100, width: 32},
    {variant: "tab", left: 40, top: window.innerHeight - 48, width: 100},
  ]) {
    const button = new RibbonButton()
    Object.assign(button, {label: "Paragraph", action: "element:p", submenu: ["Heading 1", "Heading 2"], ...options})
    Object.assign(button.style, {position: "fixed", left: `${options.left}px`, top: `${options.top}px`, width: `${options.width}px`})
    document.body.append(button)
    try {
      await button.updateComplete
      const row = button.shadowRoot!.querySelector<HTMLElement>(".button-row")!
      const trigger = button.shadowRoot!.querySelector<HTMLButtonElement>(options.dropdownOnClick ? ".main-button" : ".submenu-trigger")!
      trigger.click()
      await button.updateComplete
      await layoutFrame()
      const menu = button.shadowRoot!.querySelector<HTMLElement>("ribbon-menu")!
      const box = row.getBoundingClientRect(), popup = menu.getBoundingClientRect()
      const above = row.dataset.connected === "above"
      assert(row.dataset.connected === (options.variant === "tab" ? "above" : "below"), `${options.variant}: wrong placement`)
      assert(menu.matches(":popover-open"), "menu left the browser's top layer")
      assert(Math.abs((above ? popup.bottom - box.top : box.bottom - popup.top) - 1) < .01, "trigger and menu do not share exactly one border pixel")
      assert(popup.width >= box.width && popup.left >= 8 && popup.right <= window.innerWidth - 8, "menu does not contain its trigger within the viewport")
      const style = getComputedStyle(row), surface = getComputedStyle(menu.shadowRoot!.querySelector<HTMLElement>(".menu")!)
      assert(style.backgroundColor === surface.backgroundColor && style.backgroundColor === "rgb(255, 255, 255)", "open trigger does not match the menu's white background")
      assert(style.opacity === "1", "muted trigger makes the joined border translucent")
      assert(style.borderLeftColor === surface.borderLeftColor && style.boxShadow === "none", "trigger's border does not match its menu")
      assert(parseFloat(getComputedStyle(menu, "::before").width) === box.width - 2, "shared border mask does not match trigger interior")
      assert(parseFloat(menu.style.getPropertyValue("--ribbon-menu-join-left")) === box.left - popup.left + 1, "shared border mask is not aligned with the trigger")
      const corners = above ? [surface.borderBottomLeftRadius, surface.borderBottomRightRadius] : [surface.borderTopLeftRadius, surface.borderTopRightRadius]
      if(popup.left === box.left) assert(corners[0] === "0px", "joined left corner retains a rounded gap")
      if(popup.right === box.right) assert(corners[1] === "0px", "joined right corner retains a rounded gap")
      button.closeSubmenu()
      await button.updateComplete
      assert(!row.hasAttribute("data-connected") && menu.hidden && !menu.matches(":popover-open"), "closing the menu retains connected styling")
    }
    finally { button.remove() }
  }
})

await check("ribbon shapes retain their aspect ratio under the document theme", async () => {
  const theme = document.createElement("style")
  theme.textContent = defaultDocumentTheme.source
  document.head.append(theme)
  try {
    for(const shape of ["ellipse", "rounded-rectangle", "line"] as const) {
      $.selectRange(document.body, document.body.childNodes.length)
      editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape})
      const graphic = $.selectedElement as SVGSVGElement
      try {
        await layoutFrame()
        const rect = graphic.getBoundingClientRect()
        const width = Number(graphic.getAttribute("width")), height = Number(graphic.getAttribute("height"))
        assert(Math.abs(rect.width - width) < 1 && Math.abs(rect.height - height) < 1,
          `${shape} stretched from ${width} × ${height} to ${rect.width} × ${rect.height}`)
      }
      finally { graphic.remove() }
    }
  }
  finally {
    theme.remove()
    $.selectDocumentStart()
    editor.features.selection.processSelection()
  }
})

await check("standalone SVG affordances refit rotated elements and resize beyond their original size", async () => {
  $.selectRange(fixture, fixture.childNodes.length)
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "ellipse"})
  const graphic = fixture.querySelector<SVGSVGElement>("svg")!
  assert(graphic, "standalone SVG was not inserted")
  Object.assign(graphic.style, {left: "200px", top: "200px", rotate: "30deg"})
  editor.features.selection.selectElement(graphic)
  await layoutFrame()
  assert($.selectedElement === graphic && !editor.features.selection.isCaptureSelection, "shape did not retain ordinary element selection")
  assert(!editor.appendix.querySelector('[part~="atomic-selection-overlay"]'), "standalone selection has a blue fill")
  const originalWidth = parseFloat(getComputedStyle(graphic).width)
  const original = graphic.getScreenCTM()!
  const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="radius-x"]')!
  const box = handle.getBoundingClientRect()
  const start = {x: box.left + box.width / 2, y: box.top + box.height / 2}
  const end = {x: start.x + original.a * 180, y: start.y + original.b * 180}
  handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, pointerId: 91, clientX: start.x, clientY: start.y}))
  document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 91, clientX: end.x, clientY: end.y}))
  await layoutFrame()
  document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 91}))
  await layoutFrame()
  const current = graphic.getScreenCTM()!
  for(const key of ["a", "b", "c", "d", "e", "f"] as const) {
    assert(Math.abs(current[key] - original[key]) < .1, `refitting moved the shape's ${key} transform`)
  }
  assert(parseFloat(getComputedStyle(graphic).width) > originalWidth + 300, "radius edit did not grow the element")
  const ellipse = graphic.querySelector("ellipse")!
  assert(Number(ellipse.getAttribute("rx")) > 290, "radius remained constrained to the original viewport")
  const resizer = editor.features.transformation.overlay.querySelector<HTMLElement>('#◆transform-overlay-scale-down-right')!
  const resizeBox = resizer.getBoundingClientRect()
  const x = resizeBox.left + resizeBox.width / 2, y = resizeBox.top + resizeBox.height / 2
  const beforeResize = parseFloat(getComputedStyle(graphic).width)
  // Synthetic pointers cannot acquire native capture; exercise the same
  // transformation methods with a mouse gesture and real rendered geometry.
  resizer.addEventListener("mousedown", event => editor.features.transformation.handleScaleStart(event), {once: true})
  resizer.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: x, clientY: y}))
  const selectionMutations: MutationRecord[] = []
  const selectionObserver = new MutationObserver(records => selectionMutations.push(...records))
  selectionObserver.observe(graphic, {attributes: true, attributeFilter: ["class"], attributeOldValue: true})
  try {
    for(let step = 1; step <= 3; step++) {
      editor.features.transformation.handleScaleDrag(new MouseEvent("mousemove", {buttons: 1, clientX: x + step * 60, clientY: y + step * 60}))
      await layoutFrame()
      assert($.selectedElement === graphic, "resizing changed the selected element")
    }
    selectionMutations.push(...selectionObserver.takeRecords())
    assert(selectionMutations.every(record => record.oldValue?.split(/\s+/).includes("◆element-selected")), "resizing temporarily removed the selection marker")
  }
  finally { selectionObserver.disconnect() }
  editor.features.transformation.handleScaleEnd()
  await layoutFrame()
  assert(parseFloat(getComputedStyle(graphic).width) > beforeResize + 100, "standard resizing could not enlarge the shape")
  assert($.selectedElement === graphic, "resizing lost the element selection")
  graphic.remove()
  $.selectDocumentStart()
  editor.features.selection.processSelection()
})

await check("iframe lifecycle reaches load and cleans up", async () => {
  const frame = document.querySelector<HTMLIFrameElement>("#lifecycle")!
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("iframe load timed out")), 2000)
    if(frame.contentDocument?.readyState === "complete") { clearTimeout(timer); resolve(); return }
    frame.addEventListener("load", () => { clearTimeout(timer); resolve() }, {once: true})
  })
  assert(frame.contentDocument?.querySelector("p")?.textContent === "ready", "iframe document did not load")
  const frameWindow = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string, reinitializeEditor?: () => void}
  for(let attempt = 0; !frameWindow.editor && attempt < 40; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
  assert(frameWindow.editor, `iframe editor did not initialize${frameWindow.editorError ? `: ${frameWindow.editorError}` : ""}`)
  const iframeEditor = frameWindow.editor!
  iframeEditor.destroy()
  assert(!frame.contentDocument?.querySelector("[class*='◆']"), "iframe destroy left authored markers")
  assert(!frame.contentDocument?.body.shadowRoot?.querySelector("[class*='◆']"), "iframe destroy left appendix markers")
  assert(frameWindow.reinitializeEditor, "iframe reinitialization function missing")
  frameWindow.reinitializeEditor!()
  frameWindow.editor!.destroy()
  frame.remove()
  assert(!frame.isConnected && !document.querySelector("#lifecycle"), "iframe was not removed")
})

await check("dead-key composition stays outside authored formulas", async () => {
  const paragraph = document.createElement("p")
  fixture.append(paragraph)
  try {
    for(const data of ["^2", "â", "release", "cancel"]) {
      paragraph.innerHTML = "<math><mi>x</mi><mi>a</mi></math>"
      const math = paragraph.querySelector("math")!
      $.move(math.lastElementChild!.firstChild!, 1)
      document.body.dispatchEvent(new KeyboardEvent("keydown", {key: "Dead", code: "IntlBackslash", keyCode: 229, bubbles: true, cancelable: true}))
      document.body.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true, cancelable: true, data: ""}))
      const input = editor.appendix.querySelector<HTMLTextAreaElement>('textarea[aria-label="Formula exponent input"]')!
      assert(input && editor.appendix.activeElement === input, "native composition did not move to the appendix input")
      await layoutFrame()
      assert(math.querySelector(".◆math-slot"), "exponent placeholder disappeared during composition")
      if(data === "cancel") {
        const prose = document.createTextNode("outside")
        paragraph.append(prose)
        paragraph.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true}))
        $.move(prose, 2)
        editor.features.selection.processSelection(undefined, {scrollIntoView: false})
        editor.features.math.refresh()
        await layoutFrame()
        assert(!input.isConnected && !editor.features.math.isComposingPower, "composition input lingered after leaving the formula")
        assert(!editor.appendix.querySelector(".◆math-overlay") && !math.querySelector(".◆math-slot"), "formula presentation lingered after leaving")
        input.dispatchEvent(new CompositionEvent("compositionend", {bubbles: true, data: "^2"}))
        assert(document.getSelection()!.focusNode === prose && math.textContent === "xa", "late composition returned to the old formula")
        continue
      }
      if(data === "release") {
        input.value = "^"
        input.dispatchEvent(new KeyboardEvent("keyup", {key: "Dead", code: "IntlBackslash", isComposing: true, bubbles: true}))
        await layoutFrame()
        const slot = math.querySelector("msup > mrow:last-child")!
        assert(!input.isConnected && document.activeElement === document.body, "formula did not regain focus after releasing the dead key")
        assert(document.getSelection()!.focusNode === slot && document.getSelection()!.focusOffset === 0, "caret did not return to the exponent start")
        document.body.dispatchEvent(new KeyboardEvent("keydown", {key: "2", code: "Digit2", bubbles: true, cancelable: true}))
        assert(slot.textContent === "2", "first exponent character was lost after focus restoration")
        continue
      }
      for(const value of ["^", data]) {
        input.dispatchEvent(new CompositionEvent("compositionupdate", {bubbles: true, data: value}))
        input.dispatchEvent(new InputEvent("beforeinput", {bubbles: true, cancelable: false, isComposing: true, inputType: "insertCompositionText", data: value}))
        input.value = value
        input.dispatchEvent(new InputEvent("input", {bubbles: true, isComposing: true, inputType: "insertCompositionText", data: value}))
        assert(math.textContent === "xa", "composition changed the formula before commit")
      }
      input.dispatchEvent(new CompositionEvent("compositionend", {bubbles: true, data}))
      assert(!input.isConnected, "composition input was not removed")
      assert(math.querySelector("msup > mrow:last-child")?.textContent === (data === "^2" ? "2" : "a"), "exponent was lost or duplicated")
      assert(math.querySelector("msup > mrow:first-child")?.textContent === "a", "composition corrupted the base")
    }
  }
  finally { paragraph.remove(); editor.features.math.refresh() }
})

await check("canvas box selection retains disjoint ranges and stays in the document top layer", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body class="ww-canvas"><p style="position:absolute;left:40px;top:40px;width:100px;height:60px;margin:0">first</p><p style="position:absolute;left:40px;top:350px;width:100px;height:60px;margin:0">hole</p><p style="position:absolute;left:170px;top:40px;width:100px;height:60px;margin:0;z-index:2147483647">last</p></body>'
  document.body.append(frame)
  let canvasEditor: DOMEditor | undefined
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `canvas editor did not initialize: ${view.editorError}`)
    canvasEditor = view.editor!
    await layoutFrame()
    const doc = frame.contentDocument!, [first, hole, last] = Array.from(doc.querySelectorAll("p"))
    const a = first.getBoundingClientRect(), b = last.getBoundingClientRect()
    const left = Math.min(a.left, b.left) - 10, top = Math.min(a.top, b.top) - 10
    const right = Math.max(a.right, b.right) + 10, bottom = Math.max(a.bottom, b.bottom) + 10
    doc.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, pointerId: 91, button: 0, clientX: left, clientY: top}))
    doc.body.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, pointerId: 91, buttons: 1, clientX: right, clientY: bottom}))
    const box = canvasEditor.appendix.querySelector<HTMLElement>('[part="selection-box"]')!
    assert(box?.matches(":popover-open"), "selection box is not in the document top layer")
    const boxRect = box.getBoundingClientRect()
    assert(Math.abs(boxRect.left - left) < 1 && Math.abs(boxRect.top - top) < 1
      && Math.abs(boxRect.width - (right - left)) < 1 && Math.abs(boxRect.height - (bottom - top)) < 1,
      `selection box does not start at the pointer: expected=${left},${top}, actual=${boxRect.left},${boxRect.top}`)
    assert(getComputedStyle(box).pointerEvents === "none" && box.getRootNode() === doc.body.shadowRoot, "selection box intercepts content or escapes the appendix")
    assert(canvasEditor.appendix.querySelectorAll('[part~="box-selection-preview"]').length === 2, "box preview missed an enclosed item")
    assert(!first.classList.contains("◆element-selected") && !last.classList.contains("◆element-selected") && !hole.classList.contains("◆element-selected"), "box committed a selection before release")
    doc.body.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 91, clientX: right, clientY: bottom}))
    await layoutFrame()
    assert(!box.isConnected && first.classList.contains("◆element-selected") && last.classList.contains("◆element-selected"), "selection did not survive pointerup and native refresh")
    assert(canvasEditor.appendix.querySelectorAll('[part~="multi-selection-overlay"]').length === 2, "selected items do not have separate overlays")
    const selection = canvasEditor.doc.snapshot().selection
    assert(selection?.ranges?.length === 2, "snapshot lost disjoint ranges")
    assert(!canvasEditor.toHTML().includes("selection-box"), "marquee leaked into serialized content")
  }
  finally { canvasEditor?.destroy(); frame.remove() }
})

await check("canvas slot preserves hit testing and document coordinates at different zoom levels", async () => {
  const paragraph = document.createElement("p")
  paragraph.textContent = "Canvas text"
  paragraph.style.cssText = "width:240px;margin:0"
  document.body.append(paragraph)
  const rotated = document.createElement("aside")
  rotated.textContent = "Rotated"
  rotated.style.cssText = "width:180px;height:60px;rotate:20deg;margin:12px"
  document.body.append(rotated)
  const originalDifference = {x: rotated.getBoundingClientRect().left - paragraph.getBoundingClientRect().left,
    y: rotated.getBoundingClientRect().top - paragraph.getBoundingClientRect().top}
  const originalChildren = Array.from(document.body.childNodes)
  try {
    assert(editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"}), "canvas conversion failed")
    assert(originalChildren.every((node, i) => document.body.childNodes[i] === node), "conversion rebuilt content")
    const difference = {x: rotated.getBoundingClientRect().left - paragraph.getBoundingClientRect().left,
      y: rotated.getBoundingClientRect().top - paragraph.getBoundingClientRect().top}
    assert(Math.abs(difference.x / editor.features.canvas.zoom - originalDifference.x) < 1
      && Math.abs(difference.y / editor.features.canvas.zoom - originalDifference.y) < 1, "conversion displaced an authored transform")
    editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "actual-size"})
    paragraph.style.left = "-300px"
    paragraph.style.top = "-200px"
    const slot = editor.appendix.querySelector<HTMLSlotElement>("slot")!
    // Pan to a negative authored position without changing it.
    slot.dispatchEvent(new WheelEvent("wheel", {bubbles: true, composed: true, cancelable: true, deltaX: -500, deltaY: -400}))
    await layoutFrame()
    const before = paragraph.getBoundingClientRect()
    assert(before.width > 200 && before.height > 0, "slotted paragraph has no usable box")
    const point = editor.features.canvas.clientPoint(before.left, before.top)
    assert(Math.abs(point.x + 300) < 1 && Math.abs(point.y + 200) < 1, `negative canvas coordinate is wrong: ${JSON.stringify(point)}`)
    editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "zoom-in"})
    await layoutFrame()
    const zoomed = paragraph.getBoundingClientRect()
    assert(Math.abs(zoomed.width / before.width - 1.2) < .01, "camera did not scale slotted content")
    const zoomPoint = editor.features.canvas.clientPoint(zoomed.left, zoomed.top)
    assert(Math.abs(zoomPoint.x + 300) < 1 && Math.abs(zoomPoint.y + 200) < 1, "zoom changed authored coordinates")
    editor.features.canvas.reveal(zoomed)
    await layoutFrame()
    const rect = paragraph.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + 10, rect.top + rect.height / 2)
    assert(hit === paragraph || paragraph.contains(hit), `hit testing missed canvas text: ${hit?.outerHTML}`)
    $.move(paragraph.firstChild!, 3)
    editor.features.selection.processSelection()
    assert(getSelection()?.anchorNode === paragraph.firstChild, "canvas text lost its native selection")
    assert(editor.features.transformation.target === paragraph && !paragraph.classList.contains("◆element-selected"), "canvas caret does not show item controls independently of node selection")
    assert(getComputedStyle(editor.features.transformation.overlay).outlineStyle === "dotted", "canvas text selection lacks the dotted item outline")
    assert(getComputedStyle(paragraph).caretColor !== "rgba(0, 0, 0, 0)", "canvas item controls hide the text caret")
    for(const surface of [document.body, slot]) {
      $.selectRange(document.body, 0)
      const range = document.createRange(), text = paragraph.firstChild!
      range.setStart(text, 1); range.collapse(true)
      const start = range.getBoundingClientRect()
      range.setStart(text, 7)
      const end = range.getBoundingClientRect(), y = start.top + start.height / 2
      surface.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 29, clientX: start.left, clientY: y}))
      document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 29, clientX: end.left, clientY: y}))
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 29, clientX: end.left, clientY: y}))
      assert(!getSelection()?.isCollapsed && paragraph.contains(getSelection()!.anchorNode) && paragraph.contains(getSelection()!.focusNode),
        `canvas drag through ${surface.localName} did not stay inside its item`)
    }
    dragTextInside(editor, paragraph)
    const contentFrame = editor.features.transformation.overlay
    assert(contentFrame.part.contains("transform-overlay-content-selected"), "inner canvas selection did not show the root frame")
    await new Promise(resolve => setTimeout(resolve, 200))
    const contentFrameColor = getComputedStyle(contentFrame).outlineColor
    const rotation = contentFrame.querySelector<HTMLElement>("#◆transform-overlay-rotator")!
    for(const pseudo of ["::before", "::after"]) {
      assert(getComputedStyle(rotation, pseudo).backgroundColor === contentFrameColor, "canvas rotation icon or stem does not match the grey frame")
    }
    const resizeBefore = paragraph.getBoundingClientRect()
    const resizer = editor.features.transformation.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    assert(getComputedStyle(resizer).backgroundColor === contentFrameColor, "content-selection handles do not match the grey frame")
    resizer.addEventListener("mousedown", event => editor.features.transformation.handleScaleStart(event), {once: true})
    resizer.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: resizeBefore.right, clientY: resizeBefore.bottom}))
    editor.features.transformation.handleScaleDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: resizeBefore.right + 120, clientY: resizeBefore.bottom + 60}))
    editor.features.transformation.handleScaleEnd()
    const resizeAfter = paragraph.getBoundingClientRect()
    assert(Math.abs(resizeAfter.width - resizeBefore.width - 120) < 1
      && Math.abs(resizeAfter.height - resizeBefore.height - 60) < 1, "zoomed canvas resize did not grow the rendered item")
    assert(Math.abs(resizeAfter.left - resizeBefore.left) < 1 && Math.abs(resizeAfter.top - resizeBefore.top) < 1, "canvas resize moved its opposite corner")
    assert($.selectedElement === paragraph && !contentFrame.part.contains("transform-overlay-content-selected"), "resizing did not promote the canvas root to element selection")
    assert(contentFrame.getAnimations().length > 0 && resizer.getAnimations().length > 0, "canvas selection color changed without a transition")
    await new Promise(resolve => setTimeout(resolve, 200))
    assert(getComputedStyle(resizer).backgroundColor !== contentFrameColor, "selected root retained grey handles")
    dragTextInside(editor, paragraph)
    const mover = editor.features.transformation.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
    mover.addEventListener("mousedown", event => editor.features.transformation.handleMoveStart(event), {once: true})
    mover.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: 200, clientY: 200}))
    editor.features.transformation.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: 320, clientY: 200}))
    editor.features.transformation.handleMoveEnd()
    assert($.selectedElement === paragraph, "moving did not promote the canvas root to element selection")
    assert(Math.abs(parseFloat(paragraph.style.left) - (-300 + 120 / editor.features.canvas.zoom)) < 1, `zoomed move used screen instead of document units: ${paragraph.style.left}`)
    mover.addEventListener("mousedown", event => editor.features.transformation.handleMoveStart(event), {once: true})
    mover.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: window.innerWidth - 20, clientY: 200}))
    const cameraBeforeEdge = slot.style.transform
    editor.features.transformation.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, clientX: window.innerWidth - 1, clientY: 200}))
    await layoutFrame()
    assert(slot.style.transform !== cameraBeforeEdge, "dragging at the edge did not pan the canvas")
    editor.features.transformation.handleMoveEnd()
    const cameraAfterDrag = slot.style.transform
    await layoutFrame()
    assert(slot.style.transform === cameraAfterDrag, "edge panning continued after release")
    paragraph.style.height = "120px"
    for(const direction of ["left", "right", "up", "down", "diagonal"]) {
      const current = paragraph.getBoundingClientRect()
      paragraph.style.left = `${parseFloat(paragraph.style.left) + (200 - current.left) / editor.features.canvas.zoom}px`
      paragraph.style.top = `${parseFloat(paragraph.style.top) + (200 - current.top) / editor.features.canvas.zoom}px`
      const start = paragraph.getBoundingClientRect()
      const x = start.left + start.width / 2, y = start.top + start.height / 2
      const dx = direction === "left" ? 10 - start.left : direction === "right" || direction === "diagonal" ? window.innerWidth - 10 - start.right : 0
      const dy = direction === "up" ? 10 - start.top : direction === "down" || direction === "diagonal" ? window.innerHeight - 10 - start.bottom : 0
      assert(x + dx > 32 && x + dx < window.innerWidth - 32 && y + dy > 32 && y + dy < window.innerHeight - 32, "pointer must stay outside the edge zone")
      editor.features.transformation.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: x, clientY: y}))
      const camera = editor.features.canvas.clientPoint(0, 0)
      editor.features.transformation.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: x + dx, clientY: y + dy}))
      const atEdge = paragraph.getBoundingClientRect()
      await layoutFrame()
      const firstPan = slot.style.transform
      await layoutFrame()
      assert(slot.style.transform !== firstPan, `${direction}: panning stopped while holding the item at the edge`)
      const panned = editor.features.canvas.clientPoint(0, 0)
      assert(dx ? (panned.x - camera.x) * dx > 0 : Math.abs(panned.x - camera.x) < .01, `${direction}: wrong horizontal pan`)
      assert(dy ? (panned.y - camera.y) * dy > 0 : Math.abs(panned.y - camera.y) < .01, `${direction}: wrong vertical pan`)
      const held = paragraph.getBoundingClientRect()
      assert(Math.abs(held.left - atEdge.left) < 1 && Math.abs(held.top - atEdge.top) < 1, `${direction}: panning displaced the item from the pointer`)
      editor.features.transformation.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: x, clientY: y}))
      const centered = slot.style.transform
      await layoutFrame()
      assert(slot.style.transform === centered, `${direction}: panning continued after moving away from the edge`)
      editor.features.transformation.handleMoveEnd()
      const released = slot.style.transform
      await layoutFrame()
      assert(slot.style.transform === released, `${direction}: panning continued after release`)
    }
    const deletionTarget = document.createElement("p")
    deletionTarget.textContent = "Text"
    Object.assign(deletionTarget.style, {position: "absolute", left: "-20000px", top: "-20000px"})
    document.body.append(deletionTarget)
    try {
      $.selectRange(deletionTarget.firstChild!, 1, deletionTarget.firstChild!, 3)
      editor.features.selection.processSelection(false, {scrollIntoView: false})
      const beforeDelete = slot.style.transform
      deletionTarget.dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", bubbles: true, cancelable: true}))
      await layoutFrame()
      assert(deletionTarget.textContent === "Tt", "Backspace did not delete selected canvas text")
      assert(slot.style.transform === beforeDelete, "Backspace moved the canvas while deleting text")
      $.selectElement(deletionTarget)
      editor.features.selection.processSelection(false, {scrollIntoView: false})
      editor.features.manipulation.actions.hoverSnippet({type: "hoverSnippet", hovered: true})
      assert(document.querySelector(".◆snippet-hovered") === deletionTarget && getComputedStyle(editor.features.selection.hoverCaret!).display === "block",
        "selected canvas root suppresses the future snippet outline")
      editor.features.manipulation.actions.hoverSnippet({type: "hoverSnippet", hovered: false})
      assert(!deletionTarget.classList.contains("◆snippet-hovered"), "canvas snippet preview was not cleared")
      deletionTarget.dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", bubbles: true, cancelable: true}))
      await layoutFrame()
      assert(!deletionTarget.isConnected, "Backspace did not delete the canvas root")
      assert(slot.style.transform === beforeDelete, "Backspace moved the canvas while deleting a root")
    }
    finally { deletionTarget.remove() }
    const exported = new DOMParser().parseFromString(editor.toHTML(), "text/html")
    assert(exported.body.classList.contains("ww-canvas") && !exported.body.outerHTML.includes("canvas-controls")
      && !exported.documentElement.classList.contains("◆canvas-active"), "serialization mixed camera and authored layout")
    await checkFreeformCapture(editor, document.body)
  }
  finally {
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "document", expectedMode: "canvas"})
    paragraph.remove(); rotated.remove()
  }
})

await check("canvas Enter inserts a line break and conversion returns normal flow", async () => {
  const paragraph = document.createElement("p")
  paragraph.textContent = "FirstSecond"
  document.body.append(paragraph)
  try {
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"})
    paragraph.style.left = "120px"; paragraph.style.top = "100px"; paragraph.style.margin = "0px"
    $.move(paragraph.firstChild!, 5)
    const siblings = Array.from(paragraph.parentNode!.childNodes)
    paragraph.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    assert(paragraph.innerHTML === "First<br>Second", "canvas Enter did not insert a line break")
    assert(Array.from(paragraph.parentNode!.childNodes).every((node, index) => node === siblings[index])
      && paragraph.parentNode!.childNodes.length === siblings.length, "canvas Enter split the root element")
    $.move(paragraph.lastChild!, 3)
    paragraph.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertParagraph", bubbles: true, cancelable: true}))
    assert(paragraph.innerHTML === "First<br>Sec<br>ond", "canvas native paragraph input did not insert a line break")
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "document", expectedMode: "canvas"})
    assert(getComputedStyle(paragraph).position === "static", "document conversion retained absolute placement")
    assert(!document.documentElement.classList.contains("◆canvas-active"), "document conversion retained camera marker")
  }
  finally {
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "document", expectedMode: "canvas"})
    paragraph.remove()
  }
})


let savedCanvasHTML = ""
await check("ribbon elements drop on the blank canvas slot", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p></p></body>'
  document.body.append(frame)
  let canvasEditor: DOMEditor | undefined
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `canvas editor did not initialize: ${view.editorError}`)
    canvasEditor = view.editor!
    assert(canvasEditor.features.canvas.actions.startCanvas({type: "startCanvas"}), "empty canvas could not start")
    await layoutFrame()
    const doc = frame.contentDocument!, slot = doc.body.shadowRoot!.querySelector<HTMLSlotElement>("slot:not([name])")!
    const data = new DataTransfer()
    data.setData("application/x-webwriter-element-tag", "h2")
    data.setData("application/x-webwriter-element-tag-h2", "h2")
    data.setData("text/html", "<h2></h2>")
    const rect = slot.getBoundingClientRect()
    const init = {dataTransfer: data, clientX: rect.left + 240, clientY: rect.top + 180, bubbles: true, cancelable: true, composed: true}
    const over = new DragEvent("dragover", init)
    slot.dispatchEvent(over)
    assert(over.defaultPrevented, "canvas slot did not accept the ribbon drag")
    slot.dispatchEvent(new DragEvent("drop", init))
    const heading = doc.body.querySelector<HTMLElement>("h2")
    assert(heading?.style.position === "absolute", "canvas slot did not insert the dropped heading")
  }
  finally { canvasEditor?.destroy(); frame.remove() }
})

await check("relayed ribbon elements drop onto the selected element beneath editor overlays", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p>before</p><h2>selected</h2><p>after</p></body>'
  document.body.append(frame)
  let frameEditor: DOMEditor | undefined
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `overlay drop editor did not initialize: ${view.editorError}`)
    frameEditor = view.editor!
    const doc = frame.contentDocument!, heading = doc.querySelector("h2")!
    doc.getSelection()!.setBaseAndExtent(doc.body, 1, doc.body, 2)
    frameEditor.features.selection.processSelection()
    await layoutFrame(); await layoutFrame()
    const rect = heading.getBoundingClientRect()
    const x = rect.right - 2, y = rect.top + rect.height / 2
    assert(doc.elementFromPoint(x, y) === doc.body, "the selected element is not covered by an editor overlay")
    const data = {"application/x-webwriter-element-tag": "table", "application/x-webwriter-element-tag-table": "table", "text/html": "<table></table>"}
    assert(replayHostDrag({event: "dragover", x, y, data}, doc), "drag over the selected element was not accepted")
    assert(doc.body.classList.contains("◆drop-selection-active"), "drag over the selected element shows no drop caret")
    assert(replayHostDrag({event: "drop", x, y, data}, doc), "drop on the selected element was not accepted")
    assert(doc.body.querySelector("table") && heading.isConnected,
      `drop on the selected element did not insert the table: ${doc.body.innerHTML}`)
    doc.body.innerHTML = '<picture style="width:600px;height:320px"><img></picture>'
    const image = doc.querySelector("picture")!
    doc.getSelection()!.setBaseAndExtent(doc.body, 0, doc.body, 1)
    frameEditor.features.selection.processSelection()
    await layoutFrame(); await layoutFrame()
    const imageBox = image.getBoundingClientRect()
    const inputBox = frameEditor.features.media.placeholder.root.querySelector("input")!.getBoundingClientRect()
    const nativeData = {"application/x-webwriter-ribbon-insertion": "element:h2"}
    // A media-only document has no text caret to recover in the surrounding
    // whitespace. Browsers are allowed to return no native caret there.
    const nativeCaret = doc.caretPositionFromPoint.bind(doc)
    Object.defineProperty(doc, "caretPositionFromPoint", {configurable: true, value: () => null})
    const nativeHits = doc.elementsFromPoint.bind(doc)
    Object.defineProperty(doc, "elementsFromPoint", {configurable: true, value: () => [doc.body]})
    for(const [dropX, dropY] of [[inputBox.left + inputBox.width / 2, inputBox.top + inputBox.height / 2], [imageBox.left + imageBox.width / 2, imageBox.bottom + 160]]) {
      const imageIndex = Array.from(doc.body.childNodes).indexOf(image)
      doc.getSelection()!.setBaseAndExtent(doc.body, imageIndex, doc.body, imageIndex + 1)
      frameEditor.features.selection.processSelection()
      await layoutFrame(); await layoutFrame()
      const before = doc.querySelectorAll("h2").length
      assert(replayHostDrag({event: "dragover", x: dropX, y: dropY, data: nativeData}, doc), "drag over selected image was rejected")
      assert(doc.body.classList.contains("◆drop-selection-active"), "selected image prevented the drop caret")
      assert(replayHostDrag({event: "drop", x: dropX, y: dropY, data: nativeData}, doc), "drop near selected image was rejected")
      assert(doc.querySelectorAll("h2").length === before + 1 && image.isConnected, "selected image prevented native insertion")
    }
    Object.defineProperty(doc, "caretPositionFromPoint", {configurable: true, value: nativeCaret})
    Object.defineProperty(doc, "elementsFromPoint", {configurable: true, value: nativeHits})
    doc.body.innerHTML = "<p></p>"
    frameEditor.features.selection.processSelection()
    await layoutFrame(); await layoutFrame()
    const imageData = {"application/x-webwriter-ribbon-insertion": "element:picture"}
    replayHostDrag({event: "dragover", x: 300, y: 300, data: imageData}, doc)
    replayHostDrag({event: "drop", x: 300, y: 300, data: imageData}, doc)
    await layoutFrame(); await layoutFrame()
    assert(doc.querySelector("picture"), "initial image drop failed")
    for(const tag of ["h1", "table", "details", "picture", "p"]) {
      const count = doc.querySelectorAll(tag).length
      const nextData = {"application/x-webwriter-ribbon-insertion": `element:${tag}`}
      replayHostDrag({event: "dragover", x: 300, y: 400, data: nextData}, doc)
      assert(doc.body.classList.contains("◆drop-selection-active"), `image drop blocked ${tag} caret`)
      replayHostDrag({event: "drop", x: 300, y: 400, data: nextData}, doc)
      assert(doc.querySelectorAll(tag).length > count, `image drop blocked ${tag} insertion`)
      await layoutFrame(); await layoutFrame()
    }
  }
  finally { frameEditor?.destroy(); frame.remove() }
})

await check("ribbon snippets drop at the caret and center in freeform layouts", async () => {
  for(const mode of ["document", "canvas", "slides"] as const) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:900px;height:600px"
    frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p>before after</p></body>'
    document.body.append(frame)
    try {
      const view = frame.contentWindow as Window & {editor?: DOMEditor}
      for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor, "drop fixture did not initialize")
      const editor = view.editor!, doc = frame.contentDocument!
      if(mode !== "document") assert(editor.setDocumentLayout(mode, "document"), "drop layout could not be set")
      await layoutFrame()
      const target = mode === "slides" ? doc.querySelector<HTMLElement>(".ww-slide")! : doc.body
      const paragraph = doc.querySelector("p")!, range = doc.createRange()
      range.setStart(paragraph.firstChild!, 7); range.collapse(true)
      const caret = range.getBoundingClientRect(), rect = target.getBoundingClientRect()
      const x = mode === "document" ? caret.left : Math.max(rect.left + 250, 250)
      const y = mode === "document" ? caret.top + caret.height / 2 : Math.max(rect.top + 150, 150)
      let message: {position: import("../src/editor-bridge").RibbonDropPosition} | undefined
      editor.postHostMessage = data => {
        if((data as {type?: string}).type === "editor-ribbon-drop") message = data as typeof message
      }
      const data = new DataTransfer()
      data.setData("application/x-webwriter-ribbon-insertion", "user-snippet:saved")
      const surface = mode === "canvas" ? editor.appendix.querySelector<HTMLSlotElement>("slot:not([name])")! : paragraph
      const init = {dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true}
      const over = new DragEvent("dragover", init)
      surface.dispatchEvent(over)
      assert(over.defaultPrevented, "ribbon insertion drag was not accepted")
      if(mode === "document") assert(doc.getSelection()?.anchorNode === paragraph.firstChild && doc.getSelection()?.anchorOffset === 7, "moving drop caret is absent")
      surface.dispatchEvent(new DragEvent("drop", init))
      assert(message, "ribbon drop did not request insertion")
      const html = mode === "document" ? '<em>inserted </em>' : '<p style="width:120px;height:60px;margin:0">Saved <b>snippet</b><!--keep--></p>'
      assert(await editor.features.manipulation.actions.insertRibbonDrop({type: "insertRibbonDrop", html, position: message!.position}), "drop insertion failed")
      await layoutFrame()
      if(mode === "document") assert(paragraph.textContent === "before inserted after", "drop did not insert at the moving caret")
      else {
        const inserted = target.lastElementChild as HTMLElement, box = inserted.getBoundingClientRect()
        assert(Math.abs(box.left + box.width / 2 - x) < 1 && Math.abs(box.top + box.height / 2 - y) < 1, "drop is not centered at pointer coordinates")
        assert(inserted.innerHTML.includes("<!--keep-->"), "drop lost nested snippet content")
        for(const action of ["insert-graphic-shape:rectangle", "insert-math:frac", "list-style:ol:lower-alpha"]) {
          data.setData("application/x-webwriter-ribbon-insertion", action)
          surface.dispatchEvent(new DragEvent("drop", init))
          await layoutFrame()
          const root = target.lastElementChild as HTMLElement, box = root.getBoundingClientRect()
          assert(Math.abs(box.left + box.width / 2 - x) < 1 && Math.abs(box.top + box.height / 2 - y) < 1, `${mode}: ${action} is not centered (${box.left + box.width / 2}, ${box.top + box.height / 2} vs ${x}, ${y}; ${root.outerHTML})`)
          assert(action.startsWith("insert-graphic") ? root.localName === "svg" : action.startsWith("insert-math") ? root.querySelector("mfrac") : root.localName === "ol", `${action} did not create its element`)
          if(action.startsWith("insert-graphic")) assert(doc.getSelection()?.toString() === "" && root.parentNode === doc.getSelection()?.anchorNode, "shape drop lost its element selection")
          else assert(root.contains(doc.getSelection()?.anchorNode ?? null) && doc.getSelection()?.isCollapsed, `${action} lost its editing caret while centering`)
        }
        for(const tag of ["table", "details", "h2", "math", "svg"]) {
          const elementData = new DataTransfer()
          elementData.setData("application/x-webwriter-ribbon-insertion", `element:${tag}`)
          target.dispatchEvent(new DragEvent("drop", {...init, dataTransfer: elementData}))
          await layoutFrame()
          const root = target.lastElementChild!
          if(tag === "svg") assert(editor.features.selection.captureSelectedElement === root, "graphic drop lost its capture selection")
          else {
            const content = tag === "table" ? root.querySelector("td") : tag === "details" ? root.querySelector("summary") : tag === "math" ? root.querySelector("mrow") : root
            assert(content?.contains(doc.getSelection()?.anchorNode ?? null) && doc.getSelection()?.isCollapsed, `${mode}: ${tag} lost its editing caret while centering`)
            if(tag === "table") assert(editor.features.table.hasCellSelection, "table drop did not select the first cell")
          }
        }
      }
      message = undefined
      for(let index = 0; index < 3; index++) {
        data.setData("application/x-webwriter-ribbon-insertion", "package:prepared")
        data.setData("text/html", "<x-prepared-drop>Prepared widget</x-prepared-drop>")
        target.dispatchEvent(new DragEvent("dragover", init))
        target.dispatchEvent(new DragEvent("drop", init))
        await layoutFrame()
        assert(target.querySelectorAll("x-prepared-drop").length === index + 1, `${mode}: repeated prepared drop failed`)
        assert(!message, "prepared drop unnecessarily requested host insertion")
      }
      assert(!doc.body.classList.contains("◆drop-selection-active"), "drop selection marker leaked")
    }
    finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
  }
})

await check("a clean canvas retains its initial item when moving and typing without inserting links", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  // No script or other in-flow metadata in BODY to mask the empty-flow check.
  frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p></p></body>'
  document.body.append(frame)
  let canvasEditor: DOMEditor | undefined
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `canvas editor did not initialize: ${view.editorError}`)
    canvasEditor = view.editor!
    const doc = frame.contentDocument!, paragraph = doc.querySelector("p")!
    assert(canvasEditor.features.canvas.actions.startCanvas({type: "startCanvas"}), "empty canvas could not start")
    await layoutFrame()
    const before = paragraph.getBoundingClientRect()
    const edge = canvasEditor.features.transformation.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
    edge.addEventListener("mousedown", event => canvasEditor!.features.transformation.handleMoveStart(event), {once: true})
    edge.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: 200, clientY: 200}))
    canvasEditor.features.transformation.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: 224, clientY: 216}))
    canvasEditor.features.transformation.handleMoveEnd()
    await layoutFrame()
    const moved = paragraph.getBoundingClientRect()
    assert(paragraph.isConnected && moved.height > 0 && Math.abs(moved.left - before.left - 24) < 1
      && Math.abs(moved.top - before.top - 16) < 1, `moving the initial canvas item loses its visible box: before=${JSON.stringify(before.toJSON())}, after=${JSON.stringify(moved.toJSON())}, connected=${paragraph.isConnected}, style=${paragraph.getAttribute("style")}, content=${paragraph.innerHTML}, target=${canvasEditor.features.transformation.target?.localName}`)
    assert(doc.getSelection()?.anchorNode === doc.body && !doc.getSelection()!.isCollapsed
      && canvasEditor.features.transformation.target === paragraph, "moving the initial item did not select its root")
    const type = async (target: HTMLElement, value: string) => {
      const anchor = target.lastChild ?? target
      doc.getSelection()!.setBaseAndExtent(anchor, anchor.textContent?.length ?? 0, anchor, anchor.textContent?.length ?? 0)
      const event = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: value})
      target.dispatchEvent(event)
      assert(!event.defaultPrevented, "canvas typing entered the virtual-document insertion path")
      assert(doc.execCommand("insertText", false, value), "native canvas text insertion failed")
      await layoutFrame()
      assert(target.isConnected && target.getBoundingClientRect().height > 0 && target.contains(doc.getSelection()!.anchorNode), "typing loses the canvas item or caret")
      const emptyCaret = canvasEditor!.features.selection.emptyDocumentCaret
      assert(!emptyCaret || view.getComputedStyle(emptyCaret).display === "none", "canvas text retains the empty-document caret")
      assert(!doc.body.querySelector("link"), "typing inserted a link into canvas content")
    }
    await type(paragraph, "Hello")
    await type(paragraph, " world")
    doc.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0}))
    doc.body.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    await layoutFrame()
    const backgroundCaret = canvasEditor.features.selection.emptyDocumentCaret
    assert(view.getComputedStyle(doc.body).cursor === "default", "canvas background does not use the arrow cursor")
    assert(view.getComputedStyle(canvasEditor.appendix.querySelector("slot")!).cursor === "default", "canvas camera does not use the arrow cursor")
    assert(view.getComputedStyle(paragraph).cursor === "auto", "canvas text lost its native cursor")
    assert(backgroundCaret && view.getComputedStyle(backgroundCaret).display === "none", "blank canvas shows a background caret")
    assert(view.getComputedStyle(paragraph).caretColor === "rgba(0, 0, 0, 0)", "blank canvas selection paints a caret in positioned text")
    doc.getSelection()!.setBaseAndExtent(paragraph.firstChild!, 2, paragraph.firstChild!, 2)
    await layoutFrame()
    assert(view.getComputedStyle(backgroundCaret!).display === "none", "text selection retains the background caret")
    assert(view.getComputedStyle(paragraph).caretColor !== "rgba(0, 0, 0, 0)", "text selection did not restore its native caret")
    canvasEditor.appendix.querySelector<HTMLButtonElement>('button[name="text"]')!.click()
    const second = doc.querySelectorAll("p")[1]
    await type(second, "Second")
    assert(paragraph.textContent === "Hello world" && second.textContent === "Second", "canvas text is missing")
    assert(Math.abs(paragraph.getBoundingClientRect().left - moved.left) < 1 && Math.abs(paragraph.getBoundingClientRect().top - moved.top) < 1, "typing displaced the initial canvas item")
    canvasEditor.appendix.querySelector<HTMLButtonElement>('button[name="text"]')!.click()
    const empty = doc.body.lastElementChild!
    empty.append(doc.createElement("br"))
    await layoutFrame()
    assert(empty.isConnected && empty.contains(doc.getSelection()!.anchorNode), "the active empty paragraph was removed")
    doc.getSelection()!.setBaseAndExtent(second.firstChild!, 2, second.firstChild!, 2)
    await layoutFrame()
    assert(!empty.isConnected, "the empty canvas paragraph survived losing focus")
    assert(doc.querySelectorAll("p").length === 2 && doc.getSelection()!.anchorNode === second.firstChild
      && doc.getSelection()!.anchorOffset === 2, "empty paragraph cleanup changed the new editing position")
    canvasEditor.appendix.querySelector<HTMLButtonElement>('button[name="text"]')!.click()
    const nextEmpty = doc.body.lastElementChild!
    canvasEditor.features.selection.selectElement(paragraph)
    await layoutFrame()
    assert(!nextEmpty.isConnected && canvasEditor.features.transformation.target === paragraph,
      "cleanup disturbed the newly selected element's move controls")
    canvasEditor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "zoom-in"})
    for(const x of [10, doc.documentElement.clientWidth - 10]) {
      canvasEditor.features.selection.selectElement(paragraph)
      const y = doc.documentElement.clientHeight - 150
      const hit = canvasEditor.appendix.elementFromPoint(x, y) ?? doc.elementFromPoint(x, y)!
      const slot = canvasEditor.appendix.querySelector<HTMLSlotElement>("slot")!
      assert(hit === slot || hit === doc.body || hit === doc.documentElement, "background test point hits authored content")
      const camera = slot.style.transform
      const down = new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 41, clientX: x, clientY: y})
      hit.dispatchEvent(down)
      const mouse = new MouseEvent("mousedown", {bubbles: true, composed: true, cancelable: true, button: 0, clientX: x, clientY: y})
      hit.dispatchEvent(mouse)
      hit.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, composed: true, pointerId: 41, clientX: x, clientY: y}))
      hit.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true, cancelable: true, detail: 2, clientX: x, clientY: y}))
      await layoutFrame()
      assert(down.defaultPrevented && mouse.defaultPrevented, "blank canvas permits native nearest-text selection")
      assert(doc.getSelection()!.isCollapsed && doc.getSelection()!.anchorNode === doc.body
        && canvasEditor.features.transformation.target === null, "blank canvas selected a nearby item")
      assert(slot.style.transform === camera, "blank canvas click moved the camera")
    }
    const lastEmpty = doc.createElement("p")
    doc.body.replaceChildren(lastEmpty)
    doc.getSelection()!.setBaseAndExtent(lastEmpty, 0, lastEmpty, 0)
    await layoutFrame()
    doc.getSelection()!.setBaseAndExtent(doc.body, 1, doc.body, 1)
    await layoutFrame()
    assert(doc.body.childElementCount === 0, "removing the final empty canvas paragraph inserted a replacement")
    const theme = doc.createElement("style")
    theme.textContent = defaultDocumentTheme.source
    doc.head.append(theme)
    const saved = document.createElement("iframe")
    saved.setAttribute("sandbox", "allow-same-origin")
    saved.srcdoc = canvasEditor.toHTML()
    const loaded = new Promise<void>(resolve => saved.addEventListener("load", () => resolve(), {once: true}))
    document.body.append(saved)
    try {
      await loaded
      const savedDoc = saved.contentDocument!, savedView = saved.contentWindow!
      const background = savedView.getComputedStyle(savedDoc.documentElement)
      assert(background.backgroundImage.includes("radial-gradient"), "saved canvas lost its dots")
      assert(background.backgroundSize === "20px 20px" && background.backgroundRepeat === "repeat", "saved canvas does not tile its dotted background")
      assert(!saved.contentDocument!.body.shadowRoot, "saved canvas background depends on editor UI")
      assert(savedView.getComputedStyle(savedDoc.body).backgroundColor === "rgba(0, 0, 0, 0)", "canvas body obscures the viewport dots")
      const item = savedDoc.createElement("p")
      item.textContent = "Canvas content"
      item.style.cssText = "position:absolute;left:20px;top:20px;width:120px;margin:0"
      savedDoc.body.append(item)
      for(const [width, height] of [[400, 300], [1500, 900]]) {
        saved.style.cssText = `width:${width}px;height:${height}px;border:0`
        await layoutFrame()
        const root = savedDoc.documentElement
        assert(root.scrollWidth === root.clientWidth && root.scrollHeight === root.clientHeight, "fitting canvas content creates unnecessary scrolling")
        const body = savedDoc.body.getBoundingClientRect()
        assert(body.left === 0 && body.top === 0 && body.width === root.clientWidth && body.height >= root.clientHeight, "canvas retains page margins or fixed dimensions")
        item.style.left = `${width + 100}px`
        item.style.top = `${height + 100}px`
        await layoutFrame()
        assert(root.scrollWidth >= width + 220 && root.scrollHeight > height + 100, "canvas clips overflowing content")
        savedView.scrollTo(root.scrollWidth, root.scrollHeight)
        assert(savedView.scrollX > 0 && savedView.scrollY > 0, "overflowing canvas content is not scrollable")
        item.style.left = item.style.top = "20px"
        savedView.scrollTo(0, 0)
      }
      savedDoc.body.classList.remove("ww-canvas")
      assert(!savedView.getComputedStyle(savedDoc.documentElement).backgroundImage.includes("radial-gradient"), "document mode retains canvas dots")
    }
    finally { saved.remove() }
    doc.body.innerHTML = '<p style="position:absolute;left:-400px;top:-300px;width:200px">Exported canvas</p>'
    savedCanvasHTML = await canvasEditor.serializeHTML(true)
  }
  finally { canvasEditor?.destroy(); frame.remove() }
})

await check("exported canvas runs its standalone viewer without editor dependencies", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px;border:0"
  frame.srcdoc = savedCanvasHTML
  const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
  document.body.append(frame)
  try {
    await loaded
    const doc = frame.contentDocument!, view = frame.contentWindow!
    const appendix = doc.body.shadowRoot!
    assert(appendix, "export did not initialize its reader")
    assert(!doc.querySelector('script[src]'), "reader depends on an external script")
    const item = doc.body.querySelector("p")!, original = item.outerHTML
    const rect = item.getBoundingClientRect()
    assert(rect.left >= 0 && rect.top >= 0 && rect.right < 900, "reader did not fit negative canvas coordinates")
    assert(Math.abs((rect.left + rect.right) / 2 - view.innerWidth / 2) < 1
      && Math.abs((rect.top + rect.bottom) / 2 - view.innerHeight / 2) < 1, "reader did not center fitted content")
    const slot = appendix.querySelector("slot")!
    const before = slot.style.transform
    appendix.querySelector<HTMLButtonElement>('button[name="zoom-in"]')!.click()
    assert(slot.style.transform !== before && appendix.querySelector("output")!.textContent === "120%", "reader zoom control did not move the camera")
    const zoomed = slot.style.transform
    slot.dispatchEvent(new WheelEvent("wheel", {bubbles: true, composed: true, cancelable: true, deltaY: 100}))
    assert(slot.style.transform !== zoomed, "reader did not pan with the wheel")
    appendix.querySelector<HTMLButtonElement>('button[name="fit-content"]')!.click()
    const fitted = item.getBoundingClientRect()
    assert(Math.abs((fitted.left + fitted.right) / 2 - view.innerWidth / 2) < 1
      && Math.abs((fitted.top + fitted.bottom) / 2 - view.innerHeight / 2) < 1, "Fit did not recenter content after panning and zooming")
    assert(item.outerHTML === original, "reader changed authored placement")
    assert(!appendix.querySelector('button[name="text"]'), "reader exposes editing controls")
    assert(view.getComputedStyle(doc.documentElement).overflow === "clip", "reader viewport is not clipped")
    doc.body.classList.remove("ww-canvas")
    await new Promise(resolve => setTimeout(resolve, 0))
    assert(!appendix.querySelector("[part=canvas-controls]") && !doc.documentElement.classList.contains("◆canvas-active"), "reader did not clean up after a mode change")
  }
  finally { frame.remove() }
})

for(const mode of ["canvas", "slides"] as const) await check(`paragraphs grow with content and retain explicit sizes in ${mode}`, async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px"
  frame.srcdoc = '<!doctype html><body><p>Short</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "paragraph fixture did not initialize")
    const doc = frame.contentDocument!, theme = doc.createElement("style"), paragraph = doc.querySelector("p")!
    theme.textContent = defaultDocumentTheme.source; doc.head.append(theme)
    assert(view.editor!.setDocumentLayout(mode, "document"), "paragraph fixture did not convert")
    if(mode === "canvas") view.editor!.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "actual-size"})
    await layoutFrame()
    const short = paragraph.getBoundingClientRect()
    paragraph.textContent = "A longer paragraph that grows as its content changes"
    await layoutFrame()
    const long = paragraph.getBoundingClientRect()
    assert(long.width > short.width * 2 && Math.abs(long.height - short.height) < 1, "unsized paragraph did not grow horizontally")
    paragraph.append(doc.createElement("br"), "Another line")
    await layoutFrame()
    assert(paragraph.getBoundingClientRect().height > long.height, "unsized paragraph did not grow vertically")
    doc.documentElement.style.fontSize = "32px"
    const padding = view.getComputedStyle(paragraph)
    assert([padding.paddingTop, padding.paddingRight, padding.paddingBottom, padding.paddingLeft].every(value => value === "2px"), "paragraph padding is not fixed at 2px")
    paragraph.style.width = "140px"
    await layoutFrame()
    assert(Math.abs(parseFloat(view.getComputedStyle(paragraph).width) - 140) < 1 && paragraph.getBoundingClientRect().height > long.height, "explicit paragraph width did not wrap content")
    paragraph.style.height = "90px"
    assert(Math.abs(parseFloat(view.getComputedStyle(paragraph).height) - 90) < 1, "explicit paragraph height was overridden")
    paragraph.style.width = ""; paragraph.style.height = ""; paragraph.style.inlineSize = "160px"
    assert(Math.abs(parseFloat(view.getComputedStyle(paragraph).width) - 160) < 1, "explicit logical paragraph size was overridden")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
})

let savedSlidesHTML = ""
await check("CSS Slides use native fragment links while editing", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px"
  frame.srcdoc = `<!doctype html><body><h1>First slide</h1><p>FirstSecond</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>`
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `slide editor did not initialize: ${view.editorError}`)
    const slideEditor = view.editor!, doc = frame.contentDocument!
    const documentGutter = getComputedStyle(doc.body).paddingLeft
    assert(slideEditor.setDocumentLayout("slides", "document"), "slide conversion failed")
    const first = doc.querySelector<HTMLElement>("section.ww-slide")!, text = first.querySelector("p")!.firstChild!
    doc.getSelection()!.setBaseAndExtent(text, 5, text, 5)
    slideEditor.features.manipulation.insert(undefined, 5)
    assert(first.querySelectorAll("p").length === 2 && doc.querySelectorAll("section.ww-slide").length === 1, "Enter split slide boundary")
    slideEditor.features.slides.actions.addSlide({type: "addSlide"})
    const second = doc.querySelectorAll<HTMLElement>("section.ww-slide")[1]
    second.firstElementChild!.textContent = "Second slide"
    const viewport = doc.querySelector<HTMLElement>(".ww-slides-viewport")!
    viewport.style.scrollBehavior = "auto"
    viewport.scrollLeft = 0
    await layoutFrame()
    const link = doc.querySelectorAll<HTMLAnchorElement>("nav.ww-slides-navigation a")[1]
    link.click()
    await layoutFrame()
    assert(frame.contentDocument === doc, `fragment link replaced the editor document: ${link.href}`)
    assert(viewport.scrollLeft > viewport.clientWidth / 2, `native editor link did not scroll: ${link.href}, scrollLeft=${viewport.scrollLeft}`)
    assert(doc.getSelection()?.isCollapsed && doc.getSelection()?.anchorNode === second.firstElementChild
      && doc.getSelection()?.anchorOffset === 0, "slide navigation did not place a caret at the first text block")
    assert(slideEditor.features.transformation.target === second.firstElementChild && !second.firstElementChild!.classList.contains("◆element-selected"), "slide caret does not show item controls independently of node selection")
    assert(getComputedStyle(slideEditor.features.transformation.overlay).outlineStyle === "dotted", "slide text selection lacks the dotted item outline")
    assert(getComputedStyle(second.firstElementChild!).caretColor !== "rgba(0, 0, 0, 0)", "slide item controls hide the text caret")
    dragTextInside(slideEditor, second.firstElementChild as HTMLElement)
    viewport.scrollLeft = 0
    await layoutFrame()
    link.click()
    await layoutFrame()
    assert(viewport.scrollLeft > viewport.clientWidth / 2, "repeated fragment activation did not return to its slide")
    const slideRect = second.getBoundingClientRect(), nav = doc.querySelector<HTMLElement>("nav.ww-slides-navigation")!
    assert(Math.abs(slideRect.width - frame.clientWidth) < 1 && Math.abs(slideRect.width / slideRect.height - 16 / 9) < .01,
      `slide does not fit at 16:9: ${slideRect.width} × ${slideRect.height}`)
    assert(Math.abs(slideRect.top - (frame.clientHeight - slideRect.height) / 2) < 1 && Math.abs(slideRect.left) < 1,
      `slide is not vertically centered: ${JSON.stringify({slide: slideRect.toJSON(), viewport: viewport.getBoundingClientRect().toJSON(), frame: [frame.clientWidth, frame.clientHeight], body: doc.body.getBoundingClientRect().toJSON(), grid: getComputedStyle(doc.body).gridTemplateRows, appendix: Array.from(slideEditor.appendix.children).map(e => [e.localName, getComputedStyle(e).display, getComputedStyle(e).position]), margin: getComputedStyle(second).margin, scroll: [viewport.scrollLeft, viewport.scrollTop]})}`)
    const headingRect = second.querySelector("h1")!.getBoundingClientRect(), paragraphRect = second.querySelector("p")!.getBoundingClientRect()
    for(const item of [second.querySelector("h1")!, second.querySelector("p")!]) {
      assert(getComputedStyle(item).position === "absolute" && (item as HTMLElement).offsetParent === second, "slide box is not positioned relative to the slide")
    }
    assert(Math.abs(headingRect.left - paragraphRect.left) < 1 && paragraphRect.width < headingRect.width
      && paragraphRect.top > headingRect.bottom && paragraphRect.bottom < slideRect.bottom - 20, "slide preset paragraph is not aligned or content sized")
    assert(getComputedStyle(nav).position === "absolute" && nav.getBoundingClientRect().bottom <= frame.clientHeight, "navigation is not overlaid at the bottom")
    assert(Math.abs(nav.getBoundingClientRect().left - 16) < 1, "slides pagination is not left aligned")
    assert(getComputedStyle(second).paddingTop === "20px" && getComputedStyle(second).paddingBottom === "20px"
      && getComputedStyle(second).paddingLeft === documentGutter, "slides do not use normal document spacing")
    doc.documentElement.style.setProperty("--ww-page-gutter", "24px")
    assert(getComputedStyle(second).paddingLeft === "24px" && getComputedStyle(second).paddingRight === "24px", "slides do not follow the document gutter")
    doc.documentElement.style.removeProperty("--ww-page-gutter")
    const actions = slideEditor.appendix.querySelector<HTMLElement>("[part=slide-navigation-actions]")!
    assert(!slideEditor.appendix.querySelector("[part=slide-editing-controls]"), "old editing bar remains")
    const add = actions.querySelector<HTMLButtonElement>('[name="add"]')!
    const close = actions.querySelector<HTMLButtonElement>('[aria-label="Remove slide 2"]')!
    for(const control of [link, second.querySelector<HTMLAnchorElement>(".ww-slide-previous")!, add, close]) {
      assert(getComputedStyle(control).cursor === "pointer", "slide control lacks a pointer cursor")
      assert(getComputedStyle(control).color === "rgb(47, 55, 66)" && getComputedStyle(control).borderTopColor === "rgb(47, 55, 66)", "slide control does not use the ribbon's dark grey")
      assert(!control.draggable, "slide control is draggable")
    }
    await new Promise(resolve => setTimeout(resolve, 250))
    assert(getComputedStyle(link).backgroundColor === "rgb(226, 229, 233)", `active slide bubble is not highlighted: ${getComputedStyle(link).backgroundColor}; ${link.className}; scroll=${viewport.scrollLeft}; native=${CSS.supports("scroll-target-group", "auto")}; animation=${getComputedStyle(link).animationName}; transition=${getComputedStyle(link).transitionDuration}`)
    assert(getComputedStyle(close).visibility === "visible", "active slide remove button is hidden")
    assert(getComputedStyle(actions.querySelector('[aria-label="Remove slide 1"]')!).visibility === "hidden", "inactive slide remove button is visible without hover")
    second.focus({preventScroll: true})
    assert(getComputedStyle(second).outlineStyle === "none", "focused slide still has a focus ring")
    const bubble = link.getBoundingClientRect(), closeRect = close.getBoundingClientRect()
    assert(actions.children.length === 3 && add.getBoundingClientRect().left >= nav.getBoundingClientRect().right, "appendix add affordance is not beside navigation")
    assert(bubble.width === 32 && add.getBoundingClientRect().width === 32 && closeRect.width === 16, "slide control circles are not compact")
    assert(Math.abs(closeRect.left + closeRect.width / 2 - (bubble.right - 4)) < 1 && Math.abs(closeRect.top + closeRect.height / 2 - (bubble.top + 4)) < 1, "remove affordance is not inset into bubble's top right")
    assert(slideEditor.appendix.elementFromPoint(closeRect.left + closeRect.width / 2, closeRect.top + closeRect.height / 2) === close, "bubble remove affordance is not clickable")
    slideEditor.features.selection.actions.selectNode({type: "selectNode", path: [0, 1]})
    viewport.dispatchEvent(new Event("scrollend"))
    await layoutFrame()
    const slideSelection = doc.getSelection()!
    assert(!slideSelection.isCollapsed && slideSelection.anchorNode === viewport && slideSelection.anchorOffset === 1
      && slideSelection.focusNode === viewport && slideSelection.focusOffset === 2, "slide breadcrumb did not retain whole-slide selection")
    second.querySelector<HTMLAnchorElement>(".ww-slide-previous")!.click()
    await layoutFrame()
    assert(viewport.scrollLeft < 1, "previous side arrow did not navigate")
    assert(doc.getSelection()?.anchorNode === first.firstElementChild, "previous arrow left selection in the other slide")
    first.querySelector<HTMLAnchorElement>(".ww-slide-next")!.click()
    await layoutFrame()
    assert(viewport.scrollLeft > viewport.clientWidth / 2, "next side arrow did not navigate")
    const firstContent = second.firstElementChild!, widget = doc.createElement("native-slide-widget")
    second.insertBefore(widget, firstContent)
    slideEditor.features.slides.selectStart(second)
    assert(doc.getSelection()?.anchorNode === second && doc.getSelection()?.anchorOffset === 0,
      "a slide starting with a widget did not receive a gap before the widget")
    widget.remove()
    slideEditor.features.slides.selectStart(second)
    actions.querySelector<HTMLButtonElement>('[name="add"]')!.click()
    await layoutFrame()
    assert(doc.querySelectorAll("section.ww-slide").length === 3, "navigation add affordance failed")
    const third = doc.querySelectorAll<HTMLElement>("section.ww-slide")[2], presetText = third.querySelector("p")!
    const presetHeading = third.querySelector("h1")!, beforeMove = presetHeading.getBoundingClientRect()
    presetHeading.textContent = "Slide title"
    doc.getSelection()!.setBaseAndExtent(presetHeading.firstChild!, 0, presetHeading.firstChild!, 2)
    slideEditor.features.selection.processSelection()
    const slideFrame = slideEditor.features.transformation.overlay
    assert(slideFrame.part.contains("transform-overlay-content-selected"), "inner slide selection did not show the root frame")
    await new Promise(resolve => setTimeout(resolve, 200))
    const slideFrameColor = getComputedStyle(slideFrame).outlineColor
    const slideHandle = slideFrame.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    assert(getComputedStyle(slideHandle).backgroundColor === slideFrameColor, "slide content-selection handles do not match the grey frame")
    const slideRotation = slideFrame.querySelector<HTMLElement>("#◆transform-overlay-rotator")!
    for(const pseudo of ["::before", "::after"]) {
      assert(getComputedStyle(slideRotation, pseudo).backgroundColor === slideFrameColor, "slide rotation icon or stem does not match the grey frame")
    }
    const mover = slideEditor.features.transformation.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
    mover.addEventListener("mousedown", event => slideEditor.features.transformation.handleMoveStart(event), {once: true})
    mover.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: 200, clientY: 200}))
    slideEditor.features.transformation.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: 212, clientY: 208}))
    slideEditor.features.transformation.handleMoveEnd()
    assert(!slideFrame.part.contains("transform-overlay-content-selected") && doc.getSelection()!.anchorNode === third
      && doc.getSelection()!.focusNode === third && !doc.getSelection()!.isCollapsed, "moving did not select the slide root")
    assert(slideFrame.getAnimations().length > 0 && slideHandle.getAnimations().length > 0, "slide selection color changed without a transition")
    await new Promise(resolve => setTimeout(resolve, 200))
    assert(getComputedStyle(slideHandle).backgroundColor !== slideFrameColor, "selected slide root retained grey handles")
    const afterMove = presetHeading.getBoundingClientRect()
    assert(Math.abs(afterMove.left - beforeMove.left - 12) < 1 && Math.abs(afterMove.top - beforeMove.top - 8) < 1
      && Math.abs(afterMove.width - beforeMove.width) < 1 && Math.abs(afterMove.height - beforeMove.height) < 1, "moving a slide text box changes its size or uses the wrong origin")
    await checkFreeformCapture(slideEditor, third)
    presetText.textContent = "BeforeAfter"
    doc.getSelection()!.setBaseAndExtent(presetText.firstChild!, 6, presetText.firstChild!, 6)
    presetText.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    assert(presetText.innerHTML === "Before<br>After" && third.querySelectorAll("p").length === 1, "slide Enter split the root instead of inserting a line break")
    doc.getSelection()!.setBaseAndExtent(presetText.lastChild!, 2, presetText.lastChild!, 2)
    presetText.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertParagraph", bubbles: true, cancelable: true}))
    assert(presetText.innerHTML === "Before<br>Af<br>ter", "slide native paragraph input did not insert a line break")
    const snippetRange = doc.createRange(); snippetRange.selectNode(presetText)
    doc.getSelection()!.removeAllRanges(); doc.getSelection()!.addRange(snippetRange)
    slideEditor.features.selection.processSelection(false, {scrollIntoView: false})
    slideEditor.features.manipulation.actions.hoverSnippet({type: "hoverSnippet", hovered: true})
    assert(doc.querySelector(".◆snippet-hovered") === presetText && getComputedStyle(slideEditor.features.selection.hoverCaret!).display === "block",
      "selected slide root suppresses the future snippet outline")
    slideEditor.features.manipulation.actions.hoverSnippet({type: "hoverSnippet", hovered: false})
    const selection = doc.getSelection()!
    for(const container of [doc.body, viewport, doc.querySelector("nav.ww-slides-navigation")!]) {
      for(const offset of [0, container.childNodes.length]) {
        selection.setBaseAndExtent(container, offset, container, offset)
        slideEditor.features.selection.processSelection(false, {scrollIntoView: false})
        const selectedSlide = slideEditor.features.slides.containingSlide(selection.anchorNode)
        assert(selectedSlide && slideEditor.features.slides.containingSlide(selection.focusNode) === selectedSlide,
          "outer carousel gap escaped the slide selection boundary")
        assert(!doc.querySelector('.ww-slide.◆gap-before-selected, .ww-slide.◆gap-after-selected, .ww-slides-viewport.◆gap-before-selected, .ww-slides-viewport.◆gap-after-selected'),
          "outer slide gap still shows an editing caret")
      }
    }
    actions.querySelector<HTMLButtonElement>('[name="remove"]')!.click()
    await layoutFrame()
    assert(doc.querySelectorAll("section.ww-slide").length === 2, "navigation remove affordance failed")
    frame.style.width = "900px"; frame.style.height = "350px"
    await layoutFrame()
    assert(Math.abs(third.getBoundingClientRect().height - 350) < 1 && Math.abs(third.getBoundingClientRect().width - 350 * 16 / 9) < 1,
      "slides do not fit a wide viewport at 16:9")
    assert(Math.abs(third.getBoundingClientRect().left - (frame.clientWidth - 350 * 16 / 9) / 2) < 1, "wide viewport margins are unequal")
    const outside = doc.createElement("aside")
    outside.textContent = "Outside"
    outside.style.cssText = "position:absolute;left:-40px;top:80px;width:30px;height:30px;background:blue"
    third.append(outside)
    let outsideRect = outside.getBoundingClientRect()
    assert(doc.elementFromPoint(outsideRect.left + 5, outsideRect.top + 5) === outside, "slide content is cropped in the side margin")
    frame.style.width = "360px"; frame.style.height = "480px"
    await layoutFrame()
    assert(Math.abs(third.getBoundingClientRect().width - 360) < 1 && Math.abs(third.getBoundingClientRect().height - 360 * 9 / 16) < 1, "slides did not retain 16:9 on viewport resize")
    assert(actions.querySelector<HTMLButtonElement>('[name="add"]')!.getBoundingClientRect().right <= 360 && nav.getBoundingClientRect().left >= 0, "compact navigation does not fit narrow viewport")
    outside.style.left = "80px"; outside.style.top = "-40px"
    outsideRect = outside.getBoundingClientRect()
    assert(outsideRect.bottom < third.getBoundingClientRect().top && doc.elementFromPoint(outsideRect.left + 5, outsideRect.top + 5) === outside, "slide content is cropped in the top margin")
    const lock = {}
    slideEditor.lockEditing(lock)
    assert(getComputedStyle(third).overflowX === "clip" && getComputedStyle(third).overflowY === "clip", "non-editing slides expose overflow")
    slideEditor.unlockEditing(lock)
    assert(getComputedStyle(third).overflow === "visible", "resuming editing does not expose slide overflow")
    viewport.style.removeProperty("scroll-behavior")
    savedSlidesHTML = await slideEditor.serializeHTML(true)
    slideEditor.destroy()
    assert(getComputedStyle(third).overflow === "clip", "destroying the editor leaves slide overflow exposed")
  }
  finally { frame.remove() }
})

await check("saved Slides navigate with HTML and CSS and scripting disabled", async () => {
  assert(savedSlidesHTML, "slide fixture did not export")
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px"
  frame.sandbox.add("allow-same-origin")
  const url = URL.createObjectURL(new Blob([savedSlidesHTML], {type: "text/html"}))
  frame.src = url
  const loaded = new Promise(resolve => frame.addEventListener("load", resolve, {once:true}))
  document.body.append(frame)
  try {
    await loaded
    const doc = frame.contentDocument!, viewport = doc.querySelector<HTMLElement>(".ww-slides-viewport")!
    assert(!doc.querySelector("script"), "saved carousel contains a runtime")
    assert(!doc.body.shadowRoot, "saved carousel depends on a shadow appendix")
    const readerSlide = viewport.querySelector<HTMLElement>("section.ww-slide")!
    assert(Math.abs(readerSlide.getBoundingClientRect().width - frame.clientWidth) < 1 && Math.abs(readerSlide.getBoundingClientRect().height - frame.clientWidth * 9 / 16) < 1, "exported slides do not fit the reader viewport at 16:9")
    const readerNav = doc.querySelector<HTMLElement>("nav.ww-slides-navigation")!
    assert(getComputedStyle(readerNav).position === "absolute" && readerNav.getBoundingClientRect().bottom <= frame.clientHeight, "reader navigation is not overlaid at the bottom")
    assert(Math.abs(readerNav.getBoundingClientRect().left - 16) < 1, "saved slides pagination is not left aligned")
    viewport.style.scrollBehavior = "auto"
    doc.querySelectorAll<HTMLAnchorElement>("nav.ww-slides-navigation a")[1].click()
    await layoutFrame()
    assert(frame.contentDocument === doc, "fragment navigation replaced the reader document")
    assert(viewport.scrollLeft > viewport.clientWidth / 2, "reader link did not scroll with scripts disabled")
    const outside = doc.querySelector<HTMLElement>("aside")!, outsideRect = outside.getBoundingClientRect()
    assert(doc.elementFromPoint(outsideRect.left + 5, outsideRect.top + 5) !== outside, "saved slide content is visible outside the slide")
    assert(getComputedStyle(outside.parentElement!).overflow === "clip", "saved slides do not clip overflow")
    const readerLinks = readerNav.querySelectorAll<HTMLAnchorElement>("a")
    assert(getComputedStyle(readerLinks[1]).backgroundColor === "rgb(226, 229, 233)" && getComputedStyle(readerLinks[0]).backgroundColor !== "rgb(226, 229, 233)", "saved active highlight does not follow navigation")
    assert(Array.from(doc.querySelectorAll<HTMLAnchorElement>("nav a")).every(link => !link.draggable), "saved controls can be dragged")
    const focusedSlide = doc.querySelectorAll<HTMLElement>("section.ww-slide")[1]
    focusedSlide.focus({preventScroll: true})
    assert(getComputedStyle(focusedSlide).outlineStyle === "none", "saved slide still has a focus ring")
    assert(getComputedStyle(readerNav.querySelector("a")!).cursor === "pointer", "saved navigation lacks a pointer cursor")
    doc.querySelectorAll<HTMLElement>("section.ww-slide")[1].querySelector<HTMLAnchorElement>(".ww-slide-previous")!.click()
    await layoutFrame()
    assert(viewport.scrollLeft < 1, "reader previous arrow requires scripting")
    doc.querySelector<HTMLAnchorElement>(".ww-slide-next")!.click()
    await layoutFrame()
    assert(viewport.scrollLeft > viewport.clientWidth / 2, "reader next arrow requires scripting")
    const preview = new DOMParser().parseFromString(savedSlidesHTML, "text/html")
    preview.querySelectorAll('nav.ww-slides-navigation a[href], nav.ww-slide-directions a[href]').forEach(link => link.setAttribute("href", `about:srcdoc${link.getAttribute("href")}`))
    const previewLoaded = new Promise(resolve => frame.addEventListener("load", resolve, {once:true}))
    frame.srcdoc = preview.documentElement.outerHTML
    await previewLoaded
    const previewDoc = frame.contentDocument!, previewViewport = previewDoc.querySelector<HTMLElement>(".ww-slides-viewport")!
    previewViewport.style.scrollBehavior = "auto"
    previewDoc.querySelectorAll<HTMLAnchorElement>("nav.ww-slides-navigation a")[1].click()
    await layoutFrame()
    assert(frame.contentDocument === previewDoc && previewViewport.scrollLeft > previewViewport.clientWidth / 2, "native preview links did not stay inside srcdoc")
  }
  finally { frame.remove(); URL.revokeObjectURL(url) }
})

await check("column groups expose independent gaps and stack with separator lines", async () => {
  for(const [width, count] of [[1200, 2], [640, 2], [1200, 3], [640, 3]]) {
    const frame = document.createElement("iframe")
    frame.style.cssText = `position:fixed;inset:0;inline-size:${width}px;min-inline-size:${width}px;max-inline-size:none;height:600px;border:0`
    const id = `column-group-${width}-${count}`
    const result = new Promise<string | null>(resolve => {
      const receive = (event: MessageEvent) => {
        if(event.source !== frame.contentWindow || event.data?.id !== id) return
        window.removeEventListener("message", receive)
        resolve(event.data.error ?? null)
      }
      window.addEventListener("message", receive)
    })
    frame.srcdoc = `<!doctype html><body><p>Left text</p><script type="module">
      import {DOMEditor} from "/src/domeditor.ts";
      import {$} from "/src/utility.ts";
      import {defaultDocumentTheme} from "/src/document-themes.ts";
      const assert = (condition, message) => {if(!condition) throw new Error(message)};
      let editor;
      try {
        const style = document.createElement("style");
        style.textContent = defaultDocumentTheme.source;
        document.head.append(style, document.querySelector("script"));
        editor = new DOMEditor({bridgeOrigin: parent.location.origin});
        const paragraph = document.querySelector("p");
        let media = document.createElement("img");
        media.alt = "Media";
        media.style.height = "160px";
        assert(editor.features.manipulation.placeFloat(media, paragraph, "right"), "could not create group");
        const group = document.querySelector(".ww-column-group");
        if(${count} === 3) {
          group.classList.add("ww-column-three");
          const middle = document.createElement("p");
          middle.className = "ww-column-middle";
          middle.textContent = "Middle";
          media.before(middle);
        }
        assert(group.firstElementChild === paragraph && group.lastElementChild === media, "incorrect group reading order");
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        media = group.querySelector(":scope > .ww-column-right");
        assert(media && group.isConnected, "image normalization lost its column placement");
        const columns = Array.from(group.children);
        const left = columns[0].getBoundingClientRect(), right = columns[columns.length - 1].getBoundingClientRect();
        assert(${width} > 960 ? Math.abs(left.top - right.top) < 1 && right.left > left.left : right.top >= left.bottom, "wrong column geometry " + JSON.stringify({left:left.toJSON(),right:right.toJSON(),grid:getComputedStyle(group).gridTemplateColumns,html:group.outerHTML}));
        assert((parseFloat(getComputedStyle(group).borderTopWidth) > 0) === (${width} <= 960), "wrong group separator visibility");
        assert((parseFloat(getComputedStyle(group).borderBottomWidth) > 0) === (${width} <= 960), "missing bottom separator");
        for(const child of columns) {
          const side = child === paragraph ? "left" : child === media ? "right" : "middle";
          for(const edge of ["before", "after"]) {
            const rect = child.getBoundingClientRect();
            $.selectCoords(rect.left + rect.width / 2, edge === "before" ? rect.top + 2 : rect.bottom - 2, false, child, editor.schema);
            editor.features.selection.processSelection();
            assert($.columnGap?.side === side && $.columnGap?.element === child, "gap escaped its column");
          }
          $.selectGap(child, "after");
          editor.features.selection.processSelection();
          const columnCursor = editor.features.selection.selectionCaret.getBoundingClientRect();
          const inserted = editor.features.manipulation.ensureTextBlock();
          assert(inserted?.parentElement === group && inserted.classList.contains("ww-column-" + side), "new block escaped column " + JSON.stringify({count:${count},side,group:group.outerHTML,inserted:inserted?.outerHTML,parent:inserted?.parentElement?.localName,connected:group.isConnected}));
          inserted.textContent = "Another block";
          const insertedRect = inserted.getBoundingClientRect();
          assert(Math.abs(columnCursor.left - insertedRect.left) < 2 && Math.abs(columnCursor.top - insertedRect.top) < 2, "column cursor differs from insertion");
        }
        await new Promise(requestAnimationFrame);
        const secondLeft = paragraph.nextElementSibling.getBoundingClientRect();
        const secondRight = media.nextElementSibling.getBoundingClientRect();
        const firstLeft = paragraph.getBoundingClientRect(), firstRight = media.getBoundingClientRect();
        assert(Math.abs(secondLeft.top - firstLeft.bottom - 20) < 2, "left flow waits for tall right content");
        assert(Math.abs(secondRight.top - firstRight.bottom - 20) < 2, "right flow has incorrect spacing");
        for(const child of group.querySelectorAll(":scope > .ww-column-right")) child.remove();
        $.selectColumnGap(group, "right");
        editor.features.selection.processSelection();
        assert(editor.features.selection.selectionCaret?.getRootNode() === editor.appendix, "gap caret left appendix");
        const emptyInserted = editor.features.manipulation.ensureTextBlock();
        assert(emptyInserted?.parentElement === group && emptyInserted.classList.contains("ww-column-right"), "empty-column insertion escaped");
        emptyInserted.textContent = "Right content";
        for(const edge of ["before", "after"]) {
          $.selectGap(group, edge);
          editor.features.selection.processSelection();
          await new Promise(requestAnimationFrame);
          const cursor = editor.features.selection.selectionCaret.getBoundingClientRect();
          const inserted = editor.features.manipulation.ensureTextBlock();
          assert(inserted?.parentElement === group.parentElement, "outer gap inserted into group");
          await new Promise(requestAnimationFrame);
          const block = inserted.getBoundingClientRect();
          assert(Math.abs(cursor.left - block.left) < 2 && Math.abs(cursor.top - block.top) < 2, "outer cursor differs from insertion: " + JSON.stringify({edge, cursor:cursor.toJSON(),block:block.toJSON()}));
          inserted.remove();
        }
        const html = new DOMParser().parseFromString(editor.toHTML(true), "text/html").body.innerHTML;
        assert(html.includes("ww-column-group") && html.includes("ww-column-left") && html.includes("ww-column-right") && !html.includes("◆"), "group serialization lost content or retained editing artifacts: " + html);
        const dragged = document.createElement("p"), dropTarget = document.createElement("picture");
        dragged.textContent = "Drag a paragraph";
        dropTarget.innerHTML = '<img alt="Drop target">';
        dropTarget.style.cssText = "height:80px;min-height:80px";
        document.body.append(dragged, dropTarget);
        $.selectElement(dragged);
        editor.features.selection.processSelection();
        const dragSurface = editor.appendix.querySelector('[part="node-drag-surface"]');
        assert(dragSurface, "paragraph has no drag surface");
        const dataTransfer = new DataTransfer();
        dragSurface.dispatchEvent(new DragEvent("dragstart", {dataTransfer, bubbles:true, cancelable:true, composed:true}));
        dropTarget.scrollIntoView();
        await new Promise(requestAnimationFrame);
        const dropRect = dropTarget.getBoundingClientRect();
        const dragInit = {dataTransfer, clientX:dropRect.left + dropRect.width * 0.2, clientY:dropRect.top + dropRect.height / 2, bubbles:true, cancelable:true, composed:true};
        dropTarget.dispatchEvent(new DragEvent("dragover", dragInit));
        dropTarget.dispatchEvent(new DragEvent("drop", dragInit));
        assert(dragged.parentElement === dropTarget.parentElement && dragged.parentElement.classList.contains("ww-column-group"), "paragraph-on-media drop did not form a group");
        assert(dragged.classList.contains("ww-column-left") && dropTarget.classList.contains("ww-column-right"), "paragraph-on-media drop reversed sides");
        parent.postMessage({id:${JSON.stringify(id)}}, "*");
      } catch(error) {parent.postMessage({id:${JSON.stringify(id)}, error:String(error)}, "*")}
      finally {editor?.destroy()}
    <\/script>`
    document.body.append(frame)
    try { assert(await result === null, `column group check at ${width}px: ${await result}`) }
    finally { frame.remove() }
  }
})

await check("version previews preserve editing mode and reject native and direct mutations", async () => {
  const section = document.createElement("section")
  section.id = "native-history-section"
  section.innerHTML = '<p>Hello</p><custom-history-widget state="ready"></custom-history-widget><template><b>Template</b></template><svg xmlns="http://www.w3.org/2000/svg"><use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#shape"></use></svg>'
  fixture.append(section)
  const history = editor.features.history
  try {
    const snapshot = await history.actions.prepareVersionSave({type: "prepareVersionSave"})
    const saved = history.actions.recordVersionSave({type: "recordVersionSave", checkpointId: snapshot.checkpointId})
    history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: saved.versions[0].id})
    assert(document.designMode === "on", "preview disabled editing mode")
    const previewSection = document.querySelector("#native-history-section")!
    const paragraph = previewSection.querySelector("p")!
    const source = editor.toHTML(false, false)
    const beforeInput = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "Blocked"})
    paragraph.dispatchEvent(beforeInput)
    assert(beforeInput.defaultPrevented, "native mutation event was allowed")
    const widget = previewSection.querySelector("custom-history-widget")!
    paragraph.textContent = "Blocked"
    widget.setAttribute("state", "changed")
    previewSection.querySelector("template")!.content.querySelector("b")!.textContent = "Blocked template"
    previewSection.querySelector("use")!.removeAttributeNS("http://www.w3.org/1999/xlink", "href")
    previewSection.append(document.createElement("aside"))
    await layoutFrame()
    assert(editor.toHTML(false, false) === source, "preview mutations survived their observer boundary")
    assert(previewSection.querySelector("p") === paragraph && previewSection.querySelector("custom-history-widget") === widget,
      "mutation rollback replaced existing preview nodes")
    history.clearPreview()
    assert(!editor.isEditingLocked, "preview lock survived closing")
    document.querySelector("#native-history-section p")!.textContent = "Editable again"
    await layoutFrame()
    assert(editor.doc.body.toString().includes("Editable again"), "closing preview did not resume editing")
  }
  finally {
    history.clearPreview()
    document.querySelector("#native-history-section")?.remove()
  }
})

editor.destroy()

await check("canvas and slide gestures relay pointer dismissal before feature capture", async () => {
  for(const mode of ["canvas", "slides"]) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:800px;height:600px"
    const nonce = crypto.randomUUID()
    const messages: MessageEvent[] = []
    const observe = (event: MessageEvent) => {
      if(event.source === frame.contentWindow && event.data?.bridgeNonce === nonce
        && event.data.type === "editor-frame-pointerdown") messages.push(event)
    }
    window.addEventListener("message", observe)
    const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
    frame.srcdoc = `<!doctype html><body class="ww-${mode}"><div class="ww-slides-viewport"><section class="ww-slide" id="slide"><p>Item</p><nav class="ww-slide-directions"><a href="#slide">Next</a></nav></section></div><script type="module" src="/src/editor-entry.ts"><\/script>`
    document.body.append(frame)
    try {
      await loaded
      frame.contentWindow!.postMessage({type: initializeEditorMessage, syncUrl: "ws://127.0.0.1:65534", bridgeNonce: nonce}, location.origin)
      for(let attempt = 0; attempt < 200 && !(frame.contentWindow as any).editor; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      assert((frame.contentWindow as any).editor, `${mode} bridge did not initialize`)
      await layoutFrame()
      const doc = frame.contentDocument!, view = frame.contentWindow!
      let bubbled = false
      doc.addEventListener("pointerdown", () => { bubbled = true })
      const target = mode === "canvas" ? doc.body : doc.querySelector("a")!
      target.dispatchEvent(new (view as any).PointerEvent("pointerdown", {button: 0, pointerId: 1, bubbles: true, composed: true, cancelable: true, clientX: 700, clientY: 500}))
      assert(!bubbled, `${mode} feature did not claim the test gesture`)
      for(let attempt = 0; attempt < 100 && !messages.length; attempt++) await new Promise(resolve => setTimeout(resolve, 10))
      assert(messages.length === 1, `${mode} gesture did not reach the host exactly once`)
      assert(messages[0].data.widgetShadow === false, `${mode} gesture was mistaken for widget input`)
    }
    finally {
      ;(frame.contentWindow as any)?.editor?.destroy()
      window.removeEventListener("message", observe)
      frame.remove()
    }
  }
})

await check("table commands complete across the real iframe bridge", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1280px;height:900px"
  frame.src = "/"
  document.body.append(frame)
  try {
    let app: DomEditor | null = null
    for(let attempt = 0; attempt < 200; attempt++) {
      app = frame.contentDocument?.querySelector<DomEditor>("dom-editor") ?? null
      if((app as any)?.editorWindow) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(app && (app as any).editorWindow, "table bridge editor did not initialize")
    await (app as any).waitForEditorWindow()
    const insert = await Promise.race([
      app!.execute({type: "insertTable", rows: 2, columns: 2}),
      new Promise((_, reject) => setTimeout(() => reject(new Error("table insertion did not complete")), 3000)),
    ])
    assert(insert === true, "table insertion did not return a bridge-safe result")
    assert(await app!.execute({type: "normalizeTable"}) === true, "table normalization did not complete")
    const source = await app!.execute({type: "serializeDocument"}) as string
    const doc = new DOMParser().parseFromString(source, "text/html")
    assert(doc.querySelectorAll("table tr").length === 2 && doc.querySelectorAll("table td").length === 4,
      "table bridge commands lost the inserted cells")
    assert(!doc.body.querySelector('[class*="◆"]'), "table bridge commands exported editor markers")
  }
  finally { frame.remove() }
})

await check("iframe reactivation restores hit testing without changing the document or selection", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:1280px;height:900px;background:white"
  frame.src = "/"
  document.body.append(frame)
  try {
    let app: DomEditor | null = null
    for(let attempt = 0; attempt < 200; attempt++) {
      app = frame.contentDocument?.querySelector<DomEditor>("dom-editor") ?? null
      if((app as any)?.editorWindow) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(app && (app as any).editorWindow, "app editor did not initialize")
    await (app as any).waitForEditorWindow()
    await app!.execute({type: "selectNode", path: [0]})
    const root = app!.shadowRoot!, iframe = root.querySelector<HTMLIFrameElement>(".editor-frame")!
    const doc = app!.ownerDocument, view = doc.defaultView!
    const before = await app!.execute({type: "serializeDocument"})
    const selection = JSON.stringify((app as any).selectionPath)
    if(!iframe.contentDocument) {
      const messages = new Set<string>()
      const observe = (event: MessageEvent) => {
        if(event.source === iframe.contentWindow && event.data?.type?.startsWith("editor-frame-window-")) messages.add(event.data.type)
      }
      const button = doc.createElement("button")
      doc.body.append(button)
      view.addEventListener("message", observe)
      try {
        button.focus()
        for(let attempt = 0; attempt < 100 && !messages.has("editor-frame-window-blur"); attempt++) await new Promise(resolve => setTimeout(resolve, 10))
        assert(messages.has("editor-frame-window-blur"), "opaque frame did not relay its native Window blur")
        assert(view.getComputedStyle(iframe).pointerEvents !== "none", "moving focus to the host disabled iframe interaction")
        ;(app as any).focusEditor()
        for(let attempt = 0; attempt < 100 && !messages.has("editor-frame-window-focus"); attempt++) await new Promise(resolve => setTimeout(resolve, 10))
        assert(messages.has("editor-frame-window-focus"), "opaque frame did not relay its native Window focus")
      }
      finally { view.removeEventListener("message", observe); button.remove() }
    }
    const rect = iframe.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + 40
    assert(root.elementFromPoint(x, y) === iframe, "active iframe was not a native hit-test target")
    // Model app deactivation without relying on a headless window manager.
    Object.defineProperty(doc, "hasFocus", {configurable: true, value: () => false})
    view.dispatchEvent(new Event("blur"))
    await Promise.resolve()
    assert(view.getComputedStyle(iframe).pointerEvents === "none", "inactive iframe kept its pointer target")
    assert(root.elementFromPoint(x, y) !== iframe, "inactive iframe remained in native hit testing")
    Reflect.deleteProperty(doc, "hasFocus")
    view.dispatchEvent(new Event("focus"))
    assert(view.getComputedStyle(iframe).pointerEvents !== "none", "reactivated iframe remained disabled")
    assert(root.elementFromPoint(x, y) === iframe, "reactivation did not restore native iframe hit testing")
    assert(await app!.execute({type: "serializeDocument"}) === before, "reactivation changed authored content")
    assert(JSON.stringify((app as any).selectionPath) === selection, "reactivation changed selection")
  }
  finally {
    if(frame.contentDocument) Reflect.deleteProperty(frame.contentDocument, "hasFocus")
    frame.remove()
  }
})

await check("bottom layout cards retain native editing focus after rendering", async () => {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;width:1280px;height:900px;background:white"
  frame.src = "/"
  document.body.append(frame)
  try {
    let app: DomEditor | null = null
    let editingFrame: HTMLIFrameElement | null = null
    for(let attempt = 0; attempt < 200; attempt++) {
      app = frame.contentDocument?.querySelector<DomEditor>("dom-editor") ?? null
      editingFrame = app?.shadowRoot?.querySelector<HTMLIFrameElement>(".editor-frame") ?? null
      if(editingFrame && (app as any)?.editorWindow && (app as any)?.editorDocument) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(app && (app as any).editorWindow, `app editor did not initialize: app=${!!app} frame=${!!editingFrame} window=${!!(app as any)?.editorWindow} opaque=${(app as any)?.editorOpaque} error=${(app as any)?.packageError}`)
    await (app as any).waitForEditorWindow()
    const initialHistory = await app!.execute({type: "getVersionHistory"}) as import("../src/editor-bridge").VersionHistoryState
    assert(initialHistory.checkpoints.length === 1 && initialHistory.checkpoints[0].label === "Document created",
      "automatic initialization was recorded as an edit")
    assert(Object.values(initialHistory.versions[0].changes).every(count => count === 0), "fresh document has authored changes")
    const initialSource = await app!.execute({type: "serializeDocument"}) as string
    assert(new DOMParser().parseFromString(initialSource, "text/html").documentElement.lang === (app as any).settings.language,
      "fresh document did not start with the preferred language")
    if(!editingFrame!.contentDocument) {
      assert(new URL(editingFrame!.src).origin !== frame.contentWindow!.location.origin, "editor frame stayed on the app origin")
      assert(editingFrame!.getAttribute("sandbox") === "allow-scripts allow-same-origin", "editor frame permissions changed")
      const source = await app!.execute({type: "serializeDocument"}) as string
      assert(source.includes("<body"), "cross-origin editor did not answer a document command")
      await (app as any).enterPreview()
      const previewFrame = app!.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.preview-frame")
      assert(previewFrame && new URL(previewFrame.src).origin === new URL(editingFrame!.src).origin,
        "preview did not use the dedicated editor origin")
      assert(previewFrame!.getAttribute("sandbox") === "allow-scripts allow-same-origin",
        "preview frame permissions changed")
      for(let attempt = 0; attempt < 200 && !(app as any).previewOpaque; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      assert((app as any).previewOpaque, "preview did not initialize on the dedicated origin")
      return
    }
    assert(app!.shadowRoot!.activeElement === editingFrame, "initial editor frame was not focused")
    assert(editingFrame!.contentDocument!.body.matches(":focus"), "initial editable body did not receive native focus")
    assert(frame.contentDocument!.activeElement === app, "iframe focus was not retargeted to the shadow host")
    ;(app as any).savedEditorSelection = null
    const previousDocument = editingFrame!.contentDocument
    await (app as any).reloadEditor([])
    assert(editingFrame!.contentDocument !== previousDocument, "package reload did not replace the document")
    assert(app!.shadowRoot!.activeElement === editingFrame && editingFrame!.contentDocument!.hasFocus(), "package reload did not restore iframe focus")
    assert(editingFrame!.contentDocument!.body.matches(":focus"), "package reload did not focus the native editable body")
    assert(editingFrame!.contentDocument!.getSelection()?.rangeCount, "package reload lost the initial selection")
    const root = app!.shadowRoot!, doc = editingFrame!.contentDocument!
    await new Promise(resolve => setTimeout(resolve, 750))
    doc.documentElement.setAttribute("lang", doc.documentElement.getAttribute("lang")!)
    const resource = doc.createElement("style")
    resource.className = "◆ ◆editor-only"
    doc.head.append(resource)
    await layoutFrame()
    resource.textContent = "/* initialized editor resource */"
    resource.setAttribute("media", "screen")
    await new Promise(resolve => setTimeout(resolve, 750))
    assert(root.querySelector(".document-layouts-panel:not([inert])"), "automatic startup changes dismissed Layouts")
    resource.remove()
    editingFrame!.focus()
    for(const mode of ["canvas", "slides", "document", "slides", "canvas", "document"]) {
      await app!.updateComplete
      const card = root.querySelector<HTMLButtonElement>(`.document-layouts-bar [data-mode="${mode}"]`)!
      assert(card && !card.disabled, `${mode} card is unavailable`)
      // Model the native pointer focus default explicitly: HTMLElement.click()
      // alone omits pointerdown/mousedown and would miss a toolbar focus loss.
      for(const type of ["pointerdown", "mousedown"]) {
        const event = new MouseEvent(type, {button: 0, bubbles: true, composed: true, cancelable: true})
        card.dispatchEvent(event)
        if(!event.defaultPrevented) card.focus()
        assert(root.activeElement === editingFrame, `${mode} card took pointer focus from the editor`)
      }
      const previousAnchor = doc.getSelection()?.anchorNode
      card.click()
      for(let attempt = 0; !card.disabled && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
      assert(card.disabled, `${mode} conversion did not finish`)
      // Check after asynchronous selection messages and rendering, without
      // using automation that might refocus the page before typing.
      await new Promise(resolve => setTimeout(resolve, 300))
      assert(root.activeElement === editingFrame && doc.hasFocus(), `${mode} lost editing focus after rendering`)
      const previousBlock = previousAnchor?.nodeType === Node.ELEMENT_NODE ? previousAnchor as Element : previousAnchor?.parentElement
      const retained = previousBlock?.isConnected && doc.body.contains(previousBlock) && previousBlock.matches("p, h1")
      const first = retained ? previousBlock! : doc.querySelector(mode === "slides" ? ".ww-slide > h1" : "body > p")!
      const selection = doc.getSelection()!
      assert(first && selection.isCollapsed && first.contains(selection.anchorNode), `${mode} lost its initial native caret: ${selection.anchorNode?.nodeName}:${selection.anchorOffset}; ${doc.body.innerHTML}`)
      if(!retained) assert(!first.childNodes.length, `${mode} inserted content to imitate a caret`)
      assert(root.querySelector(".document-layouts-panel:not([inert])"), `${mode} conversion dismissed Layouts`)
    }
    assert(doc.execCommand("insertText", false, "x"), "editor was not ready for typing")
    await new Promise(resolve => setTimeout(resolve, 250))
    const panel = root.querySelector<HTMLElement>(".document-layouts-panel")!
    assert(panel.inert && panel.getBoundingClientRect().height < 1, "first edit did not slide Layouts out of view")
    assert(doc.hasFocus(), "dismissing Layouts interrupted typing focus")
    doc.body.innerHTML = '<p>First</p><p id="retained-selection">Second</p>'
    let previousMode: "document" | "canvas" | "slides" = "document"
    for(const mode of ["canvas", "slides", "document", "slides", "canvas", "document"] as const) {
      const text = doc.querySelector("#retained-selection")!.firstChild!
      doc.getSelection()!.setBaseAndExtent(text, 5, text, 2)
      await layoutFrame()
      await app!.execute({type: "setDocumentLayout", mode, expectedMode: previousMode})
      previousMode = mode
      await new Promise(resolve => setTimeout(resolve, 300))
      const selection = doc.getSelection()!
      assert(doc.hasFocus() && selection.anchorNode === text && selection.anchorOffset === 5
        && selection.focusNode === text && selection.focusOffset === 2, `${mode} did not retain the backward text selection`)
      assert(doc.execCommand("insertText", false, "x") && text.textContent === "Sexd", `${mode} typing did not replace the retained selection`)
      text.textContent = "Second"
    }
    const ribbon = root.querySelector("app-ribbon")!, paragraph = doc.querySelector("#retained-selection")!
    const text = paragraph.firstChild!, snippetsBefore = (app as any).settings.userSnippets.length
    doc.getSelection()!.setBaseAndExtent(text, 1, text, 4)
    await layoutFrame()
    const snippets = ribbon.shadowRoot!.querySelector<any>('ribbon-button[label="Snippets"]')!
    assert(snippets, "Packages drawer has no permanent Snippets item")
    assert(!ribbon.shadowRoot!.querySelector('[aria-label="Pin snippet"]'), "separate pin snippet button was retained")
    const packagesDrawer = ribbon.shadowRoot!.querySelector<any>('ribbon-drawer[label="Packages"]')!
    const packageControls = packagesDrawer.shadowRoot.querySelector(".controls") as HTMLElement
    const search = packagesDrawer.querySelector("package-search")!
    if(packageControls.getBoundingClientRect().width > 0 && packagesDrawer.packageColumnCount > 1) {
      assert(search.getBoundingClientRect().width <= packageControls.getBoundingClientRect().width / packagesDrawer.packageColumnCount + 1,
        "package search spans the full drawer")
    }
    await snippets.updateComplete
    let chevron = snippets.shadowRoot.querySelector('[aria-label="Show more Snippets options"]')!
    assert(chevron, "empty Snippets item has no dropdown chevron")
    if(!snippetsBefore) {
      chevron.click()
      await snippets.updateComplete
      assert(snippets.shadowRoot.textContent.includes("Select something and click to store it here as a snippet to use later"), "empty Snippets dropdown has no hint")
      const hint = snippets.shadowRoot.querySelector(".snippet-empty-hint")!
      assert(frame.contentWindow!.getComputedStyle(hint).color === "rgb(100, 116, 139)", "snippet hint is not the standard hint grey")
      assert(Math.abs(snippets.shadowRoot.querySelector("ribbon-menu").getBoundingClientRect().width - 200) < 1, "empty Snippets menu does not match widget dropdown width")
      chevron.click()
      await snippets.updateComplete
    }
    const pin = snippets.shadowRoot.querySelector('[aria-label="Add snippet"]')!
    assert(pin, "Snippets has no dedicated add icon")
    pin.dispatchEvent(new MouseEvent("mouseenter"))
    for(let attempt = 0; !paragraph.classList.contains("◆snippet-hovered") && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(paragraph.classList.contains("◆snippet-hovered"), "snippet icon hover did not outline its text container")
    pin.dispatchEvent(new MouseEvent("mouseleave"))
    for(let attempt = 0; paragraph.classList.contains("◆snippet-hovered") && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(!paragraph.classList.contains("◆snippet-hovered"), "snippet icon exit retained the preview outline")
    pin.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, cancelable: true}))
    pin.click()
    for(let attempt = 0; (app as any).settings.userSnippets.length === snippetsBefore && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    const saved = (app as any).settings.userSnippets[0]
    assert(saved?.html.includes('>Second</p>') && !saved.html.includes("◆"), "pinning partial text did not save its full authored container")
    await app!.updateComplete
    await ribbon.updateComplete
    assert(snippets && ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Packages"] > ribbon-button') === snippets,
      "Snippets is not the first package item")
    for(const item of packagesDrawer.querySelectorAll('ribbon-button:not([slot="more"])')) {
      assert(item.getBoundingClientRect().bottom <= packageControls.getBoundingClientRect().bottom + 1, "saved snippets create an extra package row")
    }
    await snippets.updateComplete
    assert(snippets.submenuOpen, "Snippets save icon did not open its dropdown")
    paragraph.textContent = "Replace me"
    const replacement = doc.createRange(); replacement.selectNode(paragraph)
    doc.getSelection()!.removeAllRanges(); doc.getSelection()!.addRange(replacement)
    await layoutFrame()
    chevron = snippets.shadowRoot.querySelector('[aria-label="Show more Snippets options"]')!
    snippets.shadowRoot.querySelector(".main-button").click()
    await snippets.updateComplete
    assert(!snippets.submenuOpen, "Snippets label did not close the dropdown opened by saving")
    snippets.shadowRoot.querySelector(".main-button").click()
    await snippets.updateComplete
    const menu = snippets.shadowRoot.querySelector("ribbon-menu")!
    await menu.updateComplete
    assert(Math.abs(menu.getBoundingClientRect().width - 200) < 1, "Snippets menu does not match widget dropdown width")
    menu.shadowRoot.querySelector('[role="menuitem"]').click()
    for(let attempt = 0; doc.querySelector("#retained-selection")?.textContent !== "Second" && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(doc.querySelector("#retained-selection")?.textContent === "Second", "saved user snippet did not reinsert its HTML")
    await snippets.updateComplete
    if(!snippets.submenuOpen) chevron.click()
    await snippets.updateComplete
    const removalMenu = snippets.shadowRoot.querySelector("ribbon-menu")!
    await removalMenu.updateComplete
    const remove = removalMenu.shadowRoot.querySelector('.remove')!
    assert(remove, "saved snippet has no remove button")
    remove.click()
    for(let attempt = 0; (app as any).settings.userSnippets.length !== snippetsBefore && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert((app as any).settings.userSnippets.length === snippetsBefore, "removing a user snippet did not persist")
    await app!.updateComplete
    await ribbon.updateComplete
    await snippets.updateComplete
    assert(snippets.isConnected && snippets.shadowRoot.querySelector('[aria-label="Show more Snippets options"]'),
      "removing the last snippet removed its item or chevron")
    if(!snippetsBefore) {
      if(!snippets.submenuOpen) snippets.shadowRoot.querySelector('[aria-label="Show more Snippets options"]').click()
      await snippets.updateComplete
      assert(snippets.shadowRoot.textContent.includes("Select something and click to store it here as a snippet to use later"), "removing the last snippet did not restore the empty hint")
      snippets.closeSubmenu()
    }
    for(const mode of ["canvas", "slides"] as const) {
      root.querySelector("app-ribbon")!.dispatchEvent(new CustomEvent("app-settings-change", {
        detail: {...(app as any).settings, defaultLayout: mode}, bubbles: true, composed: true,
      }))
      ;(app as any).fileDirty = false
      await (app as any).newDocument()
      editingFrame = root.querySelector<HTMLIFrameElement>(".editor-frame")!
      assert(editingFrame.contentDocument!.body.classList.contains(`ww-${mode}`), `new document did not use the ${mode} default`)
      await new Promise(resolve => setTimeout(resolve, 100))
      assert(!(app as any).fileDirty && root.querySelector(".document-layouts-panel:not([inert])"), `new ${mode} document was not clean`)
    }
  }
  finally { frame.remove() }
})

await check("Harper checks English in a worker without authored DOM artifacts", async () => {
  const {DomEditor} = await import("../src/components/dom-editor")
  const host = new DomEditor()
  const {DomEditorToolbox} = await import("../src/components/toolbox")
  const toolbox = new DomEditorToolbox()
  const source = new DOMParser().parseFromString((host as unknown as {editorSrcdoc: string}).editorSrcdoc, "text/html")
  const policy = source.querySelector('meta[http-equiv="Content-Security-Policy"]')!.outerHTML
  const nonce = source.querySelector("script[nonce]")!.getAttribute("nonce")!
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:800px;height:500px"
  frame.srcdoc = `<!doctype html><html lang="en-US"><head>${policy}<script class="◆editor-only" nonce="${nonce}" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p>😀 This is te<!--keep--><em class="meaning">h</em> example.</p></body></html>`
  document.body.append(frame, toolbox)
  const update = (event: MessageEvent) => {
    if(event.source === frame.contentWindow && isProofreadingStateChangeMessage(event.data)) toolbox.proofreadingState = event.data.detail
  }
  window.addEventListener("message", update)
  try {
    for(let attempt = 0; !frame.contentWindow?.editor && !frame.contentWindow?.editorError && attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert(!frame.contentWindow?.editorError, frame.contentWindow?.editorError ?? "editor failed")
    const child = frame.contentWindow!.editor!
    assert(child, "iframe editor did not start")
    const doc = frame.contentDocument!, feature = child.features.proofreading
    const before = child.toHTML(true), shared = child.doc.body.toString()
    for(let attempt = 0; (!feature.state().ready || feature.state().checking) && !feature.state().error && attempt < 1500; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    const state = feature.state()
    assert(!state.error, state.error ?? "Harper failed")
    const issue = state.issues.find(issue => issue.text === "teh")
    assert(issue, `Harper missed the spelling error: ${JSON.stringify(state)}`)
    assert(issue!.start === "😀 This is ".length, "Harper span did not use DOM UTF-16 offsets")
    assert(child.toHTML(true) === before && child.doc.body.toString() === shared, "checking changed authored or shared content")
    assert(!doc.body.shadowRoot!.querySelector(".◆proofreading-panel"), "background loading opened review UI")
    const registry = (doc.defaultView as Window & typeof globalThis).CSS.highlights
    const highlight = registry.get("webwriter-spelling")!
    assert(highlight?.type === "spelling-error", "spelling ranges were not registered in the iframe")
    assert(Array.from(highlight).some(range => {
      const selected = doc.createRange()
      selected.setStart(range.startContainer, range.startOffset)
      selected.setEnd(range.endContainer, range.endOffset)
      return selected.toString() === "teh"
    }), `highlight did not cross inline formatting: ${JSON.stringify(Array.from(highlight).map(range => ({start: range.startOffset, end: range.endOffset, first: range.startContainer.textContent, last: range.endContainer.textContent})))}`)
    const childWindow = doc.defaultView as Window & typeof globalThis
    const issueRect = (Array.from(highlight)[0] as Range).getClientRects()[0]
    const hit = {clientX: issueRect.left + issueRect.width / 2, clientY: issueRect.top + issueRect.height / 2}
    const paragraph = doc.querySelector("p")!
    paragraph.dispatchEvent(new childWindow.PointerEvent("pointermove", {...hit, bubbles: true, composed: true}))
    assert(feature.state().hoveredIssueId === issue!.id, "hovering the underline did not identify its issue")
    toolbox.proofreadingState = feature.state()
    await toolbox.updateComplete
    const reviewIcon = toolbox.shadowRoot!.querySelector<HTMLElement>('[data-tool="Review"] .toolbox-tab-icon')!
    assert(getComputedStyle(reviewIcon).color === "rgb(198, 40, 40)", "closed Review icon did not match the spelling underline")
    toolbox.selectTool("Review")
    await toolbox.updateComplete
    assert(!toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Review"]'), "old Review buttons remain")
    const cards = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".proofreading-card"))
    const card = cards.find(card => card.querySelector(".proofreading-text")?.textContent === "teh")!
    const verifyCardFooter = (card: HTMLElement, view: Window) => {
      const footer = card.querySelector<HTMLElement>(".proofreading-actions")!
      const add = footer.querySelector<HTMLButtonElement>(".proofreading-add-word")!
      const ignore = footer.querySelector<HTMLButtonElement>(".proofreading-ignore")!
      assert(footer === card.lastElementChild && !footer.querySelector(".proofreading-suggestion"), "card actions are mixed with suggestions")
      const addRect = add.getBoundingClientRect(), ignoreRect = ignore.getBoundingClientRect()
      assert(Math.abs(addRect.top + addRect.height / 2 - ignoreRect.top - ignoreRect.height / 2) < 1
        && addRect.left < ignoreRect.left, `card actions do not share a left/right aligned footer: ${JSON.stringify({add: addRect.toJSON(), ignore: ignoreRect.toJSON()})}`)
      for(const button of [add, ignore]) {
        const style = view.getComputedStyle(button)
        assert(style.backgroundColor === "rgba(0, 0, 0, 0)" && style.borderTopWidth === "0px" && style.outlineStyle === "none", "card footer actions have resting outlines or backgrounds")
      }
    }
    verifyCardFooter(card, window)
    assert(card, "Review did not render Harper's issue card")
    assert(getComputedStyle(card).borderTopColor === "rgb(198, 40, 40)", "open Review did not highlight the hovered issue card")
    assert(getComputedStyle(reviewIcon).color !== "rgb(198, 40, 40)", "open Review still highlighted its icon")
    const rightClick = () => {
      const event = new childWindow.MouseEvent("contextmenu", {...hit, button: 2, bubbles: true, composed: true, cancelable: true})
      doc.elementFromPoint(hit.clientX, hit.clientY)!.dispatchEvent(event)
      return event
    }
    assert(rightClick().defaultPrevented, "right-clicking an issue did not open its suggestions")
    const popup = doc.body.shadowRoot!.querySelector<HTMLElement>(".◆proofreading-popup")!
    verifyCardFooter(popup.querySelector<HTMLElement>(".proofreading-card")!, childWindow)
    assert(childWindow.getComputedStyle(popup.querySelector(".proofreading-message")!).fontSize === getComputedStyle(card.querySelector(".proofreading-message")!).fontSize, "popup and sidebar cards do not share typography")
    assert(popup?.matches(":popover-open"), "suggestions popup did not use the appendix top layer")
    const popupRect = popup.getBoundingClientRect()
    assert(popupRect.width > 0 && popupRect.height > 0 && popupRect.right <= childWindow.innerWidth && popupRect.bottom <= childWindow.innerHeight, "suggestions popup overflowed the iframe")
    assert(Math.abs(popupRect.left - issueRect.left) < 1 && Math.abs(popupRect.top - (issueRect.bottom + 6)) < 1, "suggestions popup is not below the issue underline")
    assert(child.toHTML(true) === before && child.doc.body.toString() === shared, "suggestions popup added authored or shared artifacts")
    assert(rightClick().defaultPrevented, "repeated right-click did not reopen suggestions")
    const reopened = doc.body.shadowRoot!.querySelector<HTMLElement>(".◆proofreading-popup")!
    assert(reopened, "repeated right-click switched to the native menu")
    reopened.dispatchEvent(new childWindow.KeyboardEvent("keydown", {key: "Escape", bubbles: true, composed: true, cancelable: true}))
    toolbox.proofreadingState = {...state, checking: true}
    await toolbox.updateComplete
    assert(toolbox.shadowRoot!.querySelector(".proofreading-card") === card, "checking replaced an unchanged issue card")
    const heading = toolbox.shadowRoot!.querySelector<HTMLElement>(".proofreading-section h2")!
    const spinner = heading.querySelector<HTMLElement>(".proofreading-spinner")!
    assert(spinner?.getAttribute("aria-label") === "Checking spelling, grammar and style", "heading has no accessible checking spinner")
    assert(Math.abs(spinner.getBoundingClientRect().right - heading.getBoundingClientRect().right) < 1, "heading spinner is not aligned right")
    const recheck = feature.checkNow()
    assert(feature.state().issues.some(current => current.id === issue!.id), "rechecking removed the existing issue")
    assert(registry.get("webwriter-spelling") === highlight, "rechecking removed the existing underline")
    await recheck
    toolbox.proofreadingState = feature.state()
    await toolbox.updateComplete
    assert(toolbox.shadowRoot!.querySelector(".proofreading-card") === card, "rechecking replaced an unchanged issue card")
    assert(registry.get("webwriter-spelling") === highlight, "rechecking replaced unchanged highlights")
    assert(!heading.querySelector(".proofreading-spinner"), "checking spinner did not stop")
    const issueButton = card.querySelector<HTMLButtonElement>(".proofreading-issue")!
    const bridgeClick = async (button: HTMLButtonElement) => {
      const requestId = `proofreading-${crypto.randomUUID()}`
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error("proofreading card command timed out")) }, 5000)
        const reply = (event: MessageEvent) => {
          if(event.source !== frame.contentWindow || event.data?.detail?.requestId !== requestId) return
          if(event.data.type !== executeCompleteEvent && event.data.type !== executeFailureEvent) return
          cleanup()
          if(event.data.type === executeFailureEvent || event.data.detail.result !== true) reject(new Error("proofreading card command failed"))
          else resolve()
        }
        const action = (event: Event) => frame.contentWindow!.postMessage({
          ...(event as CustomEvent<ProofreadingAction>).detail, requestId, bridgeNonce: child.trustedScriptNonce,
        }, location.origin)
        const cleanup = () => {
          clearTimeout(timer)
          window.removeEventListener("message", reply)
          toolbox.removeEventListener("proofreading-action", action)
        }
        window.addEventListener("message", reply)
        toolbox.addEventListener("proofreading-action", action)
        button.click()
      })
    }
    await bridgeClick(issueButton)
    assert(doc.getSelection()!.toString() === "teh", "clicking the card did not select the document issue")
    assert(doc.defaultView!.getComputedStyle(doc.querySelector("p")!, "::highlight(webwriter-spelling)").textDecorationStyle === "wavy", "spelling underline has no wavy decoration")
    for(const element of [doc.documentElement, doc.body, doc.querySelector("p")!, doc.querySelector("em")!]) {
      for(const pseudo of ["::spelling-error", "::grammar-error"]) {
        assert(doc.defaultView!.getComputedStyle(element, pseudo).textDecorationLine === "none", "native proofreading added a second underline")
      }
    }
    const replacement = issue!.suggestions.findIndex(suggestion => suggestion.text === "the")
    assert(replacement >= 0, "Harper offered no correction")
    await bridgeClick(card.querySelectorAll<HTMLButtonElement>(".proofreading-suggestion")[replacement])
    await feature.checkNow()
    toolbox.proofreadingState = feature.state()
    await toolbox.updateComplete
    assert(!Array.from(toolbox.shadowRoot!.querySelectorAll(".proofreading-text")).some(element => element.textContent === "teh"), "accepted issue stayed in Review")
    assert(doc.querySelector("p")!.textContent === "😀 This is the example.", "correction changed unrelated text")
    assert(doc.querySelector("em.meaning") && doc.body.innerHTML.includes("<!--keep-->"), "correction removed formatting or comments")
    child.doc.undo()
    assert(child.toHTML(true) === before, "correction did not undo as one operation")
    await feature.checkNow()
    assert(rightClick().defaultPrevented, "right-click suggestions did not reopen after undo")
    const correction = Array.from(doc.body.shadowRoot!.querySelectorAll<HTMLButtonElement>(".◆proofreading-popup button")).find(button => button.textContent === "the")!
    assert(correction, "right-click popup offered no correction")
    correction.click()
    assert(doc.querySelector("p")!.textContent === "😀 This is the example.", "right-click correction did not apply")
    assert(!doc.body.shadowRoot!.querySelector(".◆proofreading-popup"), "right-click correction left its popup behind")
    child.doc.undo()
    assert(child.toHTML(true) === before, "right-click correction did not undo as one operation")
    await feature.checkNow()
    assert(rightClick().defaultPrevented, "right-click suggestions did not reopen before ignoring")
    const ignore = Array.from(doc.body.shadowRoot!.querySelectorAll<HTMLButtonElement>(".◆proofreading-popup button")).find(button => button.textContent === "Ignore")!
    ignore.click()
    assert(!rightClick().defaultPrevented, "ignoring the issue did not allow the native menu")
    await feature.checkNow()
    assert(!rightClick().defaultPrevented, "rechecking restored the ignored issue's popup")
    assert(child.toHTML(true) === before, "ignoring an issue changed the document")
    child.doc.redo()
    assert(doc.querySelector("p")!.textContent === "😀 This is the example.", "correction did not redo")
    // Copying the demo from another editor can turn every space into NBSP.
    // Check complete phrases without changing those authored spacing choices.
    const demo = [
      "There are some cases where the the standard grammar checkers don't cut it. That;s where Harper comes in handy.",
      "Harper is an language checker for developers. It can detect improper capitalization and misspellled words, as well as a number of other issues. Like if you break up words you shoul dn't. Harper can be an lifesaver when writing technical documents, emails or other formal forms of communication.",
      "Harper works everywhere, even when you're not online. Since your data never leaves your device, you don't ned too worry abuot us selling it or using it to train large language models.",
      "The best part: Harper can give you feedback instantly. For most documents, Harper can serve up suggestions in under 10 ms, faster that Grammarly.",
    ]
    feature.setChecking(false)
    doc.body.innerHTML = `<p><meta http-equiv="content-type" content="text/html; charset=utf-8"></p>${demo.map(text => `<p>${text.replaceAll(" ", "&nbsp;")}</p>`).join("")}`
    child.doc.syncFromDOM()
    const pasted = child.toHTML(true), pastedShared = child.doc.body.toString()
    feature.setChecking(true)
    await feature.checkNow()
    const pastedIssues = feature.state().issues
    assert(pastedIssues.length === 13, `NBSP demo lost findings: ${JSON.stringify(pastedIssues)}`)
    assert(pastedIssues.filter(issue => issue.kind === "grammar").length === 1, "NBSP demo lost grammar findings")
    assert(pastedIssues.filter(issue => issue.kind === "style").length === 7, "NBSP demo lost style findings")
    assert(pastedIssues.some(issue => issue.text === "shoul\u00a0dn't" && issue.kind === "style"), "split-word correction lost authored spacing")
    const repeated = pastedIssues.find(issue => issue.text === "the\u00a0the")!
    assert(repeated && feature.selectIssue(repeated.id) && doc.getSelection()!.toString() === "the\u00a0the", "normalized phrase offsets do not select the authored text")
    assert(registry.get("webwriter-grammar")?.size === 1, "NBSP grammar ranges are not painted")
    const styleHighlight = registry.get("webwriter-style")!
    assert(styleHighlight?.size === 7 && styleHighlight.type === "highlight", "style ranges are not painted")
    const styleDecoration = childWindow.getComputedStyle(doc.querySelectorAll("p")[2], "::highlight(webwriter-style)")
    assert(styleDecoration.textDecorationStyle === "wavy" && styleDecoration.textDecorationColor === "rgb(123, 63, 187)", "style underline is not purple and wavy")
    const styleRange = Array.from(styleHighlight).find(range => range.toString() === "an")! as Range
    const styleRect = styleRange.getBoundingClientRect()
    const styleEvent = new childWindow.MouseEvent("contextmenu", {clientX: styleRect.left + styleRect.width / 2,
      clientY: styleRect.top + styleRect.height / 2, button: 2, bubbles: true, composed: true, cancelable: true})
    doc.elementFromPoint(styleEvent.clientX, styleEvent.clientY)!.dispatchEvent(styleEvent)
    const stylePopup = doc.body.shadowRoot!.querySelector<HTMLElement>(".◆proofreading-popup")!
    assert(styleEvent.defaultPrevented && stylePopup.getAttribute("aria-label") === "Style suggestions", "style popup does not show the category")
    assert(!stylePopup.querySelector(".proofreading-add-word") && stylePopup.querySelector(".proofreading-actions") === stylePopup.querySelector(".proofreading-card")!.lastElementChild, "style popup has incorrect footer actions")
    stylePopup.dispatchEvent(new childWindow.KeyboardEvent("keydown", {key: "Escape", bubbles: true, composed: true, cancelable: true}))
    assert(child.toHTML(true) === pasted && child.doc.body.toString() === pastedShared, "checking normalized authored or shared HTML")
    child.doc.stopCapturing()
    assert(feature.applySuggestion(repeated.id, 0), "NBSP phrase correction failed")
    assert(doc.querySelectorAll("p")[1].textContent === demo[0].replace("the the", "the").replaceAll(" ", "\u00a0"), "correction changed unrelated NBSP characters")
    child.doc.undo()
    assert(child.toHTML(true) === pasted, "NBSP phrase correction did not undo")
    await feature.checkNow()
    const ignored = feature.state().issues.find(issue => issue.text === "an")!
    assert(feature.ignore(ignored.id), "could not ignore a style finding")
    const ignoredParagraph = doc.querySelectorAll("p")[2]
    const ignoredText = ignoredParagraph.firstChild as Text
    ignoredText.insertData(0, "For example, ")
    ignoredText.appendData(" More prose.")
    await feature.checkNow()
    assert(feature.state().issues.filter(issue => issue.text === "an").length === 1, "surrounding DOM edits restored the ignored occurrence")
    ignoredText.insertData(ignoredText.data.indexOf("an"), "an language checker. ")
    await feature.checkNow()
    assert(feature.state().issues.filter(issue => issue.text === "an").length === 2, `ignoring an occurrence suppressed newly inserted identical text: ${JSON.stringify(feature.state().issues)}`)
    const ignoredShared = (child.doc.body.toArray()[2] as Y.XmlElement).firstChild as Y.XmlText
    child.doc.doc.transact(() => { ignoredShared.insert(0, "Remote ") }, "remote-peer")
    await feature.checkNow()
    assert(feature.state().issues.filter(issue => issue.text === "an").length === 2, "remote prose edits restored the ignored occurrence")
    assert(ignoredParagraph.textContent!.startsWith("Remote For example, "), "remote edit did not reach the ignored paragraph")
    child.doc.doc.transact(() => { ignoredShared.insert(ignoredText.data.indexOf("an\u00a0language"), "an language checker. ") }, "remote-peer")
    await feature.checkNow()
    assert(feature.state().issues.filter(issue => issue.text === "an").length === 3, "ignoring an occurrence suppressed identical text inserted remotely")
    child.destroy()
    assert(!registry.has("webwriter-style"), "style underlines leaked on teardown")
    assert(!registry.has("webwriter-spelling") && !doc.body.shadowRoot!.querySelector(".◆proofreading-panel"), "proofreading leaked on teardown")
  }
  finally { window.removeEventListener("message", update); frame.contentWindow?.editor?.destroy(); frame.remove(); toolbox.remove() }
})

const failed = checks.filter(item => item.error)
document.querySelector("#status")!.textContent = `${checks.length - failed.length} passed, ${failed.length} failed`
document.querySelector("#report")!.textContent = JSON.stringify(checks, null, 2)
document.documentElement.dataset.nativeStatus = failed.length ? "failed" : "passed"
if(new URLSearchParams(location.search).has("run")) {
  await fetch("/__native-result", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({checks})})
}
