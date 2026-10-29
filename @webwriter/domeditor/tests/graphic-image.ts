import type {DOMEditor} from "../src/domeditor"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

export async function checkGraphicImage() {
  for(const layout of ["document", "slides"] as const) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:900px;height:650px;border:0;max-width:none"
    frame.srcdoc = '<!doctype html><body><p>Before</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
    document.body.append(frame)
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
    try {
      for(let attempt = 0; !view.editor && !view.editorError && attempt < 250; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
      assert(view.editor, view.editorError ?? "Image fixture did not initialize")
      const editor = view.editor!, doc = frame.contentDocument!
      const settle = () => new Promise(resolve => setTimeout(resolve, 100))
      if(layout === "slides") assert(editor.setDocumentLayout("slides", "document"), "Slide conversion failed")
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
    finally { view.editor?.destroy(); frame.remove() }
  }
}
