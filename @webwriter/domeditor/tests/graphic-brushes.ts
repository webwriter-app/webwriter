import type {DOMEditor} from "../src/domeditor"
import {ShapeKeyboard} from "../src/components/shape-keyboard"
import {shapeKeyboardInputEvent, selectionChangeEvent, type ShapeKeyboardInput} from "../src/editor-bridge"
import {graphicShapeType, type GraphicMode, type GraphicShapePaint, type GraphicShapeType} from "../src/graphic"

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if(!condition) throw new Error(message) }

export async function checkGraphicBrushes() {
  const inspect = new URLSearchParams(location.search).has("inspect-brushes")
  const fixture = document.createElement("section")
  fixture.setAttribute("aria-label", "Graphic brush persistence fixture")
  fixture.style.cssText = "position:fixed;inset:12px;z-index:2147483646;display:flex;flex-direction:column;gap:8px;padding:8px;background:#eef2f7;box-sizing:border-box"
  const frame = document.createElement("iframe")
  frame.style.cssText = "display:block;flex:1;min-height:260px;width:100%;border:1px solid #94a3b8;background:white;max-width:none"
  frame.srcdoc = '<!doctype html><style>html,body{margin:0}svg{display:block}</style><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  const keyboard = new ShapeKeyboard()
  keyboard.style.cssText = "width:min(100%,760px);max-height:42vh;flex:none"
  fixture.append(frame, keyboard)
  document.body.append(fixture)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
  const relay = (event: MessageEvent) => {
    if(event.source !== view) return
    if(event.data?.type === shapeKeyboardInputEvent) keyboard.handleInput(event.data.detail as ShapeKeyboardInput)
    if(event.data?.type === selectionChangeEvent && event.data.detail.graphic?.capture) keyboard.mode = event.data.detail.graphic.mode
  }
  const waitFrame = async () => {
    await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    await keyboard.updateComplete
  }
  window.addEventListener("message", relay)
  try {
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 150; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, view.editorError ?? "Graphic brush fixture did not initialize")
    const editor = view.editor, doc = frame.contentDocument!
    doc.body.innerHTML = '<svg id="captured" viewBox="0 0 800 450" style="width:800px;height:450px"><!--keep--></svg>'
    const graphic = doc.querySelector<SVGSVGElement>("#captured")!
    editor.features.selection.captureElement(graphic)

    const setMode = (mode: GraphicMode, paint: GraphicShapePaint = keyboard.paint) =>
      editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode, paint})
    keyboard.addEventListener("ribbon-button-click", event => {
      const label = (event as CustomEvent<{label: string}>).detail.label
      if(label.startsWith("graphic-mode:")) setMode(label.slice("graphic-mode:".length) as GraphicMode)
    })
    keyboard.addEventListener("shape-paint-change", event => {
      keyboard.paint = {...(event as CustomEvent<{paint: Required<GraphicShapePaint>}>).detail.paint}
      const mode = editor.features.graphic.getState()?.mode
      if(mode && mode !== "select") editor.features.graphic.actions.setGraphicDrawPaint({type: "setGraphicDrawPaint", paint: keyboard.paint})
    })
    keyboard.addEventListener("shape-brush-preview", event => {
      const detail = (event as CustomEvent<{paint: Required<GraphicShapePaint> | null, mode: Exclude<GraphicMode, "select">}>).detail
      const paint = detail.paint ?? keyboard.paint
      const current = editor.features.graphic.getState()?.mode
      if(detail.paint && current !== detail.mode) setMode(detail.mode, paint)
      else editor.features.graphic.actions.setGraphicDrawPaint({type: "setGraphicDrawPaint", paint})
    })
    keyboard.addEventListener("shape-keyboard-command", event => {
      const detail = (event as CustomEvent<{shape: GraphicShapeType, paint: GraphicShapePaint}>).detail
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: detail.shape, paint: detail.paint})
    })
    await waitFrame()

    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Freehand"]')!.click()
    await waitFrame()
    const preset = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="#5b9bd5, 8 px brush"]')!
    preset.click()
    await keyboard.updateComplete
    const opacity = keyboard.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Drawing opacity"]')!
    opacity.value = "0.5"
    opacity.dispatchEvent(new Event("input", {bubbles: true}))
    await keyboard.updateComplete

    let pointerId = 1
    const pointer = (type: string, id: number, x: number, y: number, buttons = 0) => {
      const matrix = graphic.getScreenCTM()!
      return new view.PointerEvent(type, {bubbles: true, cancelable: true, isPrimary: true, pointerType: "mouse", button: 0,
        pointerId: id, buttons, clientX: matrix.a * x + matrix.c * y + matrix.e, clientY: matrix.b * x + matrix.d * y + matrix.f})
    }
    const pointClick = async (x: number, y: number) => {
      const id = pointerId++
      graphic.dispatchEvent(pointer("pointerdown", id, x, y, 1))
      doc.dispatchEvent(pointer("pointerup", id, x, y))
      await waitFrame()
    }
    const freehand = (x: number, y: number) => {
      const id = pointerId++
      graphic.dispatchEvent(pointer("pointerdown", id, x, y, 1))
      doc.dispatchEvent(pointer("pointermove", id, x + 60, y + 30, 1))
      doc.dispatchEvent(pointer("pointerup", id, x + 80, y + 45))
    }
    const draw = async (mode: "draw" | "lines" | "curves", x: number, y: number) => {
      const before = new Set(graphic.children)
      const keydown = new view.KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "0", code: "Digit0"})
      doc.dispatchEvent(keydown)
      await new Promise(resolve => setTimeout(resolve, 40))
      await waitFrame()
      const modeName = mode === "draw" ? "Freehand" : mode === "lines" ? "Lines" : "Curves"
      assert(keyboard.activePage === modeName, `${mode}: the drawing tab was not active`)

      if(mode === "draw") freehand(x, y)
      else {
        await pointClick(x, y)
        await pointClick(x + 100, y + 55)
        doc.dispatchEvent(new view.KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter", code: "Enter"}))
      }
      await waitFrame()
      const temporary = [...graphic.children].find(child => !before.has(child)) as SVGGraphicsElement | undefined
      assert(temporary, `${mode}: temporary brush path was not inserted`)
      assert(temporary.getAttribute("stroke") === "#70ad47", `${mode}: temporary brush color was ${temporary.getAttribute("stroke")}`)
      assert(temporary.getAttribute("stroke-width") === "1", `${mode}: temporary brush width was ${temporary.getAttribute("stroke-width")}`)
      assert(temporary.getAttribute("opacity") === "0.5", `${mode}: temporary brush opacity was ${temporary.getAttribute("opacity")}`)

      doc.dispatchEvent(new view.KeyboardEvent("keyup", {bubbles: true, key: "0", code: "Digit0"}))
      await new Promise(resolve => setTimeout(resolve, 40))
      await waitFrame()
      const authoredBefore = new Set(graphic.children)
      if(mode === "draw") freehand(x + 10, y + 10)
      else {
        await pointClick(x + 10, y + 10)
        await pointClick(x + 110, y + 65)
        doc.dispatchEvent(new view.KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter", code: "Enter"}))
      }
      await waitFrame()
      const restored = [...graphic.children].find(child => !authoredBefore.has(child)) as SVGGraphicsElement | undefined
      assert(restored, `${mode}: persistent brush path was not inserted after keyup`)
      assert(restored.getAttribute("stroke") === "#5b9bd5", `${mode}: persistent brush color did not restore`)
      assert(restored.getAttribute("stroke-width") === "8", `${mode}: persistent brush width did not restore`)
      assert(restored.getAttribute("opacity") === "0.5", `${mode}: persistent brush opacity did not restore`)
      assert(keyboard.paint.stroke === "#5b9bd5" && keyboard.paint["stroke-width"] === "8", `${mode}: temporary brush replaced persistent keyboard paint`)
    }

    for(const [mode, y] of [["draw", 100], ["lines", 180], ["curves", 260]] as const) {
      const tab = mode === "draw" ? "Freehand" : mode === "lines" ? "Lines" : "Curves"
      keyboard.shadowRoot!.querySelector<HTMLButtonElement>(`button[aria-label="${tab}"]`)!.click()
      await waitFrame()
      await draw(mode, 140, y)
    }

    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.tabs button[aria-label="Basic"]')!.click()
    await waitFrame()
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.key[title="Rectangle"]')!.click()
    await waitFrame()
    const rect = editor.features.graphic.selectedShape
    assert(rect && graphicShapeType(rect) === "square-rectangle", "shape keyboard did not insert the rectangle")
    assert(rect.getAttribute("fill") === "#ffffff", `inserted rectangle fill unexpectedly changed: ${rect.getAttribute("fill")}`)
    assert(rect.getAttribute("stroke") === "#334155", `inserted rectangle stroke inherited brush: ${rect.getAttribute("stroke")}`)
    assert(rect.getAttribute("stroke-width") === "4", `inserted rectangle width inherited brush: ${rect.getAttribute("stroke-width")}`)
    assert(view.getComputedStyle(rect).opacity === "1", `inserted rectangle opacity inherited brush: ${view.getComputedStyle(rect).opacity}`)

  }
  finally {
    if(!inspect) { window.removeEventListener("message", relay); view.editor?.destroy(); fixture.remove() }
  }
}
