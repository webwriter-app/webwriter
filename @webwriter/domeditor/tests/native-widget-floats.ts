import {documentThemes, editingDocumentThemeSource} from "../src/document-themes"

type Assert = (condition: unknown, message: string) => void

/** Document lanes must leave a widget's authored floats and alignment local. */
export async function checkNativeWidgetFloats(host: {addAppendix(element: HTMLElement): unknown}, assert: Assert, layoutFrame: () => Promise<void>) {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;inset:0;height:800px;border:0;max-width:none"
  const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
  frame.srcdoc = "<!doctype html><html><head></head><body></body></html>"
  host.addAppendix(frame)
  try {
    await loaded
    const doc = frame.contentDocument!, view = frame.contentWindow!
    const style = doc.createElement("style")
    doc.head.append(style)
    const close = (a: number, b: number) => Math.abs(a - b) < 1
    const geometry = () => {
      const peer = doc.querySelector("#peer")!.getBoundingClientRect()
      const body = view.getComputedStyle(doc.body)
      return [peer.left, peer.width, parseFloat(body.paddingLeft), parseFloat(body.paddingRight)]
    }
    for(const theme of documentThemes) for(const editing of [false, true]) {
      style.textContent = (editing ? editingDocumentThemeSource(theme) : theme.source)
        + "\nfloat-widget, float-part {display:block} float-widget {min-width:0}"
      doc.body.innerHTML = '<p id="peer">Neighboring document content</p><float-widget><float-part><picture id="local" style="width:44%;margin:0 0 12px 16px"><img width="360" height="224" alt="Local illustration" style="width:100%;height:auto"></picture><p>Local content</p></float-part></float-widget><section is="float-widget"><aside id="customized" style="width:80px">Local</aside></section><main><float-widget><aside id="wrapped" style="width:80px">Local</aside></float-widget><p>Wrapped document content</p></main>'
      const local = doc.querySelector<HTMLElement>("#local")!
      const customized = doc.querySelector<HTMLElement>("#customized")!
      const wrapped = doc.querySelector<HTMLElement>("#wrapped")!
      for(const width of [360, 800, 1200, 1800]) {
        frame.style.width = `${width}px`
        local.style.float = "none"
        customized.className = wrapped.className = ""
        await layoutFrame()
        const baseline = geometry()
        local.style.float = "right"
        customized.className = "ww-float-left"
        wrapped.className = "ww-float-right"
        await layoutFrame()
        const label = `${theme.value}, ${editing ? "editing" : "saved"}, ${width}px`
        assert(geometry().every((value, index) => close(value, baseline[index])), `${label}: internal floats changed document alignment`)
        const verifyLocal = () => {
          assert(view.getComputedStyle(local).float === "right", `${label}: internal float was stacked or moved`)
          assert(close(local.getBoundingClientRect().width, local.parentElement!.getBoundingClientRect().width * 0.44), `${label}: page lane resized internal image`)
          assert(close(parseFloat(view.getComputedStyle(local).marginLeft), 16), `${label}: page lane changed internal margin`)
          assert(view.getComputedStyle(customized).float === "left" && close(customized.getBoundingClientRect().width, 80), `${label}: customized widget float escaped its boundary`)
          assert(view.getComputedStyle(wrapped).float === "right" && close(wrapped.getBoundingClientRect().width, 80), `${label}: wrapped widget float escaped its boundary`)
        }
        verifyLocal()
        const external = doc.createElement("float-widget")
        external.className = "ww-float-left"
        external.style.setProperty("--ww-float-size", "120px")
        external.textContent = "Document-level floated widget"
        doc.querySelector("main")!.prepend(external)
        await layoutFrame()
        assert(view.getComputedStyle(external).float === (width < 720 ? "none" : "left"), `${label}: widget host lost document float placement`)
        if(width >= 720) assert(geometry()[2] > baseline[2], `${label}: external float did not reserve a document lane`)
        verifyLocal()
        external.remove()
        await layoutFrame()
        assert(geometry().every((value, index) => close(value, baseline[index])), `${label}: removing the external float retained a lane`)
      }
    }
  }
  finally { frame.remove() }
}
