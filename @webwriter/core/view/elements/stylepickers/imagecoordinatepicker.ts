import { localized, msg } from "@lit/localize"
import { LitElement, css, html } from "lit"
import { customElement, property, query } from "lit/decorators.js"

@localized()
@customElement("ww-image-coordinate-picker")
export class ImageCoordinatePicker extends LitElement {

  
  @property({type: Boolean, attribute: true, reflect: true})
  multiple: boolean = false

  @property({type: String, attribute: true, reflect: true})
  label: string

  @property({type: String, attribute: true, reflect: true})
  helpText: string

  @property({type: String, attribute: true, reflect: true})
  src: string

  @property({attribute: false})
  coordinates: {x: number, y: number}[] = []

  @query("img")
  img: HTMLImageElement

  handleClick(e: MouseEvent) {
    let rect = this.img.getBoundingClientRect()
    const [x, y] = [Math.round(e.clientX - rect.left), Math.round(e.clientY - rect.top)]
    if(this.multiple) {
      this.coordinates.push({x, y})
    }
    else {
      this.coordinates = [{x, y}]
    }
    this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  }

  static get styles() {
    return css`

    * {
        font-family: var(--sl-font-sans);
        font-size: var(--sl-input-font-size-medium);
      }

      #coordinate-picker {
        position: relative;
        cursor: crosshair;
        overflow: hidden;
      }

      img {
        aspect-ratio: auto;
        width: 100%;
        user-select: none;
      }

      label {
        margin-bottom: var(--sl-spacing-3x-small);
      }

      .hotspot {
        position: absolute;
        background: var(--sl-color-danger-400);
        width: 30px;
        height: 30px;
        border-radius: 30px;
        transform: translate(-16px, -15px);
        mix-blend-mode: difference;
      }

      .help-text {
        color: gray;
        margin-left: 2ch;
      }
    `
  }

  static Cursor = `<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
    <g>
      <ellipse stroke-width="0" ry="10" rx="10" id="svg_1" cy="10" cx="10" stroke="#000000" fill="#0284c7"/>
    </g>
  </svg>`

  static Hotspot({x, y}: {x: number, y: number}) {
    return html`<div class="hotspot" title=${`x=${x}, y=${y}`} style=${`left: ${x}px; top: ${y}px`}></div>`
  }

  render() {
    return html`
      <slot name="label">
        <label>${this.label}</label> <span class="help-text">${this.helpText}</span>
      </slot>
      <label>${this.label}</label> <span class="help-text">${this.helpText}</span>
      <div id="coordinate-picker" @click=${this.handleClick} title=${msg("Pick coordinates")}>
        <img draggable="false" src=${this.src} />
        ${this.coordinates.map(ImageCoordinatePicker.Hotspot)}
      </div>
    `
  }
}