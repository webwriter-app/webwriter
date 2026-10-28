import type {DOMEditor} from "../src/domeditor"
import {markStateChangeEvent, selectionChangeEvent} from "../src/editor-bridge"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

export async function checkGraphicText() {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:650px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
  let updates = 0
  const states: {type: string, detail: {canMark?: boolean, svgText?: boolean, graphic?: {capture?: boolean}}}[] = []
  const observe = (event: MessageEvent) => {
    if(event.source === view && [markStateChangeEvent, selectionChangeEvent].includes(event.data?.type)) {
      updates++
      states.push(event.data)
    }
  }
  window.addEventListener("message", observe)
  try {
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 250; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, view.editorError ?? "Shape text fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const settle = () => new Promise(resolve => setTimeout(resolve, 100))
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "square-rectangle"})
    const graphic = doc.querySelector("svg")!, shape = graphic.querySelector("path")!
    await settle()
    const idleUpdates = updates
    await settle()
    assert(updates - idleUpdates < 4, "SVG capture continuously republishes selection state")
    for(const activation of ["double-click", "Enter"]) {
      if(activation === "double-click") shape.dispatchEvent(new view.MouseEvent("dblclick", {bubbles: true, button: 0}))
      else doc.body.dispatchEvent(new view.KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
      const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
      assert(proxy && editor.features.graphic.isTextInputFocused, `${activation}: did not focus the label input`)
      const expected = activation === "double-click" ? "Shape text" : "Typed again"
      for(const key of expected) {
        proxy.dispatchEvent(new view.KeyboardEvent("keydown", {key, bubbles: true, cancelable: true}))
        assert(editor.features.graphic.isTextInputFocused, `${activation}: printable keydown moved focus`)
        doc.execCommand("insertText", false, key)
        assert(!graphic.contains(doc.getSelection()?.anchorNode ?? null), `${activation}: native input caret remained in the SVG`)
      }
      await settle()
      assert(graphic.querySelector("text")!.textContent === expected, `${activation}: native typing lost characters`)
      assert(editor.features.selection.captureSelectedElement === graphic, `${activation}: text entry lost capture`)
      const editingUpdates = updates
      await settle()
      assert(updates - editingUpdates < 4, `${activation}: label editing continuously republishes selection state`)
      proxy.dispatchEvent(new view.KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}))
      assert(!editor.appendix.querySelector(".◆graphic-label-input"), "Escape left the label proxy attached")
      assert(!graphic.querySelector(".◆graphic-text-editing"), "Escape left a text editing marker")
    }
    shape.dispatchEvent(new view.MouseEvent("dblclick", {bubbles: true, button: 0}))
    await settle()
    assert(editor.features.graphic.isTextInputFocused, "label did not reopen before blank-canvas dismissal")
    states.length = 0
    const box = graphic.getBoundingClientRect()
    graphic.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, pointerId: 9, clientX: box.left + 10, clientY: box.top + 10}))
    doc.dispatchEvent(new view.PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 9}))
    await settle()
    assert(editor.features.selection.captureSelectedElement === graphic, "dismissing a label lost graphic capture")
    assert(!editor.features.graphic.selectedShapes.length && !editor.features.graphic.textEditingRange,
      "blank-canvas dismissal retained a shape or label selection")
    const markStates = states.filter(state => state.type === markStateChangeEvent)
    assert(markStates.length && markStates.every(state => !state.detail.canMark || state.detail.svgText),
      "label dismissal temporarily reported document text formatting and would unmount the shape keyboard")
    assert(states.filter(state => state.type === selectionChangeEvent).every(state => state.detail.graphic?.capture),
      "label dismissal temporarily reported uncaptured graphic selection")
    const text=graphic.querySelector("text")!
    for(const surface of ["shape","outline","resize-se","rotate","port","graphic-resize"]) {
      text.dispatchEvent(new view.PointerEvent("pointerdown",{bubbles:true,cancelable:true,button:0,pointerId:7}))
      doc.dispatchEvent(new view.PointerEvent("pointerup",{bubbles:true,button:0,pointerId:7}))
      await settle()
      assert(editor.features.graphic.textEditingRange && editor.features.graphic.isTextInputFocused,`${surface}: clicking the label did not enter text selection`)
      const selected=editor.features.graphic.selectedShape!
      const outline=editor.appendix.querySelector<SVGPolygonElement>('[part="graphic-selection-outline"]')!
      const points=outline.points,first=points.getItem(0),second=points.getItem(1)
      const edge={x:first.x+(second.x-first.x)/4,y:first.y+(second.y-first.y)/4}
      assert(editor.appendix.elementFromPoint(edge.x,edge.y)===outline,`${surface}: transformation box edge is not clickable`)
      const target=surface==="shape" ? selected.querySelector("path")! : surface==="outline" ? outline
        : surface==="graphic-resize" ? editor.features.transformation.overlay.querySelector('[data-transform-mode="scale"]')!
        : editor.appendix.querySelector(surface==="port" ? '[data-graphic-port="n"]' : `[data-graphic-handle="${surface}"]`)!
      target.dispatchEvent(new view.PointerEvent("pointerdown",{bubbles:true,composed:true,cancelable:true,button:0,pointerId:8,clientX:edge.x,clientY:edge.y}))
      assert(editor.features.graphic.selectedShape===selected,`${surface}: clicking the shape controls lost shape selection`)
      assert(!editor.features.graphic.textEditingRange && !editor.features.graphic.isTextInputFocused,`${surface}: shape selection retained text selection`)
      assert(!editor.appendix.querySelector('.◆graphic-label-input, [part="graphic-text-caret"]'),`${surface}: shape selection left a label caret`)
      assert(!text.classList.contains("◆graphic-text-editing"),`${surface}: shape selection left its text editing marker`)
      doc.dispatchEvent(new view.PointerEvent("pointercancel",{bubbles:true,pointerId:8}))
      assert(editor.features.selection.captureSelectedElement===graphic,`${surface}: shape selection lost graphic capture`)
      assert(text.textContent==="Typed again",`${surface}: selecting the shape modified its label`)
    }
    assert(!editor.toHTML(true).includes("◆"), "Shape label serialized editing artifacts")
  }
  finally { window.removeEventListener("message", observe); view.editor?.destroy(); frame.remove() }
}
