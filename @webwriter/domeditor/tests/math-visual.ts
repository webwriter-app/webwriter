import {DOMEditor} from "../src/domeditor"
import {$} from "../src/utility"
import {mathElement, mathStructureOptions} from "../src/math"

type Box = {left: number, top: number, width: number, height: number}
type Position = {path: number[], offset: number, label: string}
export type MathVisualResult = {
  name: string, structure: string, errors: string[], source: string,
  caret: Box, character: Box, before: HTMLElement, after: HTMLElement,
  html: string, position: Position,
}
const box = (rect: DOMRect, origin: DOMRect): Box => ({left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height})
const tolerance = 1
const pathTo = (root: Node, node: Node): number[] => node === root ? [] : [...pathTo(root, node.parentNode!), Array.from(node.parentNode!.childNodes).indexOf(node as ChildNode)]
const atPath = (root: Node, path: number[]) => path.reduce((node, index) => node.childNodes[index], root)
const intersects = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerance
  && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tolerance
const guidesFor = (editor: DOMEditor) => Array.from(editor.appendix.querySelectorAll<HTMLElement>(".◆math-overlay > span"))
  .filter(element => element.style.borderStyle === "dashed")

function snapshot(editor: DOMEditor, math: Element, caret: Box, source: string) {
  const panel = document.createElement("div")
  panel.style.cssText = "position:relative;flex:0 0 280px;box-sizing:content-box;margin:8px;padding:12px;width:280px;overflow:hidden"
  panel.title = source
  const clone = math.cloneNode(true) as Element
  const originals = [math, ...math.querySelectorAll("*")]
  // Copy presentation into the appendix without freezing computed widths or
  // heights: those would change native MathML layout in the snapshot.
  const properties = ["font-family", "font-size", "font-style", "font-weight", "line-height", "math-style", "math-depth", "direction", "display", "box-sizing", "min-width", "min-height", "padding", "border-top", "border-bottom", "color", "background-color"]
  ;[clone, ...clone.querySelectorAll("*")].forEach((element, index) => {
    const style = getComputedStyle(originals[index])
    element.setAttribute("style", properties.map(key => `${key}:${style.getPropertyValue(key)}`).join(";"))
    element.removeAttribute("id")
  })
  panel.append(clone)
  const origin = math.getBoundingClientRect()
  guidesFor(editor).forEach(element => {
    const rect = box(element.getBoundingClientRect(), origin)
    const guide = document.createElement("span")
    guide.style.cssText = `position:absolute;border:1px dashed #64748b;box-sizing:border-box;left:${12 + rect.left}px;top:${12 + rect.top}px;width:${rect.width}px;height:${rect.height}px`
    panel.append(guide)
  })
  const line = document.createElement("span")
  line.style.cssText = `position:absolute;background:#e11d48;left:${12 + caret.left}px;top:${12 + caret.top}px;width:1px;height:${caret.height}px`
  panel.append(line)
  return panel
}

/** Real commands and browser layout, without mocked DOMRects. The reference
 * character is inserted only in this disposable test fixture. */
export async function auditMathVisuals(editor: DOMEditor, fixture: HTMLElement, snapshots = false) {
  const results: MathVisualResult[] = []
  const host = document.createElement("div")
  host.style.width = "280px"
  fixture.append(host)
  try {
    const templates = mathStructureOptions.map(option => {
      host.innerHTML = "<math><mrow></mrow></math>"
      $.move(host.querySelector("mrow")!, 0)
      if(!editor.features.math.execute(option.command)) throw new Error(`Cannot create ${option.title}`)
      const math = host.querySelector("math")!.cloneNode(true) as Element
      math.querySelectorAll("[class]").forEach(element => element.removeAttribute("class"))
      return {name: option.title, html: math.innerHTML}
    })
    templates.push(
      {name: "Square root", html: "<msqrt><mrow></mrow></msqrt>"},
      {name: "Subscript and superscript", html: "<msubsup><mrow></mrow><mrow></mrow><mrow></mrow></msubsup>"},
      {name: "Over", html: "<mover><mrow></mrow><mrow></mrow></mover>"},
      {name: "Under", html: "<munder><mrow></mrow><mrow></mrow></munder>"},
      {name: "Over and under", html: "<munderover><mrow></mrow><mrow></mrow><mrow></mrow></munderover>"},
      {name: "Nested fraction and root", html: "<mfrac><mroot><mrow></mrow><mrow></mrow></mroot><mfrac><mrow></mrow><mrow></mrow></mfrac></mfrac>"},
      {name: "Nested scripts", html: "<msup><mi>x</mi><msub><mrow></mrow><mrow></mrow></msub></msup>"},
    )
    for(const size of [16, 32]) for(const direction of ["ltr", "rtl"]) for(const display of ["inline", "block"]) for(const template of templates) {
      for(const filled of [false, true]) {
        host.innerHTML = `<math display="${display}" style="font-size:${size}px;direction:${direction}"><mrow>${template.html}<mi>z</mi></mrow></math>`
        const original = host.querySelector("math")!
        const positions: Position[] = []
        const add = (node: Node, offset: number, label: string) => positions.push({path: pathTo(original, node), offset, label})
        const slots = Array.from(original.querySelectorAll("mrow:empty, mtd:empty"))
        if(!slots.length) throw new Error(`${template.name} has no argument fixtures`)
        if(!filled) slots.forEach((slot, index) => add(slot, 0, `empty argument ${index + 1}`))
        else {
          slots.forEach(slot => slot.append(mathElement("mi", "xg")))
          original.querySelectorAll("mi, mn").forEach((token, index) => {
            if(token === original.lastElementChild!.lastElementChild) return
            for(let offset = 0; offset <= token.textContent!.length; offset++) add(token.firstChild!, offset, `token ${index + 1}, offset ${offset}`)
          })
          original.querySelectorAll("mrow").forEach((row, index) => {
            Array.from(row.children).forEach(child => {
              if(["mi", "mn", "mo", "mtext"].includes(child.localName)) return
              const offset = Array.from(row.childNodes).indexOf(child)
              add(row, offset, `row ${index + 1}, before ${child.localName}`)
              add(row, offset + 1, `row ${index + 1}, after ${child.localName}`)
            })
          })
        }
        const html = host.innerHTML
        for(const position of positions) {
          host.innerHTML = html
          const math = host.querySelector("math")!
          const node = atPath(math, position.path)
          $.move(node, position.offset)
          editor.features.math.refresh()
          const origin = math.getBoundingClientRect()
          const reference = math.lastElementChild!.lastElementChild!.getBoundingClientRect()
          const container = node instanceof Element ? node : node.parentElement!.parentElement!
          const containerBefore = container.getBoundingClientRect()
          const paddingBefore = parseFloat(getComputedStyle(container).paddingLeft) || 0
          const native = document.getSelection()!.getRangeAt(0).getBoundingClientRect()
          const painted = editor.appendix.querySelector<HTMLElement>(".◆math-overlay > span[style*='background:']")
          const source = painted ? "Editor overlay" : native.height ? "Native Range" : "Empty Range: slot bounds only (native caret needs visual inspection)"
          const caretRect = painted?.getBoundingClientRect() ?? (native.height ? native : (node instanceof Element ? node : node.parentElement!).getBoundingClientRect())
          const caret = box(caretRect, origin)
          const before = snapshots ? snapshot(editor, math, caret, source) : document.createElement("div")
          const errors: string[] = []
          if(position.label.startsWith("empty argument") && (caretRect.top < containerBefore.top - tolerance || caretRect.bottom > containerBefore.bottom + tolerance)) {
            errors.push("caret exceeds the current placeholder")
          }
          if(!painted && !native.height) errors.push("native caret bounds unavailable; slot geometry is shown as a diagnostic")
          const guides = guidesFor(editor)
          const reserved = Array.from(math.querySelectorAll(".◆math-slot"))
          if(guides.length !== reserved.length) errors.push(`expected ${reserved.length} placeholders, found ${guides.length}`)
          guides.forEach((guide, i) => {
            const rect = guide.getBoundingClientRect(), bounds = reserved[i]?.getBoundingClientRect()
            if(!rect.width || !rect.height) errors.push(`placeholder ${i + 1} has no area`)
            if(bounds && (rect.left < bounds.left - tolerance || rect.right > bounds.right + tolerance || rect.top < bounds.top - tolerance || rect.bottom > bounds.bottom + tolerance)) errors.push(`placeholder ${i + 1} exceeds its reserved slot`)
            guides.slice(i + 1).forEach((other, j) => {
              if(intersects(rect, other.getBoundingClientRect())) errors.push(`placeholders ${i + 1} and ${i + j + 2} overlap`)
            })
            math.querySelectorAll("mi, mn, mo, mtext").forEach(token => {
              if(intersects(rect, token.getBoundingClientRect())) errors.push(`placeholder ${i + 1} overlaps ${token.localName} ${token.textContent}`)
            })
          })
          if(!editor.features.math.execute("text:x")) throw new Error(`${template.name}: insertion failed at ${position.label}`)
          const selection = document.getSelection()!
          const text = selection.focusNode!
          if(!(text instanceof Text)) throw new Error(`${template.name}: insertion did not select text`)
          const characterRange = document.createRange()
          characterRange.setStart(text, selection.focusOffset - 1)
          characterRange.setEnd(text, selection.focusOffset)
          const characterRect = characterRange.getBoundingClientRect()
          const afterOrigin = math.getBoundingClientRect()
          const afterReference = math.lastElementChild!.lastElementChild!.getBoundingClientRect()
          const character = box(characterRect, afterOrigin)
          const characterStart = characterRange.cloneRange()
          characterStart.collapse(true)
          const expectedCaret = characterStart.getBoundingClientRect()
          const containerAfter = container.getBoundingClientRect()
          // Align the before/after formulas by their unchanged trailing token.
          // MathML can re-center a block formula and grow its ascent on typing.
          const emptyArgument = position.label.startsWith("empty argument")
          const expectedHeight = emptyArgument ? Math.min(characterRect.height, containerBefore.height) : characterRect.height
          const deltaY = emptyArgument ? caretRect.top - (containerBefore.top + (containerBefore.height - expectedHeight) / 2)
            : caretRect.top - reference.top - (characterRect.top - afterReference.top)
          const deltaHeight = caretRect.height - expectedHeight
          // Empty operator slots reserve extra space which disappears on typing.
          const paddingDelta = emptyArgument ? paddingBefore - (parseFloat(getComputedStyle(container).paddingLeft) || 0) : 0
          const deltaX = caretRect.left - containerBefore.left - (expectedCaret.left - containerAfter.left) - paddingDelta - (emptyArgument ? 1 : 0)
          if(Math.abs(deltaY) > tolerance || Math.abs(deltaHeight) > tolerance || Math.abs(deltaX) > tolerance) errors.push(`caret Δx=${deltaX.toFixed(2)}, Δy=${deltaY.toFixed(2)}, Δheight=${deltaHeight.toFixed(2)}px`)
          const name = `${template.name} · ${position.label} · ${size}px · ${direction} · ${display}`
          results.push({name, structure: template.name, errors, source, caret, character, before,
            after: snapshots ? snapshot(editor, math, {...character, left: expectedCaret.left - afterOrigin.left}, "Inserted x and reference caret") : document.createElement("div"), html, position})
        }
      }
      // Keep the interactive gallery responsive while constructing snapshots.
      if(snapshots) await new Promise<void>(resolve => setTimeout(resolve, 0))
    }
    return results
  }
  finally {
    host.remove()
    editor.features.math.refresh()
  }
}

export function selectMathVisualPosition(editor: DOMEditor, fixture: HTMLElement, result: MathVisualResult) {
  fixture.innerHTML = result.html
  const math = fixture.querySelector("math")!
  $.move(atPath(math, result.position.path), result.position.offset)
  editor.features.math.refresh()
}
