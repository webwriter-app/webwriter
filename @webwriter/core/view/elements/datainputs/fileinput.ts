import { LitElement, html, css } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import {until} from "lit/directives/until.js"
import { msg, str } from "@lit/localize"
import { shortenBytes } from "../../../model/utility"

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

  static PreviewTabs(files: File[], activeFile?: number, setActiveFile?: Function) {
    return files.map((file, i) => html`
      <input class="radiotab" name="tabs" tabindex=${i} type="radio" id=${`tab${i}`} @change=${() => setActiveFile? setActiveFile(i): null} />
      <label class="label" for=${`tab${i}`} ?data-active=${i === activeFile} title=${shortenBytes(file.size)}>
        ${file.name}
      </label>
      <div class="panel" tabindex=${i} ?data-active=${i === activeFile}>
        ${FileInput.Preview(file)}
      </div>
    `)
  }

  handleFileChange = (e: Event) => {
    this.files = (e.target as HTMLInputElement).files ?? this.files
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
    const files = e.dataTransfer?.files
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
        <label id="select-button" for="fileInput">${msg(str`Select ${this.mediaType}...`)}</label>
        <input name="fileInput" id="fileInput" type="file" .files=${this.files} accept=${this.accept} capture=${this.capture} ?multiple=${this.multiple} @change=${this.handleFileChange} />
        ${FileInput.PreviewTabs(Array.from(this.files ?? []), this.activeFile, (i: number) => this.activeFile = i)}
        ${!this.files || this.files.length === 0? html`
          <div class="drop-zone-label">${msg(str`Or drop ${this.mediaType} here`)}</div>`
        : null}
      </form>
    `
  }
}