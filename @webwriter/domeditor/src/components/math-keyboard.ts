import {LitElement, css, html, nothing, svg} from "lit"
import {mathKeyboardLayouts, type MathKeyboardKey} from "../math-input"
import {ribbonIcon} from "../ribbon-icons"
import type {MathHandwritingRecognizer} from "../math-handwriting"
import type {Stroke, StrokePoint} from "../math-handwriting-ocr"
import {parseMathFragment} from "../math"

const movementDirection = (command: string): string | undefined => {
  const match = /^move:(left|right|up|down)$/.exec(command)
  return match?.[1]
}

type Point = Pick<StrokePoint, "x" | "y">
const layoutIcons: Record<string, string> = {numbers: "123", operators: "∑", letters: "A", greek: "α"}
const pointSegmentDistance = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x, dy = end.y - start.y
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy)
}

/** Swept hit testing also catches ink crossed between sparse pointer events. */
const eraserHitsSegment = (from: Point, to: Point, start: Point, end: Point) => {
  const dx = to.x - from.x, dy = to.y - from.y
  const sx = end.x - start.x, sy = end.y - start.y
  const determinant = dx * sy - dy * sx
  if(determinant) {
    const x = start.x - from.x, y = start.y - from.y
    const t = (x * sy - y * sx) / determinant
    const u = (x * dy - y * dx) / determinant
    if(t >= 0 && t <= 1 && u >= 0 && u <= 1) return true
  }
  return Math.min(pointSegmentDistance(from, start, end), pointSegmentDistance(to, start, end),
    pointSegmentDistance(start, from, to), pointSegmentDistance(end, from, to)) <= 8
}

/** A compact on-screen formula keyboard for touch and pointer input. */
export class MathKeyboard extends LitElement {
  static properties = {
    display: {type: String},
    activeLayout: {type: String, state: true},
    shifted: {type: Boolean, state: true},
    strokes: {state: true},
    handwritingBusy: {state: true},
    handwritingError: {state: true},
    handwritingFragment: {state: true},
  }

  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      container-type: inline-size;
      width: min(100%, 760px);
      height: 280px;
      max-height: min(280px, calc(100dvh - 80px));
      margin-inline: auto;
      opacity: 0.9;
      overflow-x: hidden;
      padding: 0.45rem 0.6rem max(0.45rem, env(safe-area-inset-bottom, 0px));
      color: #26313d;
      background: #f2f4f7;
      border: 1px solid #c9d0d9;
      border-radius: 0.55rem 0.55rem 0 0;
      box-shadow: 0 -3px 14px rgb(25 35 48 / 20%);
      font: 400 0.82rem/1.2 system-ui, sans-serif;
    }

    * { box-sizing: border-box; }

    section { display: flex; flex-direction: column; height: 100%; min-height: 0; }

    .header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-start;
      gap: 0.35rem 0.6rem;
      margin-bottom: 0.4rem;
    }

    .controls, .tabs {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem;
    }

    .controls { flex: 0 0 auto; flex-wrap: nowrap; margin-inline-start: auto; }
    .tabs { flex-wrap: nowrap; min-width: 0; gap: 0; }
    .tabs button { border-radius: 0; }
    .tabs button + button { margin-inline-start: -1px; }
    .tabs button:first-child { border-radius: .32rem 0 0 .32rem; }
    .tabs button:last-child { border-radius: 0 .32rem .32rem 0; }
    .tabs button:focus-visible { position: relative; z-index: 1; }
    .freehand { display: inline-flex; align-items: center; gap: .35rem; margin-inline-start: .35rem; }
    .freehand svg { display: block; width: 1.2rem; height: 1.2rem; }
    .compact-icon, .control-icon { display: none; }

    button {
      min-width: 0;
      min-height: 2rem;
      padding: 0.25rem 0.45rem;
      border: 1px solid #c5cdd7;
      border-radius: 0.32rem;
      color: inherit;
      background: #fff;
      font: inherit;
      cursor: pointer;
      touch-action: manipulation;
    }

    button:hover { background: #e8edf3; }
    button.close, button.close:hover { border: 0; background: transparent; }
    button.close { display: grid; place-items: center; width: 2rem; padding: 0.25rem; }
    button.close svg { width: 1.15rem; height: 1.15rem; }
    button:focus-visible { outline: 2px solid #286bb3; outline-offset: 1px; }

    button[aria-pressed="true"] {
      color: #fff;
      border-color: #315f91;
      background: #315f91;
    }

    .grid {
      flex: 1;
      min-height: 0;
      display: grid;
      /* Half-width spacer keys are common in the main layout. */
      grid-template-columns: repeat(20, minmax(0, 1fr));
      gap: 0.25rem;
    }

    .key {
      position: relative;
      min-height: 0;
      padding: 0.25rem 0.1rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: clamp(0.68rem, 2.8vw, 0.95rem);
    }

    .key.action { background: #e5e9ef; }
    .key.action:hover { background: #dce2ea; }

    .hint {
      position: absolute;
      top: 0.04rem;
      right: 0.14rem;
      color: #667488;
      font-size: 0.52rem;
      line-height: 1;
    }

    .gap { min-width: 0; }
    .drawing-area { position: relative; flex: 1; min-height: 0; }
    .drawing-surface {
      display: block; width: 100%; height: 100%;
      border: 1px solid #c5cdd7; border-radius: .32rem;
      background: #fff; color: #26313d; cursor: crosshair;
      touch-action: none; user-select: none;
    }
    .recognition { display: flex; flex: 0 0 4rem; gap: .35rem; min-width: 0; overflow-x: auto; overflow-y: hidden; margin-bottom: .35rem; }
    .recognition-option { flex: 0 0 auto; max-width: 100%; padding: .35rem .65rem; overflow-x: auto; overflow-y: hidden; }
    .recognition math { font-size: 1.35rem; }
    .recognition-status { align-self: center; }
    .clear-drawing { position: absolute; top: .4rem; right: .4rem; display: grid; place-items: center; width: 2rem; padding: .25rem; }
    .clear-drawing svg { display: block; width: 1.15rem; height: 1.15rem; }
    .error { color: #a32626; }
    button:disabled { opacity: .5; cursor: default; }
    @container (max-width: 520px) {
      .header { gap: .2rem; }
      .tabs button { padding-inline: .3rem; font-size: .7rem; }
      .freehand { margin-inline-start: 0; padding-inline: .3rem; font-size: .75rem; }
    }
    @container (max-width: 420px) {
      .header { flex-wrap: nowrap; gap: .2rem; }
      .controls { gap: .15rem; }
      .tab-label, .handwriting-label, .control-label { display: none; }
      .compact-icon, .control-icon { display: inline; }
      .tabs button, .freehand, .controls button:not(.close) {
        width: 1.8rem; min-width: 1.8rem; flex: 0 0 1.8rem; justify-content: center; padding-inline: 0;
      }
      .tabs button { font-size: .8rem; }
      .freehand { gap: 0; }
      .controls { margin-inline-start: auto; }
    }
  `

  activeLayout = mathKeyboardLayouts[0]?.id ?? ""
  display: "inline" | "block" = "inline"
  shifted = false
  strokes: Stroke[] = []
  handwritingBusy = false
  handwritingError = ""
  handwritingFragment = ""
  #stroke: Stroke | undefined
  #pointer: number | undefined
  #erasePoint: StrokePoint | undefined
  #timer: ReturnType<typeof setTimeout> | undefined
  #version = 0
  #session = 0
  #recognizer: MathHandwritingRecognizer | undefined
  #ready: Promise<void> | undefined

  cycleLayout(backward = false) {
    const layouts = [...mathKeyboardLayouts.map(layout => layout.id), "handwriting"]
    const index = layouts.indexOf(this.activeLayout)
    this.#selectLayout(layouts[(index + (backward ? -1 : 1) + layouts.length) % layouts.length])
  }

  render() {
    const layout = mathKeyboardLayouts.find(item => item.id === this.activeLayout)
      ?? mathKeyboardLayouts[0]

    return html`
      <section aria-label="Formula keyboard">
        <div class="header">
          <div class="tabs" role="group" aria-label="Keyboard layout">
            ${mathKeyboardLayouts.map(item => html`
              <button type="button" aria-label=${item.label} title=${item.label}
                aria-pressed=${String(item.id === this.activeLayout)}
                @pointerdown=${this.#keepSelection}
                @click=${() => this.#selectLayout(item.id)}><span class="tab-label">${item.label}</span>
                <span class="compact-icon" aria-hidden="true">${layoutIcons[item.id] ?? item.label}</span></button>
            `)}
          </div>
          <button class="freehand" type="button" aria-label="Handwriting" title="Handwriting"
            aria-pressed=${String(this.activeLayout === "handwriting")}
            @pointerdown=${this.#keepSelection} @click=${() => this.#selectLayout("handwriting")}>
            <span aria-hidden="true">${ribbonIcon("Freehand")}</span><strong class="handwriting-label">Handwriting</strong>
          </button>
          <div class="controls" aria-label="Keyboard controls">
            ${(["inline", "block"] as const).map(display => html`<button type="button"
              aria-label=${`${display === "inline" ? "Inline" : "Block"} formula`} title=${`${display === "inline" ? "Inline" : "Block"} formula`}
              aria-pressed=${String(this.display === display)}
              @pointerdown=${this.#keepSelection} @click=${() => this.#dispatch(`display:${display}`)}
            ><span class="control-label">${display === "inline" ? "Inline" : "Block"}</span>
              <span class="control-icon" aria-hidden="true">${display === "inline" ? "x" : "∑"}</span></button>`)}
            <button type="button" class="close" aria-label="Hide formula keyboard" title="Hide formula keyboard"
              @pointerdown=${this.#keepSelection} @click=${this.#hide}>${ribbonIcon("Reject")}</button>
          </div>
        </div>
        ${this.activeLayout === "handwriting" ? html`
          <div class="recognition" role="group" aria-label="Recognized formulas">
            ${this.handwritingFragment && !this.handwritingBusy ? html`<button class="recognition-option" type="button"
              aria-label="Insert recognized formula" title="Insert recognized formula"
              @pointerdown=${this.#keepSelection} @click=${this.#confirmHandwriting}>${this.#preview()}</button>` : nothing}
            <span class="recognition-status ${this.handwritingError ? "error" : ""}" role="status" aria-live="polite">
              ${this.handwritingError || (this.handwritingBusy ? this.strokes.length ? "Recognizing…" : "Loading…" : "")}
            </span>
          </div>
          <div class="drawing-area">
            <svg class="drawing-surface" viewBox="0 0 1000 300" preserveAspectRatio="none"
              role="img" aria-label="Draw a formula" aria-busy=${String(this.handwritingBusy)}
              @pointerdown=${this.#penDown} @pointermove=${this.#penMove} @pointerup=${this.#penUp}
              @pointercancel=${this.#cancelStroke} @lostpointercapture=${this.#cancelStroke}
              @contextmenu=${this.#keepSelection}>
              ${[...this.strokes, ...(this.#stroke ? [this.#stroke] : [])].map(stroke => svg`<polyline
                points=${stroke.map(point => `${point.x},${point.y}`).join(" ")}
                fill="none" stroke="currentColor" stroke-width="2.5" vector-effect="non-scaling-stroke"
                stroke-linecap="round" stroke-linejoin="round"></polyline>`)}
            </svg>
            <button class="clear-drawing" type="button" aria-label="Clear drawing" title="Clear drawing"
              ?disabled=${!this.strokes.length && !this.#stroke} @pointerdown=${this.#keepSelection}
              @click=${this.#clearDrawing}>${ribbonIcon("Delete")}</button>
          </div>` : layout ? html`<div class="grid" role="group" aria-label=${layout.label}
          style=${`grid-template-rows: repeat(${layout.rows.length}, minmax(0, 1fr))`}>
          ${layout.rows.flatMap(row => row.map(key => this.#key(key)))}
        </div>` : nothing}
      </section>
    `
  }

  #key(key: MathKeyboardKey) {
    if (!key.command) {
      const span = Math.max(1, Math.round((key.span ?? 1) * 2))
      return html`<span class="gap" aria-hidden="true" style=${`grid-column: span ${span}`}></span>`
    }

    const displayed = this.shifted && key.shift ? key.shift : key
    const isShift = displayed.command === "shift"
    const direction = movementDirection(displayed.command)
    const title = displayed.title || displayed.label
    const span = Math.max(1, Math.round((key.span ?? 1) * 2))
    const hint = key.shift && !this.shifted
      ? html`<span class="hint" aria-hidden="true">${key.shift.label}</span>`
      : nothing

    return html`<button type="button" class="key ${isShift ? "action" : ""}"
      style=${`grid-column: span ${span}`}
      aria-label=${title} title=${title}
      aria-pressed=${isShift ? String(this.shifted) : nothing}
      @pointerdown=${this.#keepSelection}
      @click=${() => this.#press(displayed, direction)}>${displayed.label}${hint}</button>`
  }

  #keepSelection(event: Event) {
    event.preventDefault()
  }

  #selectLayout(id: string) {
    if(id === this.activeLayout) return
    this.#stopHandwriting()
    this.activeLayout = id
    this.shifted = false
    if(id === "handwriting") {
      const session = this.#session
      this.handwritingBusy = true
      this.#ready = import("../math-handwriting").then(async ({MathHandwritingRecognizer}) => {
        if(!this.isConnected || this.activeLayout !== "handwriting" || session !== this.#session) return
        const recognizer = this.#recognizer = new MathHandwritingRecognizer()
        await recognizer.load()
      }).then(() => {
        if(session === this.#session && !this.strokes.length && !this.#stroke) this.handwritingBusy = false
      }).catch(error => {
        if(session === this.#session) {
          this.handwritingBusy = false
          this.handwritingError = "Could not load handwriting recognition. Reopen the tab to retry."
        }
        throw error
      })
      void this.#ready.catch(() => {})
    }
  }

  #preview() {
    if(!this.handwritingFragment) return ""
    return parseMathFragment(this.handwritingFragment)
  }

  #invalidateDrawing() {
    clearTimeout(this.#timer)
    this.#version++
    this.handwritingFragment = ""
    this.handwritingError = ""
    this.handwritingBusy = false
  }

  #clearDrawing() {
    this.#invalidateDrawing()
    this.#stroke = undefined
    this.#pointer = undefined
    this.#erasePoint = undefined
    this.strokes = []
  }

  #point(event: PointerEvent) {
    const bounds = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
    return {x: (event.clientX - bounds.left) / (bounds.width || 1) * 1000,
      y: (event.clientY - bounds.top) / (bounds.height || 1) * 300, t: event.timeStamp}
  }

  #penDown(event: PointerEvent) {
    event.preventDefault()
    const erasing = this.#isEraser(event)
    if(!event.isPrimary || (event.button !== 0 && !erasing) || this.#pointer !== undefined) return
    this.#pointer = event.pointerId
    if(erasing) {
      this.#erasePoint = this.#point(event)
      this.#erase(event)
    }
    else {
      this.#invalidateDrawing()
      this.#stroke = [this.#point(event)]
    }
    ;(event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId)
    this.requestUpdate()
  }

  #isEraser(event: PointerEvent) {
    if(event.pointerType !== "mouse" && event.pointerType !== "pen") return false
    const mask = event.pointerType === "pen" ? 2 | 32 : 2
    return Boolean(event.buttons & mask) || event.type === "pointerdown"
      && (event.button === 2 || event.pointerType === "pen" && event.button === 5)
  }

  #erase(event: PointerEvent) {
    const point = this.#point(event)
    const bounds = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
    const scaled = (point: Point) => ({x: point.x * bounds.width / 1000, y: point.y * bounds.height / 300})
    const from = scaled(this.#erasePoint ?? point), to = scaled(point)
    this.#erasePoint = point
    const strokes = this.strokes.filter(stroke => !stroke.some((point, index) =>
      eraserHitsSegment(from, to, scaled(stroke[Math.max(0, index - 1)]), scaled(point))))
    if(strokes.length === this.strokes.length) return
    this.#invalidateDrawing()
    this.strokes = strokes
  }

  #penMove(event: PointerEvent) {
    if(event.pointerId !== this.#pointer) return
    // Pen buttons can change during contact without another pointerdown.
    if(this.#isEraser(event)) {
      if(this.#stroke) {
        if(this.#stroke.length > 1) this.strokes = [...this.strokes, this.#stroke]
        this.#stroke = undefined
      }
      this.#erase(event)
      return
    }
    if(this.#erasePoint) {
      this.#erasePoint = undefined
      this.#invalidateDrawing()
      this.#stroke = [this.#point(event)]
      this.requestUpdate()
      return
    }
    if(!this.#stroke) return
    // Bound the recognizer's input before allocating an unbounded stroke.
    if(this.strokes.reduce((count, stroke) => count + stroke.length, this.#stroke.length) >= 2048) {
      this.handwritingError = "Too much drawn. Clear the surface and write a smaller fragment."
      return
    }
    this.#stroke.push(this.#point(event))
    this.requestUpdate()
  }

  #penUp(event: PointerEvent) {
    if(event.pointerId !== this.#pointer) return
    if(this.#erasePoint) this.#erase(event)
    const stroke = this.#stroke
    this.#stroke = undefined
    this.#pointer = undefined
    this.#erasePoint = undefined
    if(stroke && stroke.length > 1) this.strokes = [...this.strokes, stroke]
    this.requestUpdate()
    if(!this.handwritingError) this.#scheduleRecognition()
  }

  #cancelStroke(event: PointerEvent) {
    if(event.pointerId !== this.#pointer) return
    this.#stroke = undefined
    this.#pointer = undefined
    this.#erasePoint = undefined
    this.requestUpdate()
    this.#scheduleRecognition()
  }

  #scheduleRecognition() {
    clearTimeout(this.#timer)
    if(!this.strokes.length) return
    const version = this.#version
    this.#timer = setTimeout(() => void this.#recognize(version), 800)
  }

  async #recognize(version: number) {
    this.handwritingBusy = true
    try {
      await this.#ready
      if(version !== this.#version || !this.#recognizer) return
      const bounds = this.renderRoot.querySelector(".drawing-surface")!.getBoundingClientRect()
      const strokes = this.strokes.map(stroke => stroke.map(point => ({...point,
        x: point.x * bounds.width / 1000, y: point.y * bounds.height / 300})))
      const mathml = await this.#recognizer.recognize(strokes)
      if(version !== this.#version) return
      if(!parseMathFragment(mathml)) throw new Error("No formula recognized")
      this.handwritingFragment = mathml
    }
    catch {
      if(version === this.#version) this.handwritingError = "Could not recognize the formula. Clear and try again."
    }
    finally {
      if(version === this.#version) this.handwritingBusy = false
    }
  }

  #confirmHandwriting() {
    if(!this.handwritingFragment || this.handwritingBusy || this.#pointer !== undefined) return
    this.#dispatch(`mathml:${this.handwritingFragment}`)
    this.#clearDrawing()
  }

  #stopHandwriting() {
    this.#session++
    this.#clearDrawing()
    this.#recognizer?.dispose()
    this.#recognizer = undefined
    this.#ready = undefined
  }

  disconnectedCallback() {
    this.#stopHandwriting()
    // A reattached keyboard starts with ordinary keys; no disposed tab remains active.
    if(this.activeLayout === "handwriting") this.activeLayout = mathKeyboardLayouts[0].id
    super.disconnectedCallback()
  }

  #press(key: MathKeyboardKey, direction?: string) {
    if (key.command === "shift") {
      this.shifted = !this.shifted
      return
    }
    if (direction && this.shifted) {
      this.#dispatch(`move-extend:${direction}`)
      return
    }
    this.#dispatch(key.command)
    this.shifted = false
  }

  #hide() {
    this.#stopHandwriting()
    this.dispatchEvent(new CustomEvent("math-keyboard-close", {bubbles: true, composed: true}))
  }

  #dispatch(command: string) {
    this.dispatchEvent(new CustomEvent("math-keyboard-command", {
      detail: {command},
      bubbles: true,
      composed: true,
    }))
  }
}

if (!customElements.get("dom-editor-math-keyboard")) {
  customElements.define("dom-editor-math-keyboard", MathKeyboard)
}
