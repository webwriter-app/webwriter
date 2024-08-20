import {html, css} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement, property, query} from "lit/decorators.js"
import {styleMap} from "lit/directives/style-map.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

import SlIconButton from "@shoelace-style/shoelace/dist/components/icon-button/icon-button.component.js"

/**
 * @param {!Node} node
 * @param {boolean=} optimized
 * @return {string}
 */
export const xPath = function (node, optimized=false) {
    if (node.nodeType === Node.DOCUMENT_NODE) {
        return '/';
    }

    const steps = [];
    let contextNode = node;
    while (contextNode) {
        const step = _xPathValue(contextNode, optimized);
        if (!step) {
            break;
        }  // Error - bail out early.
        steps.push(step);
        if (step.optimized) {
            break;
        }
        contextNode = contextNode.parentNode;
    }

    steps.reverse();
    return (steps.length && steps[0].optimized ? '' : '/') + steps.join('/');
};

/**
 * @param {!Node} node
 * @param {boolean=} optimized
 * @return {?Step}
 */
const _xPathValue = function (node, optimized) {
    let ownValue;
    const ownIndex = _xPathIndex(node);
    if (ownIndex === -1) {
        return null;
    }  // Error.

    switch (node.nodeType) {
        case Node.ELEMENT_NODE:
            if (optimized && node.getAttribute('id')) {
                return new Step('//*[@id="' + node.getAttribute('id') + '"]', true);
            }
            ownValue = node.localName;
            break;
        case Node.ATTRIBUTE_NODE:
            ownValue = '@' + node.nodeName;
            break;
        case Node.TEXT_NODE:
        case Node.CDATA_SECTION_NODE:
            ownValue = 'text()';
            break;
        case Node.PROCESSING_INSTRUCTION_NODE:
            ownValue = 'processing-instruction()';
            break;
        case Node.COMMENT_NODE:
            ownValue = 'comment()';
            break;
        case Node.DOCUMENT_NODE:
            ownValue = '';
            break;
        default:
            ownValue = '';
            break;
    }

    if (ownIndex > 0) {
        ownValue += '[' + ownIndex + ']';
    }

    return new Step(ownValue, node.nodeType === Node.DOCUMENT_NODE);
};

/**
 * @param {!Node} node
 * @return {number}
 */
const _xPathIndex = function (node) {
    // Returns -1 in case of error, 0 if no siblings matching the same expression,
    // <XPath index among the same expression-matching sibling nodes> otherwise.
    function areNodesSimilar(left, right) {
        if (left === right) {
            return true;
        }

        if (left.nodeType === Node.ELEMENT_NODE && right.nodeType === Node.ELEMENT_NODE) {
            return left.localName === right.localName;
        }

        if (left.nodeType === right.nodeType) {
            return true;
        }

        // XPath treats CDATA as text nodes.
        const leftType = left.nodeType === Node.CDATA_SECTION_NODE ? Node.TEXT_NODE : left.nodeType;
        const rightType = right.nodeType === Node.CDATA_SECTION_NODE ? Node.TEXT_NODE : right.nodeType;
        return leftType === rightType;
    }

    const siblings = node.parentNode ? node.parentNode.children : null;
    if (!siblings) {
        return 0;
    }  // Root node - no siblings.
    let hasSameNamedElements;
    for (let i = 0; i < siblings.length; ++i) {
        if (areNodesSimilar(node, siblings[i]) && siblings[i] !== node) {
            hasSameNamedElements = true;
            break;
        }
    }
    if (!hasSameNamedElements) {
        return 0;
    }
    let ownIndex = 1;  // XPath indices start with 1.
    for (let i = 0; i < siblings.length; ++i) {
        if (areNodesSimilar(node, siblings[i])) {
            if (siblings[i] === node) {
                return ownIndex;
            }
            ++ownIndex;
        }
    }
    return -1;  // An error occurred: |node| not found in parent's children.
};

/**
 * @unrestricted
 */
const Step = class {
    constructor(readonly value: string, readonly optimized=false) {}
    
    toString() {
        return this.value;
    }
};

import IconHighlighter from "bootstrap-icons/icons/highlighter.svg"

declare global {interface HTMLElementTagNameMap {
  "webwriter-mark": WebwriterMark;
}}

@customElement("webwriter-mark")
export class WebwriterMark extends LitElementWw {

  static localization = {}

  // @ts-ignore: Experimental API
  static highlight = new Highlight()

  static {
    // @ts-ignore: Experimental API
    CSS.highlights.set("webwriter-mark", this.highlight)
  }

  msg = (str: string) => this.lang in WebwriterMark.localization? WebwriterMark.localization[this.lang][str] ?? str: str

  
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

    #highlight {
      position: absolute;
      right: 0;
      top: 0;
      background: rgba(255, 255, 255, 0.85)
    }

    slot[data-empty]:after {
      content: var(--ww-placeholder);
      position: absolute;
      left: 0;
      top: 0;
      color: darkgray;
      pointer-events: none;
      user-select: none;
    }

    #highlight::part(base):hover {
      background: yellow;
    }

    :host ::highlight(webwriter-mark) {
      background-color: yellow;
    }

    #highlight[data-highlighting]::part(base) {
      background-color: lightyellow;
    }

    :host(:has(#highlight[data-highlighting])) ::selection {
      background: lightyellow !important;
    }
  `

  @property({type: Boolean, attribute: true, reflect: true})
  accessor highlighting = false

  #value: Range[] = []

  get value() {
    return this.#value
  }

  @property({
    attribute: true,
    reflect: true,
    converter: {
      toAttribute: (v: Range[]) => {
        const ranges = v.map(range => {
          return range.startContainer === range.endContainer
            ? {
              startContainer: xPath(range.startContainer),
              startOffset: range.startOffset,
              endOffset: range.endOffset
            }
            : {
              startContainer: xPath(range.startContainer),
              startOffset: range.startOffset,
              endContainer: xPath(range.endContainer),
              endOffset: range.endOffset
            }
        })
        return JSON.stringify(ranges)
      },
      fromAttribute: attr => {
        const ranges = JSON.parse(attr) as {startContainer: string, startOffset: number, endContainer?: string, endOffset: number}[]
        return ranges.map(({startContainer, startOffset, endContainer, endOffset}) => {
          const range = new Range()
          const startNode = document.evaluate(startContainer, document, null, 9, null).singleNodeValue
          startNode && range.setStart(startNode, startOffset)
          const endNode = document.evaluate(endContainer ?? startContainer, document, null, 9, null).singleNodeValue
          endNode && range.setEnd(endNode, endOffset)
          return startNode && endNode? range: null
        })
        .filter(node => node)
      }
    }
  })
  set value(value) {
    const prev = this.#value
    const added = []
    const removed = []
    // for each added:
    //  
    const finalValue = value.filter(range => {
      const isContained = value.some(otherRange => {
        if(range === otherRange) {
          return
        }
        const startsWithin = range.compareBoundaryPoints(Range.START_TO_START, otherRange) > -1
        const endsWithin = range.compareBoundaryPoints(Range.END_TO_END, otherRange) <= 0
        return startsWithin && endsWithin
      })
      return !isContained && !range.collapsed
    })
    this.#value = finalValue
    for(const range of prev) {
      WebwriterMark.highlight.delete(range)
    }
    for(const range of value) {
      WebwriterMark.highlight.add(range)
    }
  }

  observer: MutationObserver

  connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener("selectionchange", e => {
      const sel = document.getSelection()
      const el = document.getSelection()?.anchorNode?.parentElement
      if(el?.closest("webwriter-mark") && !sel.isCollapsed) {
        this.highlightButton.toggleAttribute("data-highlighting", true)
      }
      else {
        this.highlightButton.toggleAttribute("data-highlighting", false)
      }
    })
    this.observer = new MutationObserver(() => this.value = this.value)
    this.observer.observe(this, {characterData: true, childList: true, subtree: true})
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.observer?.disconnect()
  }

  @query("#highlight")
  accessor highlightButton: SlIconButton

  addHighlight() {
    const range = document.getSelection().getRangeAt(0)
    this.value = [...this.value, range]
  }

  deleteHighlight() {
    const range = document.getSelection().getRangeAt(0)
    WebwriterMark.highlight.delete(range)
  }

  toggleHighlight = () => {
    const range = document.getSelection().getRangeAt(0)
    if(WebwriterMark.highlight.has(range)) {
      this.deleteHighlight()
    }
    else {
      this.addHighlight()
    }
  }

  render() {
    console.log(this.value)
    return html`
      <slot style=${styleMap({"--ww-placeholder": `"${this.msg("Text to Highlight")}"`})} ?data-empty=${!this.textContent}></slot>
      <sl-icon-button id="highlight" src=${IconHighlighter} @click=${this.toggleHighlight}></sl-icon-button>
    `
  }
}