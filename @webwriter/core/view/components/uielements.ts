import { LitElement, html, css, PropertyDeclaration, PropertyValueMap, unsafeCSS } from "lit"
import { customElement, property, query, queryAssignedElements } from "lit/decorators.js"
import SortableJS, {SortableOptions} from "sortablejs";
import {until} from 'lit/directives/until.js';
import { styleMap } from "lit/directives/style-map.js"
import { SlButton, SlIconButton, SlTooltip } from "@shoelace-style/shoelace";

@customElement("ww-combobox")
export class WwCombobox extends LitElement {

  static shadowRootOptions = {...LitElement.shadowRootOptions, delegatesFocus: true}

  constructor() {
    super()
    this.tabIndex = 0
    this.addEventListener("focus", e => this.active = true)
    this.addEventListener("blur", e => this.active = false)
  }


  @query("slot")
  slotElement: HTMLSlotElement

  @queryAssignedElements()
  optionElements: HTMLElement[]

  @property({type: Boolean, attribute: true, reflect: true})
  active: boolean

  @property({type: Boolean, attribute: true})
  disabled: boolean

  @property({type: Boolean, attribute: true, reflect: true})
  multiple: boolean = false

  @property({type: String})
  placeholder: string

  @property({type: Boolean, attribute: true, reflect: true})
  filled: boolean = false

  @property({type: Array, attribute: true, reflect: true})
  value: string | string[]

  static get styles() {
    return css`

      * {
        font-family: var(--sl-font-sans);
        font-size: var(--sl-input-font-size-medium);
      }

      :host {
        display: flex;
        flex-direction: row;
        justify-content: flex-start;
        position: relative;
        border: solid var(--sl-input-border-width) var(--sl-input-border-color);
        border-radius: var(--sl-input-border-radius-medium);
        height: 38px;
      }

      :host([filled]) {
        background: var(--sl-input-filled-background-color);
      }

      :host([active]) {
				border-color: var(--sl-input-border-color-focus);
				box-shadow: 0 0 0 var(--sl-focus-ring-width) var(--sl-input-focus-ring-color);
      }

      :host([disabled]) {
        background: none;
      }

      #values {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0.25rem;
        margin-left: 16px;
      }

      #open-button {
        margin-left: auto;
        background: transparent;
      }

      :host(:not([active])) #options {
        display: none;
      }

      #options {
        display: block;
        width: 100%;
        position: absolute;
        top: 100%;
        left: 0;
      }

      #options::part(base) {
        width: 100%;
        border-top: none;
      }

      input {
        width: 100%;
        border: none;
        outline: none;
        background: transparent;
      }
    `
  }

  handleOpenButtonClick(e: PointerEvent) {
    if(this.active) {
      this.blur()
      this.active = false
    }
    else {
      this.active = true
    }
  }

  handleInputChange(e: Event) {
    const input = e.target as HTMLInputElement
    if(input.value.trim() !== "") {
      this.value = this.multiple? [...this.value?.slice(0, -1) ?? [], input.value, ""]: input.value
    }
    if(this.multiple) {
      input.value = ""
    }
    this.emitChange()
  }

  handleInputKeydown(e: KeyboardEvent) {
    const input = e.target as HTMLInputElement
    if(e.key === "Backspace" && input.selectionStart === 0 && input.selectionEnd === 0) {
      this.confirmValue()
    }
    else if(e.key === " " || e.key === "," || e.key === ";") {

    }
  }

  confirmValue() {
    this.value = [...this.value.slice(0, -2), this.value[this.value.length - 1]]
  }

  emitChange() {
    this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  }

  private get inputValue() {
    if(!this.value) {
      return ""
    }
    else if(this.multiple) {
      return this.value[this.value.length - 1]
    }
    else {
      return this.value as string
    }
  }

  private get inputPlaceholder() {
    return Array.isArray(this.value) && (this.value.length > 0) && this.value[0] !== ""
      ? ""
      : this.placeholder
  }

  render() {
    return html`
      ${this.multiple? html`
        <span id="values">
          ${(this.value as string[] ?? []).slice(0, -1).map(v => html`
            <sl-tag variant="primary">${v}</sl-tag>
          `)}
        </span>
      `: null}
      <input 
        value=${this.inputValue}
        placeholder=${this.inputPlaceholder}
        ?disabled=${this.disabled}
        @change=${this.handleInputChange}
        @keydown=${this.handleInputKeydown}
      >
      ${this.optionElements.length > 0? html`
        <sl-icon-button 
          id="open-button"
          name=${this.active? "chevron-up": "chevron-down"}
          @focus=${e => e.stopPropagation()}
          @click=${this.handleOpenButtonClick}
        ></sl-icon-button>
        <sl-menu id="options">
          <slot></slot>
        </sl-menu>
      `: null}
    `
  }
}


@customElement("ww-option")
export class WwOption extends LitElement {

  @property({type: Boolean, attribute: true})
  active: boolean = false

  static get styles() {
    return css`
      :host(:not([active])) {
        display: none;
      }
    `
  }

  render() {
    return html`<slot></slot>`
  }
}

@customElement("ww-sortable")
export class Sortable extends LitElement {

  @query("[part=base]")
  base: Sortable

  @query("slot")
  slotElement: HTMLSlotElement

  sortable: SortableJS

  @property({type: Object})
  options: Omit<SortableOptions, `on${string}`>

  static get styles() {
    return css`
      :host {
        display: contents;
      }
    `
  }

  firstUpdated() {
    const handlerNames = ["onChoose", "onUnchoose", "onStart", "onEnd", "onAdd", "onUpdate", "onSort", "onRemove", "onFilter", "onMove", "onClone", "onChange"] 
    const handlerEntries = handlerNames.map(n => [n, e => new CustomEvent(n.toLowerCase().slice(2), {composed: true, bubbles: true, detail: e})])
    const handlers = Object.fromEntries(handlerEntries)
    this.sortable = new SortableJS(this.slotElement, {...this.options, ...handlers}) 
  }



  render() {
    return html`<slot></slot>`
  }
}

function shortenBytes(n) {
  const k = n > 0 ? Math.floor((Math.log2(n)/10)) : 0;
  const rank = (k > 0 ? 'KMGT'[k - 1] : '') + 'b';
  const count = Math.floor(n / Math.pow(1024, k));
  return count + rank;
}

const TEXTLIKE_TYPES = [
  "application/ecmascript",
  "application/javascript",
  "application/json-ld",
  "application/json",
  "application/xml",
  "application/xml-dtd"
]

@customElement("ww-file-input")
export class FileInput extends LitElement {

  @property({type: Number})
  filesizeLimit: number

  @property({type: String, attribute: true, reflect: true})
  accept: string
  
  @property({type: String, attribute: true, reflect: true})
  capture: string

  @property({type: Boolean, attribute: true, reflect: true})
  multiple: boolean

  @property({type: String, attribute: true, reflect: true})
  label: string

  @query("input[type=file]")
  fileInput: HTMLInputElement

  @property({attribute: false})
  files: FileList

  @property({type: Number})
  activeFile: number

  @property({type: Boolean, attribute: true, reflect: true})
  noPreview: boolean = false

  hasMouseOver: boolean = false

  get mediaType() {
    if(this.accept) {
      const mediaTypes = this.accept.split(",").map(mime => mime.split("/")[0])
      const uniqueTypes = Array.from(new Set(mediaTypes))
      const isSingleMultimediaType = uniqueTypes.length == 1 && ["image", "audio", "video"].includes(uniqueTypes[0])
      return isSingleMultimediaType? uniqueTypes[0]: "file"
    }
    else {
      return "file"
    }
  }

  static get styles() {
    return css`

      *:not(pre):not(code) {
        font-family: var(--sl-font-sans);
        font-size: var(--sl-input-font-size-medium);
      }

      :host([nopreview]) .panel {
        display: none;
      }

      form {
        position: relative;
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 0.5rem;
        justify-content: flex-start;
        align-items: flex-start;
        border: dashed 2px var(--sl-input-border-color);
        border-radius: var(--sl-input-border-radius-medium);
        background: var(--sl-color-neutral-100);
        min-height: 42px;
        height: 100%;
      }

      form.dragover {
        background-image: linear-gradient(45deg, var(--sl-color-primary-100) 25%, transparent 25%, transparent 50%, var(--sl-color-primary-100) 50%, var(--sl-color-primary-100) 75%, transparent 75%, #fff);
        background-size: 15px 15px;
      }

      .radiotab {
        position: absolute;
        opacity: 0;
      }

      .label {
        padding: 0.25rem 1rem;
        cursor: pointer;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 0.9rem;
        height: 40px;
      }

      .label:hover:not([data-active]):not(:active) {
        text-decoration: var(--sl-color-primary-600) 2px solid underline;
      }

      .label:active {
        text-decoration: var(--sl-color-primary-600) 3px solid underline;
      }

      input[type=file] {
        display: none;
      }

      #select-button {
        user-select: none;
        display: inline-block;
        background: var(--sl-color-primary-600);
        color: var(--sl-color-neutral-0);
        padding: 0.5rem 1rem;
        border-right: solid var(--sl-input-border-width) var(--sl-input-border-color);
        border-radius: var(--sl-input-border-radius-medium);
        width: min-content;
        white-space: nowrap;
        cursor: pointer;
      }

      #select-button:hover {
        background: var(--sl-color-primary-500);
      }

      #select-button:active {
        background: var(--sl-color-primary-700);
      }

      label[for=fileInputForm] {
        margin-bottom: var(--sl-spacing-3x-small);
      }

      .panel {
        display: none;
        width: 100%;
      }

      .panel[data-active] {
        display: block;
        padding: 0.5rem;
        order: 1000000000;
        resize: vertical;
        overflow: auto;
        height: 400px;
        max-height: 800px;
      }

      .label[data-active] {
        text-decoration: var(--sl-color-primary-600) 3px solid underline;
      }

      .drop-zone-label {
        position: absolute;
        width: min-content;
        height: min-content;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
        margin: auto;
        white-space: nowrap;
        user-select: none;
      }

      .file-header {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
      }

      .file-name {
        color: var(--sl-color-primary-700);
        font-weight: bold;
      }
    
      .loading::after {
        display: inline-block;
        animation: dotty steps(1, end) 1s infinite;
        content: '';
      }
      
      @keyframes dotty {
          0%   { content: ''; }
          25%  { content: '.'; }
          50%  { content: '..'; }
          75%  { content: '...'; }
          100% { content: ''; }
      }

      .preview.text {
        background: white;
        padding: 4px;
      }

      .preview {
        aspect-ratio: auto;
        width: 100%;
      }

      .preview.pdf {
        height: 100%;
      }


    `
  }

  static Loading() {
    return html`<span class="loading">Loading</span>`
  }


  static Preview(file: File) {
    const [mediaType, subtype] = file.type.split("/")
    if(mediaType === "text" || subtype.endsWith("+xml") || TEXTLIKE_TYPES.includes(file.type)) {
      return html`<pre class="preview text"><code>${until(file.text(), FileInput.Loading)}</code></pre>`
    }
    else if(mediaType === "image") {
      return html`<img class="preview image" src=${URL.createObjectURL(file)} />`
    }
    else if(mediaType === "audio") {
      return html`<audio class="preview audio" controls src=${URL.createObjectURL(file)}></audio>`
    }
    else if(mediaType === "video") {
      return html`<video class="preview video" controls src=${URL.createObjectURL(file)}></video>`
    }
    else if(file.type === "application/pdf") {
      return html`<embed class="preview pdf" type="application/pdf" src=${URL.createObjectURL(file)} />`
    }
  }

  static PreviewTabs(files: File[], activeFile?:number, setActiveFile?:CallableFunction) {
    return files.map((file, i) => html`
      <input class="radiotab" name="tabs" tabindex=${i} type="radio" id=${`tab${i}`} @change=${() => setActiveFile(i)} />
      <label class="label" for=${`tab${i}`} ?data-active=${i === activeFile} title=${shortenBytes(file.size)}>
        ${file.name}
      </label>
      <div class="panel" tabindex=${i} ?data-active=${i === activeFile}>
        ${FileInput.Preview(file)}
      </div>
    `)
  }

  handleFileChange = (e: Event) => {
    this.files = (e.target as HTMLInputElement).files
    if(this.files.length >= 1) {
      this.activeFile = 0
    }
    this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  }

  handleDragEnter = (e: DragEvent) => {
    console.log("dragenter")
    e.preventDefault()
    e.stopPropagation()
  }
  
  handleDragOver = (e: DragEvent) => {
    console.log("dragover")
    e.preventDefault()
    e.stopPropagation()
  }
  
  handleDrop = (e: DragEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const files = e.dataTransfer.files
    if(files) {
      this.files = files
      this.handleFileChange(e)
    }
  }

  handleMouseEnter(e: MouseEvent) {
    this.hasMouseOver = true
  }

  handleMouseLeave(e: MouseEvent) {
    this.hasMouseOver = false
  }

  render() {
    return html`
      <label for="fileInputForm">${this.label}</label>
      <form name="fileInputForm" id="fileInputForm" @dragenter=${this.handleDragEnter} @dragover=${this.handleDragOver} @drop=${this.handleDrop} @mouseenter=${this.handleMouseEnter} @mouseleave=${this.handleMouseLeave}>
        <label id="select-button" for="fileInput">Select ${this.mediaType}...</label>
        <input name="fileInput" id="fileInput" type="file" .files=${this.files} accept=${this.accept} capture=${this.capture} ?multiple=${this.multiple} @change=${this.handleFileChange} />
        ${FileInput.PreviewTabs(Array.from(this.files ?? []), this.activeFile, i => this.activeFile = i)}
        ${!this.files || this.files.length === 0? html`
          <div class="drop-zone-label">Or drop ${this.mediaType} here</div>`
        : null}
      </form>
    `
  }
}


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
      <div id="coordinate-picker" @click=${this.handleClick} title="Pick coordinates">
        <img draggable="false" src=${this.src} />
        ${this.coordinates.map(ImageCoordinatePicker.Hotspot)}
      </div>
    `
  }
}

type GridName = string
type GridConfig = {gridTemplate: string, gap?: string, padLikeGap?: boolean}

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
        <legend>Choose a layout</legend>
        ${previews}
      </fieldset>
      <div class="extra-options">
        <label for="gap">
          <span class="label-with-info">
            Gap
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
            Height
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
          Padding<br> like gap
          <input id="paddingLikeGap" type="checkbox" ?checked=${this.paddingLikeGap} @change=${this.handlePaddingLikeGapChange} />
        </label>
      </div>
      <main class="content-grid" style=${contentGridStyles}>
        ${imageBlocks}
      </main>
    `
  }
}


type ButtonTooltipOptions = Partial<Pick<SlTooltip, "placement" | "skidding" | "trigger" |"hoist">>

@customElement("ww-button")
export class Button extends SlButton {

  @property({type: Object, attribute: false})
  tooltipOptions: ButtonTooltipOptions = {
    placement: "bottom",
    trigger: "hover focus manual",
    hoist: true
  }

  @query("slot[slot=content]")
  variantSlot: HTMLSlotElement

  get tooltipDisabled() {
    return !this.variantSlot?.assignedElements().some(el => el.slot === this.variant)
  }

  static styles = [
    SlButton.styles,
    css`
      #default-slot {
        display: none; 
      }

      :host([circle]) [part=base] {
        display: flex;
        flex-direction: column;
        justify-content: center;
        background: none !important;
      }

      :host([circle]) [part=label] {
        height: min-content;
        line-height: 1;
        padding: var(--sl-spacing-x-small);
      }
    `
  ]

  render() {
    const {placement, skidding, trigger, hoist} = this.tooltipOptions
    return html`<sl-tooltip placement=${placement} skidding=${skidding} trigger=${trigger} ?hoist=${hoist} ?disabled=${this.tooltipDisabled}>
      ${super.render()}
      <slot name=${this.variant} slot="content"></slot>
      <slot id="default-slot"></slot>
    </sl-tooltip>
    `
  }

}