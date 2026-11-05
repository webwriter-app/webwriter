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
    const minimap = editor.appendix.querySelector<HTMLButtonElement>('[part="canvas-minimap"]')!
    const toggle = editor.appendix.querySelector<HTMLButtonElement>('[name="minimap-toggle"]')!
    for(let i = 0; !minimap.querySelector("image")?.hasAttribute("href") && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(minimap.querySelector("image")?.getAttribute("href")?.startsWith("data:image/png"), "editor did not rasterize the minimap")
    assert(toggle.getAttribute("aria-expanded") === "true" && minimap.getBoundingClientRect().top > toggle.getBoundingClientRect().bottom,
      "editor minimap is not initially open below the canvas controls")
    const toolbar = toggle.parentElement!
    const expanded = toolbar.getBoundingClientRect()
    const controls = toolbar.parentElement!
    const mapRect = minimap.getBoundingClientRect()
    const bottomGap = controls.getBoundingClientRect().bottom - parseFloat(view.getComputedStyle(controls).borderBottomWidth) - mapRect.bottom
    assert(Math.abs(mapRect.top - expanded.bottom - bottomGap) < .5, "minimap has uneven spacing above and below")
    toggle.click()
    await settle()
    const collapsed = toolbar.getBoundingClientRect()
    assert(minimap.hidden && toggle.getAttribute("aria-expanded") === "false", "minimap did not close")
    assert(Math.abs(expanded.left - collapsed.left) < .5 && Math.abs(expanded.width - collapsed.width) < .5
      && Math.abs(expanded.height - collapsed.height) < .5, "collapsing the minimap shifted the toolbar")
    assert(view.getComputedStyle(toggle).backgroundColor === "rgba(0, 0, 0, 0)", "minimap chevron has a background")
    const presets = toolbar.querySelector('[role="group"]')!
    assert(presets.querySelector('[name="actual-size"]') && presets.querySelector('[name="fit-content"]'), "zoom presets are not grouped")
    toggle.click()
    const group = editor.appendix.querySelector<HTMLElement>('.◆canvas-starting-view-controls')!
    const button = group.querySelector<HTMLButtonElement>('[name="add-starting-view"]')!
    const show = group.querySelector<HTMLButtonElement>('[name="starting-view"]')!
    assert(group.getAttribute("role") === "group" && group.firstElementChild === button && button.querySelector("svg")
      && show.textContent === "Starting view" && show.disabled, "starting-view controls are not an add-icon and label group")
    assert(view.getComputedStyle(group).backgroundColor === "rgba(255, 255, 255, 0.5)", "starting-view overlay lacks its translucent background")
    button.click()
    const bounds = doc.querySelector<HTMLDivElement>(".ww-canvas-starting-view")!
    assert(bounds && Math.abs(bounds.getBoundingClientRect().left) < 1 && Math.abs(bounds.getBoundingClientRect().width - 900) < 1, "saved bounds do not match the viewport")
    const outline = editor.appendix.querySelector<HTMLElement>("[part=canvas-minimap-starting-view]")!
    const edge = outline.querySelector<HTMLButtonElement>("button")!, corner = outline.querySelector<HTMLElement>("[data-corner=nw]")!
    const map = minimap.getBoundingClientRect()
    let outlineRect = outline.getBoundingClientRect()
    for(let i = 0; (outline.hidden || outlineRect.top < map.top || outlineRect.right > map.right) && i < 100; i++) {
      await new Promise(resolve => setTimeout(resolve, 20))
      outlineRect = outline.getBoundingClientRect()
    }
    assert(!outline.hidden && view.getComputedStyle(bounds).visibility === "hidden"
      && !editor.appendix.querySelector("[part=canvas-starting-view]"), "starting view is not limited to the minimap")
    const x = outlineRect.left + outlineRect.width / 2, y = outlineRect.top + 1
    const hit = editor.appendix.elementFromPoint(x, y)!
    assert(edge.contains(hit), "starting view frame cannot be dragged in the minimap")
    assert(editor.appendix.elementFromPoint(x, outlineRect.top + outlineRect.height / 2) === minimap,
      "starting view frame intercepts clicks inside it")
    const reset = presets.querySelector<HTMLButtonElement>('[name="actual-size"]')!
    assert(reset.querySelector("svg") && !reset.textContent?.trim() && reset.getAttribute("aria-label") === "Reset zoom to 100%", "reset zoom is not an icon button")
    // Synthetic browser events do not have an active native pointer to capture.
    edge.setPointerCapture = corner.setPointerCapture = () => {}
    const pointer = (type: string, clientX: number, clientY: number, handle: Element = hit) => handle.dispatchEvent(new view.PointerEvent(type, {
      button: 0, pointerId: 7, isPrimary: true, clientX, clientY, bubbles: true, cancelable: true, composed: true,
    }))
    const slot = editor.appendix.querySelector("slot")!, camera = slot.style.transform, zoom = canvas.zoom
    const savedPosition = bounds.style.left
    const width = bounds.style.width, height = bounds.style.height
    pointer("pointerdown", x, y)
    pointer("pointermove", x + 8, y - 7)
    assert(outline.getBoundingClientRect().left > outlineRect.left && slot.style.transform !== camera
      && canvas.zoom === zoom && bounds.style.left === savedPosition, "drag did not move the frame and pan the camera live")
    pointer("pointerup", x + 8, y - 7)
    await settle()
    assert(bounds.style.left !== savedPosition && bounds.style.width === width && bounds.style.height === height, "drag did not save the new center at the original size")
    const moved = bounds.getBoundingClientRect()
    assert(Math.abs(moved.left + moved.width / 2 - view.innerWidth / 2) < 1
      && Math.abs(moved.top + moved.height / 2 - view.innerHeight / 2) < 1, "camera did not follow the moved starting view")
    const handle = corner.getBoundingClientRect(), cx = handle.left + handle.width / 2, cy = handle.top + handle.height / 2
    assert(edge.getAttribute("aria-pressed") === "true" && editor.appendix.elementFromPoint(cx, cy) === corner,
      "the selected frame has no accessible resize corner")
    pointer("pointerdown", cx, cy, corner)
    pointer("pointermove", cx + 6, cy + 5, corner)
    pointer("pointerup", cx + 6, cy + 5, corner)
    assert(parseFloat(bounds.style.width) < parseFloat(width) && parseFloat(bounds.style.height) < parseFloat(height),
      "resizing the frame did not change the saved dimensions")
    const authoredBounds = bounds.getAttribute("style")
    slot.dispatchEvent(new view.WheelEvent("wheel", {deltaX: 3000, deltaY: 2000, bubbles: true, composed: true, cancelable: true}))
    show.click()
    await settle()
    const shown = bounds.getBoundingClientRect()
    assert(Math.abs(shown.left + shown.width / 2 - view.innerWidth / 2) < 1
      && Math.abs(shown.top + shown.height / 2 - view.innerHeight / 2) < 1, "Starting view button did not center the camera on the frame")
    assert(canvas.zoom > zoom, "Starting view button did not use the resized frame to set the zoom")
    assert(bounds.getAttribute("style") === authoredBounds, "Starting view button reset the existing authored bounds")
    const saved = editor.toHTML()
    const savedBody = new DOMParser().parseFromString(saved, "text/html").body
    assert(!savedBody.querySelector("[part=canvas-minimap-starting-view]") && !savedBody.outerHTML.includes("◆element-selected"), "starting view UI leaked into authored HTML")
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
      const output = preview.contentDocument!, outputView = preview.contentWindow! as Window & typeof globalThis & {firstCamera?: Promise<string>}
      const slot = output.body.shadowRoot!.querySelector("slot")!
      const first = await outputView.firstCamera
      assert(first === slot.style.transform, `reader shifted after its first frame (${first} -> ${slot.style.transform})`)
      const result = output.querySelector<HTMLElement>(".ww-canvas-starting-view")!.getBoundingClientRect()
      assert(Math.abs((result.left + result.right) / 2 - width / 2) < 1 && Math.abs((result.top + result.bottom) / 2 - height / 2) < 1, "reader did not center starting view")
      assert(result.width <= width + 1 && result.height <= height + 1 && (Math.abs(result.width - width) < 1 || Math.abs(result.height - height) < 1), "reader did not fit starting view to available screen")
      const readerOutline = output.body.shadowRoot!.querySelector<HTMLElement>("[part=canvas-minimap-starting-view]")!
      for(let i = 0; readerOutline.hidden && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 20))
      const readerEdge = readerOutline.querySelector<HTMLButtonElement>("button")!
      assert(!readerOutline.hidden && readerEdge.disabled && outputView.getComputedStyle(readerEdge).borderTopStyle === "dashed",
        "reader lacks a read-only starting view frame on its minimap")
      const outputWidget = output.querySelector<HTMLElement>("starting-view-widget")!
      const shadow = outputWidget.attachShadow({mode: "open"})
      shadow.innerHTML = '<slot></slot><button>Shadow action</button><input aria-label="Shadow answer">'
      const appendix = output.body.shadowRoot!
      const pan = appendix.querySelector<HTMLButtonElement>('[name="hand"]')!
      for(const root of [outputWidget, shadow]) {
        const action = root.querySelector<HTMLButtonElement>("button")!, input = root.querySelector<HTMLInputElement>("input")!
        const rect = action.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
        assert(output.elementFromPoint(x, y) === (root === shadow ? outputWidget : action), "starting bounds cover a widget control")
        if(root === shadow) assert(shadow.elementFromPoint(x, y) === action, "widget shadow action is unreachable")
        let clicked = false
        action.addEventListener("click", () => { clicked = true }, {once: true})
        action.click()
        input.focus()
        assert(clicked && (root === shadow ? shadow.activeElement : output.activeElement) === input, "widget action or editable input failed with Hand off")
      }
      pan.click()
      const panSurface = appendix.querySelector<HTMLElement>('[part="canvas-pan-surface"]')!
      assert(panSurface && !panSurface.hidden, "Hand did not show the canvas pan surface")
      for(const root of [outputWidget, shadow]) {
        const action = root.querySelector<HTMLButtonElement>("button")!
        const rect = action.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
        const hit = appendix.elementFromPoint(x, y)!
        assert(hit === panSurface, `Hand surface does not cover widget control (${hit?.outerHTML})`)
        const before = slot.style.transform
        const pointer = (type: string, clientX: number, clientY: number) => new outputView.PointerEvent(type, {
          button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 12,
          clientX, clientY, bubbles: true, composed: true, cancelable: true,
        })
        hit.dispatchEvent(pointer("pointerdown", x, y))
        output.dispatchEvent(pointer("pointermove", x + 36, y + 24))
        output.dispatchEvent(pointer("pointerup", x + 36, y + 24))
        assert(slot.style.transform !== before, "Hand drag over widget control did not pan the canvas")
      }
      pan.click()
      assert(panSurface.hidden, "Hand off did not hide the canvas pan surface")
      for(const root of [outputWidget, shadow]) {
        const action = root.querySelector<HTMLButtonElement>("button")!, input = root.querySelector<HTMLInputElement>("input")!
        const rect = action.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
        const hit = output.elementFromPoint(x, y)
        assert(hit === (root === shadow ? outputWidget : action), "widget hit target was not restored when Hand turned off")
        input.focus()
        assert((root === shadow ? shadow.activeElement : output.activeElement) === input, "widget input did not regain focus with Hand off")
      }
      preview.remove()
    }
    editor.appendix.querySelector('[name="delete-starting-view"] path')!.dispatchEvent(new view.MouseEvent("click", {bubbles: true, composed: true}))
    await settle()
    assert(!doc.querySelector(".ww-canvas-starting-view") && outline.hidden, "delete left the starting view frame visible")
    editor.doc.undo()
    await settle()
    for(let i = 0; outline.hidden && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(doc.querySelector(".ww-canvas-starting-view") && !outline.hidden, "undo did not restore the minimap starting view")
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
      emptyView.editor!.appendix.querySelector<HTMLButtonElement>('[name="add-starting-view"]')!.click()
      const emptyBounds = empty.contentDocument!.querySelector(".ww-canvas-starting-view")
      const emptyOutline = emptyView.editor!.appendix.querySelector<HTMLElement>('[part="canvas-minimap-starting-view"]')!
      for(let i = 0; emptyOutline.hidden && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 20))
      assert(emptyBounds && !emptyOutline.hidden, "empty canvas did not show its starting view on the minimap")
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
