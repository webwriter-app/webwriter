import type {DOMEditor} from "../src/domeditor"
import {defaultDocumentTheme} from "../src/document-themes"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const layout = async () => {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

export async function checkResizeAlignment(nativeRootEditor: DOMEditor) {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1440px;height:800px;max-width:none"
  nativeRootEditor.addAppendix(frame)
  try {
    const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once:true}))
    frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
    await loaded
    const view = frame.contentWindow! as Window & typeof globalThis, doc = frame.contentDocument!
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, "aligned resize fixture did not initialize")
    const editor = view.editor!, theme = doc.createElement("style")
    theme.textContent = defaultDocumentTheme.source; doc.head.append(theme)
    for(const width of [1440, 900, 375]) {
      frame.style.width = `${width}px`
      for(const placement of ["left", "center", "right", "far-left", "far-right"] as const) {
        const target = doc.createElement("picture"), image = target.appendChild(doc.createElement("img"))
        image.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="skyblue"/><circle cx="100" cy="50" r="40" fill="navy"/></svg>')}`
        target.style.cssText = "width:200px;height:auto"
        doc.body.append(target)
        await image.decode()
        const floated = placement.startsWith("far-")
        editor.features.manipulation.setFloat(target, floated ? placement as "far-left" | "far-right" : "none", floated ? undefined : placement as "left" | "center" | "right")
        // Keep the page's reserved lane fixed while testing exact cursor and
        // fixed-edge behavior. Without a wider peer, resizing this sole float
        // also changes the centered body/column width, moving both outer edges.
        let laneHolder: HTMLElement | null = null
        if(floated && width >= 720) {
          laneHolder = doc.createElement("aside")
          laneHolder.className = `ww-float-${placement.endsWith("left") ? "left" : "right"}`
          laneHolder.style.cssText = "--ww-float-size:400px;height:1px;margin:0"
          doc.body.append(laneHolder)
        }
        await layout()
        editor.features.selection.captureElement(target)
        await layout()
        const transform = editor.features.transformation
        const effective = floated ? view.getComputedStyle(target).float : placement
        const centered = effective === "center" || effective === "none"
        const right = effective === "right"
        const handles = Array.from(transform.overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale:not([hidden])"))
        assert(handles.length === 1 && handles[0].dataset.resizeDirection === (right ? "down-left" : "down-right"), `${placement}: wrong resize corner`)
        const handleBox = handles[0].getBoundingClientRect()
        const hit = doc.body.shadowRoot!.elementFromPoint(handleBox.left + handleBox.width / 2, handleBox.top + handleBox.height / 2)
        assert(hit === handles[0], `${placement}: resize handle is covered by ${hit?.getAttribute("part") ?? hit?.localName}`)
        const borderHit = doc.body.shadowRoot!.elementFromPoint(handleBox.left + .5, handleBox.top + .5)
        assert(borderHit === handles[0], `${placement}: resize corner covered by ${borderHit?.getAttribute("part") ?? borderHit?.localName}`)
        for(const distance of [30, -20]) {
          const before = target.getBoundingClientRect(), handle = handles[0]
          const startX = right ? before.left : before.right, dx = right ? -distance : distance
          handle.addEventListener("mousedown", event => transform.handleScaleStart(event), {once:true})
          handle.dispatchEvent(new view.MouseEvent("mousedown", {button:0, clientX:startX, clientY:before.bottom}))
          transform.handleScaleDrag(new view.MouseEvent("mousemove", {clientX:startX + dx, clientY:before.bottom + 10, altKey:true}))
          transform.handleScaleEnd()
          await layout()
          const after = target.getBoundingClientRect()
          assert(Math.abs((right ? after.left : after.right) - startX - dx) < 1, `${placement}: dragged edge missed the cursor`)
          assert(Math.abs(after.bottom - before.bottom - 10) < 1, `${placement}: bottom edge missed the cursor`)
          if(centered) assert(Math.abs(after.left + after.width / 2 - before.left - before.width / 2) < 1, "centered resize moved its center")
          else assert(Math.abs((right ? after.right : after.left) - (right ? before.right : before.left)) < 1, `${placement}: fixed edge moved`)
          assert(!target.style.position && !target.style.left && !target.style.right, `${placement}: resizing left document flow`)
        }
        transform.clearTransform()
        target.remove()
        laneHolder?.remove()
      }
    }
    const graphic = doc.createElementNS("http://www.w3.org/2000/svg", "svg")
    graphic.setAttribute("width", "359")
    graphic.setAttribute("height", "202")
    doc.body.append(graphic)
    editor.features.selection.captureElement(graphic)
    await layout()
    const handle = editor.features.transformation.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    const box = handle.getBoundingClientRect()
    assert(doc.body.shadowRoot!.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === handle,
      "graphic resize affordance is covered at its center")
    assert(doc.body.shadowRoot!.elementFromPoint(box.left + .5, box.top + .5) === handle,
      "graphic resize affordance is covered at its inner corner")
    assert(!editor.features.transformation.overlay.querySelector(".◆transform-overlay-edge[title]"),
      "graphic move border exposes a lingering native tooltip")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
}
