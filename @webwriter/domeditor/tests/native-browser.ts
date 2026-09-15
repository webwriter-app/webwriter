type Check = {name: string, error?: string}
import {DOMEditor} from "../src/domeditor"
import type {DomEditor} from "../src/components/dom-editor"
import {$} from "../src/utility"
import {defaultDocumentTheme} from "../src/document-themes"

const checks: Check[] = []
const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const check = async (name: string, run: () => void | Promise<void>) => {
  try { await run(); checks.push({name}) }
  catch(error) { checks.push({name, error: String(error)}) }
}
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
const fixture = document.querySelector<HTMLElement>("#fixture")!
const layoutFrame = async () => { await nextFrame(); await nextFrame() }

const dragTextInside = (editor: DOMEditor, element: HTMLElement) => {
  const doc = element.ownerDocument, text = element.firstChild!, range = doc.createRange()
  editor.features.selection.selectElement(element)
  assert(!editor.appendix.querySelector('[part="node-drag-surface"]'), "item interior is covered by a node drag surface")
  range.setStart(text, 1); range.collapse(true)
  const start = range.getBoundingClientRect()
  range.setStart(text, 7)
  const end = range.getBoundingClientRect(), y = start.top + start.height / 2
  const hit = doc.elementFromPoint(start.left, y)!
  assert(element === hit || element.contains(hit), "item interior is covered by an overlay")
  const style = element.getAttribute("style")
  hit.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, pointerId: 19, clientX: start.left, clientY: y}))
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
  assert(getComputedStyle(slot).caretColor !== "rgba(0, 0, 0, 0)", "native formula caret is hidden")
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
      const formula = math.getBoundingClientRect()
      assert(caret.height >= fontSize, `formula boundary caret ignored ${fontSize}px paragraph text: ${caret.height}px`)
      assert(Math.abs(caret.top + caret.height / 2 - formula.top - formula.height / 2) < 1, "formula boundary caret is not vertically centered")
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
  assert(widget.getAttribute("contenteditable") === "true", "editor did not mark widget host as editable boundary")
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
    $.selectRange(fixture, fixture.childNodes.length)
    editor.features.selection.processSelection()
    const inserted = editor.features.layout.actions.insertLayout({type: "insertLayout", preset: "two-columns"})
    assert(inserted === true, "layout insertion was rejected at a valid caret")
    await layoutFrame()
    const section = fixture.querySelector<HTMLElement>("section")
    assert(section, "layout insertion did not create a section")
    assert(editor.features.selection.selectedSectionElement === section, "inserted layout lost its explicit section selection")
    assert(editor.features.layout.getState()?.kind === "grid", "inserted layout did not retain grid state")
    assert(editor.appendix.querySelector<HTMLElement>(".◆layout-overlay")?.hidden === false, "inserted layout overlay was not retained")
  }
  finally {
    fixture.querySelectorAll("section").forEach(section => section.remove())
    paragraph.remove()
    editor.features.selection.clearSelectedSection()
  }
})

await check("layout presets create direct paragraph children", async () => {
  const paragraph = document.createElement("p")
  paragraph.textContent = "preset insertion"
  fixture.append(paragraph)
  try {
    $.selectRange(fixture, fixture.childNodes.length)
    editor.features.selection.processSelection()
    const inserted = editor.features.layout.actions.insertLayout({type: "insertLayout", preset: "two-columns"})
    assert(inserted === true, "layout preset insertion was rejected at a valid caret")
    const section = fixture.querySelector<HTMLElement>("section")
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
    fixture.querySelectorAll("section").forEach(section => section.remove())
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
  editor.features.transformation.handleScaleDrag(new MouseEvent("mousemove", {buttons: 1, clientX: x + 180, clientY: y + 180}))
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
    dragTextInside(editor, paragraph)
    const selectedText = getSelection()!.toString()
    const resizeBefore = paragraph.getBoundingClientRect()
    const resizer = editor.features.transformation.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    resizer.addEventListener("mousedown", event => editor.features.transformation.handleScaleStart(event), {once: true})
    resizer.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: resizeBefore.right, clientY: resizeBefore.bottom}))
    editor.features.transformation.handleScaleDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: resizeBefore.right + 120, clientY: resizeBefore.bottom + 60}))
    editor.features.transformation.handleScaleEnd()
    const resizeAfter = paragraph.getBoundingClientRect()
    assert(Math.abs(resizeAfter.width - resizeBefore.width - 120) < 1
      && Math.abs(resizeAfter.height - resizeBefore.height - 60) < 1, "zoomed canvas resize did not grow the rendered item")
    assert(Math.abs(resizeAfter.left - resizeBefore.left) < 1 && Math.abs(resizeAfter.top - resizeBefore.top) < 1, "canvas resize moved its opposite corner")
    assert(getSelection()!.toString() === selectedText, "resizing a canvas item replaced its inner text selection")
    const mover = editor.features.transformation.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
    mover.addEventListener("mousedown", event => editor.features.transformation.handleMoveStart(event), {once: true})
    mover.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: 200, clientY: 200}))
    editor.features.transformation.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: 320, clientY: 200}))
    editor.features.transformation.handleMoveEnd()
    assert(getSelection()!.toString() === selectedText && !getSelection()!.isCollapsed, "moving an item replaced its inner text selection")
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
    const exported = new DOMParser().parseFromString(editor.toHTML(), "text/html")
    assert(exported.body.classList.contains("ww-canvas") && !exported.body.outerHTML.includes("canvas-controls")
      && !exported.documentElement.classList.contains("◆canvas-active"), "serialization mixed camera and authored layout")
  }
  finally {
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "document", expectedMode: "canvas"})
    paragraph.remove(); rotated.remove()
  }
})

await check("canvas paragraphs split into separate positioned items and conversion returns normal flow", async () => {
  const paragraph = document.createElement("p")
  paragraph.textContent = "FirstSecond"
  document.body.append(paragraph)
  let next: Element | null = null
  try {
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"})
    paragraph.style.left = "120px"; paragraph.style.top = "100px"; paragraph.style.margin = "0px"
    $.move(paragraph.firstChild!, 5)
    editor.features.manipulation.insert()
    next = paragraph.nextElementSibling
    assert(paragraph.textContent === "First" && next?.textContent === "Second", "canvas Enter did not split text")
    assert(getComputedStyle(next!).position === "absolute", "continuation is not a canvas item")
    assert(next!.getBoundingClientRect().top >= paragraph.getBoundingClientRect().bottom, "canvas continuation overlaps its source")
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "document", expectedMode: "canvas"})
    assert(getComputedStyle(paragraph).position === "static" && getComputedStyle(next!).position === "static", "document conversion retained absolute placement")
    assert(!document.documentElement.classList.contains("◆canvas-active"), "document conversion retained camera marker")
  }
  finally {
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "document", expectedMode: "canvas"})
    paragraph.remove(); next?.remove()
  }
})


let savedCanvasHTML = ""
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
    assert(doc.getSelection()?.anchorNode === paragraph && canvasEditor.features.transformation.target === paragraph, "moving the initial item loses its editing selection")
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
    const slot = appendix.querySelector("slot")!
    const before = slot.style.transform
    appendix.querySelector<HTMLButtonElement>('button[name="zoom-in"]')!.click()
    assert(slot.style.transform !== before && appendix.querySelector("output")!.textContent === "120%", "reader zoom control did not move the camera")
    const zoomed = slot.style.transform
    slot.dispatchEvent(new WheelEvent("wheel", {bubbles: true, composed: true, cancelable: true, deltaY: 100}))
    assert(slot.style.transform !== zoomed, "reader did not pan with the wheel")
    assert(item.outerHTML === original, "reader changed authored placement")
    assert(!appendix.querySelector('button[name="text"]'), "reader exposes editing controls")
    assert(view.getComputedStyle(doc.documentElement).overflow === "clip", "reader viewport is not clipped")
    doc.body.classList.remove("ww-canvas")
    await new Promise(resolve => setTimeout(resolve, 0))
    assert(!appendix.querySelector("[part=canvas-controls]") && !doc.documentElement.classList.contains("◆canvas-active"), "reader did not clean up after a mode change")
  }
  finally { frame.remove() }
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
    assert(Math.abs(slideRect.top - (frame.clientHeight - slideRect.height) / 2) < 1 && Math.abs(slideRect.left) < 1, "slide is not vertically centered")
    const headingRect = second.querySelector("h1")!.getBoundingClientRect(), paragraphRect = second.querySelector("p")!.getBoundingClientRect()
    for(const item of [second.querySelector("h1")!, second.querySelector("p")!]) {
      assert(getComputedStyle(item).position === "absolute" && (item as HTMLElement).offsetParent === second, "slide box is not positioned relative to the slide")
    }
    assert(Math.abs(headingRect.left - paragraphRect.left) < 1 && Math.abs(headingRect.width - paragraphRect.width) < 1
      && paragraphRect.top > headingRect.bottom && Math.abs(paragraphRect.bottom - (slideRect.bottom - 20)) < 1, "slide preset boxes are not aligned or do not fill the slide")
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
    slideEditor.features.selection.selectElement(presetHeading)
    const mover = slideEditor.features.transformation.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
    mover.addEventListener("mousedown", event => slideEditor.features.transformation.handleMoveStart(event), {once: true})
    mover.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, composed: true, button: 0, clientX: 200, clientY: 200}))
    slideEditor.features.transformation.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: 212, clientY: 208}))
    slideEditor.features.transformation.handleMoveEnd()
    const afterMove = presetHeading.getBoundingClientRect()
    assert(Math.abs(afterMove.left - beforeMove.left - 12) < 1 && Math.abs(afterMove.top - beforeMove.top - 8) < 1
      && Math.abs(afterMove.width - beforeMove.width) < 1 && Math.abs(afterMove.height - beforeMove.height) < 1, "moving a slide text box changes its size or uses the wrong origin")
    presetText.textContent = "BeforeAfter"
    doc.getSelection()!.setBaseAndExtent(presetText.firstChild!, 6, presetText.firstChild!, 6)
    slideEditor.features.manipulation.insert()
    const continuation = presetText.nextElementSibling as HTMLElement
    assert(continuation.matches("p") && continuation.textContent === "After", "preset paragraph cannot be split")
    assert(continuation.offsetParent === third && continuation.getBoundingClientRect().top >= presetText.getBoundingClientRect().bottom
      && continuation.getBoundingClientRect().bottom <= third.getBoundingClientRect().bottom, "split text boxes overlap or leave the slide")
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

editor.destroy()

await check("bottom template cards retain native editing focus after rendering", async () => {
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
      if(editingFrame?.contentDocument?.designMode === "on") break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(app && editingFrame?.contentDocument?.designMode === "on", "app editor did not initialize")
    await (app as any).waitForEditorWindow()
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
    assert(root.querySelector(".templates-panel:not([inert])"), "automatic startup changes dismissed Templates")
    resource.remove()
    editingFrame!.focus()
    for(const mode of ["canvas", "slides", "document", "slides", "canvas", "document"]) {
      await app!.updateComplete
      const card = root.querySelector<HTMLButtonElement>(`.templates-bar [data-mode="${mode}"]`)!
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
      assert(root.querySelector(".templates-panel:not([inert])"), `${mode} conversion dismissed Templates`)
    }
    assert(doc.execCommand("insertText", false, "x"), "editor was not ready for typing")
    await new Promise(resolve => setTimeout(resolve, 250))
    const panel = root.querySelector<HTMLElement>(".templates-panel")!
    assert(panel.inert && panel.getBoundingClientRect().height < 1, "first edit did not slide Templates out of view")
    assert(doc.hasFocus(), "dismissing Templates interrupted typing focus")
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
  }
  finally { frame.remove() }
})

const failed = checks.filter(item => item.error)
document.querySelector("#status")!.textContent = `${checks.length - failed.length} passed, ${failed.length} failed`
document.querySelector("#report")!.textContent = JSON.stringify(checks, null, 2)
document.documentElement.dataset.nativeStatus = failed.length ? "failed" : "passed"
if(new URLSearchParams(location.search).has("run")) {
  await fetch("/__native-result", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({checks})})
}
