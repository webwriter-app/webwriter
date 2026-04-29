import { Schema } from "./schema"

type Granularity = "character" | "word" | "line"
type Direction = "left" | "right" | "forward" | "backward"



export class EditingSelection {

  static get #selection() {
    if(!document.getSelection()) {
      throw Error("Document has no browsing context")
    }
    return document.getSelection()!
  }

  static get range() {
    return document.getSelection()!.getRangeAt(0)
  }

  static selectGap(element: Element, direction: "before" | "after" = "after") {
    const parent = element.parentElement!
    const i = Array.from(parent.childNodes).indexOf(element)
    this.#selection.setPosition(parent, direction === "before"? i: i + 1)
    window.focus()
  }

  static selectElement(element: Element) {
    this.range.selectNode(element)
    window.focus()
  }

  static selectRange(anchorNode: Node, anchorOffset=0, focusNode: Node=anchorNode, focusOffset=anchorOffset) {
    this.#selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset)
    window.focus()
  }

  static selectDocumentStart() {
    this.selectRange(document.body)
  }

  static selectCoords(x: number, y: number, extend=false) {
    window.focus()
    const el = document.elementFromPoint(x, y)
    const {offset, offsetNode} = document.caretPositionFromPoint(x, y) ?? {}
    const caretAtEndOrStart = offsetNode instanceof Text && (offset === 0 || offsetNode.length === offset)
    const container: HTMLElement = offsetNode instanceof Text? offsetNode.parentElement!: offsetNode as HTMLElement
    const isBefore = y < container.offsetTop
    const isAtGap = caretAtEndOrStart && el !== offsetNode.parentElement
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

  static get isEmpty() {
    return this.#selection.isCollapsed
  }

  static get isGapSelection() {
    return isElement(this.anchor) && this.isEmpty && !Array.from(this.anchor.childNodes).some(node => isText(node))
  }

  static get isElementSelection() {
    return isElement(this.anchor) && Math.abs(this.#selection.anchorOffset - this.#selection.focusOffset) === 1
  }

  static get isTextSelection() {
    return !this.isCrossNodeSelection && this.anchor instanceof Text
  }

  static get isCrossNodeSelection() {
    return this.anchor !== this.focus
  }

  static get anchor() {
    return this.#selection.anchorNode
  }

  static get anchorOffset() {
    return this.#selection.anchorOffset
  }

  static get focus() {
    return this.#selection.focusNode
  }

  static get focusOffset() {
    return this.#selection.focusOffset
  }

  static get start() {
    return this.isBackwards? this.focus: this.anchor
  }

  static get startOffset() {
    return this.isBackwards? this.focusOffset: this.anchorOffset
  }

  static get end() {
    return this.isBackwards? this.anchor: this.focus
  }

  static get endOffset() {
    return this.isBackwards? this.anchorOffset: this.focusOffset
  }

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

  static get commonAncestor() {
    return this.range.commonAncestorContainer
  }

  static get selectedElement() {
    isElement(this.anchor) && Math.abs(this.#selection.anchorOffset - this.#selection.focusOffset) === 1
    const i = Math.min(this.#selection.anchorOffset, this.#selection.focusOffset)
    return this.isElementSelection? this.anchor?.childNodes.item(i) as Element: undefined
  }

  static get anchorContainer() {
    if(this.anchor instanceof Text) {
      return this.anchor?.parentElement!
    }
    else {
      return this.anchor as Element
    }
  }

  static get focusContainer() {
    if(this.focus instanceof Text) {
      return this.focus?.parentElement!
    }
    else {
      return this.focus as Element
    }
  }

  static get siblings() {
    return Array.from(this.commonAncestor.childNodes) as Node[]
  }

  static get slice() {
    return this.range.cloneContents()
  }

  static get nodesBetween() {
    if(!this.start || !this.end) {
      return []
    }
    else if(this.isElementSelection) {
      return [this.selectedElement!]
    }
    return this.siblings.filter(node => {
      const isAfterStart = this.start === node || (this.start!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)
      const isBeforeEnd = this.end === node || (this.end!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING)
      return isAfterStart && isBeforeEnd
    })
  }

  static #getAdjacentElement(direction: "previous" | "next" = "next") {
    const siblingGetter = `${direction}ElementSibling` as const
    if(this.isElementSelection) {
      return this.selectedElement?.[siblingGetter] ?? null
    }
    else if(this.isGapSelection) { 
      return null
    }
    else if(this.isTextSelection) {
      return this.anchorContainer?.[siblingGetter]
    }
    else if(direction === "next") {
      
    }
    else {

    }
  }

  static get elementBefore() {
    return this.#getAdjacentElement("previous")
  }

  static get elementAfter() {
    return this.#getAdjacentElement("next")
  }

  static copy() {
    return this.range.cloneContents()
  }

  static delete() {
    this.range.deleteContents()
    window.focus()
  }

  static cut() {
    const fragment = this.range.extractContents()
    window.focus()
    return fragment
  }

  static replace(...nodes: Node[]) {
    const fragment = document.createDocumentFragment()
    fragment.append(...nodes)
    $.delete()
    this.range.insertNode(fragment)
    window.focus()
  }

  static extend(node: Node, offset: number = 0) {
    if(this.isGapSelection) {
      this.#selection.deleteFromDocument()
    }
    this.#selection.extend(node, offset)
    window.focus()
  }

  static extendBy(granularity: Granularity, direction: Direction="forward") {
    this.#selection.modify("extend", direction, granularity)
    window.focus()
  }

  static move(node: Node, offset: number = 0) {
    this.#selection.setPosition(node, offset)
    window.focus()
  }

  static moveBy(granularity: Granularity, direction: Direction = "forward") {
    this.#selection.modify("move", direction, granularity)
    window.focus()
  }

  static getNodesInRange(range: Range): Node[] {
    let parent = range?.startContainer
    parent = parent instanceof Text? parent.parentElement!: parent
    if(!parent || !range) {
      throw TypeError("Invalid pos")
    }
    return Array.from(parent!.childNodes).filter(node => range.comparePoint(node, 0))
  }

  static toString() {
    return `${this.anchor?.nodeName.toLowerCase()}@${this.anchorOffset}` + this.focus? `-${this.focus!.nodeName.toLowerCase()}@${this.focusOffset}`: ""
  }
}

export const $ = EditingSelection


export function getContainer(node: Node) {
  if(node instanceof Text) {
    return node.parentElement!
  }
  else {
    return node as Element
  }
}

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


export function getSelectionAnchorBlock(schema: Schema) {
  let node = $.anchor
  while(node && !schema.isBlock(node)) {
    node = node.parentElement
  }
  return node
}

export function getSelectionFocusBlock(schema: Schema) {
  let node = $.focus
  while(node && !schema.isBlock(node)) {
    node = node.parentElement
  }
  return node
}

export function getIndexBefore(range: Range): number {
  let parent = $.anchorContainer
  parent = parent instanceof Text? parent.parentElement!: parent
  const allChildNodes = Array.from(parent!.childNodes)
  return allChildNodes.findIndex(v => range.comparePoint(v, 0) === 0) - 1
}

export function isElement(node: unknown): node is Element {
  return node instanceof Node && node.nodeType === Node.ELEMENT_NODE
}

export function isComment(node: unknown): node is Comment {
  return node instanceof Node && node.nodeType === Node.COMMENT_NODE
}

export function isText(node: unknown): node is Text {
  return node instanceof Node && node.nodeType === Node.TEXT_NODE
}

export function isDocument(node?: unknown): node is Document {
  return node instanceof Node && node.nodeType === Node.DOCUMENT_NODE
}

export function isOnApple() {
  return navigator.platform.startsWith("Mac") || navigator.platform.startsWith("iPhone") || navigator.platform.startsWith("iPad")
}

export function modifierKeyDown(ev: KeyboardEvent | PointerEvent | MouseEvent) {
  return isOnApple()? ev.metaKey: ev.ctrlKey
}

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

export function htmlToFragment(html: string) {
  return document.createRange().createContextualFragment(html)
}

/** Round a given value to the device pixel ratio. */
export function roundByDPR(value: number) {
  const dpr = window.devicePixelRatio || 1
  return Math.round(value * dpr) / dpr
}

export function roundTo(value: number, to: number) {
  return Math.round(value / to) * to
}

export function angleOnCircle(cx: number, cy: number, x1: number, y1: number, x2: number, y2: number) {
  const angle1 = Math.atan2(y1 - cy, x1 - cx)
  const angle2 = Math.atan2(y2 - cy, x2 - cx)
  return (angle2 - angle1) * (180/Math.PI)
}

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

export function distanceBetweenPoints(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt( (x1-x2)**2 + (y1-y2)**2 )
}

export function midpoint(x1: number, y1: number, x2: number, y2: number) {
  return [(x1 + x2) / 2, (y1 + y2) / 2]
}

export function intersectionPoint(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) {
  const a_dx = x2 - x1
  const a_dy = y2 - y1
  const b_dx = x4 - x3
  const b_dy = y4 - y3
  const s = (-a_dy * (x1 - x3) + a_dx * (y1 - y3)) / (-b_dx * a_dy + a_dx * b_dy)
  const t = (+b_dx * (y1 - y3) - b_dy * (x1 - x3)) / (-b_dx * a_dy + a_dx * b_dy)
  return (s >= 0 && s <= 1 && t >= 0 && t <= 1)? [x1 + t * a_dx, y1 + t * a_dy]: false
}


function translationMatrix(x: number, y: number) {
  return DOMMatrix.fromMatrix({a: 1, b: 0, c: x, d: 0, e: 1, f: y})
}

function rotationMatrix(angle: number) {
  const rad = angle * (Math.PI / 180)
  return DOMMatrix.fromMatrix({a: Math.cos(rad), b: -Math.sin(rad), c: 0, d: Math.sin(rad), e: Math.cos(rad), f: 0})
} 


export function findClosest(el: HTMLElement, filter: (node: HTMLElement) => boolean) {
  let n: HTMLElement | null = el; do {
    if(filter(n)) { return n }
  } while (n = n.parentElement)
}


const transformOrFilterKey = ["filter", "backdrop-filter", "transform", "perspective", "rotate", "scale", "translate"] as const

function elEstablishesAbsoluteOrFixedContainingBlock(el: HTMLElement) {
  const style = getComputedStyle(el)
  const hasTransformOrFilter = transformOrFilterKey.some(k => style.getPropertyValue(k) !== "none")
  const hasContain = ["layout", "paint", "strict", "content"].includes(style.contain)
  const hasContainerType = style.containerType !== "normal"
  const hasWillChange = style.willChange.split(",").some(v => transformOrFilterKey.includes(v.trim() as any))
  const hasContentVisibilityAuto = style.contentVisibility === "auto"
  return hasTransformOrFilter || hasContain || hasContainerType || hasWillChange || hasContentVisibilityAuto
}

const formattingContextDisplayValues = ["block", "list-item", "table", "flex", "grid",  "inline-block", "inline-table", "inline-flex", "inline-grid"] as const

function elEstablishesFormattingContext(el: HTMLElement) {
  const style = getComputedStyle(el)
  return formattingContextDisplayValues.some(v => style.display.trim().split(/\s+/).includes(v))
}

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
      const isPositioned = style.position !== "static"
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

export function findScrollingAncestor(el: HTMLElement) {
  return findClosest(el, node => {
    const style = getComputedStyle(node)
    return ["hidden", "scroll", "auto", "overlay"].some(v => style.overflow.trim().split(/\s+/).includes(v))
  })
}

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

function findStackingContext(nodes: HTMLElement[]) {
	let i = nodes.length;

	while (i--) {
		if (createsStackingContext(nodes[i])) return nodes[i];
	}

	return null;
}

function getZIndex(node: HTMLElement) {
	return (node && Number(getComputedStyle(node).zIndex)) || 0;
}

function getAncestors(node: HTMLElement) {
	const ancestors = [];

	while (node) {
		ancestors.push(node);
		node = getParent(node);
	}

	return ancestors;
}

function getParent(node: HTMLElement) { // @ts-ignore
	return node.parentNode?.host || node.parentNode;
}

export function getDescendantsInStackingOrder(node: HTMLElement, selector="*") {
  const root = node !== document.documentElement? node: document.body
  const descendants = Array.from(root.querySelectorAll(selector)) as HTMLElement[]
  return descendants.sort(compareStackingOrder)
}

export function createsStackingContext(node: HTMLElement) {
  const style = getComputedStyle(node)
  const display = parseDisplayStyle(style.display)
  const [,inside] = display
  const isDocumentElement = node === document.documentElement
  const isZPositioned = (style.position === "relative" || style.position === "absolute") && style.zIndex !== "auto"
  const isFixedOrSticky = style.position === "fixed" || style.position === "sticky"
  const isContainer = style.containerType === "size" || style.containerType === "inline-size"
  const isFlexWithZ = Array.isArray(display) && inside === "flex" && style.zIndex !== "auto"
  const isGridWithZ = Array.isArray(display) && inside === "grid" && style.zIndex !== "auto"
  const isTransformedOrClipped = ["transform", "scale", "rotate", "translate", "filter", "backdropFilter", "perspective", "clipPath", "mask", "maskImage", "maskBorder"].some(k => (style.getPropertyValue(k) !== "none") && (style.getPropertyValue(k) !== ""))
  const isTransparent = parseInt(style.opacity || "1") < 1
  const isMixBlended = style.mixBlendMode !== "normal"
  const isIsolated = style.isolation === "isolate"
  const isWillChangeStacking = style.willChange.split(",").some(v => ["zIndex", "position", "containerType", "display", "transform", "scale", "rotate", "translate", "filter", "backdropFilter", "perspective", "clipPath", "mask", "maskImage", "maskBorder", "contain", "isolation", "animationFillMode", "opacity"].includes(v.trim()))
  const isContainStacking = style.contain.trim().split(/\s+/).some(v => ["layout", "paint", "strict", "content"].includes(v))
  const isInTopLayer = node.matches(":fullscreen") || node.matches(":popover-open") || node.tagName === "DIALOG" && node.matches(":open")
  const isAnimationStacking = style.animationName !== "none" && style.animationFillMode === "forwards"
  return isDocumentElement || isZPositioned || isFixedOrSticky || isContainer || isFlexWithZ || isGridWithZ || isTransformedOrClipped || isTransparent || isMixBlended || isIsolated || isWillChangeStacking || isContainStacking || isInTopLayer || isAnimationStacking
}


export function findStackingContainer(el: HTMLElement) {
  return findClosest(el.parentElement!, createsStackingContext)!
}

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