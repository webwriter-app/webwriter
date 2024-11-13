import {html, css} from "lit"
import {LitElementWw, option} from "@webwriter/lit"
import {customElement, property} from "lit/decorators.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

import LOCALIZE from "../../localization/generated"
import {msg} from "@lit/localize"

declare global {interface HTMLElementTagNameMap {
  "webwriter-pairing-item": WebwriterPairingItem;
}}

@customElement("webwriter-pairing-item")
export class WebwriterPairingItem extends LitElementWw {

  localize = LOCALIZE

  tabIndex = -1

  static styles = css`

    :host {
      aspect-ratio: 1;
      min-width: 125px;
      max-width: 350px;
      min-height: 125px;
      max-height: 350px;
      position: relative;
      overflow: hidden;
      overflow-y: auto;
      scrollbar-width: thin;
      resize: both;
      border: 2px solid var(--sl-color-gray-500);
      border-radius: 5px;
      background: white;
    }

    slot {
      width: 100%;
      height: 100%;
      display: flex;
      box-sizing: border-box;
      position: relative;
      font-size: 0.8em;
      z-index: 1;
    }

    :host([droppreview]) slot {
      background: lightblue;
    }

    ::slotted(*) {
      height: 100%;
      width: 100%;
      box-sizing: border-box;
    }

    ::slotted(:not(:is(picture, audio, video, img, iframe))) {
      padding: 5px !important;
    }

    #handle {
      box-sizing: border-box;
      border-radius: 2px;
      position: absolute;
      left: 1px;
      bottom: 1px;
      width: 20px;
      height: 30px;
      display: inline-block;
      overflow: hidden;
      line-height: 5px;
      padding: 6px 4px;
      cursor: move;
      vertical-align: middle;
      font-size: 12px;
      font-family: sans-serif;
      letter-spacing: 2px;
      color: #cccccc;
      text-shadow: 1px 0 1px black;
      font-weight: 600;
      opacity: 0.95;
      z-index: 100;
    }
    #handle::after {
      content: '.. .. ..';
    }

    :host(:not([contenteditable=true]):not([contenteditable=""])) .author-only {
      display: none !important;
    }

    #click-overlay {
      position: absolute;
      top: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }

    #click-overlay:hover {
      background: var(--sl-color-primary-600);
      opacity: 10%;
    }

    :host(.ww-selected) #click-overlay {
      display: none;
    }
  `

  @property({attribute: true, reflect: true, converter: {toAttribute: (v: boolean) => v? "true": "false", fromAttribute: (attr: string) => attr === "true"}})
  accessor draggable = true

  @property({type: Boolean, attribute: true, reflect: true})
  accessor dropPreview = false

  connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener("dragstart", e => {
      if(e.target !== this) {
        e.preventDefault()
      }
      // this.dropPreview = undefined
      e.dataTransfer.setData("text/html", this.outerHTML)
      e.dataTransfer.setData("text/plain", this.id)
      // setTimeout(() => this.baseEl.style.visibility = "hidden")
      e.stopPropagation()
    })
    this.addEventListener("drop", e => {
      e.stopPropagation()
      const id = e.dataTransfer.getData("text/plain")
      const el = document.querySelector(`webwriter-pairing-item#${id}`)
      if(!el) {
        const html = e.dataTransfer.getData("text/html")
        this.parentElement.insertAdjacentHTML("beforeend", html)
      }
      else if(el && !this.contains(el)) {
        this.parentElement.insertAdjacentElement("beforeend", el)
      }
      this.dispatchEvent(new CustomEvent("ww-pairwith", {bubbles: true, detail: {with: id}}))
    }, {passive: true})
    this.addEventListener("dragover", e => {
      this.dropPreview = true
      e.preventDefault()
      e.stopImmediatePropagation()
    })
    this.addEventListener("dragleave", () => this.dropPreview = false, {passive: true})
    document.addEventListener("dragend", (e) => {
      // (e.target as HTMLElement)?.remove()
      this.dropPreview = false
    }, {passive: true})
  }

  render() {
    return html`
      <slot></slot>
      <div class="author-only" id="handle" @click=${() => this.dispatchEvent(new FocusEvent("focus"))}></div>

    `
  }
}