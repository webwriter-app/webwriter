import {ElementStyleEditor} from "../src/components/element-style-editor"
import {defaultDocumentTheme} from "../src/document-themes"

export async function checkParagraphStylePresets() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const controls = new ElementStyleEditor()
  controls.mode = "compact"
  controls.showPresets = true
  controls.propertyNames = []
  controls.style.cssText = "display:block;width:280px"
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:680px;height:380px;max-width:none"
  frame.srcdoc = `<!doctype html><head><style>${defaultDocumentTheme.source}</style></head><body><p>First paragraph</p><!--keep--><p><em>Second paragraph</em></p><p>Unselected paragraph</p><script type="module" src="/tests/native-browser-frame.ts?proofreading-disabled"></script></body>`
  document.querySelector("#fixture")!.append(controls, frame)
  try {
    for(let attempt = 0; attempt < 200 && !frame.contentWindow?.editor; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    const editor = frame.contentWindow?.editor
    assert(editor, `paragraph preset editor failed: ${frame.contentWindow?.editorError}`)
    const doc = frame.contentDocument!, view = frame.contentWindow!
    const paragraphs = Array.from(doc.querySelectorAll("p")), nodes = Array.from(doc.body.childNodes)
    const selection = doc.getSelection()!
    selection.setBaseAndExtent(paragraphs[0].firstChild!, 2, paragraphs[1].firstElementChild!.firstChild!, 6)
    const text = selection.toString()
    controls.state = editor!.features.manipulation.actions.getStyleState({type: "getStyleState", topLevel: true})
    assert(controls.state.target?.localName === "p", "paragraph range was projected as document styling")
    await controls.updateComplete
    controls.addEventListener("element-style-change", event => {
      editor!.features.manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: (event as CustomEvent).detail.styles})
    })
    const preset = controls.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Blue style preset"]')!
    preset.click()
    for(const paragraph of paragraphs.slice(0, 2)) {
      const style = view.getComputedStyle(paragraph), box = paragraph.getBoundingClientRect()
      assert(style.backgroundColor === preset.style.backgroundColor, "selected paragraph did not receive the blue background")
      assert(style.borderTopStyle === "solid" && style.borderTopWidth === "1px" && style.paddingTop === "8px",
        "selected paragraph did not receive the preset border and padding")
      assert(box.width > 0 && paragraph.scrollWidth <= paragraph.clientWidth + 1, "styled paragraph overflows its container")
    }
    assert(!doc.body.hasAttribute("style") && !paragraphs[2].hasAttribute("style"), "preset escaped the selected paragraphs")
    assert(selection.toString() === text, "preset changed the native text selection")
    assert(nodes.every((node, index) => doc.body.childNodes[index] === node), "preset rebuilt authored content")
    assert(controls.shadowRoot!.querySelector<HTMLElement>(".style-gallery")!.scrollWidth <= 280, "preset gallery overflows the toolbox")
    assert(!editor!.toHTML(true).includes("◆"), "paragraph preset export contains editing markers")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove(); controls.remove() }
}
