import {LitElement, css, html, nothing, type PropertyValues} from "lit"
import {graphicShapeDragType, defaultGraphicShapePaint, graphicShapeIsOpen, graphicShapeOptions, graphicShapeSections, type GraphicShapePaint, type GraphicMode} from "../graphic"
import {ribbonIcon} from "../ribbon-icons"
import {themeColorColumns, colorHex} from "../css-color"
import type {ShapeKeyboardInput} from "../editor-bridge"

const shapePages = graphicShapeSections.map(section => section.label)
const shapePageIcons = {Basic: "Geometry", Advanced: "Graphic", Arrows: "ArrowBigRight", Flowchart: "ArrowRotaryRight"}
const brushSizes = [1, 2, 4, 8]
// The number row skips Backquote; each displayed row has at most 11 keys.
const shapeKeyCodes = [
  ["Backquote", ...Array.from({length: 9}, (_, i) => `Digit${i + 1}`), "Digit0", "Minus"],
  [...[..."QWERTYUIOP"].map(key => `Key${key}`), "BracketLeft"],
  [...[..."ASDFGHJKL"].map(key => `Key${key}`), "Semicolon", "Quote"],
  ["IntlBackslash", ...[..."ZXCVBNM"].map(key => `Key${key}`), "Comma", "Period", "Slash"],
]
type ShapeKey = {code: string, key: string}
type KeyboardLayout = Partial<EventTarget> & {getLayoutMap(): Promise<ReadonlyMap<string, string>>}
const fallbackKeyRows = () => {
  const language = navigator.language.toLowerCase()
  const labels = language.startsWith("de-ch") ? ["§1234567890'", "qwertzuiopü", "asdfghjklöä", "<yxcvbnm,.-"]
    : language.startsWith("de") ? ["^1234567890ß", "qwertzuiopü", "asdfghjklöä", "<yxcvbnm,.-"]
      : ["`1234567890-", "qwertyuiop[", "asdfghjkl;'", "<zxcvbnm,./"]
  return shapeKeyCodes.map((row, index) => row.map((code, column) => ({code, key: labels[index][column]})))
}
type ShapeOption = typeof graphicShapeOptions[number]
type CustomBrush = Pick<Required<GraphicShapePaint>, "stroke" | "stroke-width">

/** Insertion paint belongs to the keyboard, independently of selected shapes. */
export class ShapeKeyboard extends LitElement {
  static properties = {
    activePage: {state: true},
    activeShape: {state: true},
    heldBrush: {state: true},
    keyRows: {state: true},
    paint: {attribute: false},
    mode: {attribute: false},
    insertionDisabled: {attribute: false},
    keyboardInputDisabled: {attribute: false},
    customColor: {state: true},
    customWidth: {state: true},
    customBrushes: {state: true},
    brushDialogOpen: {state: true},
  }

  static styles = css`
    :host {
      display: block;
      container-type: inline-size;
      box-sizing: border-box;
      width: min(100%, 760px);
      max-height: min(420px, calc(100dvh - 80px));
      overflow-y: auto;
      margin-inline: auto;
      padding: .45rem .6rem max(.45rem, env(safe-area-inset-bottom, 0px));
      color: #26313d;
      background: #f2f4f7;
      border: 1px solid #c9d0d9;
      border-radius: .55rem .55rem 0 0;
      box-shadow: 0 -3px 14px rgb(25 35 48 / 20%);
      font: 400 .75rem/1.2 system-ui, sans-serif;
    }
    * { box-sizing: border-box; }
    section { display: flex; flex-direction: column; gap: .35rem; height: 100%; min-height: 0; }
    .header { display: flex; align-items: center; gap: .5rem; }
    .header { position: sticky; top: 0; z-index: 1; flex-shrink: 0; background: #f2f4f7; }
    .tabs, .drawing-modes { display: flex; align-items: center; flex-wrap: nowrap; min-width: 0; gap: 0; }
    .tabs button, .drawing-modes button { display: inline-flex; align-items: center; justify-content: center; gap: .3rem; white-space: nowrap; border-radius: 0; }
    .tabs button + button, .drawing-modes button + button { margin-inline-start: -1px; }
    .tabs button:first-child, .drawing-modes button:first-child { border-radius: .32rem 0 0 .32rem; }
    .tabs button:last-child, .drawing-modes button:last-child { border-radius: 0 .32rem .32rem 0; }
    .tabs button:focus-visible, .drawing-modes button:focus-visible { position: relative; z-index: 1; }
    .tab-icon { display: grid; place-items: center; flex: none; }
    .tab-icon svg { display: block; width: 1.1rem; height: 1.1rem; }
    button {
      font: inherit; color: inherit; border: 1px solid #c5cdd7;
      border-radius: .32rem; background: #fff; min-width: 0;
    }
    button { cursor: pointer; touch-action: manipulation; min-height: 2rem; padding: .25rem .45rem; }
    button:hover { background: #e8edf3; }
    button:focus-visible { outline: 2px solid #286bb3; outline-offset: 1px; }
    button[aria-pressed="true"] { color: #fff; border-color: #315f91; background: #315f91; }
    .close { display: grid; place-items: center; width: 2rem; margin-left: auto; flex: 0 0 auto; border: 0; background: transparent; }
    .close svg { width: 1.15rem; height: 1.15rem; }
    .grid, .drawing-panel { height: calc(4 * 2.2rem + 3 * .25rem); min-height: 0; }
    .grid { display: flex; gap: .75rem; }
    .main-keys { display: grid; flex: 11; min-width: 0; grid-template-rows: repeat(4, minmax(0, 1fr)); gap: .25rem; }
    .key-row { display: grid; grid-template-columns: repeat(11, minmax(0, 1fr)); gap: .25rem; }
    .surplus { display: grid; flex: var(--columns); min-width: 0; grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
      grid-template-rows: repeat(4, minmax(0, 1fr)); grid-auto-flow: column; gap: .25rem; }
    .key { display: grid; place-items: center; min-height: 0; padding: .15rem .2rem; }
    .key svg { display: block; grid-area: 1 / 1; width: 2rem; max-width: 100%; height: 1.65rem; }
    .hint { grid-area: 1 / 1; align-self: start; justify-self: end; color: #667488; font-size: .52rem; line-height: 1; }
    .key[aria-pressed="true"] .hint { color: #fff; }
    .shape-hint { grid-column: 9 / span 3; align-self: center; min-width: 0; color: #667488; font-size: .65rem; line-height: 1.2; text-align: right; }
    .drawing-panel { display: flex; flex-direction: column; gap: .35rem; }
    .presets { flex: 1; min-height: 0; }
    .brush-grid { width: 100%; height: 100%; table-layout: fixed; border-spacing: .2rem; }
    .brush-grid .brush { min-height: 0; height: 100%; }
    .brush-grid .brush svg { height: 1rem; }
    .brush-grid td { padding: 0; }
    .brush { position: relative; display: grid; place-items: center; width: 100%; min-height: 1.55rem; padding: 0; }
    .brush svg { display: block; width: 100%; height: 1.3rem; }
    .brush .hint { position: absolute; grid-area: auto; top: 50%; right: .16rem; transform: translateY(-50%); pointer-events: none; }
    .brush[aria-pressed="true"] { background: #e8f0fa; box-shadow: inset 0 0 0 1px #315f91; }
    .brush.light, .brush.light[aria-pressed="true"] { background: #cbd5e1; }
    .brush-footer { display: flex; flex: 0 0 auto; align-items: center; gap: .5rem; min-width: 0; }
    .opacity { display: flex; flex: 0 0 auto; align-items: center; gap: .25rem; font-size: .7rem; }
    .opacity input { width: 3.5rem; min-width: 0; margin: 0; accent-color: #315f91; }
    .opacity output { min-width: 4ch; text-align: end; font-variant-numeric: tabular-nums; }
    .custom-brushes { display: flex; flex: 1; min-width: 0; align-items: center; gap: .25rem; padding: 1px; }
    .custom-brushes .brush { flex: 0 1 4.5rem; }
    .add-brush { display: grid; place-items: center; flex: 0 0 1.8rem; min-height: 1.55rem; padding: 0; }
    .add-brush svg { width: 1.1rem; height: 1.1rem; }
    dialog { width: min(22rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); padding: 1rem; overflow: auto;
      border: 1px solid #c5cdd7; border-radius: .6rem; color: inherit; background: #f2f4f7; box-shadow: 0 1rem 3rem rgb(15 23 42 / 25%); }
    dialog::backdrop { background: rgb(15 23 42 / 40%); }
    dialog h2 { margin: 0 0 .8rem; font-size: 1rem; }
    .brush-preview { display: block; width: 100%; height: 8rem; margin-bottom: .8rem; border: 1px solid #c5cdd7; border-radius: .32rem;
      background: repeating-conic-gradient(#e1e6ed 0% 25%, #fff 0% 50%) 0 0 / 16px 16px; }
    .custom-controls { display: flex; flex-wrap: wrap; align-items: center; gap: .8rem; }
    .custom-controls label { display: flex; align-items: center; gap: .3rem; }
    .custom-controls input { min-height: 2rem; max-width: 5rem; border: 1px solid #c5cdd7; border-radius: .32rem; background: white; color: inherit; font: inherit; }
    .custom-controls input[type="color"] { width: 3rem; padding: .15rem; }
    .custom-controls input[type="number"] { width: 4rem; padding: .25rem; }
    .dialog-actions { display: flex; justify-content: flex-end; gap: .4rem; margin-top: 1rem; }
    button:disabled { opacity: .5; cursor: default; }
    @container (max-width: 36rem) {
      .header { gap: .35rem; }
      .tab-label { display: none; }
      .tabs button, .drawing-modes button { width: 2rem; padding-inline: 0; }
      .key { padding-inline: .08rem; }
      .shape-hint { font-size: .55rem; line-height: 1.05; }
    }

  `

  activePage = "Basic"
  private activeShape: ShapeOption["type"] | null = null
  private heldShapeKey: {code: string, key: string} | null = null
  private heldBrush: {code: string, key: string, brush: CustomBrush, mode: "draw" | "lines" | "curves"} | null = null
  private keyRows: ShapeKey[][] = fallbackKeyRows()
  private keyboardLayout = (navigator as Navigator & {keyboard?: KeyboardLayout}).keyboard
  private previewViewBoxes = new Map<string, string>()
  paint: Required<GraphicShapePaint> = {...defaultGraphicShapePaint}
  mode: GraphicMode = "select"
  insertionDisabled = false
  keyboardInputDisabled = false
  customColor = defaultGraphicShapePaint.stroke
  customWidth = defaultGraphicShapePaint["stroke-width"]
  customBrushes: CustomBrush[] = []
  brushDialogOpen = false

  private get shortcutRows() { return this.keyRows.map((row, index) => index === 0 ? row.slice(1) : row) }
  private get brushShortcutRows() { return this.shortcutRows.map(row => row.slice(0, 10)) }
  private get drawingPaint() { return {...this.paint, ...this.heldBrush?.brush} }
  private pageKeys(page: string) {
    const shapeRows = graphicShapeSections.find(section => section.label === page)?.rows ?? []
    if(page === "Flowchart") return shapeRows.flat()
    const rows = this.shortcutRows
    const surplus: ShapeOption[] = []
    const keys = rows.flatMap((keys, index): (ShapeOption | undefined)[] => {
      const row = shapeRows[index] ?? []
      const capacity = keys.length
      surplus.push(...row.slice(capacity))
      return [...row.slice(0, capacity), ...Array<undefined>(Math.max(0, capacity - row.length)).fill(undefined)]
    })
    return [...keys, ...surplus]
  }

  connectedCallback() {
    super.connectedCallback()
    this.keyboardLayout?.addEventListener?.("layoutchange", this.updateKeyboardLayout)
    void this.updateKeyboardLayout()
  }

  private updateKeyboardLayout = async () => {
    if(!this.keyboardLayout) return
    try {
      const layout = await this.keyboardLayout.getLayoutMap()
      const rows = shapeKeyCodes.map(row => row.flatMap(code => {
        const key = layout.get(code)
        return key ? [{code, key}] : []
      }))
      if(this.isConnected && rows.every(row => row.length)) this.keyRows = rows
    }
    catch { /* Browsers without layout access use the language-based key labels. */ }
  }

  /** Held shortcuts follow the selected page and physical keyboard layout. */
  handleInput(input: ShapeKeyboardInput) {
    if(this.insertionDisabled || this.keyboardInputDisabled) return false
    const matches = (key: ShapeKey) => input.code ? key.code === input.code : key.key === input.key.toLowerCase()
    if(input.type === "keyup") {
      if(this.heldBrush && matches(this.heldBrush)) { this.clearHeldBrush(); return true }
      if(this.heldShapeKey && matches(this.heldShapeKey)) { this.clearHeldShape(); return true }
      this.updateHeldShape()
      return false
    }
    if(input.key === "Escape") { const held = !!this.heldShapeKey || !!this.heldBrush; this.cancelInput(); return held }
    if(this.brushDialogOpen) return false
    if(input.key === "Tab" && !input.altKey) {
      if(!input.repeat) {
        this.cancelInput()
        const pages = [...shapePages, "Freehand", "Lines", "Curves"]
        const index = pages.indexOf(this.activePage)
        this.selectPage(pages[(index + (input.shiftKey ? -1 : 1) + pages.length) % pages.length])
      }
      return true
    }
    if(this.isDrawingPage(this.activePage)) {
      for(const [row, keys] of this.brushShortcutRows.entries()) {
        const column = keys.findIndex(matches)
        if(column < 0) continue
        if(!input.repeat && (!this.heldBrush || !matches(this.heldBrush))) {
          this.heldBrush = {code: input.code, key: input.key.toLowerCase(), mode: this.pageMode(this.activePage),
            brush: {stroke: `#${themeColorColumns[column][0]}`, "stroke-width": String(brushSizes[row])}}
          this.previewBrush()
        }
        return true
      }
      return false
    }
    if(input.type !== "keydown") return false
    const keys = this.shortcutRows.flat()
    const index = keys.findIndex(matches)
    const page = this.activePage
    const option = index < 0 ? undefined : this.pageKeys(page)[index]
    if(!option) return false
    if(this.heldShapeKey && matches(this.heldShapeKey)) {
      this.updateHeldShape()
      return true
    }
    this.heldShapeKey = {code: input.code, key: input.key.toLowerCase()}
    this.setActiveShape(option.type)
    return true
  }

  private setActiveShape(shape: ShapeOption["type"] | null) {
    if(this.activeShape === shape) return
    this.activeShape = shape
    this.dispatchEvent(new CustomEvent("shape-keyboard-preview", {
      detail: {shape, ...(shape ? {paint: this.insertionPaint(shape), ...this.heldShapeKey} : {})}, bubbles: true, composed: true,
    }))
  }

  private updateHeldShape() {
    if(!this.heldShapeKey || this.isDrawingPage(this.activePage)) return
    const keys = this.shortcutRows.flat()
    const index = keys.findIndex(key => this.heldShapeKey!.code ? key.code === this.heldShapeKey!.code : key.key === this.heldShapeKey!.key)
    const option = index < 0 ? undefined : this.pageKeys(this.activePage)[index]
    this.setActiveShape(option?.type ?? null)
  }

  private clearHeldShape() {
    this.heldShapeKey = null
    this.setActiveShape(null)
  }

  private previewBrush() {
    if(!this.heldBrush) return
    this.dispatchEvent(new CustomEvent("shape-brush-preview", {
      detail: {paint: this.drawingPaint, mode: this.heldBrush.mode}, bubbles: true, composed: true,
    }))
  }

  private clearHeldBrush(notify = true) {
    const held = this.heldBrush
    if(!held) return
    this.heldBrush = null
    if(notify) this.dispatchEvent(new CustomEvent("shape-brush-preview", {
      detail: {paint: null, mode: held.mode}, bubbles: true, composed: true,
    }))
  }

  /** Clears a held shortcut when the host loses focus or hides the keyboard. */
  cancelInput() { this.clearHeldShape(); this.clearHeldBrush() }

  protected willUpdate(changed: PropertyValues) {
    if(changed.has("insertionDisabled") && this.insertionDisabled || changed.has("keyboardInputDisabled") && this.keyboardInputDisabled) this.cancelInput()
    if(changed.has("activePage")) this.cancelInput()
    if(changed.has("mode")) {
      if(this.mode === "select") this.clearHeldBrush()
      if(this.mode !== "select") {
        const page = this.modePage(this.mode)
        if(this.activePage !== page) this.cancelInput()
        this.activePage = page
      }
    }
    if(this.brushDialogOpen && (changed.has("mode") && this.mode === "select" || !this.isDrawingPage(this.activePage))) {
      this.closeBrushDialog()
    }
  }

  render() {
    const rows = this.shortcutRows, brushRows = this.brushShortcutRows
    const options = this.pageKeys(this.activePage)
    const surplus = options.slice(rows.flat().length).filter((option): option is ShapeOption => !!option)
    let offset = 0
    return html`<section aria-label="Shapes">
      <div class="header">
        <div class="tabs" role="group" aria-label="Shape pages">
          ${shapePages.map(page => html`<button type="button" aria-label=${page} title=${page} aria-pressed=${String(this.activePage === page)}
            @pointerdown=${this.keepSelection} @click=${() => this.selectPage(page)}><span class="tab-icon" aria-hidden="true">${ribbonIcon(shapePageIcons[page])}</span><span class="tab-label">${page}</span></button>`)}
        </div>
        <div class="drawing-modes" role="group" aria-label="Drawing modes">
          ${(["draw", "lines", "curves"] as const).map(mode => html`<button class="drawing-mode ${mode === "draw" ? "freehand" : ""}" type="button"
            aria-label=${this.modeLabel(mode)} aria-pressed=${String(this.activePage === this.modePage(mode))} title=${`${this.modeLabel(mode)}: ${this.modeHint(mode)}`} aria-description=${this.modeHint(mode)}
            @pointerdown=${this.keepSelection} @click=${() => this.selectPage(this.modePage(mode))}>
            <span class="tab-icon" aria-hidden="true">${ribbonIcon(this.modeLabel(mode))}</span><strong class="tab-label">${this.modeLabel(mode)}</strong>
          </button>`)}
        </div>
        <button class="close" type="button" aria-label="Hide shape keyboard" title="Hide shape keyboard"
          @pointerdown=${this.keepSelection} @click=${() => { this.closeBrushDialog(); this.dispatchEvent(new CustomEvent("shape-keyboard-close", {bubbles: true, composed: true})) }}>${ribbonIcon("Reject")}</button>
      </div>
      ${this.isDrawingPage(this.activePage) ? html`<div class="drawing-panel" role="group" aria-label=${`${this.modeLabel(this.pageMode(this.activePage))} drawing`}>
        <div class="presets"><table class="brush-grid" aria-label="Brush presets by color and size">
          <tbody>${brushSizes.map((size, row) => html`<tr>
            ${themeColorColumns.map(([base], column) => html`<td>${this.brushButton({stroke: `#${base}`, "stroke-width": String(size)}, false, brushRows[row][column]?.key)}</td>`)}
          </tr>`)}</tbody>
        </table></div>
        <div class="brush-footer"><div class="custom-brushes" role="group" aria-label="Custom brushes">
          ${this.customBrushes.map(brush => this.brushButton(brush, true))}
          <button class="add-brush" type="button" aria-label="Add brush" title="Add brush"
            @pointerdown=${this.keepSelection} @click=${this.openBrushDialog}>${ribbonIcon("Plus")}</button>
        </div>
          <label class="opacity" title="Opacity">
            <input type="range" aria-label="Drawing opacity" min="0" max="1" step="0.05"
              .value=${this.paint.opacity} @input=${(event: Event) => this.setPaint({opacity: (event.currentTarget as HTMLInputElement).value})}>
            <output>${Math.round(Number(this.paint.opacity) * 100)}%</output>
          </label>
        </div>
      </div>` : html`<div class="grid" role="group" aria-label=${this.activePage}>
        <div class="main-keys">
          ${rows.map((row, rowIndex) => {
            const start = offset
            offset += row.length
            return html`<div class="key-row">
              ${options.slice(start, offset).map((option, column) => option
                ? this.shapeButton(option, row[column].key)
                : this.activePage === "Basic" && rowIndex === 0 && column === 8
                  ? html`<span class="shape-hint" style="grid-column: 9 / span 3">Hold key and click to insert</span>`
                  : this.activePage === "Basic" && rowIndex === 0 && column > 8
                    ? nothing : html`<span aria-hidden="true"></span>`)}
            </div>`
          })}
        </div>
        ${surplus.length ? html`<div class="surplus" role="group" aria-label="More shapes" style=${`--columns: ${Math.ceil(surplus.length / 4)}`}>
          ${surplus.map(option => this.shapeButton(option))}
        </div>` : nothing}
      </div>`}
    </section>
    ${this.brushDialogOpen ? html`<dialog aria-labelledby="brush-heading" @cancel=${this.closeBrushDialog} @close=${() => this.brushDialogOpen = false}>
      <form @submit=${this.addCustomBrush}>
        <h2 id="brush-heading">Add brush</h2>
        <svg class="brush-preview" viewBox="0 0 280 140" role="img" aria-label="Brush preview">
          <path d="M 55 80 Q 95 20 140 70 T 225 65" fill="none" stroke=${this.customColor}
            stroke-width=${this.validCustomWidth ? this.customWidth : "1"} opacity=${this.paint.opacity} stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
        <div class="custom-controls">
          <label>Color <input type="color" aria-label="Custom brush color" .value=${this.customColor}
            @input=${(event: Event) => { this.customColor = (event.currentTarget as HTMLInputElement).value }}></label>
          <label>Width <input type="number" aria-label="Custom brush width" min="0.5" max="100" step="any" required .value=${this.customWidth}
            @input=${(event: Event) => { this.customWidth = (event.currentTarget as HTMLInputElement).value }}> px</label>
        </div>
        <div class="dialog-actions">
          <button type="button" @click=${this.closeBrushDialog}>Cancel</button>
          <button type="submit" ?disabled=${!this.validCustomWidth}>Add brush</button>
        </div>
      </form>
    </dialog>` : null}`
  }

  private insertShape(shape: ShapeOption["type"], onlyIfUnselected = false) {
    if(this.insertionDisabled) return
    this.dispatchEvent(new CustomEvent("shape-keyboard-command", {
      detail: {shape, paint: this.insertionPaint(shape), ...(onlyIfUnselected ? {onlyIfUnselected: true} : {})}, bubbles: true, composed: true,
    }))
  }

  private shapeButton(option: ShapeOption, key?: string) {
    return html`<button class="key" type="button" draggable=${String(!this.insertionDisabled)} ?disabled=${this.insertionDisabled} title=${option.label} aria-label=${option.label}
      aria-keyshortcuts=${key || nothing}
      aria-pressed=${String(this.activeShape === option.type)}
      @pointerdown=${(event: PointerEvent) => { if(event.pointerType !== "mouse") this.keepSelection(event) }}
      @dragstart=${(event: DragEvent) => this.startDrag(event, option.type)} @click=${() => this.insertShape(option.type)}>
      ${key ? html`<span class="hint" aria-hidden="true">${key}</span>` : nothing}
      <svg viewBox=${this.previewViewBoxes.get(option.path) ?? "-10 -10 120 120"} aria-hidden="true" focusable="false">
        <g fill=${graphicShapeIsOpen(option.type) ? "none" : this.paint.fill} stroke=${defaultGraphicShapePaint.stroke}
          stroke-width=${Number(defaultGraphicShapePaint["stroke-width"]) * 1.25} opacity=${defaultGraphicShapePaint.opacity} stroke-linejoin="round" fill-rule=${option.fillRule}>
          <path d=${option.path} fill=${option.pathFill === "currentColor" ? defaultGraphicShapePaint.stroke : "inherit"}></path>
        </g>
      </svg>
    </button>`
  }

  private brushButton(brush: CustomBrush, custom = false, key?: string) {
    const color = colorHex(brush.stroke) ?? brush.stroke
    const width = brush["stroke-width"]
    return html`<button class="brush ${color === "#ffffff" ? "light" : ""}" type="button"
      aria-label=${`${custom ? "Custom " : ""}${color}, ${width} px brush`} title=${`${color}, ${width} px`}
      aria-keyshortcuts=${key || nothing}
      aria-pressed=${String(this.mode === this.pageMode(this.activePage) && colorHex(this.drawingPaint.stroke) === color && Number(this.drawingPaint["stroke-width"]) === Number(width))}
      @pointerdown=${this.keepSelection} @click=${() => this.setPaint(brush, true)}>
      <svg viewBox="0 0 80 24" aria-hidden="true"><path d=${custom ? "M 10 12 L 70 12" : "M 28 12 L 52 12"} fill="none" stroke=${color}
        stroke-width=${width} opacity=${this.paint.opacity} stroke-linecap="round" vector-effect="non-scaling-stroke"></path></svg>
      ${key ? html`<span class="hint" aria-hidden="true">${key}</span>` : nothing}
    </button>`
  }

  private get validCustomWidth() {
    const width = Number(this.customWidth)
    return Number.isFinite(width) && width >= 0.5 && width <= 100
  }

  private openBrushDialog() {
    this.cancelInput()
    this.customColor = colorHex(this.paint.stroke) ?? defaultGraphicShapePaint.stroke
    this.customWidth = this.paint["stroke-width"]
    this.brushDialogOpen = true
  }

  private closeBrushDialog() {
    this.renderRoot.querySelector<HTMLDialogElement>("dialog")?.close()
    this.brushDialogOpen = false
  }

  private addCustomBrush(event: Event) {
    event.preventDefault()
    if(!this.validCustomWidth) return
    const brush = {stroke: this.customColor, "stroke-width": this.customWidth}
    this.customBrushes = [...this.customBrushes, brush]
    this.setPaint(brush, true)
    this.closeBrushDialog()
  }

  disconnectedCallback() {
    this.keyboardLayout?.removeEventListener?.("layoutchange", this.updateKeyboardLayout)
    this.cancelInput()
    this.closeBrushDialog()
    super.disconnectedCallback()
  }

  private selectPage(page: string) {
    const wasDrawing = this.isDrawingPage(this.activePage)
    const nextMode = this.pageMode(page)
    if(page !== this.activePage) this.cancelInput()
    this.activePage = page
    if(wasDrawing === this.isDrawingPage(page) && (!wasDrawing || this.mode === nextMode)) return
    this.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: `graphic-mode:${this.isDrawingPage(page) ? nextMode : "select"}`}, bubbles: true, composed: true,
    }))
  }

  private isDrawingPage(page: string) { return ["Freehand", "Lines", "Curves"].includes(page) }
  private modePage(mode: "draw" | "lines" | "curves") { return mode === "draw" ? "Freehand" : mode === "lines" ? "Lines" : "Curves" }
  private pageMode(page: string): "draw" | "lines" | "curves" { return page === "Lines" ? "lines" : page === "Curves" ? "curves" : "draw" }
  private modeLabel(mode: "draw" | "lines" | "curves") { return mode === "draw" ? "Freehand" : mode === "lines" ? "Lines" : "Curves" }
  private modeHint(mode: "draw" | "lines" | "curves") {
    return mode === "lines"
      ? "Click vertices; click the first vertex to close. Press Enter or double-click to finish; Escape cancels. Alt disables snapping; Shift constrains direction."
      : mode === "curves"
        ? "Click or drag anchors to set handles. Press Enter or double-click to finish; Escape cancels. Alt disables snapping; Shift constrains direction."
        : "Draw freehand paths. Escape cancels. Alt disables snapping; Shift constrains direction."
  }

  private setPaint(paint: GraphicShapePaint, activateDrawing = false) {
    if(activateDrawing) this.clearHeldBrush(false)
    this.paint = {...this.paint, ...paint}
    this.dispatchEvent(new CustomEvent("shape-paint-change", {
      detail: {paint: {...this.paint}}, bubbles: true, composed: true,
    }))
    this.previewBrush()
    if(activateDrawing && this.isDrawingPage(this.activePage)) {
      const mode = this.pageMode(this.activePage)
      if(this.mode !== mode) this.dispatchEvent(new CustomEvent("ribbon-button-click", {
        detail: {label: `graphic-mode:${mode}`}, bubbles: true, composed: true,
      }))
    }
  }

  private insertionPaint(shape: ShapeOption["type"]): GraphicShapePaint {
    return shape === "text-box" ? {} : {fill: this.paint.fill}
  }

  private startDrag(event: DragEvent, shape: typeof graphicShapeOptions[number]["type"]) {
    if(this.insertionDisabled) { event.preventDefault(); return }
    const data = event.dataTransfer
    if(!data) return
    data.setData(graphicShapeDragType, JSON.stringify({shape, paint: this.insertionPaint(shape)}))
    data.effectAllowed = "copy"
    const preview = (event.currentTarget as HTMLElement).querySelector("svg")!
    const bounds = preview.getBoundingClientRect()
    data.setDragImage(preview, bounds.width / 2, bounds.height / 2)
  }

  protected updated() {
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>("dialog")
    if(this.brushDialogOpen && dialog && !dialog.open) dialog.showModal()
    const fitted: {preview: SVGSVGElement, viewBox: string}[] = []
    this.renderRoot.querySelectorAll<SVGSVGElement>(".key svg").forEach(preview => {
      const geometry = preview.querySelector<SVGGElement>("g")!
      const path = geometry.querySelector("path")!.getAttribute("d")!
      const cached = this.previewViewBoxes.get(path)
      if(cached) { fitted.push({preview, viewBox: cached}); return }
      if(!geometry.getBBox) return
      try {
        const bounds = geometry.getBBox()
        const size = Math.max(bounds.width, bounds.height) * 1.2
        if(!Number.isFinite(size) || size <= 0) return
        const viewBox = `${bounds.x + bounds.width / 2 - size / 2} ${bounds.y + bounds.height / 2 - size / 2} ${size} ${size}`
        this.previewViewBoxes.set(path, viewBox)
        fitted.push({preview, viewBox})
      }
      catch { /* Hidden or detached SVGs may not have measurable geometry. */ }
    })
    // Complete geometry reads before changing any viewport. Interleaving these
    // forces a fresh browser layout for every shape when changing pages.
    fitted.forEach(({preview, viewBox}) => {
      if(preview.getAttribute("viewBox") !== viewBox) preview.setAttribute("viewBox", viewBox)
    })
  }

  private keepSelection(event: PointerEvent) { event.preventDefault() }
}

if(!customElements.get("dom-editor-shape-keyboard")) customElements.define("dom-editor-shape-keyboard", ShapeKeyboard)
