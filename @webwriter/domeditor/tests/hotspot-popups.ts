import {hasPresentationState} from "../src/presentation-state.js"
import type {DOMEditor} from "../src/domeditor"
import {defaultDocumentTheme} from "../src/document-themes"
import {DomEditor} from "../src/components/dom-editor"
import {DomEditorToolbox} from "../src/components/toolbox"
import {DomEditorBreadcrumb} from "../src/components/breadcrumb"
import type {RibbonDrawer} from "../src/components/ribbon-drawer"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const layout = async () => {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

export async function checkHotspotPopups(append: (element: HTMLElement) => void) {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:800px;height:500px;max-width:none;border:0"
  frame.srcdoc = `<!doctype html><head><style>${defaultDocumentTheme.source}</style><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></head><body><img src="/tests/fixtures/image-map.svg" style="width:300px;height:175px" usemap="#plan"><map name="plan"><span><!--keep--><area shape="rect" coords="500,40,680,340" popovertarget="first"><area shape="circle" coords="100,100,40" interestfor="second"></span></map><div id="first" popover="auto"><p>First popup</p></div><div id="second" popover="auto"><p>Second popup</p></div><p><span class="ww-popup"><button popovertarget="mark-popup">Popup mark</button></span></p><div class="ww-popup-content" id="mark-popup" popover="auto"><p>Mark popup</p></div></body>`
  append(frame)
  const toolbox = new DomEditorToolbox(), breadcrumb = new DomEditorBreadcrumb()
  toolbox.style.width = "300px"
  toolbox.activeTool = "Edit"; toolbox.activeMenu = "Edit"
  append(toolbox); append(breadcrumb)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
  try {
    for(let attempt = 0; !view.editor && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "hotspot popup fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const first = doc.getElementById("first")!, second = doc.getElementById("second")!, mark = doc.getElementById("mark-popup")!
    const before = editor.toHTML(true)
    editor.features.selection.actions.selectNode({type: "selectNode", path: [0]})
    toolbox.selectedElementTypes = editor.features.manipulation.getSelectedElementTypes()
    await toolbox.updateComplete
    const drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>('ribbon-drawer[layout="popup"]'))
    assert(drawers.length === 2 && drawers.every(drawer => drawer.label === "Popup" && drawer.icon === "Popup"), "hotspots do not expose individual Popup drawers")
    await Promise.all(drawers.map(drawer => drawer.updateComplete))
    toolbox.addEventListener("toolbox-element-select", event => {
      editor.features.selection.actions.selectElementTypes({type: "selectElementTypes", selectionTypes: (event as CustomEvent).detail.selectionTypes})
    })
    drawers[0].shadowRoot!.querySelector<HTMLButtonElement>(".pane-label-button")!.click()
    await layout()
    assert(hasPresentationState(first, "element-selected") && !hasPresentationState(second, "element-selected"), "the first popup cannot be selected independently")
    assert(first.matches(":popover-open"), "selecting a closed hotspot popup did not open it")
    for(const width of [800, 360]) {
      frame.style.width = `${width}px`
      await layout()
      const rect = first.getBoundingClientRect()
      assert(rect.width > 0 && rect.left >= 0 && rect.right <= width && rect.top >= 0 && rect.bottom <= 500,
        `selected popup overflowed ${width}px viewport`)
      const actual = view.getComputedStyle(first), expected = view.getComputedStyle(mark)
      for(const property of ["padding", "border", "border-radius", "background-color", "color", "box-shadow", "overflow-wrap"]) {
        assert(actual.getPropertyValue(property) === expected.getPropertyValue(property), `hotspot popup differs from popup mark: ${property}`)
      }
      assert(view.getComputedStyle(first, "::before").content === '""', "hotspot popup has no shared speech-bubble pointer")
    }
    const tree = DomEditor.prototype["buildDocumentTree"].call({editorDocument: doc, installedPackages: []} as unknown as DomEditor)!
    assert(tree.children[0].children.map(child => child.name).join() === "Popup,Popup", "popup outline is not beneath the image")
    breadcrumb.tree = tree
    breadcrumb.path = [tree, tree.children[0], tree.children[0].children[0]]
    await breadcrumb.updateComplete
    assert(breadcrumb.shadowRoot!.querySelectorAll(".icon-tabler-message-circle").length > 0, "breadcrumb does not use the Popup mark icon")
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    editor.features.manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: {"background-color": "rgb(250, 230, 160)"}})
    await layout()
    first.getAnimations().forEach(animation => animation.finish())
    assert(view.getComputedStyle(first).backgroundColor === "rgb(250, 230, 160)", "selected popup did not accept styling")
    assert(!second.hasAttribute("style") && doc.querySelector<HTMLImageElement>("img")!.style.cssText === "width: 300px; height: 175px;", "popup styling affected a sibling")
    editor.doc.syncFromDOM(); editor.doc.stopCapturing(); editor.doc.undo()
    await layout()
    assert(!doc.getElementById("first")!.hasAttribute("style"), "undo did not restore popup styling")
    editor.doc.redo(); await layout()
    assert(doc.getElementById("first")!.getAttribute("style")?.includes("background-color"), "redo did not restore popup styling")
    assert(!editor.toHTML(true).includes("◆hotspot-popup") && !editor.doc.body.toString().includes("◆hotspot-popup"), "popup marker leaked into saved or shared HTML")
    editor.doc.undo(); await layout()
    assert(editor.toHTML(true) === before, "popup selection or styling changed unrelated authored content")
  }
  finally { view.editor?.destroy(); frame.remove(); toolbox.remove(); breadcrumb.remove() }
}
