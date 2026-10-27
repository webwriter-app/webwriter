import type {DOMEditor} from "../src/domeditor"
import {graphicShapeDragType} from "../src/graphic"
import {replayHostDrag} from "../src/editor-bridge"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

export async function checkGraphicKeyboardDrag() {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1000px;height:650px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
  try {
    for(let attempt=0; !view.editor && !view.editorError && attempt<250; attempt++) await new Promise(resolve => setTimeout(resolve,20))
    assert(view.editor,view.editorError ?? "Keyboard drag fixture did not initialize")
    const editor=view.editor!, doc=frame.contentDocument!
    const layout=async () => {
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    }
    doc.body.innerHTML='<svg id="captured" viewBox="0 0 500 220" style="display:inline-block;width:500px;height:220px;vertical-align:top"><!--keep--><g><rect x="80" y="60" width="100" height="100" fill="skyblue"/></g><rect id="overflow" x="800" y="40" width="20" height="20"/></svg><svg id="other" viewBox="0 0 200 220" style="display:inline-block;width:200px;height:220px;vertical-align:top"><rect x="50" y="50" width="100" height="100"/></svg><p>Outside the graphic</p>'
    const graphic=doc.querySelector<SVGSVGElement>("#captured")!, other=doc.querySelector<SVGSVGElement>("#other")!, paragraph=doc.querySelector("p")!
    editor.features.selection.captureElement(graphic)
    await layout()
    const original=editor.toHTML(true), selection=doc.getSelection()!, anchor=selection.anchorNode, offset=selection.anchorOffset
    const data={[graphicShapeDragType]:JSON.stringify({shape:"ellipse",paint:{fill:"#fbbf24",stroke:"#334155"}})}
    const center=(element:Element) => {const box=element.getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2}}
    const retain=() => {
      assert(editor.features.selection.captureSelectedElement===graphic,"shape drag released or changed capture")
      assert(selection.anchorNode===anchor && selection.anchorOffset===offset,"shape hover changed native selection")
      assert(!doc.body.classList.contains("◆drop-selection-active") && !editor.appendix.querySelector("#◆float-drop-preview"),"shape drag displayed document insertion chrome")
    }
    for(const zoom of [100,150,75]) {
      editor.features.graphic.actions.navigateGraphic({type:"navigateGraphic",operation:"set-zoom",zoom})
      await layout()
      for(const target of [paragraph,other,graphic.querySelector("#overflow")!]) {
        const point=center(target)
        for(const event of ["dragover","drop"] as const) {
          const transfer=new view.DataTransfer()
          transfer.setData(graphicShapeDragType,data[graphicShapeDragType])
          const drag=new view.DragEvent(event,{bubbles:true,cancelable:true,composed:true,clientX:point.x,clientY:point.y,dataTransfer:transfer})
          target.dispatchEvent(drag)
          await layout()
          assert(drag.defaultPrevented && transfer.dropEffect==="none",`${zoom}: outside shape drop was accepted`)
          assert(editor.toHTML(true)===original,"outside shape drop changed authored content")
          retain()
        }
      }
      replayHostDrag({event:"dragleave",x:0,y:0,data},doc)
      await layout()
      retain()
    }
    const point=center(graphic)
    assert(replayHostDrag({event:"dragover",...point,data},doc),"relayed hover was not handled")
    await layout()
    retain()
    editor.doc.stopCapturing()
    assert(replayHostDrag({event:"drop",...point,data},doc),"relayed drop was not handled")
    await layout()
    const ellipse=graphic.querySelector("ellipse")!
    assert(ellipse?.getAttribute("fill")==="#fbbf24","shape did not land in captured graphic with paint")
    assert(editor.features.graphic.selectedShape===ellipse && editor.features.selection.captureSelectedElement===graphic,"inserted shape was not selected inside capture")
    assert(!other.querySelector("ellipse") && doc.querySelectorAll("svg").length===2,"drop inserted a new or other graphic")
    editor.doc.undo();await layout()
    assert(!graphic.querySelector("ellipse"),"drop undo failed")
    editor.doc.redo();await layout()
    assert(graphic.querySelector("ellipse"),"drop redo failed")
    editor.features.selection.selectElement(graphic)
    await layout()
    const uncaptured=editor.toHTML(true)
    replayHostDrag({event:"dragover",...point,data},doc)
    replayHostDrag({event:"drop",...point,data},doc)
    await layout()
    assert(!editor.features.selection.captureSelectedElement && editor.toHTML(true)===uncaptured,"hover acquired capture or inserted into an uncaptured graphic")
    assert(!editor.toHTML(true).includes("◆"),"shape drag serialized editing artifacts")
  }
  finally {view.editor?.destroy();frame.remove()}
}
