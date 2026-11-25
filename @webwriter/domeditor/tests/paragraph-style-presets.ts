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
  frame.srcdoc = `<!doctype html><head><style>${defaultDocumentTheme.source}
    example-widget {display: block; padding-block: 3px 7px; padding-inline: 9px 13px}
    </style></head><body>
    <p style="padding: 2px 4px 6px 10px !important">First paragraph</p><!--keep-->
    <example-widget>Widget</example-widget><h2>Heading</h2><ul><li>Item</li></ul>
    <ol dir="rtl" start="1000"><li>Numbered item</li></ol>
    <p><em>Second paragraph</em></p><p>Unselected paragraph</p>
    <script type="module" src="/tests/native-browser-frame.ts?proofreading-disabled"></script></body>`
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
      const {styles, boxPreset} = (event as CustomEvent).detail
      editor!.features.manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles, boxPreset})
    })
    const preset = controls.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Blue style preset"]')!
    const presetBackground = getComputedStyle(preset).backgroundColor
    const widget = doc.querySelector<HTMLElement>("example-widget")!
    const widgetPadding = view.getComputedStyle(widget).padding
    preset.click()
    for(const element of [...paragraphs.slice(0, 2), ...doc.querySelectorAll("h2, ul, ol")]) {
      const style = view.getComputedStyle(element), box = element.getBoundingClientRect()
      assert(style.backgroundColor === presetBackground, `selected ${element.localName} did not receive the blue background`)
      assert(style.borderTopStyle === "solid" && style.borderTopWidth === "1px", `selected ${element.localName} did not receive the preset border`)
      assert(style.padding === "8px", `selected ${element.localName} did not receive the preset padding`)
      assert(box.width > 0 && element.scrollWidth <= element.clientWidth + 1, `styled ${element.localName} overflows its container`)
    }
    assert(paragraphs[0].style.getPropertyPriority("padding") === "important", "preset changed authored padding priority")
    assert(view.getComputedStyle(widget).backgroundColor === presetBackground, "selected widget did not receive the blue background")
    assert(view.getComputedStyle(widget).padding === widgetPadding && !widget.style.padding, "preset changed widget padding")
    for(const item of doc.querySelectorAll("li")) {
      assert(view.getComputedStyle(item).listStylePosition === "inside", "list marker sits outside the styled list")
      assert(!item.hasAttribute("style"), "preset added styling to a list item")
    }
    assert(!doc.body.hasAttribute("style") && !paragraphs[2].hasAttribute("style"), "preset escaped the selected paragraphs")
    assert(selection.toString() === text, "preset changed the native text selection")
    assert(nodes.every((node, index) => doc.body.childNodes[index] === node), "preset rebuilt authored content")
    assert(controls.shadowRoot!.querySelector<HTMLElement>(".style-gallery")!.scrollWidth <= 280, "preset gallery overflows the toolbox")
    assert(!editor!.toHTML(true).includes("◆"), "paragraph preset export contains editing markers")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove(); controls.remove() }
}
