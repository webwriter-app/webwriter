import type {DOMEditor} from "../src/domeditor"

/** Converted lists and empty middle items stay editable through Backspace. */
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
    const key = async (key: string) => {
      const event = new view.KeyboardEvent("keydown", {key, bubbles: true, cancelable: true})
      doc.dispatchEvent(event)
      assert(event.defaultPrevented, `${key} was not handled`)
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
      assert(selection.anchorNode?.isConnected, `${key} lost its live editing point`)
    }
    for(const type of ["ul", "ol"] as const) {
      doc.body.innerHTML = "<p>One</p><p>Two</p><p>Three</p>"
      selection.setBaseAndExtent(doc.body, 0, doc.body, 3)
      editor.features.list.toggleList(type)
      const list = doc.querySelector(type)!
      const initialItems = Array.from(list.children)
      // Ordinary paragraphs are flattened onto the new list item during
      // conversion, so continue from the text node in the live li structure.
      const text = initialItems[2].firstChild!
      selection.collapse(text, text.textContent!.length)
      for(let index = initialItems.length - 1; index >= 0; index--) {
        for(let length = list.children[index].textContent!.length; length > 0; length--) {
          // Selection.modify can first traverse the element boundary at the
          // preceding item's end before extending over its last character.
          for(let attempt = 0; list.children[index].textContent!.length === length && attempt < 3; attempt++) {
            await key("Backspace")
            assert(list.children[index].contains(selection.anchorNode), `${type}: text deletion escaped its item`)
          }
          assert(list.children[index].textContent!.length === length - 1,
            `${type}: item ${index}, length ${length}: repeated Backspace left ${list.children[index].outerHTML}; caret=${selection.anchorNode?.nodeName}:${selection.anchorOffset}`)
        }
        const emptyItem = list.children[index]
        assert(emptyItem.childNodes.length === 0 && selection.anchorNode === emptyItem,
          `${type}: removing empty item content escaped the live item; caret=${selection.anchorNode?.nodeName}:${selection.anchorOffset}`)
        await key("Backspace")
        assert(!emptyItem.isConnected && list.children.length === index, `${type}: Backspace did not remove the empty bullet`)
        if(index) assert(selection.anchorNode === list.children[index - 1], `${type}: Backspace did not return to the preceding item`)
      }
      await key("Backspace")
      assert(!list.isConnected, `${type}: Backspace did not exit the empty list`)
      assert(!editor.toHTML(true).includes("◆"), "list deletion leaked editor markers")
    }

    doc.body.innerHTML = "<ul><li>A</li><li>B</li><li>C</li></ul>"
    const list = doc.querySelector("ul")!
    const [first, middle, last] = Array.from(list.children)
    selection.collapse(middle.firstChild!, 1)
    await key("Backspace")
    assert(selection.anchorNode === middle && middle.childNodes.length === 0, "Backspace left the middle item while deleting its text")
    await key("Backspace")
    assert(doc.body.firstElementChild === list && list.children.length === 2 && list.lastElementChild === last,
      "Deleting an empty middle item split the original list")
    assert(selection.anchorNode === first, "Backspace did not return to the preceding item")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
}
