import { Decoration, DecorationSource, NodeView, NodeViewConstructor } from "prosemirror-view"
import { NodeSelection } from "prosemirror-state"
import { DOMSerializer, Node } from "prosemirror-model"
import {html, render} from "lit"

import { getAttrs, globalHTMLAttributes, toAttributes } from "../../model"
import {EditorViewController} from "."
import { selectParentNode } from "prosemirror-commands"
import { filterObject, sameMembers, shallowCompare } from "../../utility"

export class WidgetView implements NodeView {

	node: Node
	view: EditorViewController
	getPos: () => number
	dom: HTMLElement
  contentDOM?: HTMLElement


  // static existingWidgets = new Set()

	constructor(node: Node, view: EditorViewController, getPos: () => number) {
		this.node = node
		this.view = view
    this.getPos = getPos
    // const existingDom = this.view.dom.querySelector(`#${this.node.attrs.id}`)
    this.dom = this.contentDOM = this.createDOM()
    this.dom.toggleAttribute("contenteditable", true)
    /*
    WidgetView.existingWidgets.add(this.dom)
    if(existingDom) {
      const oldNames = this.dom.getAttributeNames()
      const newNames = newDom.getAttributeNames()
      const toRemove = oldNames.filter(k => !newNames.includes(k))
      toRemove.forEach(k => this.dom.removeAttribute(k))
      newNames.forEach(k => this.dom.setAttribute(k, newDom.getAttribute(k)!))
    }
    console.log(Array.from(WidgetView.existingWidgets as any))*/
	}

  update(node: Node, decorations: readonly Decoration[], innerDecorations: DecorationSource) {
    const oldName = this.node.type.name
    const oldAttrs = {...this.node.attrs, ...this.node.attrs._, ...this.node.attrs.data, data: undefined, _: undefined}
    const name = node.type.name
    const attrs = {...node.attrs, ...node.attrs._, ...node.attrs.data, data: undefined, _: undefined}
    if(oldName !== name) {
      return false
    }
    // this.node = node
    const newDom = DOMSerializer.fromSchema(node.type.schema).serializeNode(node, {document: this.view.dom.ownerDocument}) as HTMLElement
    const oldNames = this.dom.getAttributeNames()
    const newNames = newDom.getAttributeNames()
    const toRemove = oldNames.filter(k => !newNames.includes(k)).filter(k => k !== "contenteditable")
    toRemove.forEach(k => this.dom.removeAttribute(k))
    newNames.forEach(k => this.dom.setAttribute(k, newDom.getAttribute(k)!))
    for(const dec of decorations) {
      const attrs = (dec as any)?.type.attrs ?? {}
      for(const attr of Object.keys(attrs)) {
        if(attr !== "class") {
          this.dom.setAttribute(attr, attrs[attr])
        }
        else {
          this.dom.classList.add(attrs[attr])
        }
      }
    }
    return true
  }

  /*getPos() {
    return this.view.posAtDOM(this.dom, 0)
  }*/

  get firstAvailableWidgetID() {
		let num = 0
		while(this.view.dom.querySelector(`#ww_${num.toString(36)}`)) {
			num++
			if(num === Number.MAX_SAFE_INTEGER) {
				throw Error("Exceeded maximum number of widgets: " + String(Number.MAX_SAFE_INTEGER))
			}
		}
		return `ww_${num.toString(36)}`
	}

  /*
  get nextWidgetID() {
    const widgetTags = Object.values(this.node.type.schema.nodes).map(t => t.spec).filter(spec => spec.widget).map(spec => spec.tag)
    const widgetElements = Array.from(WidgetView.existingWidgets as any) as HTMLElement[]
    const widgetNumbers = widgetElements.map(el => parseInt(el.id.slice(3), 36)).filter(n => !Number.isNaN(n))
    const num = Math.max(...widgetNumbers, 0) + 1
    console.log(widgetNumbers, num)
    return `ww_${num.toString(36)}`

  }*/

  createDOM(ignoreListeners=false) {
		const dom = DOMSerializer.fromSchema(this.node.type.schema).serializeNode(this.node, {document: this.view.dom.ownerDocument}) as HTMLElement
    if(!ignoreListeners) {
      if(this.node.isAtom) {
        dom.addEventListener("focusin", e => this.selectFocused(), {passive: true})
      }
      dom.addEventListener("mouseenter", e => this.emitWidgetMouseenter(e), {passive: true})
      dom.addEventListener("mouseleave", e => this.emitWidgetMouseleave(e), {passive: true})
      dom.addEventListener("keydown", e => this.emitWidgetInteract(e), {passive: true})
      dom.addEventListener("click", e => this.handleWidgetClick(e), {passive: true})
      dom.addEventListener("touchstart", e => this.emitWidgetInteract(e), {passive: true})
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

  handleWidgetClick(e: MouseEvent) {
    if(e.offsetX > this.dom.offsetWidth) {
      this.selectFocused()
    }
    this.emitWidgetClick(e)
  }

	ignoreMutation(mutation: MutationRecord) {
    const {type, target, attributeName: attr, oldValue} = mutation
    const value = attr? this.dom.getAttribute(attr): null
    const attrUnchanged = !!(attr && (value === oldValue))
    if(attr && !attrUnchanged) {
      const builtinAttr = attr in globalHTMLAttributes
      const dataAttr = attr.startsWith("data-")
      let tr = this.view.state.tr
      if(builtinAttr) {
        tr = tr.setNodeAttribute(this.getPos(), attr, value)
      }
      else if(dataAttr) {
        const data = {...this.node.attrs.data, [attr]: value}
        tr = tr.setNodeAttribute(this.getPos(), "data", data)
      }
      else {
        const _ = {...this.node.attrs._, [attr]: value}
        tr = tr.setNodeAttribute(this.getPos(), "_", _)
      }
      this.view.dispatch(tr)
      return true
    }
    return attrUnchanged
    const dom = target as HTMLElement
    const domAttrs = getAttrs(dom)
    const allAttrs = filterObject({...domAttrs, data: undefined}, (k, v) => !!v)
    const flatNodeAttrs = filterObject({...this.node.attrs, data: undefined, _: undefined, ...this.node.attrs._}, (k, v) => v)
		if(type === "attributes") {
      if(!shallowCompare(allAttrs, flatNodeAttrs)) {
        const otherAttrs = filterObject(domAttrs, k => !(k in globalHTMLAttributes))
        const allAttrs = {...domAttrs, _: otherAttrs}
        const tr = this.view.state.tr.setNodeMarkup(this.getPos(), undefined, allAttrs)
        this.view.dispatch(tr)
        return false
      }
      return true
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

export class VideoView implements NodeView {
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
    this.dom.addEventListener("mousedown", e => {
      const el = e.target as HTMLElement
      if(el.tagName === "SUMMARY") {
        const range = el.ownerDocument.createRange()
        range.selectNodeContents(el)
        const rangeRect = range.getBoundingClientRect()
        const ignoreX = rangeRect.left
        if(e.clientX <= ignoreX) {
          this.view.dispatch(this.view.state.tr.setNodeAttribute(this.getPos(), "open", !this.node.attrs.open))
          e.stopImmediatePropagation()
          e.preventDefault()
        }
      }
    })
	}
}

export class IFrameView implements NodeView {
  node: Node
	view: EditorViewController
	getPos: () => number
	dom: HTMLIFrameElement
  contentDOM?: HTMLElement

  

  constructor(node: Node, view: EditorViewController, getPos: () => number) {
		this.node = node
		this.view = view
    this.getPos = getPos
    this.dom = this.contentDOM = DOMSerializer.fromSchema(this.node.type.schema).serializeNode(this.node) as HTMLIFrameElement
    this.dom.addEventListener("focus", () => this.selectFocused())
    this.dom.addEventListener("load", e => {
      this.dom.contentDocument?.addEventListener("click", () => this.dom.focus())
      if(this.dom.contentWindow!.location.href === "about:blank") {
        const img = this.dom.contentDocument!.createElement("img")
        img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-world-www" width="64" height="64" viewBox="0 0 24 24" stroke-width="2" stroke="darkgray" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M19.5 7a9 9 0 0 0 -7.5 -4a8.991 8.991 0 0 0 -7.484 4" /><path d="M11.5 3a16.989 16.989 0 0 0 -1.826 4" /><path d="M12.5 3a16.989 16.989 0 0 1 1.828 4" /><path d="M19.5 17a9 9 0 0 1 -7.5 4a8.991 8.991 0 0 1 -7.484 -4" /><path d="M11.5 21a16.989 16.989 0 0 1 -1.826 -4" /><path d="M12.5 21a16.989 16.989 0 0 0 1.828 -4" /><path d="M2 10l1 4l1.5 -4l1.5 4l1 -4" /><path d="M17 10l1 4l1.5 -4l1.5 4l1 -4" /><path d="M9.5 10l1 4l1.5 -4l1.5 4l1 -4" /></svg>'
        img.setAttribute("style", "position: fixed; top: calc(50% - 32px); left: calc(50% - 32px); user-select: none;")
        this.dom.contentDocument!.body.appendChild(img)
      }
    })
	}

  selectFocused() {
    const resolvedPos = this.view.state.doc.resolve(this.getPos())
    const tr = this.view.state.tr.setSelection(new NodeSelection(resolvedPos))
    this.view.dispatch(tr)
  }
}


export const nodeViews = {
  "_widget": WidgetView,
  "audio": AudioView,
  "video": VideoView,
  "details": DetailsView,
  "iframe": IFrameView
}