import { Decoration, DecorationSource, NodeView, NodeViewConstructor } from "prosemirror-view"
import { NodeSelection } from "prosemirror-state"
import { DOMSerializer, Node } from "prosemirror-model"
import {html, render} from "lit"

import { getOtherAttrsFromWidget, toAttributes } from "../../model"
import {EditorViewController} from "."
import { selectParentNode } from "prosemirror-commands"

export class WidgetView implements NodeView {

	node: Node
	view: EditorViewController
	// getPos: () => number
	dom: HTMLElement
  contentDOM?: HTMLElement

	constructor(node: Node, view: EditorViewController, getPos: () => number) {
		this.node = node
		this.view = view
    const existingDom = view.dom.querySelector(`#${node.attrs.id}`)
    const newDom = this.createDOM(!!existingDom)
    this.dom = this.contentDOM = existingDom as HTMLElement ?? newDom
    if(existingDom) {
      const oldNames = this.dom.getAttributeNames()
      const newNames = newDom.getAttributeNames()
      const toRemove = oldNames.filter(k => !newNames.includes(k))
      toRemove.forEach(k => this.dom.removeAttribute(k))
      newNames.forEach(k => this.dom.setAttribute(k, newDom.getAttribute(k)!))
    }
    this.dom.toggleAttribute("editable", true)
	}

  getPos() {
    return this.view.posAtDOM(this.dom, 0)
  }

  createDOM(ignoreListeners=false) {
		const dom = DOMSerializer.fromSchema(this.node.type.schema).serializeNode(this.node) as HTMLElement
    if(!ignoreListeners) {
      dom.tabIndex = -1
      dom.addEventListener("focusin", e => this.selectFocused())
      dom.addEventListener("mouseenter", e => this.emitWidgetMouseenter(e))
      dom.addEventListener("mouseleave", e => this.emitWidgetMouseleave(e))
      dom.addEventListener("keydown", e => this.emitWidgetInteract(e))
      dom.addEventListener("click", e => this.emitWidgetInteract(e))
      dom.addEventListener("touchstart", e => this.emitWidgetInteract(e))
    }
    return dom
  }

  get slots(): HTMLSlotElement[] {
    return Array.from(this.dom.shadowRoot?.querySelectorAll("slot") ?? [])
  }

  selectFocused() {
    const resolvedPos = this.view.state.doc.resolve(this.getPos())
    const tr = this.view.state.tr.setSelection(new NodeSelection(resolvedPos))
    this.view.dispatch(tr)
  }

	ignoreMutation(mutation: MutationRecord) {
		const {type, target} = mutation
		if(type === "attributes") {
			const tr = this.view.state.tr.setNodeAttribute(
				this.getPos(),
				"otherAttrs",
				getOtherAttrsFromWidget(target as HTMLElement)
			)
			this.view.dispatch(tr)
		}
		else if(type === "childList") {
			// TODO
      return false
		}
		return true
	}

	selectNode() {
		this.emitWidgetFocus()
		this.dom["focus"]()
	}
 
	deselectNode() {
		this.emitWidgetBlur()
		this.dom["blur"]()
	}

	stopEvent(e: Event) {
    const window = this.dom.ownerDocument.defaultView!
		const activeElement = this.view?.host?.shadowRoot?.activeElement
		const node = this.view.nodeDOM(this.getPos())
    if(e instanceof window.MouseEvent || e instanceof window.DragEvent) {
      const clickedElement = e.composedPath()[0] as HTMLElement
      const isFromSlotContent = e.composedPath().some((el: any) => el?.classList?.contains("slot-content"))
      return !isFromSlotContent
    }
		else if(activeElement === node) {
			return true
				&& !(e instanceof window.KeyboardEvent && e.key === "Delete")
				&& !(e instanceof window.KeyboardEvent && e.key === "Escape")
				&& !(e instanceof window.KeyboardEvent && (e.ctrlKey && e.key === "ArrowDown"))
				&& !(e instanceof window.KeyboardEvent && (e.ctrlKey && e.key === "ArrowUp"))
		}
		else {
			return true 
				&& !(e instanceof window.KeyboardEvent && e.key === "Delete")
				&& !(e instanceof window.KeyboardEvent && e.key === "Escape")
		}
	}

	emitWidgetFocus = () => this.dom.dispatchEvent(new CustomEvent("ww-widget-focus", {
		composed: true,
		bubbles: true,
		detail: {widget: this.dom}
	}))

	emitWidgetBlur = () => this.dom.dispatchEvent(new CustomEvent("ww-widget-blur", {
		composed: true,
		bubbles: true,
		detail: {widget: this.dom}
	}))

	emitWidgetMouseenter = (e: MouseEvent) => this.dom.dispatchEvent(new CustomEvent("ww-widget-mouseenter", {
		composed: true,
		bubbles: true,
		detail: {widget: this.dom, relatedTarget: e.relatedTarget}
	}))

	emitWidgetMouseleave = (e: MouseEvent) => this.dom.dispatchEvent(new CustomEvent("ww-widget-mouseleave", {
		composed: true,
		bubbles: true,
		detail: {widget: this.dom, relatedTarget: e.relatedTarget}
	}))

	emitWidgetInteract = (relatedEvent: Event) => this.dom.dispatchEvent(
		new CustomEvent("ww-widget-interact", {composed: true, bubbles: true, detail: {widget: this.dom, relatedEvent}})
	)

	emitWidgetClick = (relatedEvent: Event) => this.dom.dispatchEvent(
		new CustomEvent("ww-widget-click", {composed: true, bubbles: true, detail: {widget: this.dom, relatedEvent}})
	)


}


export class FigureView implements NodeView {
  node: Node
	view: EditorViewController
	getPos: () => number
	dom: HTMLElement
  contentDOM?: HTMLElement 

	constructor(node: Node, view: EditorViewController, getPos: () => number) {
		this.node = node
		this.view = view
    this.getPos = getPos
    this.dom = this.contentDOM = DOMSerializer.fromSchema(this.node.type.schema).serializeNode(this.node) as HTMLElement
    const observer = new MutationObserver(() => {
      selectParentNode(this.view.state, this.view.dispatch, this.view)
    })
    observer.observe(this.dom, {subtree: true, attributes: true})
	}

}

export class AudioView implements NodeView {
  static emptyDataURL = "data:audio/mpeg;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYwLjMuMTAwAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAABJbmZvAAAADwAAAAMAAAMoAHt7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e729vb29vb29vb29vb29vb29vb29vb29vb29vb29vb29vf///////////////////////////////////////////wAAAABMYXZjNjAuMy4AAAAAAAAAAAAAAAAkBhUAAAAAAAADKFkYr/kAAAAAAP/7UMQAA8AAAaQAAAAgAAA0gAAABExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX"
  node: Node
	view: EditorViewController
	getPos: () => number
	dom: HTMLElement
  contentDOM?: HTMLElement 

	constructor(node: Node, view: EditorViewController, getPos: () => number) {
		this.node = node
		this.view = view
    this.getPos = getPos
    this.dom = this.contentDOM = DOMSerializer.fromSchema(this.node.type.schema).serializeNode(this.node) as HTMLElement
    const observer = new MutationObserver(mutations => {
      if(mutations.some(m => m.attributeName === "src") && !node.attrs.src) {
        this.dom.setAttribute("src", AudioView.emptyDataURL)
      }
    })
    observer.observe(this.dom, {attributes: true})
	}

}

export class VideoView implements NodeView {
  static emptyDataURL = "data:video/mp4;base64,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"
  node: Node
	view: EditorViewController
	getPos: () => number
	dom: HTMLElement
  contentDOM?: HTMLElement 

	constructor(node: Node, view: EditorViewController, getPos: () => number) {
		this.node = node
		this.view = view
    this.getPos = getPos
    this.dom = this.contentDOM = DOMSerializer.fromSchema(this.node.type.schema).serializeNode(this.node) as HTMLElement
    const observer = new MutationObserver(mutations => {
      if(mutations.some(m => m.attributeName === "src") && !node.attrs.src) {
        this.dom.setAttribute("src", AudioView.emptyDataURL)
      }
    })
    observer.observe(this.dom, {attributes: true})
	}
}

export class UnknownElementView implements NodeView {
  node: Node
	view: EditorViewController
	getPos: () => number
	dom: HTMLElement
  contentDOM?: HTMLElement 

	constructor(node: Node, view: EditorViewController, getPos: () => number) {
		this.node = node
		this.view = view
    this.getPos = getPos
    this.dom = this.contentDOM = DOMSerializer.fromSchema(this.node.type.schema).serializeNode(this.node) as HTMLElement
	}

}

export class DetailsView implements NodeView {
  node: Node
	view: EditorViewController
	getPos: () => number
	dom: HTMLDetailsElement
  contentDOM?: HTMLElement 

	constructor(node: Node, view: EditorViewController, getPos: () => number) {
		this.node = node
		this.view = view
    this.getPos = getPos
    this.dom = this.contentDOM = DOMSerializer.fromSchema(this.node.type.schema).serializeNode(this.node) as HTMLDetailsElement
    this.dom.addEventListener("click", e => {
      const el = e.target as HTMLElement
      if(el.tagName === "SUMMARY") {
        this.view.dispatch(this.view.state.tr.setNodeAttribute(this.getPos(), "open", !this.node.attrs.open))
      }
    })
	}

}


export const nodeViews = {
  "_widget": WidgetView,
  "_unknownElement": UnknownElementView,
  "audio": AudioView,
  "video": VideoView,
  "details": DetailsView
}