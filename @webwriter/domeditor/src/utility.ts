import { Schema } from "./schema"
import {isMarkElement} from "./marks"

export function createStylesheet(content: string) {
  const stylesheet = new CSSStyleSheet()
  stylesheet.replaceSync(content)
  return stylesheet
}

export function adoptStylesheet(root: Document | ShadowRoot, stylesheet: CSSStyleSheet) {
  if(!root.adoptedStyleSheets.includes(stylesheet)) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, stylesheet]
  }
}

export function setPart(element: Element, part: string, enabled = true) {
  const parts = new Set((element.getAttribute("part") ?? "").split(/\s+/).filter(Boolean))
  enabled ? parts.add(part) : parts.delete(part)
  if(parts.size) {
    element.setAttribute("part", Array.from(parts).join(" "))
  } else {
    element.removeAttribute("part")
  }
}

/** Unit for caret movement and extension (see Selection.modify). */
type Granularity = "character" | "word" | "line"
/** Direction for caret movement and extension (see Selection.modify). */
type Direction = "left" | "right" | "forward" | "backward"



/** Static facade over the document's current selection, providing editing-oriented queries (kind of selection, boundaries, covered nodes) and operations (selecting, moving, extending, copying, cutting, deleting, replacing). Usually accessed through the `$` alias. */
export class EditingSelection {

  /** The document's selection. */
  static get #selection() {
    if(!document.getSelection()) {
      throw Error("Document has no browsing context")
    }
    return document.getSelection()!
  }

  /** The selection's first (and only relevant) range. */
  static get range() {
    return document.getSelection()!.getRangeAt(0)
  }

  /** Places the caret in the gap before or after the element, i.e. at the element's position in its parent. */
  static selectGap(element: Element, direction: "before" | "after" = "after") {
    const parent = element.parentElement!
    const i = Array.from(parent.childNodes).indexOf(element)
    this.#selection.setPosition(parent, direction === "before"? i: i + 1)
    window.focus()
  }

  /** Selects the element itself (the selection is anchored in its parent, spanning exactly the element). */
  static selectElement(element: Element) {
    this.range.selectNode(element)
    window.focus()
  }

  /** Sets anchor and focus of the selection; collapses to the anchor when the focus is omitted. */
  static selectRange(anchorNode: Node, anchorOffset=0, focusNode: Node=anchorNode, focusOffset=anchorOffset) {
    this.#selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset)
    window.focus()
  }

  /** Places a collapsed selection at the start of the body. */
  static selectDocumentStart() {
    window.focus()
    document.body.focus({preventScroll: true})
    this.selectRange(document.body)
  }

  /** Moves (or with `extend`, extends) the selection to the document position at the given viewport coordinates, snapping to element gaps at text boundaries. Requires layout (caretPositionFromPoint). */
  static selectCoords(x: number, y: number, extend=false) {
    window.focus()
    const {offset, offsetNode} = document.caretPositionFromPoint(x, y) ?? {}
    const firstBodyElement = document.body.firstElementChild
    const firstBodyElementIndex = firstBodyElement? Array.from(document.body.childNodes).indexOf(firstBodyElement): -1
    if(!offsetNode) {
      if(!extend && firstBodyElement && y < firstBodyElement.getBoundingClientRect().top) {
        this.selectGap(firstBodyElement, "before")
      }
      return
    }
    const isBeforeFirstBodyElement = offsetNode === document.body && typeof offset === "number" && firstBodyElementIndex >= 0 && offset <= firstBodyElementIndex &&
      y < firstBodyElement.getBoundingClientRect().top
    if(!extend && isBeforeFirstBodyElement) {
      this.selectGap(firstBodyElement, "before")
      return
    }
    const caretAtEndOrStart = offsetNode instanceof Text && (offset === 0 || offsetNode.length === offset)
    const container: HTMLElement = offsetNode instanceof Text? offsetNode.parentElement!: offsetNode as HTMLElement
    const containerRect = container.getBoundingClientRect()
    let boundaryRect = containerRect
    if(offsetNode instanceof Text && offsetNode.length && typeof document.createRange().getBoundingClientRect === "function") {
      const boundaryRange = document.createRange()
      const boundaryOffset = offset === 0? 0: offset - 1
      boundaryRange.setStart(offsetNode, boundaryOffset)
      boundaryRange.setEnd(offsetNode, offset === 0? 1: offset)
      const rangeRect = boundaryRange.getBoundingClientRect()
      if(rangeRect.top || rangeRect.bottom || rangeRect.left || rangeRect.right) {
        boundaryRect = rangeRect
      }
    }
    const isBefore = y < boundaryRect.top
    // A click just outside the inline text box can still resolve to the
    // text's first/last caret position. It is only a gap click when it is
    // vertically outside the text container; clicks beside the text within
    // the block must keep the boundary caret position.
    const isAtGap = caretAtEndOrStart && (y < boundaryRect.top || y > boundaryRect.bottom)
    if(!extend && isAtGap) {
      this.selectGap(offsetNode.parentElement!, isBefore? "before": "after")
    }
    else if(extend && isAtGap) {
      return
    }
    else {
      if(extend) {
        this.extend(offsetNode!, offset)
      }
      else {
        this.selectRange(offsetNode!, offset)
      }
    }
  }

  /** Whether the selection is collapsed (a caret). */
  static get isEmpty() {
    return this.#selection.isCollapsed
  }

  /** Whether the caret sits in a gap between elements: collapsed, anchored in an element without text children, and not in an empty container. A body boundary before its first element is also a gap when any preceding text is only whitespace. */
  static get isGapSelection() {
    const firstBodyElement = document.body.firstElementChild
    const firstBodyElementIndex = firstBodyElement? Array.from(document.body.childNodes).indexOf(firstBodyElement): -1
    const isBodyBoundaryBeforeFirstElement = this.anchor === document.body &&
      firstBodyElementIndex >= 0 &&
      this.anchorOffset <= firstBodyElementIndex &&
      Array.from(document.body.childNodes).slice(this.anchorOffset, firstBodyElementIndex).every(node => !isText(node) || !node.textContent?.trim())
    return isElement(this.anchor) && this.isEmpty && !this.isEmptySelection &&
      (!Array.from(this.anchor.childNodes).some(node => isText(node) || isMarkElement(node)) || isBodyBoundaryBeforeFirstElement)
  }

  /** Whether exactly one element is selected (anchored in its parent,
   * spanning one child). */
  static get isElementSelection() {
    if(!isElement(this.anchor) || Math.abs(this.#selection.anchorOffset - this.#selection.focusOffset) !== 1) return false
    const index = Math.min(this.#selection.anchorOffset, this.#selection.focusOffset)
    return isElement(this.anchor.childNodes.item(index)) && !isMarkElement(this.anchor.childNodes.item(index))
  }

  /** Whether the selection consists only of text and mark wrappers within one
   * editing container. Also true for a collapsed caret inside either. */
  static get isTextSelection() {
    if(this.isEmptySelection || this.isElementSelection) return false
    if(this.isEmpty) {
      if(this.anchor instanceof Text || isMarkElement(this.anchor)) return true
      if(isElement(this.anchor)) {
        return [
          this.anchor.childNodes.item(this.anchorOffset - 1),
          this.anchor.childNodes.item(this.anchorOffset),
        ].some(node => node instanceof Text || isMarkElement(node))
      }
      return false
    }
    const fragment = this.range.cloneContents()
    return Boolean(fragment.textContent)
      && !Array.from(fragment.querySelectorAll("*")).some(element => !isMarkElement(element))
  }

  /** Whether the caret is at offset 0 of a container that has no content (no children, or a single empty text node). */
  static get isEmptySelection() {
    return  this.anchor && (getContainer(this.anchor).childNodes.length === 0 || getContainer(this.anchor).childNodes.length === 1 && getContainer(this.anchor).childNodes.item(0) instanceof Text && !getContainer(this.anchor).childNodes.item(0).textContent) && this.anchorOffset === 0
  }

  /** Whether anchor and focus are different nodes. */
  static get isCrossNodeSelection() {
    return this.anchor !== this.focus
  }

  /** Whether the selection is collapsed and the body contains no editable elements (contenteditable=false elements are ignored). */
  static get isEmptyDocumentSelection() {
    return this.isEmpty && !document.querySelectorAll("body > :not([contenteditable=false])").length
  }

  /** The selection's anchor node (where it started). */
  static get anchor() {
    return this.#selection.anchorNode
  }

  /** Offset of the anchor within its node. */
  static get anchorOffset() {
    return this.#selection.anchorOffset
  }

  /** The selection's focus node (its movable end). */
  static get focus() {
    return this.#selection.focusNode
  }

  /** Offset of the focus within its node. */
  static get focusOffset() {
    return this.#selection.focusOffset
  }

  /** The boundary node first in document order (anchor or focus, depending on
   * direction). */
  static get start() {
    return this.isBackwards? this.focus: this.anchor
  }

  /** Offset of the document-order first boundary. */
  static get startOffset() {
    return this.isBackwards? this.focusOffset: this.anchorOffset
  }

  /** The boundary node last in document order. */
  static get end() {
    return this.isBackwards? this.anchor: this.focus
  }

  /** Offset of the document-order last boundary. */
  static get endOffset() {
    return this.isBackwards? this.anchorOffset: this.focusOffset
  }

  /** Whether the focus precedes the anchor in the document. */
  static get isBackwards() {
    if(this.anchor === this.focus) {
      return this.anchorOffset > this.focusOffset
    }
    else if(this.anchor && this.focus) {
      return this.anchor.compareDocumentPosition(this.focus) === Node.DOCUMENT_POSITION_PRECEDING
    }
    else {
      return false
    }
  }

  /** The deepest node containing the whole selection (the text node itself for selections within one text node). */
  static get commonAncestor() {
    return this.range.commonAncestorContainer
  }

  /** The selected element for element selections, else undefined. */
  static get selectedElement() {
    const i = Math.min(this.#selection.anchorOffset, this.#selection.focusOffset)
    return this.isElementSelection? this.anchor?.childNodes.item(i) as Element: undefined
  }

  /** The anchor as an element (a text anchor's parent element). */
  static get anchorContainer() {
    return this.anchor? getContainer(this.anchor): null
  }

  /** The focus as an element (a text focus' parent element). */
  static get focusContainer() {
    return this.focus? getContainer(this.focus): null
  }

  /** Child nodes of the common ancestor (empty when it is a text node). */
  static get siblings() {
    return Array.from(this.commonAncestor.childNodes) as Node[]
  }

  /** A clone of the selected content. */
  static get slice() {
    return this.range.cloneContents()
  }

  /** The common ancestor's children covered by the selection (the selected element itself for element selections). Empty for selections within a single text node. Currently excludes children that contain the selection start, e.g. the first block of a cross-block selection. */
  static get nodesBetween() {
  if(!this.start || !this.end) {
    return []
  }
  else if(this.isElementSelection) {
    return [this.selectedElement!]
  }
  else if(this.isTextSelection) {
    return []
  }
  return this.siblings.filter(node => this.range.intersectsNode(node))
  }

  /** The element adjacent to the selection: the selected element's sibling, the element beside a gap, or the text container's sibling. Undefined for other selection kinds. */
  static #getAdjacentElement(direction: "previous" | "next" = "next") {
    const siblingGetter = `${direction}ElementSibling` as const
    if(this.isElementSelection) {
      return this.selectedElement?.[siblingGetter] ?? null
    }
    else if(this.isGapSelection) {
      const [nodesBefore, nodesAfter] = getSidesOfPoint($.range)
      return direction === "previous"? getContainer(nodesBefore.at(-1)!): getContainer(nodesAfter.at(0)!)
    }
    else if(this.isTextSelection) {
      return this.anchorContainer?.[siblingGetter]
    }
    else if(direction === "next") {
      
    }
    else {

    }
  }

  /** The element preceding the selection (see #getAdjacentElement). */
  static get elementBefore() {
    return this.#getAdjacentElement("previous")
  }

  /** The element following the selection (see #getAdjacentElement). */
  static get elementAfter() {
    return this.#getAdjacentElement("next")
  }

  /** Returns a clone of the selected content, leaving the document
   * unchanged. */
  static copy() {
    if(this.isTextSelection) {
      const str = this.#selection.toString()
      return this.range.createContextualFragment(str)
    }
    else return this.range.cloneContents()
  }

  /** Deletes the selected content (a no-op for collapsed selections). */
  static delete() {
    this.range.deleteContents()
    window.focus()
  }

  /** Removes the selected content from the document and returns it. */
  static cut() {
    const fragment = this.range.extractContents()
    window.focus()
    return fragment
  }

  /** Replaces the selected content with the given nodes (inserts at the caret for collapsed selections). */
  static replace(...nodes: Node[]) {
    const fragment = document.createDocumentFragment()
    fragment.append(...nodes)
    $.delete()
    this.range.insertNode(fragment)
    window.focus()
  }

  /** Extends the focus to the given position, keeping the anchor. */
  static extend(node: Node, offset: number = 0) {
    if(this.isGapSelection) {
      this.#selection.deleteFromDocument()
    }
    this.#selection.extend(node, offset)
    window.focus()
  }

  /** Extends the focus by the given granularity. */
  static extendBy(granularity: Granularity, direction: Direction="forward") {
    this.#selection.modify("extend", direction, granularity)
    window.focus()
  }

  /** Collapses the selection to the given position. Negative offsets count from the node's end (-1 = at the very end). */
  static move(node: Node, offset: number = 0) {
    const length = node instanceof Text? node.length: node.childNodes.length
    this.#selection.setPosition(node, offset < 0? length + 1 + offset: offset)
    window.focus()
  }

  /** Moves the caret by the given granularity (character, word, line) and direction (forward, backward). */
  static moveBy(granularity: Granularity, direction: Direction = "forward") {
    this.#selection.modify("move", direction, granularity)
    window.focus()
  }

  /** The children of the range's start container relative to the range. Throws for detached start containers. */
  static getNodesInRange(range: Range): Node[] {
    let parent = range?.startContainer
    parent = parent instanceof Text? parent.parentElement!: parent
    if(!parent || !range) {
      throw TypeError("Invalid pos")
    }
    return Array.from(parent!.childNodes).filter(node => range.comparePoint(node, 0) === 0)
  }

  /** Formats the selection as "anchor@offset-focus@offset". */
  static toString() {
    return `${this.anchor?.nodeName.toLowerCase()}@${this.anchorOffset}` + (this.focus? `-${this.focus!.nodeName.toLowerCase()}@${this.focusOffset}`: "")
  }
}

/** Shorthand for the EditingSelection facade. */
export const $ = EditingSelection


/** The nearest non-mark element containing the node (the node itself when it
 * is already a non-mark element). */
export function getContainer(node: Node) {
  let element = node instanceof Text? node.parentElement: node as Element
  while(element && isMarkElement(element)) element = element.parentElement
  return element!
}

/** Splits the children of the point's container into those before the point
 * and those at or after it, as `[left, right]`. */
export function getSidesOfPoint(point: Range) {
  const container = getContainer(point!.commonAncestorContainer)
  const nodes = Array.from(container.childNodes)
  const leftNodes = []
  const rightNodes = []
  for(const node of nodes) {
    const isBefore = point?.comparePoint(node, 0) === -1
    if(isBefore) {
      leftNodes.push(node)
    }
    else {
      rightNodes.push(node)
    }
  }
  return [leftNodes, rightNodes]
}


/** The nearest block-level ancestor of the selection anchor, or null. */
export function getSelectionAnchorBlock(schema: Schema) {
  let node = $.anchor
  while(node && !schema.isBlock(node)) {
    node = node.parentElement
  }
  return node
}

/** The nearest block-level ancestor of the selection focus, or null. */
export function getSelectionFocusBlock(schema: Schema) {
  let node = $.focus
  while(node && !schema.isBlock(node)) {
    node = node.parentElement
  }
  return node
}

/** Index of the child preceding the range within the selection's container (-1 when the range starts at the container start). Note that the container is taken from the current selection's anchor, not from the range. */
export function getIndexBefore(range: Range): number {
  let parent = $.anchorContainer
  parent = parent instanceof Text? parent.parentElement!: parent
  const allChildNodes = Array.from(parent!.childNodes)
  return allChildNodes.findIndex(v => range.comparePoint(v, 0) === 0) - 1
}

/** Type guard for element nodes. */
export function isElement(node: unknown): node is Element {
  return node instanceof Node && node.nodeType === Node.ELEMENT_NODE
}

/** Type guard for comment nodes. */
export function isComment(node: unknown): node is Comment {
  return node instanceof Node && node.nodeType === Node.COMMENT_NODE
}

/** Type guard for text nodes. */
export function isText(node: unknown): node is Text {
  return node instanceof Node && node.nodeType === Node.TEXT_NODE
}

/** Type guard for document nodes. */
export function isDocument(node?: unknown): node is Document {
  return node instanceof Node && node.nodeType === Node.DOCUMENT_NODE
}

/** Whether the platform is macOS or iOS. */
export function isOnApple() {
  return navigator.platform.startsWith("Mac") || navigator.platform.startsWith("iPhone") || navigator.platform.startsWith("iPad")
}

/** Whether the platform's primary modifier key is pressed (meta on Apple platforms, ctrl elsewhere). */
export function modifierKeyDown(ev: KeyboardEvent | PointerEvent | MouseEvent) {
  return isOnApple()? ev.metaKey: ev.ctrlKey
}

/** XPath-like path to the element, anchored at the nearest id or at BODY, e.g. 'BODY/DIV[1]/P[2]' or 'id("x")/P[1]'. Empty for null or detached elements. */
export function getPathTo(element: Element | null): string {
  if(element === null) {
    return ""
  }
  else if (element.id !== '') {
    return `id("${element.id}")`
  }
  else if (element === document.body) {
    return element.tagName
  }
  else {
    let ix= 0;
    let siblings = element.parentNode?.childNodes ?? []
    for (let i=0; i < siblings.length; i++) {
      let sibling = siblings[i] as Element
      let parent = element.parentNode as Element | null
      if (sibling === element)
        return `${getPathTo(parent)}/${element.tagName}[${ix+1}]`;
      if (sibling.nodeType === 1 && sibling.tagName === element.tagName)
        ix++
    }
    return ""
  }
}

/** Parses an HTML string into a DocumentFragment. */
export function htmlToFragment(html: string) {
  return document.createRange().createContextualFragment(html)
}

/** Round a given value to the device pixel ratio. */
export function roundByDPR(value: number) {
  const dpr = window.devicePixelRatio || 1
  return Math.round(value * dpr) / dpr
}

/** Rounds the value to the nearest multiple of `to`. */
export function roundTo(value: number, to: number) {
  return Math.round(value / to) * to
}

/** Signed angle in degrees between two points as seen from the center (cx, cy). */
export function angleOnCircle(cx: number, cy: number, x1: number, y1: number, x2: number, y2: number) {
  const angle1 = Math.atan2(y1 - cy, x1 - cx)
  const angle2 = Math.atan2(y2 - cy, x2 - cx)
  return (angle2 - angle1) * (180/Math.PI)
}

/** Rotates the point (x, y) around the center (cx, cy) by `angle` degrees, returning [x', y']. */
export function rotatePoint(x: number, y: number, cx: number, cy: number, angle: number) {
  const radians = angle * (Math.PI / 180)
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  /*return [
    cos * (x - cx) - sin * (y - cy) + cx,
    sin * (x - cx) - cos * (y - cy) + cy,
  ]*/
  return [
    cos * (x - cx) - sin * (y - cy) + cx,
    cos * (y - cy) + sin * (x - cx) + cy
  ]
}

/** Euclidean distance between two points. */
export function distanceBetweenPoints(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt( (x1-x2)**2 + (y1-y2)**2 )
}

/** The point halfway between two points, as [x, y]. */
export function midpoint(x1: number, y1: number, x2: number, y2: number) {
  return [(x1 + x2) / 2, (y1 + y2) / 2]
}

/** Intersection point [x, y] of the segments (x1,y1)-(x2,y2) and
 * (x3,y3)-(x4,y4), or false if they do not intersect (including parallels). */
export function intersectionPoint(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) {
  const a_dx = x2 - x1
  const a_dy = y2 - y1
  const b_dx = x4 - x3
  const b_dy = y4 - y3
  const s = (-a_dy * (x1 - x3) + a_dx * (y1 - y3)) / (-b_dx * a_dy + a_dx * b_dy)
  const t = (+b_dx * (y1 - y3) - b_dy * (x1 - x3)) / (-b_dx * a_dy + a_dx * b_dy)
  return (s >= 0 && s <= 1 && t >= 0 && t <= 1)? [x1 + t * a_dx, y1 + t * a_dy]: false
}


/** A DOMMatrix translating by (x, y). */
function translationMatrix(x: number, y: number) {
  return DOMMatrix.fromMatrix({a: 1, b: 0, c: x, d: 0, e: 1, f: y})
}

/** A DOMMatrix rotating by `angle` degrees. */
function rotationMatrix(angle: number) {
  const rad = angle * (Math.PI / 180)
  return DOMMatrix.fromMatrix({a: Math.cos(rad), b: -Math.sin(rad), c: 0, d: Math.sin(rad), e: Math.cos(rad), f: 0})
} 


/** The closest ancestor-or-self of `el` matching the filter, or undefined. */
export function findClosest(el: HTMLElement, filter: (node: HTMLElement) => boolean) {
  let n: HTMLElement | null = el; do {
    if(filter(n)) { return n }
  } while (n = n.parentElement)
}


const transformOrFilterKey = ["filter", "backdrop-filter", "transform", "perspective", "rotate", "scale", "translate"] as const

/** Whether the element establishes a containing block for absolutely or fixedly positioned descendants (transform/filter, contain, container-type, will-change or content-visibility, per CSS rules). */
function elEstablishesAbsoluteOrFixedContainingBlock(el: HTMLElement) {
  const style = getComputedStyle(el)
  const hasTransformOrFilter = transformOrFilterKey.some(k => !["none", ""].includes(style.getPropertyValue(k)))
  const hasContain = ["layout", "paint", "strict", "content"].includes(style.contain)
  const hasContainerType = ["size", "inline-size"].includes(style.containerType)
  const hasWillChange = style.willChange.split(",").some(v => transformOrFilterKey.includes(v.trim() as any))
  const hasContentVisibilityAuto = style.contentVisibility === "auto"
  return hasTransformOrFilter || hasContain || hasContainerType || hasWillChange || hasContentVisibilityAuto
}

const formattingContextDisplayValues = ["block", "list-item", "table", "flex", "grid",  "inline-block", "inline-table", "inline-flex", "inline-grid"] as const

/** Whether the element's display value establishes a formatting context (block, flex, grid, table, list-item and their inline variants). */
function elEstablishesFormattingContext(el: HTMLElement) {
  const style = getComputedStyle(el)
  return formattingContextDisplayValues.some(v => style.display.trim().split(/\s+/).includes(v))
}

/** The element's containing block for the given position mode, per CSS: the nearest formatting context for static/relative/sticky, the nearest positioned (or transform-like) ancestor for absolute, the nearest transform-like ancestor for fixed — falling back to `window`. Throws for invalid modes. */
export function findContainingBlock(el: HTMLElement, position: "static" | "relative" | "absolute" | "fixed" | "sticky" = "static"): HTMLElement | Window {
  if(!el.parentElement) {
    return window
  }
  if(["static", "relative", "sticky"].includes(position)) {
    return findClosest(el.parentElement, node => {
      return elEstablishesFormattingContext(node)
    }) ?? window
  }
  else if(position === "absolute") {
    return findClosest(el.parentElement, node => {
      const style = getComputedStyle(node)
      const isMiscContainer =  elEstablishesAbsoluteOrFixedContainingBlock(node)
      const isPositioned = ["relative", "absolute", "fixed", "sticky"].includes(style.position)
      return isMiscContainer || isPositioned
    }) ?? window
  }
  else if(position === "fixed") {
    return findClosest(el.parentElement, node => {
      return elEstablishesAbsoluteOrFixedContainingBlock(node)
    }) ?? window
  }
  else throw TypeError(`Invalid mode '${position}'`)
}

/** The closest ancestor-or-self with scrollable overflow (hidden, scroll, auto or overlay), or undefined. */
export function findScrollingAncestor(el: HTMLElement) {
  return findClosest(el, node => {
    const style = getComputedStyle(node)
    return ["hidden", "scroll", "auto", "overlay"].some(v => style.overflow.trim().split(/\s+/).includes(v))
  })
}

/** Compares the paint order of two elements (negative when `a` paints below `b`): by the z-index of their nearest stacking contexts, falling back to DOM order. Throws when comparing a node with itself. */
export function compareStackingOrder(a: HTMLElement, b: HTMLElement) {
	if (a === b) throw new Error('Cannot compare node with itself');

	const ancestors = {
		a: getAncestors(a),
		b: getAncestors(b),
	};

	let common_ancestor: HTMLElement;

	while (ancestors.a.at(-1) === ancestors.b.at(-1)) { // @ts-ignore
		a = ancestors.a.pop(); // @ts-ignore
		b = ancestors.b.pop();
		common_ancestor = a;
	}

	const z_indexes = {
		a: getZIndex(findStackingContext(ancestors.a)!),
		b: getZIndex(findStackingContext(ancestors.b)!),
	};

	if (z_indexes.a === z_indexes.b) {
		const children = common_ancestor!.childNodes;

		const furthest_ancestors = {
			a: ancestors.a.at(-1),
			b: ancestors.b.at(-1),
		};

		let i = children.length;
		while (i--) {
			const child = children[i];
			if (child === furthest_ancestors.a) return 1;
			if (child === furthest_ancestors.b) return -1;
		}
	}

	return Math.sign(z_indexes.a - z_indexes.b);
}

/** The outermost node in the (innermost-first) list that creates a stacking context, or null. */
function findStackingContext(nodes: HTMLElement[]) {
	let i = nodes.length;

	while (i--) {
		if (createsStackingContext(nodes[i])) return nodes[i];
	}

	return null;
}

/** The node's numeric z-index (0 when unset, auto or no node is given). */
function getZIndex(node: HTMLElement) {
	return (node && Number(getComputedStyle(node).zIndex)) || 0;
}

/** The node and its ancestors, innermost first, crossing shadow roots. */
function getAncestors(node: HTMLElement) {
	const ancestors = [];

	while (node) {
		ancestors.push(node);
		node = getParent(node);
	}

	return ancestors;
}

/** The parent node, crossing shadow boundaries via the host. */
function getParent(node: HTMLElement) { // @ts-ignore
	return node.parentNode?.host || node.parentNode;
}

/** The node's descendants matching the selector, sorted by paint order (lowest first). */
export function getDescendantsInStackingOrder(node: HTMLElement, selector="*") {
  const root = node !== document.documentElement? node: document.body
  const descendants = Array.from(root.querySelectorAll(selector)) as HTMLElement[]
  return descendants.sort(compareStackingOrder)
}

/** Whether a non-scroll interaction originated in the shadow tree of a
 * widget mounted in the editable document. Composed events are retargeted to
 * the widget host by the time they reach document listeners, so inspect the
 * full path instead. Hosts in the body's own shadow tree belong to the editor
 * appendix and are intentionally not treated as widgets. */
export function isWidgetShadowInteraction(event: Event) {
  if(event.type === "scroll") return false
  const origin = event.composedPath()[0] as Node | undefined
  if(typeof origin?.getRootNode !== "function") return false
  let root = origin.getRootNode()
  while(root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && "host" in root) {
    const host = (root as ShadowRoot).host
    const body = host.ownerDocument.body
    if(host !== body && body.contains(host)) return true
    root = host.getRootNode()
  }
  return false
}

/** Whether the element creates a stacking context, per CSS rules (root element, positioned with z-index, fixed/sticky, transforms/filters, opacity < 1, isolation, top layer, will-change, contain, ...). */
export function createsStackingContext(node: HTMLElement) {
  const style = getComputedStyle(node)
  const display = parseDisplayStyle(style.display)
  const [,inside] = display
  const isDocumentElement = node === document.documentElement
  const isZPositioned = (style.position === "relative" || style.position === "absolute") && !["", "auto"].includes(style.zIndex)
  const isFixedOrSticky = style.position === "fixed" || style.position === "sticky"
  const isContainer = style.containerType === "size" || style.containerType === "inline-size"
  const isFlexWithZ = Array.isArray(display) && inside === "flex" && style.zIndex !== "auto"
  const isGridWithZ = Array.isArray(display) && inside === "grid" && style.zIndex !== "auto"
  const isTransformedOrClipped = ["transform", "scale", "rotate", "translate", "filter", "backdropFilter", "perspective", "clipPath", "mask", "maskImage", "maskBorder"].some(k => (style.getPropertyValue(k) !== "none") && (style.getPropertyValue(k) !== ""))
  const isTransparent = parseInt(style.opacity || "1") < 1
  const isMixBlended = !["normal", ""].includes(style.mixBlendMode)
  const isIsolated = style.isolation === "isolate"
  const isWillChangeStacking = style.willChange.split(",").some(v => ["zIndex", "position", "containerType", "display", "transform", "scale", "rotate", "translate", "filter", "backdropFilter", "perspective", "clipPath", "mask", "maskImage", "maskBorder", "contain", "isolation", "animationFillMode", "opacity"].includes(v.trim()))
  const isContainStacking = style.contain.trim().split(/\s+/).some(v => ["layout", "paint", "strict", "content"].includes(v))
  const isInTopLayer = node.matches(":fullscreen") || node.matches(":popover-open") || node.tagName === "DIALOG" && node.matches(":open")
  const isAnimationStacking = style.animationName !== "none" && style.animationFillMode === "forwards"
  return isDocumentElement || isZPositioned || isFixedOrSticky || isContainer || isFlexWithZ || isGridWithZ || isTransformedOrClipped || isTransparent || isMixBlended || isIsolated || isWillChangeStacking || isContainStacking || isInTopLayer || isAnimationStacking
}


/** The nearest ancestor creating a stacking context (at least <html>). */
export function findStackingContainer(el: HTMLElement) {
  return findClosest(el.parentElement!, createsStackingContext)!
}

/** The element's index in the paint order of its stacking container's descendants (matching the selector). */
export function getZPos(el: HTMLElement, selector="*") {
  const stackingContainer = findStackingContainer(el)
  const descendants = getDescendantsInStackingOrder(stackingContainer, selector)
  return descendants.indexOf(el)
}

type DisplayOutside = "inline" | "block"
type DisplayInside = "flow" | "flow-root" | "table" | "flex" | "grid" | "ruby" | "math"
type DisplayInternal = "table-row-group" | "table-header-group" | "table-footer-group" | "table-row" | "table-cell" | "table-column-group" | "table-column" | "table-caption" | "ruby-base" | "ruby-text" | "ruby-base-container" | "ruby-text-container"
type DisplayBox = "none" | "contents"

const displayOutsideValues = ["inline", "block"]
const displayInsideValues = ["flow", "flow-root", "table", "flex", "grid", "ruby", "math"]
const displayInternalValues = ["table-row-group", "table-header-group", "table-footer-group", "table-row", "table-cell", "table-column-group", "table-column", "table-caption", "ruby-base", "ruby-text", "ruby-base-container", "ruby-text-container"]

type DisplayTuple<
  Outside extends DisplayOutside = DisplayOutside,
  Inside extends DisplayInside = DisplayInside
> = [Outside, Inside] | [Outside, Inside, "list-item"]

/** Parses a CSS display value into an [outside, inside(, "list-item")] tuple, a box keyword ("none"/"contents") or an internal display value. */
function parseDisplayStyle(display: string): DisplayTuple | DisplayBox | DisplayInternal {
  const keywords = display.split(/\s/)
  if(["none", "contents"].includes(display) && keywords.length === 1) {
    return display as "none" | "contents"
  }
  else if(display.startsWith("inline-") && keywords.length === 1) {
    return display.split("-") as ["inline", DisplayInside]
  }
  else if(keywords.length === 1 && displayInternalValues.includes(display)) {
    return display as DisplayInternal
  }
  else if(keywords.includes("list-item")) {
    const outside = keywords.find(kw => displayOutsideValues.includes(kw)) ?? "block"
    const inside = keywords.find(kw => ["flow", "flow-root"].includes(kw)) ?? "flow"
    if(inside !== "flow" && inside !== "flow-root") {
      throw Error(`Invalid display value: Expected 'flow' or 'flow-root' with 'list-item', found ${inside}`)
    }
    return [outside as DisplayOutside, inside, "list-item"]
  }
  else if(keywords.length === 1 || keywords.length === 2) {
    const outside = keywords.find(kw => displayOutsideValues.includes(kw)) ?? "block"
    const inside = keywords.find(kw => displayInsideValues.includes(kw)) ?? "flow"
    return [outside, inside].filter(kw => kw) as DisplayTuple
  }
  else {
    throw Error("Invalid display value")
  }
}

/** The [top, left] viewport coordinates of the element's static position, measured by temporarily inserting a marker text before it (the document is left unchanged). Requires layout. */
export function getStaticCoords(el: HTMLElement): [number, number] {
  const range = document.createRange()
  range.setStartBefore(el)
  range.insertNode(new Text("_"))
  const {top, left} = range.getBoundingClientRect()
  range.deleteContents()
  return [top, left]
  /*if(el.previousSibling) {

  }
  else if(el.parentElement) {
    const rect = el.parentElement.getBoundingClientRect()
    const style = getComputedStyle(el.parentElement)
    const top = rect.top + parseInt(style.borderTopWidth || "0") + parseInt(style.marginTop || "0")
    const left = rect.left + parseInt(style.borderLeftWidth || "0") + parseInt(style.marginLeft || "0")
    return [top, left]
  }
  else {

  }*/
}
