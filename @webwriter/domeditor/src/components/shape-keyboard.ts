import {LitElement, css, html, svg, type PropertyValues} from "lit"
import {graphicShapeDragType, defaultGraphicShapePaint, graphicShapeIsOpen, graphicShapeOptions, type GraphicShapePaint, type GraphicMode} from "../graphic"
import {ribbonIcon} from "../ribbon-icons"
import {themeColorColumns, colorHex} from "../css-color"

const shapePages = ["Basic", "Advanced", "Flowchart"] as const
const shapePageIcons = {Basic: "Geometry", Advanced: "ArrowBigRight", Flowchart: "ArrowRotaryRight"}
const brushSizes = [1, 2, 4, 8]
type CustomBrush = Pick<Required<GraphicShapePaint>, "stroke" | "stroke-width">
const shapePage = (category: string) => category === "Flowchart" ? "Flowchart"
  : ["Lines", "Rectangles", "Basic shapes"].includes(category) ? "Basic" : "Advanced"

/** Insertion paint belongs to the keyboard, independently of selected shapes. */
export class ShapeKeyboard extends LitElement {
  static properties = {
    activePage: {state: true},
    paint: {attribute: false},
    mode: {attribute: false},
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
    .grid, .drawing-panel { height: calc(4 * 1.54rem + 3 * .25rem); min-height: 0; }
    .grid {
      display: grid; grid-template-columns: repeat(auto-fill, 2.42rem);
      grid-auto-rows: 1.54rem; align-content: start; gap: .25rem;
      overflow-y: auto;
    }
    .key { display: flex; align-items: center; justify-content: center; min-height: 0; padding: 0; }
    .key svg { display: block; flex: none; width: 1.65rem; height: 1.375rem; overflow: visible; }
    .drawing-panel { display: flex; flex-direction: column; gap: .35rem; }
    .presets { flex: 1; min-height: 0; }
    .brush-grid { width: 100%; height: 100%; table-layout: fixed; border-spacing: .2rem 0; }
    .brush-grid .brush { min-height: 0; height: 1.125rem; }
    .brush-grid .brush svg { height: 1rem; }
    .brush-grid td { padding: 0; }
    .brush { display: grid; place-items: center; width: 100%; min-height: 1.55rem; padding: 0; }
    .brush svg { display: block; width: 100%; height: 1.3rem; }
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
    }

  `

  activePage = "Basic"
  paint: Required<GraphicShapePaint> = {...defaultGraphicShapePaint}
  mode: GraphicMode = "select"
  customColor = defaultGraphicShapePaint.stroke
  customWidth = defaultGraphicShapePaint["stroke-width"]
  customBrushes: CustomBrush[] = []
  brushDialogOpen = false

  protected willUpdate(changed: PropertyValues) {
    if(changed.has("mode")) {
      if(this.mode !== "select") this.activePage = this.modePage(this.mode)
    }
    if(this.brushDialogOpen && (changed.has("mode") && this.mode === "select" || !this.isDrawingPage(this.activePage))) {
      this.closeBrushDialog()
    }
  }

  render() {
    const options = graphicShapeOptions.filter(option => shapePage(option.category) === this.activePage)
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
          <tbody>${brushSizes.map(size => html`<tr>
            ${themeColorColumns.map(([base]) => html`<td>${this.brushButton({stroke: `#${base}`, "stroke-width": String(size)})}</td>`)}
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
        ${options.map(option => html`<button class="key" type="button" draggable="true" title=${option.label} aria-label=${option.label}
          @pointerdown=${(event: PointerEvent) => { if(event.pointerType !== "mouse") this.keepSelection(event) }}
          @dragstart=${(event: DragEvent) => this.startDrag(event, option.type)}
          @click=${() => this.dispatchEvent(new CustomEvent("shape-keyboard-command", {
            detail: {shape: option.type, paint: {...this.paint}}, bubbles: true, composed: true,
          }))}>
          <svg viewBox="-10 -10 120 120" aria-hidden="true" focusable="false">
            <g fill=${graphicShapeIsOpen(option.type) ? "none" : this.paint.fill} stroke=${this.paint.stroke}
              stroke-width=${this.paint["stroke-width"]} opacity=${this.paint.opacity} stroke-linejoin="round" fill-rule="evenodd">
              ${this.preview(option)}
            </g>
          </svg>
        </button>`)}
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

  private brushButton(brush: CustomBrush, custom = false) {
    const color = colorHex(brush.stroke) ?? brush.stroke
    const width = brush["stroke-width"]
    return html`<button class="brush ${color === "#ffffff" ? "light" : ""}" type="button"
      aria-label=${`${custom ? "Custom " : ""}${color}, ${width} px brush`} title=${`${color}, ${width} px`}
      aria-pressed=${String(this.mode === this.pageMode(this.activePage) && colorHex(this.paint.stroke) === color && Number(this.paint["stroke-width"]) === Number(width))}
      @pointerdown=${this.keepSelection} @click=${() => this.setPaint(brush, true)}>
      <svg viewBox="0 0 80 24" aria-hidden="true"><path d=${custom ? "M 10 12 L 70 12" : "M 28 12 L 52 12"} fill="none" stroke=${color}
        stroke-width=${width} opacity=${this.paint.opacity} stroke-linecap="round" vector-effect="non-scaling-stroke"></path></svg>
    </button>`
  }

  private get validCustomWidth() {
    const width = Number(this.customWidth)
    return Number.isFinite(width) && width >= 0.5 && width <= 100
  }

  private openBrushDialog() {
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
    this.closeBrushDialog()
    super.disconnectedCallback()
  }

  private selectPage(page: string) {
    const wasDrawing = this.isDrawingPage(this.activePage)
    this.activePage = page
    const nextMode = this.pageMode(page)
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
    this.paint = {...this.paint, ...paint}
    this.dispatchEvent(new CustomEvent("shape-paint-change", {
      detail: {paint: {...this.paint}}, bubbles: true, composed: true,
    }))
    if(activateDrawing && this.isDrawingPage(this.activePage)) {
      const mode = this.pageMode(this.activePage)
      if(this.mode !== mode) this.dispatchEvent(new CustomEvent("ribbon-button-click", {
        detail: {label: `graphic-mode:${mode}`}, bubbles: true, composed: true,
      }))
    }
  }

  private startDrag(event: DragEvent, shape: typeof graphicShapeOptions[number]["type"]) {
    const data = event.dataTransfer
    if(!data) return
    data.setData(graphicShapeDragType, JSON.stringify({shape, paint: {...this.paint}}))
    data.effectAllowed = "copy"
    const preview = (event.currentTarget as HTMLElement).querySelector("svg")!
    const bounds = preview.getBoundingClientRect()
    data.setDragImage(preview, bounds.width / 2, bounds.height / 2)
  }

  private preview(option: typeof graphicShapeOptions[number]) {
    if(option.path) return svg`<path d=${option.path}></path>`
    switch(option.type) {
      case "rectangle": return svg`<rect width="100" height="100" rx="5"></rect>`
      case "ellipse": return svg`<ellipse cx="50" cy="50" rx="50" ry="50"></ellipse>`
      case "triangle": return svg`<polygon points="50,0 100,100 0,100"></polygon>`
      case "diamond": return svg`<polygon points="50,0 100,50 50,100 0,50"></polygon>`
      case "hexagon": return svg`<polygon points="25,0 75,0 100,50 75,100 25,100 0,50"></polygon>`
      case "star": return svg`<polygon points="50,0 61,35 98,35 68,57 79,92 50,70 21,92 32,57 2,35 39,35"></polygon>`
      case "arrow": return svg`<polygon points="0,30 60,30 60,0 100,50 60,100 60,70 0,70"></polygon>`
      case "line": return svg`<path d="M 0 50 L 100 50"></path>`
      case "connector": return svg`<path d="M 0 0 L 50 0 L 50 100 L 100 100"></path>`
      case "image": return svg`<rect width="100" height="100"></rect><circle cx="72" cy="25" r="10"></circle><path d="M 0 80 L 30 45 L 60 80 L 80 60 L 100 80" fill="none"></path>`
    }
  }

  protected updated() {
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>("dialog")
    if(this.brushDialogOpen && dialog && !dialog.open) dialog.showModal()
    this.renderRoot.querySelectorAll<SVGSVGElement>(".key svg").forEach(preview => {
      const geometry = preview.querySelector<SVGGElement>("g")!
      if(!geometry.getBBox) return
      try {
        const bounds = geometry.getBBox()
        const size = Math.max(bounds.width, bounds.height) * 1.2
        if(!Number.isFinite(size) || size <= 0) return
        preview.setAttribute("viewBox", `${bounds.x + bounds.width / 2 - size / 2} ${bounds.y + bounds.height / 2 - size / 2} ${size} ${size}`)
      }
      catch { /* Hidden or detached SVGs may not have measurable geometry. */ }
    })
  }

  private keepSelection(event: PointerEvent) { event.preventDefault() }
}

if(!customElements.get("dom-editor-shape-keyboard")) customElements.define("dom-editor-shape-keyboard", ShapeKeyboard)
