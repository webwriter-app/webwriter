import { localized, msg } from "@lit/localize"
import { LitElement, html, css } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { styleMap } from "lit/directives/style-map.js"

type GridName = string
type GridConfig = {gridTemplate: string, gap?: string, padLikeGap?: boolean}

@localized()
@customElement("ww-collage-image-picker")
export class CollageImagePicker extends LitElement {

  @property({type: Array, attribute: true})
  presetGrids: GridName[] = ["1", "1-1", "2", "2-1", "1-2", "2-2", "3-1", "1-3", "2-3", "3-2", "3-3"]

  @property({type: String, attribute: true, reflect: true})
  label: string

  @property({type: String, attribute: true, reflect: true})
  helpText: string

  @property({type: String, attribute: true, reflect: true})
  gap: string = "10px"

  @property({type: Number, attribute: true, reflect: true})
  gridHeight: number = 1

  @property({type: Boolean, attribute: true, reflect: true})
  paddingLikeGap: boolean = true

  @property({type: Number, attribute: true, reflect: true})
  layout: number = 0

  @query(".layoutPreview")
  layoutPreview: HTMLElement

  get gridTemplate() {
    return CollageImagePicker.gridNameToGridTracks(this.presetGrids[this.layout])
  }

  get gridAreas() {
    return [...new Set([...this.gridTemplate.matchAll(/[a-z]/g)].map(e => e[0]))]
  }

  static gridNameToGridTracks(gridName: GridName) {
    const allCols = gridName.split("-").map(num => parseInt(num))
    const maxColCount = Math.max(...allCols)
    const tracks = []
    let shift = 0
    for(const [i, colCount] of allCols.entries()) {
      const charCodes = [...Array(colCount).keys()].map(i => 97 + i + shift)
      console.log(charCodes)
      let letters = charCodes.map(charCode => String.fromCharCode(charCode))
      const lastLetter = letters[letters.length - 1]
      letters = [...letters, ...lastLetter.repeat(maxColCount - colCount)]
      tracks.push('"' + letters.join(" ")  + '"')
      shift += colCount
    }
    console.log({gridName, tracks})
    return tracks.join(" ")
  }

  static LayoutPreview(gridTracks: string, i: number, layout: number, onChange: (i: number) => void) {
    const trackCells = [...gridTracks.matchAll(/[a-z]/g)].map(entry => entry[0])
    const gridAreas = Array.from(new Set(trackCells))
    return html`
      <input tabindex=${i} type="radio" name="layout" id=${`p${i}`} value=${i} ?checked=${i === layout} @change=${() => onChange(i)} />
      <label for=${`p${i}`} style=${"grid-template:" + gridTracks} class="layout-preview">
        ${gridAreas.map(area => html`<div style=${`grid-area: ${area}`} class="preview-block"></div>`)}
      </label>
    `
  }

  static get styles() {
    return css`

      .layout-previews {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 15px;
        position: relative;
        padding: none;
        border: 2px solid gray;
        border-radius: 2px;
      }

      .layout-preview {
        display: inline-grid;
        gap: 5px;
        height: 50px;
        width: 50px;
        cursor: pointer;
      }

      .layout-preview:hover .preview-block {
        background: var(--sl-color-neutral-800);
      }

      .preview-block {
        background: var(--sl-color-neutral-600);
        border-radius: 2px;
      }

      input[type=radio] {
        height: 0px;
        width: 0px;
        position: absolute;
        top: 0;
      }

      input[type=radio]:checked + label > .preview-block {
        background: var(--sl-color-primary-600);
      }

      input[type=radio]:checked + label:hover > .preview-block {
        background: var(--sl-color-primary-700);
      }

      legend, label {
        font-size: var(--sl-font-size-small);
        font-weight: 600;
      }

      .content-grid {
        box-sizing: border-box;
        display: grid;
        width: 100%;
        aspect-ratio: 1/1;
      }

      .extra-options {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 2ch;
        flex-wrap: wrap;
        height: 50px;
      }

      .label-with-info {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
      }

      .label-with-info .value {
        font-size: var(--sl-font-size-x-small);
        color: var(--sl-color-primary-600);

      }

      #paddingLikeGap {
        height: 20px;
        aspect-ratio: 1/1;
      }

      .extra-options > label {
        display: flex;
        flex-direction: row;
        align-items: center;
        height: 40px;
        gap: 1ch;
      }

      #gap {
        width: 100%;
      }

      label[for=gap] {
        flex-grow: 1;
      }

      label[for=gridHeight] {
        flex-grow: 1;
      }

      #gridHeight {
        width: 100%;
      }
    `
  }

  handleLayoutChange = (i: number) => {
    this.layout = i
  }

  handleGapChange = (e: Event) => {
    this.gap = `${(e.target as HTMLInputElement).value}px`
  }

  handlePaddingLikeGapChange = (e: Event) => {
    this.paddingLikeGap = (e.target as HTMLInputElement).checked
  }

  handleGridHeightChange = (e: Event) => {
    this.gridHeight = parseFloat((e.target as HTMLInputElement).value)
  }

  render() {
    const {gridTemplate, gap, paddingLikeGap} = this
    const previews = this.presetGrids
      .map(CollageImagePicker.gridNameToGridTracks)
      .map((gridName, i) => CollageImagePicker.LayoutPreview(gridName, i, this.layout, this.handleLayoutChange))
    const imageBlocks = this.gridAreas.map(area => html`
      <ww-file-input style=${styleMap({"grid-area": area})} accept="image/*"></ww-file-input>
    `)
    const contentGridStyles = styleMap({gridTemplate, gap, padding: paddingLikeGap? gap: null, aspectRatio: `1/${this.gridHeight}`})
    return html`
      <slot name="label">
        <label>${this.label}</label> <span class="help-text">${this.helpText}</span>
      </slot>
      <fieldset class="layout-previews">
        <legend>${msg("Choose a layout")}</legend>
        ${previews}
      </fieldset>
      <div class="extra-options">
        <label for="gap">
          <span class="label-with-info">
          ${msg("Gap")}
            <span class="value">${this.gap}</span>
          </span>
          <input id="gap" type="range" list="gap-tickmarks" min="0" max="50" value=${this.gap.slice(0, this.gap.length - 2)} @input=${this.handleGapChange} />
          <datalist id="gap-tickmarks">
            <option value="0" label="0">0</option>
            <option value="10" label="10">10</option>
            <option value="20" label="20">20</option>
            <option value="30" label="30">30</option>
            <option value="40" label="40">40</option>
            <option value="50" label="50">50</option>
          </datalist>
        </label>
        <label for="gridHeight">
          <span class="label-with-info">
          ${msg("Height")}
            <span class="value">${this.gridHeight}</span>
          </span>
          <input id="gridHeight" type="range" list="gridHeight-tickmarks" min="0.10" max="2.00" step="0.05" value=${this.gridHeight} @input=${this.handleGridHeightChange} />
          <datalist id="gridHeight-tickmarks">
            <option value="0.10" label="0.10">0.10</option>
            <option value="1.00" label="1.00">1.00</option>
            <option value="2.00" label="2.00">2.00</option>
          </datalist>
        </label>
        <label for="paddingLikeGap">
          ${msg("Padding<br> like gap")}
          <input id="paddingLikeGap" type="checkbox" ?checked=${this.paddingLikeGap} @change=${this.handlePaddingLikeGapChange} />
        </label>
      </div>
      <main class="content-grid" style=${contentGridStyles}>
        ${imageBlocks}
      </main>
    `
  }
}