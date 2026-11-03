import type {DOMEditor} from "../src/domeditor"
import type {RibbonDropPosition} from "../src/editor-bridge"

type HostEditor = Pick<DOMEditor, "addAppendix">
type Assert = (condition: unknown, message: string) => void

/** Native end-to-end coverage for caret-positioned ribbon snippets and freeform drops. */
export async function checkRibbonSnippetDrop(nativeRootEditor: HostEditor, assert: Assert, layoutFrame: () => Promise<void>) {
  for(const mode of ["document", "canvas", "slides"] as const) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:900px;height:600px"
    frame.srcdoc = '<!doctype html><head><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><p>before after</p></body>'
    nativeRootEditor.addAppendix(frame)
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
      let message: {position: RibbonDropPosition} | undefined
      editor.postHostMessage = data => {
        if((data as {type?: string}).type === "editor-ribbon-drop") message = data as typeof message
      }
      const data = new DataTransfer()
      data.setData("application/x-webwriter-ribbon-insertion", "user-snippet:saved")
      const surface = mode === "canvas" ? editor.appendix.querySelector<HTMLSlotElement>("slot:not([name])")! : paragraph
      const init = {dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true}
      const over = new DragEvent("dragover", init)
      const selectionFeature = editor.features.selection
      surface.dispatchEvent(over)
      assert(over.defaultPrevented, "ribbon insertion drag was not accepted")
      if(mode === "document") {
        const selection = doc.getSelection()
        if(selection?.anchorNode !== paragraph.firstChild || selection.anchorOffset !== 7) {
          assert(false, `moving drop caret is absent (expected Text@7, got ${selection?.anchorNode?.nodeName}@${selection?.anchorOffset}; ${paragraph.outerHTML})`)
        }
      }
      surface.dispatchEvent(new DragEvent("drop", init))
      assert(message, "ribbon drop did not request insertion")
      const html = mode === "document" ? '<em>inserted </em>' : '<p style="width:120px;height:60px;margin:0">Saved <b>snippet</b><!--keep--></p>'
      const insertedSuccessfully = await editor.features.manipulation.actions.insertRibbonDrop({type: "insertRibbonDrop", html, position: message!.position})
      assert(insertedSuccessfully, `drop insertion failed ${JSON.stringify({mode, position: message!.position, selection: {
        node: doc.getSelection()?.anchorNode?.nodeName, offset: doc.getSelection()?.anchorOffset}, html: paragraph.outerHTML})}`)
      await layoutFrame()
      if(mode === "document") assert(paragraph.textContent === "before inserted after", "drop did not insert at the moving caret")
      else {
        const inserted = target.lastElementChild as HTMLElement, box = inserted.getBoundingClientRect()
        assert(Math.abs(box.left + box.width / 2 - x) < 1 && Math.abs(box.top + box.height / 2 - y) < 1, "drop is not centered at pointer coordinates")
        assert(inserted.innerHTML.includes("<!--keep-->"), "drop lost nested snippet content")
        for(const action of ["insert-graphic-shape:rectangle", "insert-math:frac", "list-style:ol:lower-alpha"]) {
          for(const graphic of target.querySelectorAll<SVGSVGElement>(":scope > svg")) graphic.style.left = `${parseFloat(graphic.style.left) + 1000}px`
          range.selectNodeContents(target); range.collapse(false)
          editor.features.selection.selectDropRange(range, {scrollIntoView: false})
          data.setData("application/x-webwriter-ribbon-insertion", action)
          surface.dispatchEvent(new DragEvent("drop", init))
          await layoutFrame()
          const root = target.lastElementChild as HTMLElement, box = root.getBoundingClientRect()
          assert(Math.abs(box.left + box.width / 2 - x) < 1 && Math.abs(box.top + box.height / 2 - y) < 1,
            `${mode}: ${action} is not centered (${box.left + box.width / 2}, ${box.top + box.height / 2} vs ${x}, ${y}; ${root.outerHTML})`)
          assert(action.startsWith("insert-graphic") ? root.localName === "svg" : action.startsWith("insert-math") ? root.querySelector("mfrac") : root.localName === "ol",
            `${action} did not create its element`)
          if(action.startsWith("insert-graphic")) assert(doc.getSelection()?.toString() === "" && root.parentNode === doc.getSelection()?.anchorNode, "shape drop lost its element selection")
          else assert(root.contains(doc.getSelection()?.anchorNode ?? null) && doc.getSelection()?.isCollapsed,
            `${action} lost its editing caret while centering: ${root.outerHTML}; ${doc.getSelection()?.anchorNode?.nodeName}@${doc.getSelection()?.anchorOffset}, collapsed=${doc.getSelection()?.isCollapsed}`)
        }
        for(const tag of ["table", "details", "h2", "math", "svg"]) {
          for(const graphic of target.querySelectorAll<SVGSVGElement>(":scope > svg")) graphic.style.left = `${parseFloat(graphic.style.left) + 1000}px`
          range.selectNodeContents(target); range.collapse(false)
          editor.features.selection.selectDropRange(range, {scrollIntoView: false})
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
        if(mode !== "document") {
          for(const graphic of target.querySelectorAll<SVGSVGElement>(":scope > svg")) graphic.style.left = `${parseFloat(graphic.style.left) + 1000}px`
          range.selectNodeContents(target); range.collapse(false)
          editor.features.selection.selectDropRange(range, {scrollIntoView: false})
        }
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
}
