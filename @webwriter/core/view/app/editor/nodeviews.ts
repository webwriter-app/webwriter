import { Decoration, DecorationSource, NodeView, ViewMutationRecord } from "prosemirror-view"
import { NodeSelection } from "prosemirror-state"
import { DOMSerializer, Node } from "prosemirror-model"

import {EditorViewController, ExplorableEditor} from "#view"
import { readDOMChange } from "./prosemirror-view/domchange"
import { globalHTMLAttributes } from "#model"

export function treeLog(tree: Node) {
  let depth = -1
  let openGroups = 0
  console.group(`${tree.type.name}`)
  tree.descendants(
    (node, pos) => {
      const resolved = tree.resolve(pos)
      if(resolved.depth < depth) {
        for(; openGroups > 0; openGroups--) {
          console.groupEnd()
        }
      }
      depth = resolved.depth
      openGroups++
      const text = node.type.name === "text"? ` '${node.textContent}'`: ""
      console.group(`${node.type.name}${text}`)
    }
  )
  for(let i = 0; i < openGroups; i++) {
    console.groupEnd()
  }
  console.groupEnd()
}


export class WidgetView implements NodeView {

	node: Node
	view: EditorViewController
	getPos: () => number
	dom: HTMLElement
  contentDOM?: HTMLElement


  // static existingWidgets = new Set()

	constructor(node: Node, view: EditorViewController, getPos: () => number, readonly editor: ExplorableEditor) {
		this.node = node
		this.view = view
    this.getPos = getPos
    // const existingDom = this.view.dom.querySelector(`#${this.node.attrs.id}`)
    this.dom = this.contentDOM = this.createDOM()
    // this.dom.toggleAttribute("contenteditable", true)
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
    // console.log("recreate DOM of", "<" + this.node.type.name + ">")
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
    if(!this.editor.executingCommand || node.eq(this.node)) {
      this.node = node
      return true
    }
    this.node = node
    const dom = DOMSerializer.fromSchema(this.node.type.schema).serializeNode(this.node, {document: this.view.dom.ownerDocument}) as HTMLElement
    dom.toggleAttribute("contenteditable", true)
    const newAttrs = dom.getAttributeNames()
    const oldAttrs = this.dom.getAttributeNames()
    const toRemove = oldAttrs.filter(attr => !newAttrs.includes(attr));
    // (this.view as any).domObserver.stop()
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
    // (this.view as any).domObserver.start()
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
    if(oldSel.from !== sel.from || oldSel.to !== sel.to) {
      let tr = this.view.state.tr.setSelection(sel)
      this.view.dispatch(tr)
    }
  }
  
  handleWidgetClick(e: MouseEvent) {
    if(e.ctrlKey || e.metaKey) {
      this.select()
      // e.preventDefault()
      // e.stopImmediatePropagation()
    }
    this.emitWidgetClick(e)
  }
  
  /*
  selectNode() {
    console.log("selectNode")
  }

  /*setSelection(anchor: number, head: number, root: Document | ShadowRoot) {
    console.log(anchor, head, root)
  }*/

	ignoreMutation(mutation: ViewMutationRecord) {
    if(mutation.type === "selection") {
      return false
    }
    const {type, target, attributeName: attr, oldValue, addedNodes, removedNodes, previousSibling, nextSibling, attributeNamespace} = mutation
    const value = attr? this.dom.getAttribute(attr): null
    const attrUnchanged = !!(attr && (value === oldValue))
    if(type === "childList") {
      (this.view as any).domObserver.stop()
      for(const node of [...Array.from(addedNodes), ...Array.from(removedNodes)]) {
        if(node instanceof this.view.dom.ownerDocument.defaultView!.HTMLElement) {
          node.classList.forEach(cls => cls.startsWith("ww-") && !cls.startsWith("ww-widget") && !cls.startsWith("ww-v")? node.classList.remove(cls): null)
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
        const _ = {...this.node.attrs._, [attr]: value}
        tr = tr.setNodeAttribute(this.getPos(), "_", _)
      }
      if(this.widgetIdPath.some(id => !this.editor.initializedElements.has(id))) {
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
  view: EditorViewController
  getPos: () => number
  dom: HTMLElement
  contentDOM?: HTMLElement

  constructor(node: Node, view: EditorViewController, getPos: () => number) {
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
        const _ = {...this.node.attrs._, [attr]: value}
        tr = tr.setNodeAttribute(this.getPos(), "_", _)
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
	view: EditorViewController
	getPos: () => number
	dom: HTMLElement
  contentDOM?: HTMLElement 

	constructor(node: Node, view: EditorViewController, getPos: () => number) {
		this.node = node
		this.view = view
    this.getPos = getPos
    this.dom = this.contentDOM = DOMSerializer.fromSchema(this.node.type.schema).serializeNode(this.node, {document: this.view.dom.ownerDocument}) as HTMLElement
	}

}

export class DetailsView extends ElementView implements NodeView {
  node: Node
	view: EditorViewController
	getPos: () => number
	dom: HTMLDetailsElement
  contentDOM?: HTMLElement 

	constructor(node: Node, view: EditorViewController, getPos: () => number) {
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
	view: EditorViewController
	getPos: () => number
	dom: HTMLIFrameElement
  contentDOM?: HTMLElement

  

  constructor(node: Node, view: EditorViewController, getPos: () => number) {
    super(node, view, getPos)
    this.dom.addEventListener("focus", () => this.selectFocused())
    this.dom.addEventListener("load", e => {
      // this.dom.contentDocument?.addEventListener("click", () => this.dom.focus())
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
	view: EditorViewController
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
  

  constructor(node: Node, view: EditorViewController, getPos: () => number) {
    super(node, view, getPos)
    this.dom.addEventListener("selectstart", (e: any) => e.preventDefault())
	}

  setSelection?: (anchor: number, head: number, root: Document | ShadowRoot) => {
    
  }
}
/*
export const WidgetViewReact = forwardRef<HTMLElement, NodeViewComponentProps>(function WidgetViewReact({children, nodeProps: {node, getPos}, ...props}, ref) {
  const pkg = node.type.spec.package
  const [tag, attrs] = widgetToDOM(pkg, !node.type.isLeaf)(node)
  attrs.className = attrs.class
  delete attrs.class
  console.log(tag, {...props, ...attrs})
  return html(tag, {...props, ...attrs, ref}, children)
})

export const ElementViewReact = forwardRef<HTMLElement, NodeViewComponentProps>(function ElementViewReact({children, nodeProps: {node, getPos}, ...props}, ref) {
  const pkg = node.type.spec.package
  const tag = node.type.name
  const attrs = toAttributes(node)
  attrs.className = attrs.class
  delete attrs.class
  console.log(tag, {...props, ...attrs})
  return html(tag, {...props, ...attrs, ref}, children)
})*/

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