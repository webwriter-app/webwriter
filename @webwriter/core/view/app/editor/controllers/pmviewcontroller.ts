import { ExplorableEditor } from ".."
import { EditorController } from "."

import { Decoration, DecorationSource, EditorView, NodeView, ViewMutationRecord } from "prosemirror-view"
import { NodeSelection } from "prosemirror-state"
import { DOMSerializer, Mark, Node } from "prosemirror-model"

import { readDOMChange } from "../prosemirror-view/domchange"
import { globalHTMLAttributes } from "#model"
import { commentView } from "#model/schemas/resource/comment.js"
import { emitCustomEvent, sameMembers } from "#model/utility/index.js"

export class PmViewController extends EditorController {

    LinkView = (mark: Mark, view: EditorView, inline: boolean) => {
      const dom = this.host.pmEditor.document.createElement("a")
      const href = mark.attrs.href
      Object.entries(mark.attrs)
        .filter(([k, v]) => v)
        .forEach(([k, v]) => dom.setAttribute(k, v))
      dom.addEventListener("click", e => {
        e.preventDefault()
        this.host.mode === "preview" && emitCustomEvent(this.host, "ww-open", {url: href})
      })
      return {dom}
    }
  
    private cachedNodeViews: Record<string, any>
  
  
    get nodeViews() {
      const {nodes} = this.host.state.schema
      const cached = this.cachedNodeViews
      const cachedKeys = Object.keys(cached ?? {})
      const widgetKeys = Object.entries(nodes)
        .filter(([_, v]) => v.spec["package"])
        .map(([k, _]) => k)
      const nodeKeys = Object.keys(nodeViews)
        .filter(k => k !== "_" && k !== "_widget")
      const elementKeys = Object.entries(nodes)
        .map(([k, _]) => k)
        .filter(k => k !== "text" && !widgetKeys.includes(k) && !nodeKeys.includes(k))
      if(sameMembers([...elementKeys, ...nodeKeys, ...widgetKeys], cachedKeys)) {
        return cached
      }
      else {
        const elementViewEntries = elementKeys.map(k => [k, (node: Node, view: EditorView, getPos: () => number) => new nodeViews._(node, view, getPos)])
        const nodeViewEntries = nodeKeys.map(k => [
          k,
          (node: Node, view: EditorView, getPos: () => number) => new (nodeViews as any)[k](node, view, getPos),
        ])
        const widgetViewEntries = widgetKeys
        .map(key => [key, (node: Node, view: EditorView, getPos: () => number) => new WidgetView(node, view, getPos, this.host)])
        this.cachedNodeViews = Object.fromEntries([...elementViewEntries, ...nodeViewEntries, ...widgetViewEntries])
        return this.cachedNodeViews
      }
    }
  
    private cachedMarkViews: Record<string, any>
  
    get markViews() {
      const cached = this.cachedMarkViews
      if(cached) {
        return cached
      }
      else {
        this.cachedMarkViews = {
          link: this.LinkView,
          _comment: commentView
        }
        return this.cachedMarkViews
      }
    }
}

export class WidgetView implements NodeView {

	node: Node
	view: EditorView
	getPos: () => number
	dom: HTMLElement
  contentDOM?: HTMLElement

	constructor(node: Node, view: EditorView, getPos: () => number, readonly editor: ExplorableEditor) {
		this.node = node
		this.view = view
    this.getPos = getPos
    this.dom = this.contentDOM = this.createDOM()
	}

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

  createDOM(ignoreListeners=false) {
		const dom = DOMSerializer.fromSchema(this.node.type.schema).serializeNode(this.node, {document: this.view.dom.ownerDocument}) as HTMLElement
    if(!ignoreListeners) {
      dom.addEventListener("focus", e => this.select(), {passive: true})
      dom.addEventListener("mouseenter", e => this.emitWidgetMouseenter(e), {passive: true})
      dom.addEventListener("mouseleave", e => this.emitWidgetMouseleave(e), {passive: true})
      dom.addEventListener("keydown", e => this.emitWidgetInteract(e), {passive: true})
      dom.addEventListener("click", e => this.emitWidgetInteract(e))
      dom.addEventListener("touchstart", e => this.emitWidgetInteract(e), {passive: true})
      dom.addEventListener("dragstart", e => {
        if(e.composedPath()[0] !== this.dom) {
          e.stopPropagation()
        }
        else if(!this.node.type.spec.draggable) {
          e.preventDefault()
        }
      })
      dom.addEventListener("mousedown", e => this.emitWidgetClick(e))
    }
    dom.toggleAttribute("contenteditable", true)
    return dom
  }

  inTransaction = false

  get widgetIdPath() {
    const ids = [this.dom.id]
    let el = this.dom
    while(el.parentElement && el.parentElement.tagName !== "BODY") {
      el = el.parentElement
      if(el.id?.startsWith("ww-")) {
        ids.push(el.id)
      }
    }
    return ids
  }

  update(node: Node, decorations: readonly Decoration[], innerDecorations: DecorationSource) {
    const oldName = this.node.type.name
    const name = node.type.name
    if(oldName !== name || this.node.attrs.id !== node.attrs.id) {
      return false
    }
    if(!this.editor.editing.executingCommand || node.eq(this.node)) {
      this.node = node
      return true
    }
    this.node = node
    const dom = DOMSerializer.fromSchema(this.node.type.schema).serializeNode(this.node, {document: this.view.dom.ownerDocument}) as HTMLElement
    dom.toggleAttribute("contenteditable", true)
    const newAttrs = dom.getAttributeNames()
    const oldAttrs = this.dom.getAttributeNames()
    const toRemove = oldAttrs.filter(attr => !newAttrs.includes(attr));
    toRemove.forEach(attr => this.dom.removeAttribute(attr))
    newAttrs.forEach(attr => {
      if(attr === "class") {
        const oldClasses = Array.from(this.dom.classList)
        const newClasses = Array.from(dom.classList)
        const classesToRemove = oldClasses.filter(cls => !newClasses.includes(cls) && !cls.startsWith("ProseMirror-") && !cls.startsWith("ww-"))
        const classesToAdd = newClasses.filter(cls => !oldClasses.includes(cls))
        classesToRemove.forEach(cls => this.dom.classList.remove(cls))
        classesToAdd.forEach(cls => this.dom.classList.add(cls))
      }
      else {
        this.dom.setAttribute(attr, dom.getAttribute(attr)!)
      }
    });
    return true
  }

  get slots(): HTMLSlotElement[] {
    return Array.from(this.dom.shadowRoot?.querySelectorAll("slot") ?? [])
  }



  select() {
    const pos = this.getPos()
    if(pos === undefined) {
      return
    }
    const $pos = this.view.state.doc.resolve(pos)
    const sel = new NodeSelection($pos)
    const oldSel = this.view.state.selection
    if(!oldSel.eq(sel)) {
      let tr = this.view.state.tr.setSelection(sel)
      this.view.dispatch(tr)
    }
  }
  
  handleWidgetClick(e: MouseEvent) {
    if(e.ctrlKey || e.metaKey) {
      this.select()
    }
    this.emitWidgetClick(e)
  }

	ignoreMutation(mutation: ViewMutationRecord) {
    if(mutation.type === "selection") {
      return false
    }
    const {type, target, attributeName: attr, oldValue, addedNodes, removedNodes, previousSibling, nextSibling, attributeNamespace} = mutation
    const value = attr? this.dom.getAttribute(attr): null
    const attrUnchanged = !!(attr && (value === oldValue))
    if(type === "childList") {
      if(this.node.type.spec.dataType === "text/plain" && Array.from(addedNodes).every(node => node.nodeType === node.TEXT_NODE) && Array.from(removedNodes).every(node => node.nodeType === node.TEXT_NODE)) {
        const tr = this.view.state.tr.setNodeAttribute(this.getPos(), "=data", {type: "text/plain", value: this.dom.textContent})
        this.view.dispatch(tr)
        return true
      }
      (this.view as any).domObserver.stop()
      for(const node of [...Array.from(addedNodes), ...Array.from(removedNodes)]) {
        if(node instanceof this.view.dom.ownerDocument.defaultView!.HTMLElement) {
          (node as HTMLElement).classList.forEach(cls => cls.startsWith("ww-") && !cls.startsWith("ww-widget") && !cls.startsWith("ww-v")? (node as HTMLElement).classList.remove(cls): null)
        }
      }
      readDOMChange(this.view as any, this.getPos(), this.getPos() + this.node.nodeSize, true, Array.from(addedNodes));
      (this.view as any).domObserver.start()
      return true
    }
    else if(attr && !attrUnchanged) {
      const builtinAttr = attr in globalHTMLAttributes
      const dataAttr = attr.startsWith("data-")
      let tr = this.view.state.tr
      if(attr === "class") {
        const oldClasses = oldValue!.trim().split(" ")
        const newClasses = value!.trim().split(" ")
        const removedClasses = oldClasses.filter(v => !newClasses.includes(v) && !v.startsWith("ww-"))
        const addedClasses = newClasses.filter(v => !oldClasses.includes(v) && !v.startsWith("ww-")) 
        if(removedClasses.length || addedClasses.length) {
          const final = newClasses.filter(v => !v.startsWith("ww-"))
          tr = tr.setNodeAttribute(this.getPos(), attr, final)  
        }
        else {
          return true
        }
      }
      else if(builtinAttr) {
        tr = tr.setNodeAttribute(this.getPos(), attr, value)
      }
      else if(dataAttr) {
        const data = {...this.node.attrs.data, [attr]: value}
        tr = tr.setNodeAttribute(this.getPos(), "data", data)
      }
      else {
        const _ = {...this.node.attrs["=custom"], [attr]: value}
        tr = tr.setNodeAttribute(this.getPos(), "=custom", _)
      }
      if(this.widgetIdPath.some(id => !this.editor.editing.initializedElements.has(id))) {
        tr = tr.setMeta("addToHistory", false)
      }
      this.view.dispatch(tr)
      return true
    }
    return attrUnchanged
	}

	stopEvent(e: Event) {
    const window = this.dom.ownerDocument.defaultView!
    const selectList = ["mousedown", "touchstart"]
    this.emitWidgetInteract(e)
    const shouldSelect = selectList.some(E => typeof E === "string"? E === e.type: e instanceof E)
    if((this.node.isAtom && shouldSelect) || e instanceof window.MouseEvent && (e.ctrlKey || e.metaKey)) {
      this.select()
    }
    const fromShadowDOM = (e.composedPath()[0] as HTMLElement)?.getRootNode()
    // TODO: Improve into a more solid solution
    const isFlowContainer = Boolean(this.node.type.spec.content && /^flow\*|flow\+|\(flow\)\*|\(flow\)\+|\(flow\s*\|\s*p\s*\)(\*|\+)?|\(p\s*\|\s*flow\s*\)(\*|\+)?|p\s*\|\s*flow\s*(\*|\+)?|flow\s*\|\s*p\s*(\*|\+)?$/g.test(this.node.type.spec.content.trim()))
    const isTextblockOrInline = this.node.isTextblock || this.node.isInline
    const isControlMetaClick = (e instanceof window.KeyboardEvent && (e.ctrlKey || e.metaKey))
    const isContextMenu = e.type === "contextmenu"
    const isFromInsideOptions = e.composedPath().some(el => {
      const isPartOptions = (el as HTMLElement)?.getAttribute?.("part") === "options"
      const isInShadowDOMOfWidget = (el as any).parentNode?.host?.classList.contains("ww-widget")
      return isPartOptions && isInShadowDOMOfWidget
    })
    const shouldBePropagated = (e as any)["shouldPropagate"] || this.node.type.spec.propagateEvents?.includes(e.type) || ((isFlowContainer || isTextblockOrInline) && !isFromInsideOptions)
    if(shouldBePropagated) {
      (e as any)["shouldPropagate"] = true
    }
    return isFromInsideOptions || (fromShadowDOM && !isFlowContainer && !isTextblockOrInline && !isControlMetaClick && !isContextMenu && !shouldBePropagated)
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

export class ElementView implements NodeView {
  node: Node
  view: EditorView
  getPos: () => number
  dom: HTMLElement
  contentDOM?: HTMLElement

  constructor(node: Node, view: EditorView, getPos: () => number) {
    this.node = node
    this.view = view
    this.getPos = getPos
    this.dom = this.contentDOM = DOMSerializer.fromSchema(this.node.type.schema).serializeNode(this.node, {document: this.view.dom.ownerDocument}) as HTMLElement
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    if(mutation.type === "selection") {
      return true
    }
    const {type, target, attributeName: attr, oldValue, addedNodes, removedNodes, previousSibling, nextSibling, attributeNamespace} = mutation
    const value = attr? this.dom.getAttribute(attr): null
    const attrUnchanged = !!(attr && (value === oldValue))
    if(attr && !attrUnchanged) {
      const builtinAttr = attr in globalHTMLAttributes
      const dataAttr = attr.startsWith("data-")
      let tr = this.view.state.tr
      if(attr === "class") {
        const oldClasses = oldValue!.trim().split(" ")
        const newClasses = value!.trim().split(" ")
        const removedClasses = oldClasses.filter(v => !newClasses.includes(v) && !v.startsWith("ww-"))
        const addedClasses = newClasses.filter(v => !oldClasses.includes(v) && !v.startsWith("ww-")) 
        if(removedClasses.length || addedClasses.length) {
          const final = newClasses.filter(v => !v.startsWith("ww-"))
          tr = tr.setNodeAttribute(this.getPos(), attr, final)  
        }
        else {
          return true
        }
      }
      else if(builtinAttr) {
        tr = tr.setNodeAttribute(this.getPos(), attr, value)
      }
      else if(dataAttr) {
        const data = {...this.node.attrs.data, [attr]: value}
        tr = tr.setNodeAttribute(this.getPos(), "data", data)
      }
      else {
        const _ = {...this.node.attrs["=custom"], [attr]: value}
        tr = tr.setNodeAttribute(this.getPos(), "=custom", _)
      }
      this.view.dispatch(tr)
      return true
    }
    return attrUnchanged
  }
}

export class ImageView extends ElementView {}

export class AudioView extends ElementView implements NodeView {}

export class VideoView extends ElementView implements NodeView {}

export class UnknownElementView implements NodeView {
  node: Node
	view: EditorView
	getPos: () => number
	dom: HTMLElement
  contentDOM?: HTMLElement 

	constructor(node: Node, view: EditorView, getPos: () => number) {
		this.node = node
		this.view = view
    this.getPos = getPos
    this.dom = this.contentDOM = DOMSerializer.fromSchema(this.node.type.schema).serializeNode(this.node, {document: this.view.dom.ownerDocument}) as HTMLElement
	}

}

export class DetailsView extends ElementView implements NodeView {
  node: Node
	view: EditorView
	getPos: () => number
	dom: HTMLDetailsElement
  contentDOM?: HTMLElement 

	constructor(node: Node, view: EditorView, getPos: () => number) {
    super(node, view, getPos)
    const summary = this.dom.querySelector("summary")
    this.dom.addEventListener("click", e => {
      const el = e.target as HTMLElement
      if(el.tagName === "SUMMARY") {
        e.preventDefault(); e.stopImmediatePropagation()
        const range = el.ownerDocument.createRange()
        range.selectNodeContents(el)
        const rangeRect = range.getBoundingClientRect()
        const ignoreX = rangeRect.left
        if(e.clientX <= ignoreX) {
          this.view.dispatch(this.view.state.tr.setNodeAttribute(this.getPos(), "open", !this.node.attrs.open))
        }
      }
    })
    this.dom.addEventListener("toggle", (e: Event) => {
      if(Array.from(this.dom.children).some(el => el.matches("summary:only-child"))) {
        const p = this.dom.ownerDocument.createElement("p")
        this.dom.append(p)
        this.dom.ownerDocument.getSelection()?.setBaseAndExtent(p, 0, p, 0)
      }
    })
	}
}

export class IFrameView extends ElementView implements NodeView {
  node: Node
	view: EditorView
	getPos: () => number
	dom: HTMLIFrameElement
  contentDOM?: HTMLElement

  

  constructor(node: Node, view: EditorView, getPos: () => number) {
    super(node, view, getPos)
    this.dom.addEventListener("focus", () => this.selectFocused())
    this.dom.addEventListener("load", e => {
      try {
        if(this.dom.contentWindow!.location.href === "about:blank") {
          const img = this.dom.contentDocument!.createElement("img")
          img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-world-www" width="64" height="64" viewBox="0 0 24 24" stroke-width="2" stroke="darkgray" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M19.5 7a9 9 0 0 0 -7.5 -4a8.991 8.991 0 0 0 -7.484 4" /><path d="M11.5 3a16.989 16.989 0 0 0 -1.826 4" /><path d="M12.5 3a16.989 16.989 0 0 1 1.828 4" /><path d="M19.5 17a9 9 0 0 1 -7.5 4a8.991 8.991 0 0 1 -7.484 -4" /><path d="M11.5 21a16.989 16.989 0 0 1 -1.826 -4" /><path d="M12.5 21a16.989 16.989 0 0 0 1.828 -4" /><path d="M2 10l1 4l1.5 -4l1.5 4l1 -4" /><path d="M17 10l1 4l1.5 -4l1.5 4l1 -4" /><path d="M9.5 10l1 4l1.5 -4l1.5 4l1 -4" /></svg>'
          img.setAttribute("style", "position: fixed; top: calc(50% - 32px); left: calc(50% - 32px); user-select: none;")
          this.dom.contentDocument!.body.appendChild(img)
        } 
      }
      catch(err) {}
    })
	}

  selectFocused() {
    const resolvedPos = this.view.state.doc.resolve(this.getPos())
    const tr = this.view.state.tr.setSelection(new NodeSelection(resolvedPos))
    this.view.dispatch(tr)
  }
}

export class MathView extends ElementView implements NodeView {
  node: Node
	view: EditorView
	getPos: () => number
	dom: MathMLElement & HTMLElement
  contentDOM?: MathMLElement & HTMLElement

  selectFocused() {
    const pos = this.getPos()
    if(pos === undefined) {
      return
    }
    const $pos = this.view.state.doc.resolve(pos)
    const tr = this.view.state.tr.setSelection(new NodeSelection($pos))
    this.view.dispatch(tr)
  }
  

  constructor(node: Node, view: EditorView, getPos: () => number) {
    super(node, view, getPos)
    this.dom.addEventListener("selectstart", (e: any) => e.preventDefault())
	}

  setSelection?: (anchor: number, head: number, root: Document | ShadowRoot) => {
    
  }
}

export const nodeViews = {
  "_widget": WidgetView,
  "audio": AudioView,
  "audio_inline": AudioView,
  "picture": ImageView,
  "picture_inline": ImageView,
  "video": VideoView,
  "video_inline": VideoView,
  "details": DetailsView,
  "details_inline": DetailsView,
  "iframe": IFrameView,
  "iframe_inline": IFrameView,
  "math": MathView,
  "math_inline": MathView,
  "_": ElementView
}