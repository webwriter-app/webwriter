import type {DOMEditor} from "../src/domeditor"
import {DomEditorToolbox} from "../src/components/toolbox"
import type {RibbonDrawer} from "../src/components/ribbon-drawer"
import {nodeDragType} from "../src/insertion"

/** #316: list Enter splitting and item indentation through native browser events. */
export async function checkListEditing() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  frame.srcdoc = '<!doctype html><body><p>Ready</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 400; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `list editing fixture did not initialize: ${view.editorError ?? "timed out"}`)
    const editor = view.editor!, doc = frame.contentDocument!, selection = doc.getSelection()!
    const waitForEdit = async () => new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    const enterCases = [
      {name: "direct li keydown", html: "<ul><li>OneTwo</li></ul>", kind: "keydown"},
      {name: "direct li beforeinput", html: "<ol><li>OneTwo</li></ol>", kind: "beforeinput"},
      {name: "converted p keydown", html: "<p>OneTwo</p>", kind: "keydown", convert: true},
      {name: "converted p beforeinput", html: "<p>OneTwo</p>", kind: "beforeinput", convert: true},
    ] as const
    for(const test of enterCases) {
      doc.body.innerHTML = test.html
      editor.doc.syncFromDOM(); editor.doc.stopCapturing()
      if("convert" in test && test.convert) {
        const paragraph = doc.querySelector("p")!
        selection.setBaseAndExtent(paragraph.parentNode!, Array.from(paragraph.parentNode!.childNodes).indexOf(paragraph),
          paragraph.parentNode!, Array.from(paragraph.parentNode!.childNodes).indexOf(paragraph) + 1)
        editor.features.list.toggleList("ul")
      }
      const text = doc.querySelector("li")?.querySelector("p")?.firstChild ?? doc.querySelector("li")?.firstChild ?? doc.querySelector("p")?.firstChild
      assert(text?.nodeType === Node.TEXT_NODE, `${test.name}: no text node at the caret target`)
      selection.collapse(text!, 3)
      const event = test.kind === "keydown"
        ? new view.KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true})
        : new view.InputEvent("beforeinput", {inputType: "insertParagraph", bubbles: true, cancelable: true})
      doc.dispatchEvent(event)
      assert(event.defaultPrevented, `${test.name}: Enter was not handled`)
      await waitForEdit()
      const list = doc.querySelector("ul, ol")!
      const items = Array.from(list.children)
      assert(items.length === 2, `${test.name}: Enter did not split into two direct list items: ${list.outerHTML}`)
      assert(items[0].textContent === "One" && items[1].textContent === "Two",
        `${test.name}: Enter split at the wrong point: ${list.outerHTML}`)
    }

    doc.body.innerHTML = "<ul><li id='lead'>Lead</li><li id='first'>First</li><li id='second'>Second</li><li id='tail'>Tail</li></ul>"
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    let list = doc.querySelector("ul")!
    const first = doc.querySelector("#first")!, second = doc.querySelector("#second")!
    selection.setBaseAndExtent(list, 1, list, 3)
    const tab = new view.KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true})
    doc.dispatchEvent(tab)
    assert(tab.defaultPrevented, "Tab did not handle a multi-item selection")
    let nested = doc.querySelector("#lead > ul")!
    assert(nested.children.length === 2 && nested.children[0] === first && nested.children[1] === second,
      `Tab did not indent the selected consecutive items together: ${list.outerHTML}`)
    assert(list.children.length === 2 && list.children[1].id === "tail", "Tab moved an unselected trailing item")

    selection.setBaseAndExtent(nested, 0, nested, 2)
    const shiftTab = new view.KeyboardEvent("keydown", {key: "Tab", shiftKey: true, bubbles: true, cancelable: true})
    doc.dispatchEvent(shiftTab)
    assert(shiftTab.defaultPrevented, "Shift+Tab did not handle a multi-item selection")
    assert(Array.from(list.children).filter(item => item.id === "first" || item.id === "second").length === 2,
      `Shift+Tab did not outdent the selected items together: ${list.outerHTML}`)
    assert(!nested.isConnected, "Shift+Tab left an empty nested list behind")

    doc.body.innerHTML = "<ul><li id='owner'>Owner<ul id='deep'><li id='previous'>Previous</li><li id='moving'>Moving<ul id='child'><li>Child</li></ul></li></ul></li></ul>"
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    list = doc.querySelector("#deep")!
    const moving = doc.querySelector("#moving")!
    selection.setBaseAndExtent(list, 1, list, 2)
    const nestedTab = new view.KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true})
    doc.dispatchEvent(nestedTab)
    assert(nestedTab.defaultPrevented, "Tab did not indent a nested list item")
    const child = doc.querySelector("#child")!
    const movedList = moving.parentElement, movedOwner = movedList?.parentElement
    assert(movedOwner?.id === "previous" && movedOwner.parentElement?.id === "deep",
      `nested item did not move under its previous sibling: ${doc.body.innerHTML}`)
    const childOwner = child.parentElement
    assert(childOwner?.id === "previous" && child.lastElementChild?.textContent === "Child",
      `indenting the item changed its nested child depth: ${doc.body.innerHTML}`)
    assert(childOwner?.parentElement?.id === "deep", "indenting changed the nested child's list depth")
    assert(!editor.toHTML(true).includes("◆"), "list editing leaked editor markers")

    doc.body.innerHTML = '<ol id="ordered" style="list-style-type: lower-alpha"><li id="first"><p>First</p></li><li id="middle"><p>Middle</p></li><li id="last"><p>Last</p></li></ol>'
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    const ordered = doc.querySelector("ol")!
    const firstItem = doc.querySelector("#first")!
    const firstParagraph = firstItem.querySelector("p")!
    const middleItem = doc.querySelector("#middle")!
    const lastItem = doc.querySelector("#last")!
    const lastParagraph = lastItem.querySelector("p")!
    const dragSelection = doc.createRange()
    dragSelection.selectNode(lastParagraph)
    selection.removeAllRanges(); selection.addRange(dragSelection)
    const transfer = new view.DataTransfer()
    const dragStart = new view.DragEvent("dragstart", {bubbles: true, cancelable: true, dataTransfer: transfer})
    editor.features.manipulation.startNodeDrag(dragStart, lastParagraph)
    assert(!dragStart.defaultPrevented && transfer.getData(nodeDragType) !== "",
      "dragging a paragraph in an ordered list did not start a node transfer")
    await waitForEdit()
    const firstRect = firstParagraph.getBoundingClientRect()
    const drop = new view.DragEvent("drop", {
      bubbles: true, cancelable: true, dataTransfer: transfer,
      clientX: firstRect.left + firstRect.width / 2, clientY: firstRect.bottom - 1,
    })
    firstParagraph.dispatchEvent(drop)
    await waitForEdit()
    assert(drop.defaultPrevented, "the list item drop was not handled")
    assert(ordered.children[0] === firstItem && ordered.children[1] === lastItem && ordered.children[2] === middleItem,
      `dragging a direct paragraph did not reorder its owning li: ${ordered.outerHTML}`)
    assert(lastItem.querySelector("p") === lastParagraph, "dragging rebuilt the source list item's paragraph")
    assert(ordered.style.listStyleType === "lower-alpha", "dragging changed the ordered list marker style")
    assert(!editor.toHTML(true).includes("◆"), "list item dragging leaked editor markers")
    assert(editor.features.manipulation.draggedElement === null, "list item drag remained active after drop")
    assert(!doc.body.classList.contains("◆drop-selection-active"), "list item drop selection marker remained after drop")

    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.elementAttributes = {
      path: [0], localName: "ul", namespaceURI: "http://www.w3.org/1999/xhtml", name: "ul", attributes: {},
    }
    toolbox.elementStyle = {
      target: {localName: "ul", namespaceURI: "http://www.w3.org/1999/xhtml"},
      inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"},
    }
    document.body.append(toolbox)
    try {
      await toolbox.updateComplete
      await toolbox.updateComplete
      const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('[data-specialized="ul"]')
      if(!drawer) throw new Error("List toolbox drawer did not render")
      const buttons = Array.from(drawer.querySelectorAll<HTMLButtonElement>(".list-indent button"))
      assert(buttons.length === 2
        && buttons[0].getAttribute("aria-label") === "Dedent"
        && buttons[1].getAttribute("aria-label") === "Indent",
      "List toolbox did not render both indentation buttons")
      const labels: string[] = []
      toolbox.addEventListener("ribbon-button-click", event => labels.push((event as CustomEvent<{label: string}>).detail.label))
      buttons[0].click(); buttons[1].click()
      assert(labels.join(",") === "outdentListItems,indentListItems", "List toolbox did not bridge both indentation actions")
    }
    finally { toolbox.remove() }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
}
