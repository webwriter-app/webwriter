import {html, css, LitElement} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement, query} from "lit/decorators.js"
import {styleMap} from "lit/directives/style-map.js"

import SlIconButton from "@shoelace-style/shoelace/dist/components/icon-button/icon-button.component.js"


import IconTextarea from "bootstrap-icons/icons/textarea.svg"
import { WebwriterClozeGap } from "./webwriter-cloze-gap.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

import LOCALIZE from "../../localization/generated"
import {msg} from "@lit/localize"

declare global {interface HTMLElementTagNameMap {
  "webwriter-cloze": WebwriterCloze;
}}

@customElement("webwriter-cloze")
export class WebwriterCloze extends LitElementWw {

  localize = LOCALIZE

  static shadowRootOptions: ShadowRootInit = {...LitElementWw.shadowRootOptions, delegatesFocus: false}
  
  static scopedElements = {
    "sl-icon-button": SlIconButton
  }

  static styles = css`
    :host {
      min-height: 1rem;
      position: relative;
    }

    slot {
      display: block;
      cursor: text;
    }

    slot[data-empty]:after {
      content: var(--placeholder);
      position: absolute;
      left: 0;
      top: 0;
      color: darkgray;
      pointer-events: none;
      user-select: none;
    }

    slot::after, slot::before {
      content: ' ';
    }

    #add-gap {
      position: absolute;
      right: 0;
      top: 0;
      background: rgba(255, 255, 255, 0.85);

      &[data-highlighting]::part(base) {
        background: var(--sl-color-primary-100);
      }
    }

    :host(:not([contenteditable=true]):not([contenteditable=""])) .author-only {
      display: none;
    }
  `

  @query("#add-gap")
  accessor addGapButton: SlIconButton

  observer: MutationObserver

  connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener("selectionchange", e => {
      const sel = document.getSelection()
      const node = document.getSelection()?.anchorNode
      const el = node.nodeType === node.TEXT_NODE? node.parentElement: node as HTMLElement
      this.addGapButton.toggleAttribute("data-visible", el?.closest("webwriter-cloze")? true: false)
      if(el?.closest("webwriter-cloze") && !sel.isCollapsed) {
        this.addGapButton.toggleAttribute("data-highlighting", true)
      }
      else {
        this.addGapButton.toggleAttribute("data-highlighting", false)
      }
    })
    this.observer = new MutationObserver(() => this.requestUpdate())
    this.observer.observe(this, {characterData: true, childList: true, subtree: true})
  }


  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.observer?.disconnect()
  }

  toggleGap = () => {
    const sel = document.getSelection()
    const selectedElement = sel.anchorNode.childNodes.item(sel.anchorOffset)
    if(selectedElement?.nodeName.toLowerCase() === "webwriter-cloze-gap") {
      const gap = selectedElement as WebwriterClozeGap
      selectedElement.replaceWith(document.createTextNode(gap.value))
    }
    else if(this.contains(sel.anchorNode)) {
      if(sel.anchorNode !== this) {
        const textContent = sel.toString()
        sel.deleteFromDocument()
        const textNode = sel.anchorNode as Text
        const at = sel.anchorOffset
        const clozeGap = document.createElement("webwriter-cloze-gap")
        clozeGap.classList.add("webwriter-new")
        clozeGap.setAttribute("value", textContent)
        const afterTextNode = textNode.splitText(at)
        afterTextNode.textContent = afterTextNode.textContent.trimStart()
        textNode.textContent = textNode.textContent.trimEnd()
        textNode.parentElement.insertBefore(clozeGap, afterTextNode)
      }
      else {
        const clozeGap = document.createElement("webwriter-cloze-gap")
        clozeGap.setAttribute("value", "")
        this.append(clozeGap)
      }
    }
  }

  render() {
    return html`
      <slot style=${styleMap({"--placeholder": `"${msg("Text to add gaps to")}"`})} ?data-empty=${!this.textContent.trim() && !this.querySelectorAll("& > p *:not(br)").length}></slot>
      <sl-icon-button class="author-only" id="add-gap" src=${IconTextarea} @click=${this.toggleGap}></sl-icon-button>
    `
  }
} 