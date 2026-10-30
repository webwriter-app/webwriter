import type {DOMEditor} from "../src/domeditor"
import {editorFrameControlMessage, initializeEditorMessage} from "../src/editor-bridge"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

export async function checkGraphicImage() {
  for(const layout of ["document", "slides", "board"] as const) {
    const frame = document.createElement("iframe")
    const nonce = "graphic-image-focus-regression"
    frame.style.cssText = "width:900px;height:650px;border:0;max-width:none"
    const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
    frame.srcdoc = '<!doctype html><body><p>Before</p><script class="◆editor-only" type="module" src="/src/editor-entry.ts"></script></body>'
    document.body.append(frame)
    await loaded
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
    view.postMessage({type: initializeEditorMessage, bridgeNonce: nonce, syncUrl: "ws://127.0.0.1:65534",
      proofreadingAllowed: false}, location.origin)
    // The isolated host replies asynchronously to authored pointerdown. Its
    // focus request can arrive after the image has opened its source input.
    const focusFromHost = (event: MessageEvent) => {
      if(event.source === view && event.data?.type === "editor-frame-pointerdown" && !event.data.appendix) {
        view.postMessage({type: editorFrameControlMessage, bridgeNonce: nonce, command: "focus"}, location.origin)
      }
    }
    window.addEventListener("message", focusFromHost)
    try {
      for(let attempt = 0; !view.editor && !view.editorError && attempt < 250; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
      assert(view.editor, view.editorError ?? "Image fixture did not initialize")
      const editor = view.editor!, doc = frame.contentDocument!
      const settle = () => new Promise(resolve => setTimeout(resolve, 100))
      if(layout !== "document") assert(editor.setDocumentLayout(layout, "document"), `${layout} conversion failed`)
      if(layout === "board") doc.getSelection()!.collapse(doc.querySelector(".ww-board-card > p")!, 0)
      editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "image"})
      const graphic = doc.querySelector("svg")!, image = graphic.querySelector("image")!
      const placeholder = editor.features.media.placeholder
      const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
      await settle()
      assert(editor.features.selection.captureSelectedElement === graphic, `${layout}: inserting an image lost graphic capture`)
      assert(editor.features.graphic.selectedShape === image, `${layout}: inserting an image lost shape selection`)
      assert(placeholder.target === image && placeholder.root.activeElement === input, `${layout}: image URL input lost focus`)
      const paragraph = doc.createElement("p")
      paragraph.textContent = "Outside the graphic"
      graphic.after(paragraph)
      doc.body.focus()
      doc.getSelection()!.collapse(paragraph.firstChild!, 1)
      await settle()
      assert(!editor.features.selection.captureSelectedElement, `${layout}: moving to document text retained capture`)
      assert(!image.classList.contains("◆graphic-shape-selected"), `${layout}: leaving the graphic retained the image marker`)
      const box = image.getBoundingClientRect()
      image.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, pointerId: 9,
        clientX: box.x + box.width / 2, clientY: box.y + box.height / 2}))
      doc.dispatchEvent(new view.PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 9}))
      await settle()
      assert(editor.features.graphic.selectedShape === image, `${layout}: reselecting an empty image lost selection`)
      assert(placeholder.target === image && placeholder.root.activeElement === input, `${layout}: reselecting an image lost its source input`)
      const source = `${location.origin}/tests/local-live-fixture/icon.svg`
      doc.execCommand("insertText", false, source)
      await settle()
      assert(input.value === source, `${layout}: native URL typing was interrupted`)
      assert(editor.features.graphic.selectedShape === image, `${layout}: URL typing deselected the image`)
      placeholder.root.querySelector<HTMLButtonElement>(".apply")!.click()
      await settle()
      assert(image.getAttribute("href") === source, `${layout}: image source was not applied`)
      assert(editor.features.selection.captureSelectedElement === graphic, `${layout}: applying the source lost capture`)
      assert(!editor.toHTML(true).includes("◆"), `${layout}: image controls serialized editing artifacts`)
    }
    finally { window.removeEventListener("message", focusFromHost); view.editor?.destroy(); frame.remove() }
  }
}
