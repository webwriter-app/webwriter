import type {DOMEditor} from "../src/domeditor"

/** #300: converted paragraphs must remain editable through repeated Backspace. */
export async function checkListDeletion() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  frame.srcdoc = '<!doctype html><body><p>Ready</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 400; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `list deletion fixture did not initialize: ${view.editorError ?? "timed out"}`)
    const editor = view.editor!, doc = frame.contentDocument!, selection = doc.getSelection()!
    const backspace = async () => {
      const event = new view.KeyboardEvent("keydown", {key: "Backspace", bubbles: true, cancelable: true})
      doc.dispatchEvent(event)
      assert(event.defaultPrevented, "Backspace was not handled")
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
      assert(selection.anchorNode?.isConnected, "Backspace lost its live editing point")
    }
    for(const type of ["ul", "ol"] as const) {
      doc.body.innerHTML = "<p>One</p><p>Two</p><p>Three</p>"
      selection.setBaseAndExtent(doc.body, 0, doc.body, 3)
      editor.features.list.toggleList(type)
      const list = doc.querySelector(type)!
      const items = Array.from(list.children)
      const text = items[2].querySelector("p")!.firstChild!
      selection.collapse(text, text.textContent!.length)
      for(let index = items.length - 1; index >= 0; index--) {
        const item = items[index]
        for(let length = item.textContent!.length; length > 0; length--) {
          // Selection.modify can first traverse the element boundary at the
          // preceding item's end before extending over its last character.
          for(let attempt = 0; item.textContent!.length === length && attempt < 3; attempt++) {
            await backspace()
            assert(item.contains(selection.anchorNode), `${type}: text deletion escaped its item`)
          }
          assert(item.textContent!.length === length - 1,
            `${type}: item ${index}, length ${length}: repeated Backspace left ${item.outerHTML}; caret=${selection.anchorNode?.nodeName}:${selection.anchorOffset}`)
        }
        await backspace()
        assert(item.childNodes.length === 0 && selection.anchorNode === item,
          `${type}: removing the empty paragraph escaped its list item`)
        await backspace()
        assert(!item.isConnected && list.children.length === index, `${type}: Backspace did not remove the empty bullet`)
        if(index) assert(selection.anchorNode === items[index - 1], `${type}: Backspace did not return to the preceding item`)
      }
      await backspace()
      assert(!list.isConnected, `${type}: Backspace did not exit the empty list`)
      assert(!editor.toHTML(true).includes("◆"), "list deletion leaked editor markers")
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
}
