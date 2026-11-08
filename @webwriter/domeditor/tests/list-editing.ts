import {hasPresentationState} from "../src/presentation-state.js"
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
    for(const mode of ["container", "text", "backward", "after-list", "empty-paragraph"] as const) {
      doc.body.innerHTML = '<ul><li>One</li><li>Two</li><li>Three</li></ul>'
      const list = doc.querySelector("ul")!, items = list.querySelectorAll("li")
      if(mode === "container") selection.setBaseAndExtent(list, 0, list, 3)
      else if(mode === "text") selection.setBaseAndExtent(items[0].firstChild!, 0, items[2].firstChild!, 5)
      else if(mode === "backward") selection.setBaseAndExtent(items[2].firstChild!, 5, items[0].firstChild!, 0)
      else if(mode === "after-list") selection.setBaseAndExtent(items[0].firstChild!, 0, doc.body, 1)
      else {
        const paragraph = doc.createElement("p")
        doc.body.append(paragraph)
        selection.setBaseAndExtent(items[0].firstChild!, 0, paragraph, 0)
      }
      editor.features.manipulation.actions.insertElement({type: "insertElement", tag: "p"})
      await waitForEdit()
      const expected = '<p>One</p><p>Two</p><p>Three</p>' + (mode === "empty-paragraph" ? '<p></p>' : '')
      assert(editor.toHTML(true) === expected && !doc.querySelector("ul, ol"),
        `${mode} list selection did not convert all items: ${editor.toHTML(true)}`)
    }
    for(const mode of ["text", "caret", "trailing paragraph", "backward through paragraph"] as const) {
      const includesParagraph = mode === "trailing paragraph" || mode === "backward through paragraph"
      doc.body.innerHTML = '<ul style="list-style-type: circle"><li>One</li><li>Two</li><li>Three</li></ul>'
        + (includesParagraph ? '<p><br></p><p>Keep</p>' : "")
      await waitForEdit()
      const list = doc.querySelector("ul")!
      const items = Array.from(list.children)
      const trailing = doc.querySelector("p")
      if(mode === "caret") selection.collapse(items[0].firstChild!, 2)
      else if(mode === "trailing paragraph") selection.setBaseAndExtent(items[0].firstChild!, 0, trailing!, 0)
      else if(mode === "backward through paragraph") selection.setBaseAndExtent(trailing!, 0, items[0].firstChild!, 0)
      else selection.setBaseAndExtent(items[0].firstChild!, 0, items[2].firstChild!, 5)
      await waitForEdit()
      editor.features.manipulation.actions.insertElement({type: "insertElement", tag: "ol"})
      await waitForEdit()
      const ordered = doc.querySelector("ol")
      assert(ordered?.textContent === "OneTwoThree" && ordered.children.length === 3, `list conversion lost content: ${doc.body.innerHTML}`)
      assert(ordered?.style.listStyleType === "decimal", "list conversion did not reset the marker to decimal")
      assert(ordered?.style.listStyleImage === "none", "list conversion did not reset the marker image")
      assert(view.getComputedStyle(items[0]).listStyleType === "decimal", "list items do not render decimal markers")
      assert(items.every((item, index) => ordered?.children[index] === item), "list style conversion replaced list items")
      if(includesParagraph) {
        assert(!trailing?.isConnected, "the selected empty paragraph survived conversion")
        assert(doc.body.lastElementChild?.textContent === "Keep", "conversion changed the next paragraph")
      }
    }
    doc.body.innerHTML = '<ul style="list-style-type: square"><li>Outer<ol style="list-style-type: upper-roman; list-style-image: url(marker.png)"><li>Nested</li></ol></li></ul>'
    const nestedEnumeration = doc.querySelector("ol")!, nestedEnumerationItem = nestedEnumeration.querySelector("li")!
    selection.collapse(nestedEnumerationItem.firstChild!, 1)
    editor.features.manipulation.actions.insertElement({type: "insertElement", tag: "ol"})
    await waitForEdit()
    assert(doc.querySelector("ol") === nestedEnumeration, "resetting an enumeration replaced its list")
    assert(view.getComputedStyle(nestedEnumerationItem).listStyleType === "decimal", "nested enumeration does not render decimal markers")
    assert(view.getComputedStyle(nestedEnumerationItem).listStyleImage === "none", "nested enumeration retained its image marker")
    for(const position of ["inside", "outside"]) {
      for(const lineHeight of ["normal", "48px"]) {
        doc.body.innerHTML = `<ul style="list-style-position: ${position}; font: 32px/${lineHeight} sans-serif"></ul>`
        const list = doc.querySelector("ul")!
        selection.collapse(list, 0)
        editor.features.list.refreshSelectionPresentation()
        const preview = editor.appendix.querySelector<HTMLElement>(".◆virtual-list-item")!
        const emptyHeight = list.getBoundingClientRect().height
        const previewHeight = preview.getBoundingClientRect().height
        const item = editor.features.list.materializeVirtualItem()!
        item.textContent = "Example"
        await waitForEdit()
        const itemHeight = item.getBoundingClientRect().height
        assert(Math.abs(emptyHeight - list.getBoundingClientRect().height) < 1,
          `${position} ${lineHeight}: list height changed when the first item was populated`)
        assert(Math.abs(previewHeight - itemHeight) < 1,
          `${position} ${lineHeight}: preview height ${previewHeight} differs from item height ${itemHeight}`)
      }
    }
    for(const position of ["inside", "outside"]) {
      doc.body.innerHTML = `<ul style="list-style-position: ${position}"><li>One</li></ul>`
      const text = doc.querySelector("li")!.firstChild!
      selection.collapse(text, text.textContent!.length)
      doc.dispatchEvent(new view.KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
      await waitForEdit()
      editor.features.selection.processSelection()
      const item = doc.querySelectorAll("li")[1]!
      const caret = editor.appendix.querySelector<HTMLElement>(".◆virtual-list-caret")
      if(position === "inside") {
        const textRange = doc.createRange()
        textRange.setStart(text, 0); textRange.collapse(true)
        assert(hasPresentationState(item, "list-empty-caret"), "inside empty item did not use the shadow caret")
        assert(Boolean(caret) && Math.abs(caret!.getBoundingClientRect().left - textRange.getBoundingClientRect().left) < 2,
          "inside empty item caret is not aligned with the preceding item's text")
        selection.collapse(text, 0)
        editor.features.list.refreshSelectionPresentation()
        assert(!hasPresentationState(item, "list-empty-caret"), "empty item caret marker was not cleaned up")
      }
      else assert(!hasPresentationState(item, "list-empty-caret"), "outside item unnecessarily replaced its native caret")
    }
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

    for(const depth of [0, 1, 2]) {
      for(const offset of [0, 1, 2]) {
        let html = '<ul id="gap"><li>First</li><li>Last</li></ul>'
        for(let level = 0; level < depth; level++) html = `<ul><li>Previous</li><li>Owner${html}</li></ul>`
        doc.body.innerHTML = html
        const gapList = doc.querySelector("#gap")!, items = Array.from(gapList.children)
        selection.collapse(gapList, offset)
        const event = new view.KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true})
        doc.dispatchEvent(event)
        await waitForEdit()
        assert(event.defaultPrevented, `depth ${depth}, gap ${offset}: Tab was not handled`)
        if(offset === 0) assert(editor.toHTML(true) === html, `depth ${depth}: Tab moved the parent at a leading gap`)
        else {
          const item = items[offset - 1].querySelector("ul > li")!
          assert(item?.childNodes.length === 0, `depth ${depth}, gap ${offset}: Tab did not create an empty deeper item`)
          assert(selection.anchorNode === item && selection.anchorOffset === 0,
            `depth ${depth}, gap ${offset}: Tab lost the new item's caret`)
          assert(gapList.children.length === 2 && gapList.children[0] === items[0] && gapList.children[1] === items[1],
            `depth ${depth}, gap ${offset}: Tab moved existing items`)
        }
        assert(!editor.toHTML(true).includes("◆"), "gap indentation leaked editor markers")
      }
    }

    for(const type of ["ul", "ol", "menu"]) {
      doc.body.innerHTML = `<${type}><li>Owner<${type} id="children"><li>First</li><li><b>Middle</b></li><!--keep--><li>Last</li></${type}></li></${type}>`
      const before = editor.toHTML(true), children = doc.querySelector("#children")!, text = doc.querySelector("b")!.firstChild!
      selection.collapse(text, 3)
      for(let cycle = 0; cycle < 3; cycle++) {
        for(const shiftKey of [true, false]) {
          doc.dispatchEvent(new view.KeyboardEvent("keydown", {key: "Tab", shiftKey, bubbles: true, cancelable: true}))
          await waitForEdit()
        }
        assert(editor.toHTML(true) === before, `${type} cycle ${cycle}: indent/dedent changed sibling order or split the list`)
        assert(doc.querySelector("#children") === children, `${type} cycle ${cycle}: indent/dedent replaced the list`)
        assert(selection.anchorNode === text && selection.anchorOffset === 3, `${type} cycle ${cycle}: indent/dedent lost the caret`)
      }
    }

    for(const type of ["ul", "ol"]) {
      doc.body.innerHTML = `<ul><li>Owner<ul class="first"><li>First</li></ul></li><li>Middle<${type} id="distinct" lang="de"><!--keep--><li>Last</li></${type}></li></ul>`
      const text = doc.querySelector("body > ul > li + li")!.firstChild!, child = doc.querySelector("#distinct")!
      selection.collapse(text, 2)
      doc.dispatchEvent(new view.KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true}))
      const before = editor.toHTML(true)
      for(let cycle = 0; cycle < 3; cycle++) {
        for(const shiftKey of [true, false]) {
          doc.dispatchEvent(new view.KeyboardEvent("keydown", {key: "Tab", shiftKey, bubbles: true, cancelable: true}))
          await waitForEdit()
        }
        assert(editor.toHTML(true) === before, `${type} cycle ${cycle}: distinct sublists changed order or attributes`)
        assert(doc.querySelector("#distinct") === child, `${type} cycle ${cycle}: distinct sublist was replaced`)
      }
    }

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
    assert(!hasPresentationState(doc.body, "drop-selection-active"), "list item drop selection marker remained after drop")

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
