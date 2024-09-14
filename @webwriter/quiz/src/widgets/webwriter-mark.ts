import {html, css, RenderOptions} from "lit"
import {action, LitElementWw} from "@webwriter/lit"
import {customElement, eventOptions, property} from "lit/decorators.js"
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
import IconHighlighterFill from "../lib/highlighter-fill.svg"

function getCaretPositionFromPoint(e: PointerEvent) {
  let range: Range | null;
  let textNode: Text;
  let offset: number;

  if ((document as any).caretPositionFromPoint) {
    range = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
    textNode = (range as any).offsetNode;
    offset = (range as any).offset;
    return {textNode, offset}
  } else if (document.caretRangeFromPoint) {
    // Use WebKit-proprietary fallback method
    range = document.caretRangeFromPoint(e.clientX, e.clientY);
    textNode = range.startContainer as Text;
    offset = range.startOffset;
    return {textNode, offset}
  } else {
    throw Error("Both 'caretPositionFromPoint' and 'caretRangeFromPoint' are unsupported")
  }
}

const toAttributeRange = (ranges: SerializableRange[]) => {
  return JSON.stringify(ranges)
}

const fromAttributeRange = (attr?: string) => {
  if(!attr) {
    return []
  }
  const ranges = JSON.parse(attr) as {startContainer: string, startOffset: number, endContainer?: string, endOffset: number}[]
  return ranges.map(range => new SerializableRange(range))
}

type SerializableRangeLike = SerializableRange | {startContainer: string, startOffset: number, endContainer?: string, endOffset: number}

class SerializableRange extends Range {

  constructor(value?: string | SerializableRangeLike) {
    super()
    if(value instanceof SerializableRange) {
      return value
    }
    else if(value) {
      const {startContainer, startOffset, endContainer, endOffset} = typeof value === "string"? JSON.parse(value) as {startContainer: string, startOffset: number, endContainer?: string, endOffset: number}: value
      const startNode = document.evaluate(startContainer, document, null, 9, null).singleNodeValue
      startNode && this.setStart(startNode, startOffset)
      const endNode = document.evaluate(endContainer ?? startContainer, document, null, 9, null).singleNodeValue
      endNode && this.setEnd(endNode, endOffset)
    }
  }

  toJSON() {
    return this.startContainer === this.endContainer
      ? {
        startContainer: xPath(this.startContainer),
        startOffset: this.startOffset,
        endOffset: this.endOffset
      }
      : {
        startContainer: xPath(this.startContainer),
        startOffset: this.startOffset,
        endContainer: xPath(this.endContainer),
        endOffset: this.endOffset
      }
  }

  toString() {
    return JSON.stringify(this.toJSON())
  }
}

declare global {interface HTMLElementTagNameMap {
  "webwriter-mark": WebwriterMark;
}}

@customElement("webwriter-mark")
export class WebwriterMark extends LitElementWw {

  static shadowRootOptions = {...LitElementWw.shadowRootOptions, delegatesFocus: false}

  static localization = {}

  // @ts-ignore: Experimental API
  static highlightValue = new Highlight()

  // @ts-ignore: Experimental API
  static highlightSolution = new Highlight()

  static {
    // @ts-ignore: Experimental API
    CSS.highlights.set("webwriter-mark-solution", this.highlightSolution)
    // @ts-ignore: Experimental API
    CSS.highlights.set("webwriter-mark-value", this.highlightValue)
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

    :host(:not([contenteditable=true]):not([contenteditable=""])) slot {
      cursor: pointer;
      user-select: none;
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

    :host ::highlight(webwriter-mark-value) {
      background-color: yellow;
    }

    :host ::highlight(webwriter-mark-solution) {
      background-color: greenyellow;
    }

    #highlight[data-highlighting]::part(base) {
      background-color: lightyellow;
    }

    :host(:has(#highlight[data-highlighting])) ::selection {
      background: lightyellow !important;
    }

    :host([highlighting]) #highlight::part(base) {
      background: yellow;
    }
  `

  @property({type: Boolean, attribute: true, reflect: true})
  accessor highlighting = false

  #solution: SerializableRange[] = []

  get solution(): SerializableRange[] {
    return this.#solution
  }

  @property({attribute: false})
  set solution(value: SerializableRangeLike[]) {
    this.#updateHighlight("solution", value.map(v => new SerializableRange(v)))
    this.requestUpdate("solution")
  }

  #value: SerializableRange[] = []

  get value(): SerializableRange[] {
    return this.#value
  }

  @property({attribute: true, reflect: true, converter: {toAttribute: toAttributeRange, fromAttribute: fromAttributeRange}})
  set value(value: SerializableRangeLike[]) {
    this.#updateHighlight("value", value.map(v => new SerializableRange(v)))
    this.requestUpdate("value")
  }

  #updateHighlight(key: "value" | "solution", value: SerializableRange[]) {
    const prev = this[key]
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
    if(key === "value") {
      this.#value = finalValue
    }
    else {
      this.#solution = finalValue
    }
    const highlight = WebwriterMark[key === "value"? "highlightValue": "highlightSolution"]
    for(const range of prev) {
      highlight.delete(range)
    }
    for(const range of value) {
      highlight.add(range)
    }
  }

  observer: MutationObserver

  segments: Intl.SegmentData[] = []

  connectedCallback(): void {
    super.connectedCallback()
    const segmenter = new Intl.Segmenter(undefined, {granularity: "word"})
    this.segments = [...segmenter.segment(this.textContent)]
    this.observer = new MutationObserver(() => {
      this.value = this.value
      this.segments = [...segmenter.segment(this.textContent)]
    })
    this.observer.observe(this, {characterData: true, childList: true, subtree: true})
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.observer?.disconnect()
  }

  @eventOptions({passive: true})
  @action({label: {_: "Toggle Highlight"}})
  handleHighlight(e?: PointerEvent) {
    if(e && this.isContentEditable && e.type === "click") {
      return
    }
    else if(e && !this.isContentEditable && e.type === "contextmenu") {
      return
    }
    // convert click to caret position

    const {textNode, offset} = e
      ? getCaretPositionFromPoint(e)
      : {textNode: document.getSelection().anchorNode, offset: document.getSelection().anchorOffset}
    // convert caret position to segment range
    const segment = this.segments.filter(seg => seg.isWordLike).find(({index, segment}) => index <= offset && offset <= index + segment.length)
    // add or remove segment range from highlights
    if(segment) {
      const range = new SerializableRange()
      const start = segment.index
      const end = segment.index + segment.segment.length
      range.setStart(textNode, start)
      range.setEnd(textNode, end)
      const key = this.isContentEditable? "solution": "value"
      const sameRange = this[key].find(r => r.startContainer === textNode && r.endContainer === textNode && r.startOffset === start && r.endOffset == end)
      if(sameRange) {
        this[key] = this[key].filter(r => r !== sameRange)
      }
      else {
        this[key] = [...this[key], range]
      }
      this.dispatchEvent(new CustomEvent("ww-answer-change", {
        bubbles: true,
        composed: true
      }))
    }
  }

  reset() {
    this.value = this.solution = []
  }

  reportSolution() {}


  render() {
    return html`
      <slot style=${styleMap({"--ww-placeholder": `"${this.msg("Text to Highlight")}"`})} ?data-empty=${!this.textContent} @click=${this.handleHighlight} @contextmenu=${this.handleHighlight}></slot>
    `
  }
}