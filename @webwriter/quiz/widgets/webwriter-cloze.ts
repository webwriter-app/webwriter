import {html, css} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators.js"
import {styleMap} from "lit/directives/style-map.js"

import SlIconButton from "@shoelace-style/shoelace/dist/components/icon-button/icon-button.component.js"


import IconTextarea from "bootstrap-icons/icons/textarea.svg"
import { WebwriterClozeGap } from "./webwriter-cloze-gap.js"

@customElement("webwriter-cloze")
export class WebwriterCloze extends LitElementWw {

  static localization = {}

  msg = (str: string) => this.lang in WebwriterCloze.localization? WebwriterCloze.localization[this.lang][str] ?? str: str

  
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

    #add-gap {
      position: absolute;
      right: 0;
      top: 0;
      background: rgba(255, 255, 255, 0.85)
    }

    :host(:not([contenteditable=true]):not([contenteditable=""])) .author-only {
      display: none;
    }
  `

  toggleGap = () => {
    // Get selected text
    const sel = document.getSelection()
    const selectedElement = sel.anchorNode.childNodes.item(sel.anchorOffset)
    if(selectedElement?.nodeName.toLowerCase() === "webwriter-cloze-gap") {
      const gap = selectedElement as WebwriterClozeGap
      selectedElement.replaceWith(document.createTextNode(gap.solution))
    }
    else if(this.contains(sel.anchorNode)) {
      const textContent = sel.toString()
      sel.deleteFromDocument()
      const textNode = sel.anchorNode as Text
      const at = sel.anchorOffset
      const clozeGap = document.createElement("webwriter-cloze-gap") as WebwriterClozeGap
      clozeGap.setAttribute("solution", textContent)
      const afterTextNode = textNode.splitText(at)
      afterTextNode.textContent = " " + afterTextNode.textContent.trimStart()
      textNode.textContent = textNode.textContent.trimEnd() + " "
      textNode.parentElement.insertBefore(clozeGap, afterTextNode)
      if(afterTextNode.textContent.trim() === "") {
        console.log("empty after")
        textNode.parentElement.appendChild(document.createTextNode("​"))
      }
    }
  }

  render() {
    return html`
      <slot></slot>
      <sl-icon-button class="author-only" id="add-gap" src=${IconTextarea} @click=${this.toggleGap}></sl-icon-button>
    `
  }
}