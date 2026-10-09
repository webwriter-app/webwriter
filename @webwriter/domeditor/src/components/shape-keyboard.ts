import {LitElement, css, html, svg} from "lit"
import {defaultGraphicShapePaint, graphicShapeIsOpen, graphicShapeOptions, type GraphicShapePaint} from "../graphic"
import {ribbonIcon} from "../ribbon-icons"

const shapePages = ["Basic", "Advanced", "Flowchart"] as const
const shapePage = (category: string) => category === "Flowchart" ? "Flowchart"
  : ["Lines", "Rectangles", "Basic shapes"].includes(category) ? "Basic" : "Advanced"

/** Insertion paint belongs to the keyboard, independently of selected shapes. */
export class ShapeKeyboard extends LitElement {
  static properties = {
    activePage: {state: true},
    paint: {attribute: false},
  }

  static styles = css`
    :host {
      display: block;
      box-sizing: border-box;
      width: min(100%, 760px);
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
    .header, .tabs { display: flex; align-items: center; gap: .25rem; flex-wrap: wrap; }
    .header { flex-wrap: nowrap; }
    .tabs { flex-wrap: nowrap; min-width: 0; }
    h2 { margin: 0; font-size: .82rem; font-weight: 650; }
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
    .grid {
      display: grid; grid-template-columns: repeat(auto-fill, 2.42rem);
      grid-auto-rows: 1.54rem; align-content: start; gap: .25rem;
      height: calc(4 * 1.54rem + 3 * .25rem); min-height: 0; overflow-y: auto;
    }
    .key { display: flex; align-items: center; justify-content: center; min-height: 0; padding: 0; }
    .key svg { display: block; flex: none; width: 1.65rem; height: 1.375rem; overflow: visible; }
    @media (max-width: 520px) {
      .tabs button { font-size: .7rem; padding-inline: .3rem; }
      .header { gap: .2rem; }
    }
  `

  activePage = "Basic"
  paint: Required<GraphicShapePaint> = {...defaultGraphicShapePaint}

  render() {
    const options = graphicShapeOptions.filter(option => shapePage(option.category) === this.activePage)
    return html`<section aria-label="Shapes">
      <div class="header">
        <h2>Shapes</h2>
        <div class="tabs" role="group" aria-label="Shape pages">
          ${shapePages.map(page => html`<button type="button" aria-pressed=${String(this.activePage === page)}
            @pointerdown=${this.keepSelection} @click=${() => { this.activePage = page }}>${page}</button>`)}
        </div>
        <button class="close" type="button" aria-label="Hide shape keyboard" title="Hide shape keyboard"
          @pointerdown=${this.keepSelection} @click=${() => this.dispatchEvent(new CustomEvent("shape-keyboard-close", {bubbles: true, composed: true}))}>${ribbonIcon("Reject")}</button>
      </div>
      <div class="grid" role="group" aria-label=${this.activePage}>
        ${options.map(option => html`<button class="key" type="button" title=${option.label} aria-label=${option.label}
          @pointerdown=${this.keepSelection} @click=${() => this.dispatchEvent(new CustomEvent("shape-keyboard-command", {
            detail: {shape: option.type, paint: {...this.paint}}, bubbles: true, composed: true,
          }))}>
          <svg viewBox="-10 -10 120 120" aria-hidden="true" focusable="false">
            <g fill=${graphicShapeIsOpen(option.type) ? "none" : this.paint.fill} stroke=${this.paint.stroke}
              stroke-width=${this.paint["stroke-width"]} opacity=${this.paint.opacity} stroke-linejoin="round" fill-rule="evenodd">
              ${this.preview(option)}
            </g>
          </svg>
        </button>`)}
      </div>
    </section>`
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
