import type {DOMEditor} from "../src/domeditor"

export async function checkFormulaPaste() {
  const frame = document.createElement("iframe")
  frame.srcdoc = '<!doctype html><body><p>Ready</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 400; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    if(!view.editor) throw new Error(`formula fixture did not initialize: ${view.editorError ?? "timed out"}`)
    const editor = view.editor, doc = frame.contentDocument!, selection = doc.getSelection()!
    for(const target of ["gap", "empty", "placeholder", "marked-placeholder", "marked-placeholder-after"]) {
      doc.body.innerHTML = target === "gap" ? '<p>hello</p>' : target === "empty" ? '<p>hello</p><p></p>' : target.startsWith("marked-placeholder") ? '<p>hello</p><p><br class="◆ ◆gap-before-selected"></p>' : '<p>hello</p><p><br></p>'
      const paragraph = doc.body.lastElementChild!
      selection.collapse(target === "gap" ? doc.body : paragraph, target === "gap" || target.endsWith("-after") ? 1 : 0)
      const data = new view.DataTransfer()
      data.setData("text/html", '<math><mrow><mfrac><mrow><mn>1</mn></mrow><mrow><mn>2</mn></mrow></mfrac></mrow></math>')
      const event = new view.ClipboardEvent("paste", {clipboardData: data, bubbles: true, cancelable: true})
      doc.dispatchEvent(event)
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
      const result = editor.toHTML(true)
      if(!event.defaultPrevented || doc.body.querySelector("br, slot") || !doc.body.querySelector('p > math[display="inline"]')) throw new Error(`${target}: ${result}; prevented=${event.defaultPrevented}`)
    }
    for(const target of ["gap", "new paragraph"]) for(const selectionKind of ["node", "contents"]) {
      doc.body.innerHTML = '<p>hello</p><p><math display="inline"><mrow><mfrac><mrow><mn>1</mn></mrow><mrow><mn>2</mn></mrow></mfrac></mrow></math></p>'
      const formula = doc.querySelector("math")!
      const range = doc.createRange()
      if(selectionKind === "node") range.selectNode(formula)
      else range.selectNodeContents(formula)
      selection.removeAllRanges(); selection.addRange(range)
      const data = new view.DataTransfer()
      const copy = new view.ClipboardEvent("copy", {clipboardData: data, bubbles: true, cancelable: true})
      doc.dispatchEvent(copy)
      if(!copy.defaultPrevented || !data.getData("text/html").includes("<math")) throw new Error(`whole formula copy failed: ${data.getData("text/html")}`)
      selection.collapse(doc.body, doc.body.childNodes.length)
      if(target === "new paragraph") editor.features.manipulation.insert()
      const paste = new view.ClipboardEvent("paste", {clipboardData: data, bubbles: true, cancelable: true})
      doc.dispatchEvent(paste)
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
      const result = editor.toHTML(true)
      const pasted = doc.body.lastElementChild!
      if(!paste.defaultPrevented || pasted.localName !== "p" || pasted.querySelector("br, slot") || !pasted.querySelector('math[display="inline"]')) {
        throw new Error(`copy ${selectionKind} and paste into ${target}: clipboard=${data.getData("text/html")}; result=${result}`)
      }
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
}
