import type {DOMEditor} from "../src/domeditor"
import {ShapeKeyboard} from "../src/components/shape-keyboard"
import {shapeKeyboardInputEvent, type ShapeKeyboardInput} from "../src/editor-bridge"
import type {GraphicShapePaint, GraphicShapeType} from "../src/graphic"

function assert(condition: unknown, message: string): asserts condition { if(!condition) throw new Error(message) }

/** A held shape shortcut previews at the cursor and can place more than once. */
export async function checkGraphicKeyboardHeld() {
  const inspectHeld = new URLSearchParams(location.search).has("inspect-held")
  const inspectOverflow = new URLSearchParams(location.search).has("inspect-overflow")
  const fixture = document.createElement("section")
  fixture.setAttribute("aria-label", "Held shape keyboard preview fixture")
  fixture.style.cssText = "position:fixed;inset:12px;z-index:2147483646;display:flex;flex-direction:column;gap:8px;padding:8px;background:#eef2f7;box-sizing:border-box"
  const frame = document.createElement("iframe")
  frame.style.cssText = "display:block;flex:1;min-height:250px;width:100%;border:1px solid #94a3b8;background:white;max-width:none"
  frame.srcdoc = '<!doctype html><style>html,body{margin:0}svg{display:block}</style><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  const keyboard = new ShapeKeyboard()
  keyboard.style.cssText = "width:min(100%,760px);max-height:42vh;flex:none"
  fixture.append(frame, keyboard)
  document.body.append(fixture)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
  let keepFixture = false
  let handleHostMessage: ((event: MessageEvent) => void) | undefined
  try {
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 250; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, view.editorError ?? "Held shape keyboard fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const layout = async () => {
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    }
    doc.body.innerHTML = '<svg id="captured" viewBox="0 0 960 500" style="width:100%;height:100vh"><!--keep this comment--><g id="original-group"><rect id="original-shape" x="35" y="35" width="80" height="65" fill="skyblue"/></g><circle id="original-sibling" cx="870" cy="425" r="24" fill="tomato"/></svg>'
    const graphic = doc.querySelector<SVGSVGElement>("#captured")!
    if(inspectOverflow) {
      graphic.style.cssText = "width:calc(100% - 120px);height:calc(100vh - 80px);margin:40px 60px"
      graphic.setAttribute("preserveAspectRatio", "none")
      keyboard.paint = {...keyboard.paint, fill: "#ef4444", stroke: "#991b1b"}
    }
    editor.features.selection.captureElement(graphic)
    await layout()
    const originalComment = graphic.firstChild!, originalGroup = graphic.children[0], originalSibling = graphic.children[1]
    const originalHTML = doc.body.innerHTML
    const originalSerialized = editor.toHTML(true)

    // Mirror the host's same-origin iframe bridge for this native-browser fixture.
    keyboard.addEventListener("shape-keyboard-preview", event => {
      const detail = (event as CustomEvent<{shape: GraphicShapeType | null, paint?: GraphicShapePaint, code?: string, key?: string}>).detail
      editor.features.graphic.actions.setGraphicShapePreview({type: "setGraphicShapePreview", ...detail})
    })
    handleHostMessage = event => {
      if(event.source !== view || event.data?.type !== shapeKeyboardInputEvent) return
      const input = event.data.detail as ShapeKeyboardInput
      keyboard.handleInput(input)
    }
    window.addEventListener("message", handleHostMessage)

    const dispatchKey = (type: "keydown" | "keyup") => {
      const event = new view.KeyboardEvent(type, {bubbles: true, cancelable: true, key: inspectOverflow ? "q" : "a", code: inspectOverflow ? "KeyQ" : "KeyA", altKey: false})
      doc.dispatchEvent(event)
      return event
    }
    const pointerMove = async (x: number, y: number) => {
      const target = doc.elementFromPoint(x, y) ?? graphic
      target.dispatchEvent(new view.PointerEvent("pointermove", {bubbles: true, composed: true, clientX: x, clientY: y, pointerType: "mouse"}))
      await layout()
    }
    const pointerClick = async (x: number, y: number) => {
      const target = doc.elementFromPoint(x, y) ?? graphic
      const down = new view.PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y, pointerType: "mouse"})
      target.dispatchEvent(down)
      doc.dispatchEvent(new view.PointerEvent("pointerup", {bubbles: true, composed: true, button: 0, clientX: x, clientY: y, pointerType: "mouse"}))
      await layout()
      assert(down.defaultPrevented, "held shape click was not claimed for placement")
    }
    const preview = () => editor.appendix.querySelector<SVGSVGElement>(".◆graphic-insertion-preview")
    const cursorPoint = (xRatio: number, yRatio: number) => {
      const box = graphic.getBoundingClientRect()
      if(inspectOverflow) {
        const m = graphic.getScreenCTM()!, scale = graphic.currentScale, t = graphic.currentTranslate
        const frame = graphic.viewBox.baseVal
        const x = frame.x + frame.width * xRatio - t.x, y = frame.y + frame.height * yRatio - t.y
        return {x: m.e + (m.a * x + m.c * y) / scale, y: m.f + (m.b * x + m.d * y) / scale}
      }
      return {x: box.left + box.width * xRatio, y: box.top + box.height * yRatio}
    }
    const center = (element: Element) => {
      const box = element.getBoundingClientRect()
      return {x: box.left + box.width / 2, y: box.top + box.height / 2}
    }
    const assertCentered = (element: Element, point: {x: number, y: number}, label: string) => {
      const actual = center(element)
      assert(Math.abs(actual.x - point.x) < 2 && Math.abs(actual.y - point.y) < 2,
        `${label} was not centered at the cursor: ${JSON.stringify(actual)} vs ${JSON.stringify(point)}`)
    }

    const toggleModifiers = async () => {
      const page = keyboard.activePage
      const held = keyboard.shadowRoot!.querySelector('.key[aria-pressed="true"]')
      for(const [type, key, shiftKey, modifierCapsLock] of [
        ["keydown", "Shift", true, false], ["keyup", "Shift", false, false],
        ["keydown", "CapsLock", false, true], ["keyup", "CapsLock", false, true],
        ["keydown", "CapsLock", false, false], ["keyup", "CapsLock", false, false],
      ] as const) {
        doc.dispatchEvent(new view.KeyboardEvent(type, {bubbles: true, key,
          code: key === "Shift" ? "ShiftLeft" : "CapsLock", shiftKey, modifierCapsLock}))
        await new Promise(resolve => setTimeout(resolve, 30))
        await keyboard.updateComplete
        assert(keyboard.shadowRoot!.querySelector(".grid")?.getAttribute("aria-label") === page,
          `${key} ${type} switched the selected ${page} page`)
        assert(keyboard.shadowRoot!.querySelector('.key[aria-pressed="true"]') === held,
          `${key} ${type} changed the held shape`)
      }
    }
    for(const page of ["Basic", "Advanced", "Arrows", "Flowchart"]) {
      keyboard.shadowRoot!.querySelector<HTMLButtonElement>(`.tabs button[aria-label="${page}"]`)!.click()
      await keyboard.updateComplete
      await toggleModifiers()
      assert(keyboard.shadowRoot!.querySelector(".grid")?.getAttribute("aria-label") === page,
        `Shift or Caps Lock switched the selected ${page} page`)
    }
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.tabs button[aria-label="Basic"]')!.click()
    await keyboard.updateComplete
    const keydown = dispatchKey("keydown")
    await new Promise(resolve => setTimeout(resolve, 30))
    await keyboard.updateComplete
    assert(keydown.defaultPrevented, "captured graphic did not relay the held shape key")
    assert(keyboard.shadowRoot?.querySelector('.key[aria-pressed="true"]'), "held shape key was not highlighted on the keyboard")
    const heldShape = keyboard.shadowRoot!.querySelector('.key[aria-pressed="true"]')!
    await toggleModifiers()
    assert(keyboard.shadowRoot!.querySelector('.key[aria-pressed="true"]') === heldShape,
      "Shift or Caps Lock changed the held shape")
    assert(doc.body.innerHTML === originalHTML, "holding the shape key mutated authored content")
    assert(editor.toHTML(true) === originalSerialized, "holding the shape key changed serialized content")

    const placements: SVGGraphicsElement[] = []
    for(const [zoom, locations] of [[75, [[0.28, 0.32], [0.67, 0.66]]], [150, [[0.48, 0.42]]]] as const) {
      editor.features.graphic.actions.navigateGraphic({type: "navigateGraphic", operation: "set-zoom", zoom})
      await layout()
      for(const [xRatio, yRatio] of locations) {
        const point = cursorPoint(inspectOverflow ? .96 : xRatio, inspectOverflow ? .35 : yRatio)
        const authoredHTML = doc.body.innerHTML
        const serializedHTML = editor.toHTML(true)
        await pointerMove(point.x, point.y)
        const activePreview = preview()
        assert(activePreview && activePreview.firstElementChild, `${zoom}%: pointer hover did not show the held shape preview`)
        assert(activePreview.getAttribute("part") === "graphic-preview" && Math.abs(Number(activePreview.style.opacity) - .4) < .001, "preview lost its appendix presentation")
        assert(activePreview.getRootNode() === editor.appendix, "preview was added to authored content")
        const previewViewBox = activePreview.viewBox.baseVal
        assert(Math.abs(activePreview.clientWidth - previewViewBox.width) < 1 && Math.abs(activePreview.clientHeight - previewViewBox.height) < 1,
          `${zoom}%: preview root no longer has CSS viewport dimensions matching its viewBox`)
        assert(Math.abs(graphic.clientWidth - activePreview.clientWidth) > 1,
          `${zoom}%: fixture no longer distinguishes the authored and preview viewport widths`)
        const filterSource = decodeURIComponent(view.getComputedStyle(activePreview).filter.match(/data:image\/svg\+xml,([^"#]+)/)?.[1] ?? "")
        const insideFlood = filterSource.match(/<feFlood x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" result="inside"\s*\/>/)
        assert(insideFlood, `${zoom}%: preview has no viewport-bounded inside flood: ${filterSource}`)
        // Map the filter rectangle from preview CSS pixels to the screen and
        // compare it with the authored SVG's rendered viewport.
        const viewportMatrix = (svg: SVGSVGElement) => {
          const box = svg.viewBox.baseVal
          const sx = svg.clientWidth / box.width, sy = svg.clientHeight / box.height
          if(svg.getAttribute("preserveAspectRatio") === "none") return new view.DOMMatrix([sx, 0, 0, sy, -box.x * sx, -box.y * sy])
          const scale = Math.min(sx, sy)
          return new view.DOMMatrix([scale, 0, 0, scale,
            (svg.clientWidth - box.width * scale) / 2 - box.x * scale,
            (svg.clientHeight - box.height * scale) / 2 - box.y * scale])
        }
        const screenMatrix = (svg: SVGSVGElement) => {
          const matrix = svg.getScreenCTM()
          assert(matrix, `${zoom}%: SVG has no screen transform`)
          return new view.DOMMatrix([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f])
        }
        const previewBase = screenMatrix(activePreview)
        const previewViewport = viewportMatrix(activePreview)
        const previewScreenFromCSS = previewBase.multiply(previewViewport.inverse())
        const [x, y, width, height] = insideFlood.slice(1).map(Number)
        const floodCorners = [
          [x, y], [x + width, y], [x + width, y + height], [x, y + height],
        ]
        const floodScreenCorners = floodCorners.map(([x, y]) => new view.DOMPoint(x, y).matrixTransform(previewScreenFromCSS))
        const graphicViewport = graphic.getBoundingClientRect()
        const graphicScreenCorners = [
          [graphicViewport.left, graphicViewport.top], [graphicViewport.right, graphicViewport.top],
          [graphicViewport.right, graphicViewport.bottom], [graphicViewport.left, graphicViewport.bottom],
        ]
        for(const [index, [x, y]] of graphicScreenCorners.entries()) {
          const nearest = Math.min(...floodScreenCorners.map(point => Math.hypot(point.x - x, point.y - y)))
          assert(nearest < 1, `${zoom}%: preview inside-flood corner ${index} missed the rendered graphic viewport by ${nearest}px`)
        }
        assertCentered(activePreview.firstElementChild, point, `${zoom}% preview`)
        assert(doc.body.innerHTML === authoredHTML, "hovering the preview mutated authored content")
        assert(editor.toHTML(true) === serializedHTML, "hovering the preview changed serialized content")
        if(inspectHeld || inspectOverflow) {
          if(inspectOverflow) {
            // Keep a rendered sample visible when the inspector takes focus.
            const sample = activePreview.cloneNode(true) as SVGSVGElement
            sample.classList.remove("◆graphic-insertion-preview")
            editor.appendix.append(sample)
          }
          keepFixture = true
          return
        }
        editor.doc.stopCapturing()
        await pointerClick(point.x, point.y)
        const inserted = Array.from(graphic.children).find(child => child !== originalGroup && child !== originalSibling && !placements.includes(child as SVGGraphicsElement)) as SVGGraphicsElement | undefined
        assert(inserted, "held shape click did not add a graphic sibling")
        assertCentered(inserted, point, `${zoom}% committed shape`)
        placements.push(inserted)
        assert(graphic.firstChild === originalComment && originalGroup.isConnected && originalSibling.isConnected,
          "placing a held shape replaced an original sibling or comment")
      }
    }

    dispatchKey("keyup")
    await new Promise(resolve => setTimeout(resolve, 30))
    await layout()
    await keyboard.updateComplete
    assert(!keyboard.shadowRoot?.querySelector('.key[aria-pressed="true"]'), "released shape key stayed highlighted")
    assert(!preview(), "released shape key left its preview visible")
    assert(!editor.toHTML(true).includes("◆"), "shape preview markers leaked into serialized content")

    editor.doc.undo()
    await layout()
    assert(Array.from(graphic.children).filter(child => child !== originalGroup && child !== originalSibling).length === 2,
      "undo did not remove the last held-shape placement")
    editor.doc.redo()
    await layout()
    assert(Array.from(graphic.children).filter(child => child !== originalGroup && child !== originalSibling).length === 3,
      "redo did not restore the last held-shape placement")
    assert(originalGroup.isConnected && originalSibling.isConnected && graphic.firstChild === originalComment,
      "undo/redo changed the original graphic siblings")
  }
  finally {
    if(!keepFixture) {
      if(handleHostMessage) window.removeEventListener("message", handleHostMessage)
      view.editor?.destroy()
      fixture.remove()
    }
  }
}
