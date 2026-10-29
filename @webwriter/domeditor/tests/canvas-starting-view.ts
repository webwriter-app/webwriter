import type {DOMEditor} from "../src/domeditor"
import {previewFrameHTML} from "../src/frame-document"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

export async function checkCanvasStartingView() {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px;border:0"
  frame.srcdoc = '<!doctype html><body><h1>Canvas starting view</h1><p>Keep this content</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
  const settle = async () => { for(let i = 0; i < 3; i++) await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve())) }
  const preview = document.createElement("iframe")
  try {
    for(let i = 0; !view.editor && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, "starting view fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, canvas = editor.features.canvas
    assert(editor.setDocumentLayout("canvas", "document"), "canvas conversion failed")
    canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "zoom-out"})
    await settle()
    const button = editor.appendix.querySelector<HTMLButtonElement>('button[name="starting-view"]')!
    button.click()
    await settle()
    const bounds = doc.querySelector<HTMLDivElement>(".ww-canvas-starting-view")!
    assert(bounds && Math.abs(bounds.getBoundingClientRect().left) < 1 && Math.abs(bounds.getBoundingClientRect().width - 900) < 1, "saved bounds do not match the viewport")
    assert(editor.features.transformation.target === bounds, "new starting view was not selected")
    const group = editor.appendix.querySelector<HTMLElement>('.◆canvas-starting-view-controls')!
    assert(group.getAttribute("role") === "group" && group.querySelector('[name="starting-view"]')?.textContent === "Starting view"
      && group.querySelector('[name="delete-starting-view"] svg'), "starting-view controls are not a labeled button and trash-icon group")
    editor.features.selection.selectElement(doc.querySelector("p")!)
    // Move the camera so all four edges and their controls are within reach.
    canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "zoom-out"})
    await settle()
    const outline = editor.appendix.querySelector<HTMLElement>("[part=canvas-starting-view]")!
    const box = outline.getBoundingClientRect()
    const x = box.left + box.width / 2, y = box.top
    const hit = editor.appendix.elementFromPoint(x, y)!
    assert(outline.contains(hit), `dotted outline cannot be clicked (${hit?.outerHTML})`)
    hit.dispatchEvent(new view.PointerEvent("pointerdown", {button: 0, pointerId: 7, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true}))
    await settle()
    const transform = editor.features.transformation
    assert(transform.target === bounds, "frame click did not select authored bounds")
    assert(view.getComputedStyle(transform.overlay).outlineStyle === "none", "selection added a second frame")
    assert(view.getComputedStyle(outline).borderColor === view.getComputedStyle(transform.overlay).getPropertyValue("--ww-transform-color").trim()
      || view.getComputedStyle(outline).borderColor === view.getComputedStyle(transform.overlay.querySelector(".◆transform-overlay-scale")!).backgroundColor,
      "selected dotted frame did not become selection blue")
    assert(transform.overlay.querySelector<HTMLElement>("#◆transform-overlay-rotator")!.hidden, "starting view exposes rotation")
    const label = outline.querySelector<HTMLElement>("[part=canvas-starting-view-label]")!
    const verifySelectionLabel = (inside: boolean) => {
      const labelRect = label.getBoundingClientRect(), frameRect = bounds.getBoundingClientRect()
      assert(view.getComputedStyle(label).display !== "none" && label.textContent === "STARTING VIEW", "selected starting-view label is absent")
      assert(view.getComputedStyle(label).color === view.getComputedStyle(outline).borderColor, "starting-view label does not match selection blue")
      assert(inside ? labelRect.top > frameRect.top && labelRect.bottom < frameRect.bottom : labelRect.bottom < frameRect.top && labelRect.top >= 0,
        "starting-view label did not flip to the available side of the frame")
      const deleter = transform.overlay.querySelector<HTMLElement>("#◆transform-overlay-delete")!
      const deleteRect = deleter.getBoundingClientRect(), stem = view.getComputedStyle(deleter, "::after")
      const dot = transform.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-up-right")!.getBoundingClientRect()
      const start = deleteRect.top + parseFloat(stem.top) * canvas.zoom, end = start + parseFloat(stem.height) * canvas.zoom
      const centerX = dot.left + dot.width / 2, centerY = dot.top + dot.height / 2
      assert(Math.abs(deleteRect.left + (parseFloat(stem.left) + parseFloat(stem.width) / 2) * canvas.zoom - centerX) < 1
        && start <= centerY + 1 && end >= centerY - 1, "delete connector does not meet the top-right selection dot")
    }
    verifySelectionLabel(false)
    const originalTop = bounds.style.top
    bounds.style.top = `${canvas.clientPoint(0, 8).y}px`
    await settle()
    verifySelectionLabel(true)
    bounds.style.top = originalTop
    await settle()
    const handles = transform.overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale:not([hidden])")
    assert(handles.length === 8, "starting view is missing ordinary resize handles")
    const handle = transform.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    const rect = handle.getBoundingClientRect(), width = parseFloat(bounds.style.width)
    const selectedRect = bounds.getBoundingClientRect()
    assert(Math.abs(rect.left + rect.width / 2 - (selectedRect.right - 1)) < 1 && Math.abs(rect.top + rect.height / 2 - (selectedRect.bottom - 1)) < 1,
      "resize affordances are not directly on the dotted frame")
    handle.addEventListener("mousedown", event => transform.handleScaleStart(event), {once: true})
    handle.dispatchEvent(new view.MouseEvent("mousedown", {button: 0, clientX: rect.left + 4, clientY: rect.top + 4}))
    transform.handleScaleDrag(new view.MouseEvent("mousemove", {clientX: rect.left + 84, clientY: rect.top + 44}))
    transform.handleScaleEnd()
    await settle()
    assert(parseFloat(bounds.style.width) > width, "ordinary resize did not update starting bounds")
    assert(Math.abs(outline.getBoundingClientRect().width - bounds.getBoundingClientRect().width) < 1, "dotted outline did not follow resizing")
    const authoredBounds = bounds.getAttribute("style")
    editor.features.selection.selectElement(doc.querySelector("p")!)
    const slot = editor.appendix.querySelector("slot")!
    slot.dispatchEvent(new view.WheelEvent("wheel", {deltaX: 3000, deltaY: 2000, bubbles: true, composed: true, cancelable: true}))
    editor.appendix.querySelector<HTMLButtonElement>('[name="starting-view"]')!.click()
    await settle()
    const shown = bounds.getBoundingClientRect()
    assert(editor.features.transformation.target === bounds && Math.abs(shown.left + shown.width / 2 - view.innerWidth / 2) < 1
      && Math.abs(shown.top + shown.height / 2 - view.innerHeight / 2) < 1, "Starting view button did not bring back and select the frame")
    assert(bounds.getAttribute("style") === authoredBounds, "Starting view button reset the existing authored bounds")
    const saved = editor.toHTML()
    assert(!saved.includes('part="canvas-starting-view"') && !saved.includes('part="canvas-starting-view-label"') && !saved.includes("◆element-selected"), "frame UI leaked into export")
    // Documents created before starting views lack the portable hiding rule.
    // The editor's adopted layout stylesheet masks that omission until preview.
    const legacy = new DOMParser().parseFromString(saved, "text/html")
    for(const style of legacy.head.querySelectorAll("style")) {
      style.textContent = style.textContent!.replace(/div\.ww-canvas-starting-view:not\(\[is\]\) \{[^}]*\}/g, "")
    }
    const widget = legacy.createElement("starting-view-widget")
    widget.style.cssText = "position:absolute;left:100px;top:100px;width:240px;height:120px;background:white"
    widget.innerHTML = '<button>Light DOM action</button><input aria-label="Light DOM answer">'
    legacy.body.insertBefore(widget, legacy.body.firstChild)
    const previewHTML = previewFrameHTML(legacy.cloneNode(true) as Document, {
      bridgeNonce: "canvas-starting-view-test", packages: [], importMap: null,
      hostOrigin: location.origin, frameOrigin: location.origin,
      entryURL: new URL("../src/preview-entry.ts", import.meta.url).href, executeScripts: true,
    })
    for(const html of [legacy.documentElement.outerHTML, previewHTML]) for(const [width, height] of [[900, 600], [450, 700], [1400, 400]]) {
      preview.style.cssText = `width:${width}px;height:${height}px;border:0`
      // Record the camera on the very first animation frame, before load.
      preview.srcdoc = html.replace("<head>", '<head><script>window.firstCamera = new Promise(resolve => requestAnimationFrame(() => resolve(document.body?.shadowRoot?.querySelector("slot")?.style.transform)))</script>')
      const loaded = new Promise<void>(resolve => preview.addEventListener("load", () => resolve(), {once: true}))
      document.body.append(preview)
      await loaded
      const output = preview.contentDocument!, outputView = preview.contentWindow! as Window & {firstCamera?: Promise<string>}
      const slot = output.body.shadowRoot!.querySelector("slot")!
      const first = await outputView.firstCamera
      assert(first === slot.style.transform, `reader shifted after its first frame (${first} -> ${slot.style.transform})`)
      const result = output.querySelector<HTMLElement>(".ww-canvas-starting-view")!.getBoundingClientRect()
      assert(Math.abs((result.left + result.right) / 2 - width / 2) < 1 && Math.abs((result.top + result.bottom) / 2 - height / 2) < 1, "reader did not center starting view")
      assert(result.width <= width + 1 && result.height <= height + 1 && (Math.abs(result.width - width) < 1 || Math.abs(result.height - height) < 1), "reader did not fit starting view to available screen")
      assert(!output.body.shadowRoot!.querySelector("[part=canvas-starting-view]"), "reader exposes the dotted editing outline")
      const outputWidget = output.querySelector<HTMLElement>("starting-view-widget")!
      const shadow = outputWidget.attachShadow({mode: "open"})
      shadow.innerHTML = '<slot></slot><button>Shadow action</button><input aria-label="Shadow answer">'
      const pan = output.body.shadowRoot!.querySelector<HTMLButtonElement>('[name="hand"]')!
      // Even with the hand tool enabled, widget controls own their input.
      pan.click()
      for(const root of [outputWidget, shadow]) {
        const action = root.querySelector<HTMLButtonElement>("button")!, input = root.querySelector<HTMLInputElement>("input")!
        const rect = action.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
        assert(output.elementFromPoint(x, y) === (root === shadow ? outputWidget : action), "starting bounds cover a widget control")
        if(root === shadow) assert(shadow.elementFromPoint(x, y) === action, "widget shadow action is unreachable")
        const pointer = new (preview.contentWindow as Window & typeof globalThis).PointerEvent("pointerdown", {button: 0, pointerId: 12, clientX: x, clientY: y, bubbles: true, composed: true, cancelable: true})
        action.dispatchEvent(pointer)
        assert(!pointer.defaultPrevented && !output.body.classList.contains("◆canvas-panning"), "reader stole widget input")
        let clicked = false
        action.addEventListener("click", () => { clicked = true }, {once: true})
        action.click()
        input.focus()
        assert(clicked && (root === shadow ? shadow.activeElement : output.activeElement) === input, "widget action or editable input failed")
      }
      preview.remove()
    }
    editor.appendix.querySelector('[name="delete-starting-view"] path')!.dispatchEvent(new view.MouseEvent("click", {bubbles: true, composed: true}))
    await settle()
    assert(!doc.querySelector(".ww-canvas-starting-view") && outline.hidden, "ordinary delete left starting view or outline")
    editor.doc.undo()
    await settle()
    assert(doc.querySelector(".ww-canvas-starting-view") && !outline.hidden, "undo did not restore starting view")
    // Empty paragraph cleanup shifts live Range offsets. Exercise the browser's
    // actual adjustment here; Happy DOM does not implement that behavior.
    const empty = document.createElement("iframe")
    empty.style.cssText = "width:900px;height:600px;border:0"
    empty.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
    document.body.append(empty)
    try {
      const emptyView = empty.contentWindow as Window & {editor?: DOMEditor}
      for(let i = 0; !emptyView.editor && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 20))
      assert(emptyView.editor, "empty canvas fixture did not initialize")
      emptyView.editor!.features.canvas.convert("canvas")
      emptyView.editor!.appendix.querySelector<HTMLButtonElement>('[name="starting-view"]')!.click()
      const emptyBounds = empty.contentDocument!.querySelector(".ww-canvas-starting-view")
      assert(emptyBounds && emptyView.editor!.features.transformation.target === emptyBounds, "empty canvas did not select its new starting view")
    }
    finally { empty.contentWindow?.editor?.destroy(); empty.remove() }
    // Retain a useful interactive fixture for manual visual inspection.
    if(new URLSearchParams(location.search).has("visual")) {
      canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "zoom-out"})
      return
    }
  }
  finally {
    preview.remove()
    if(!new URLSearchParams(location.search).has("visual")) { view.editor?.destroy(); frame.remove() }
  }
}
