import { NodeView } from "prosemirror-view"
import { NodeSelection } from "prosemirror-state"
import { DOMSerializer, Node } from "prosemirror-model"

import { getOtherAttrsFromWidget } from "../../model"
import {EditorViewController} from "."

export class WidgetView implements NodeView {

	node: Node
	view: EditorViewController
	getPos: () => number
	dom: HTMLElement

	constructor(node: Node, view: EditorViewController, getPos: () => number) {
		this.node = node
		this.view = view
		this.getPos = getPos
		this.dom = DOMSerializer.fromSchema(node.type.schema).serializeNode(node) as HTMLElement
		this.dom.tabIndex = -1
		this.dom.addEventListener("focusin", e => {
			const resolvedPos = view.state.doc.resolve(getPos())
			const tr = view.state.tr.setSelection(new NodeSelection(resolvedPos))
			view.dispatch(tr)
		})
		this.dom.addEventListener("mouseenter", e => this.emitWidgetMouseenter(e))
		this.dom.addEventListener("mouseleave", e => this.emitWidgetMouseleave(e))
		this.dom.addEventListener("keydown", e => this.emitWidgetInteract(e))
		this.dom.addEventListener("click", e => {this.emitWidgetInteract(e)})
		this.dom.addEventListener("touchstart", e => this.emitWidgetInteract(e))
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
		}
		return true
	}

	selectNode() {
		this.emitWidgetFocus()
		// this.dom["focus"]()
	}
 
	deselectNode() {
		this.emitWidgetBlur()
		// this.dom["blur"]()
	}

	stopEvent(e: Event) {
		const activeElement = this.view?.host?.shadowRoot?.activeElement
		const node = this.view.nodeDOM(this.getPos())
		if(activeElement === node) {
			return true
				&& !(e instanceof KeyboardEvent && e.key === "Delete")
				&& !(e instanceof KeyboardEvent && e.key === "Escape")
				&& !(e instanceof KeyboardEvent && (e.ctrlKey && e.key === "ArrowDown"))
				&& !(e instanceof KeyboardEvent && (e.ctrlKey && e.key === "ArrowUp"))
		}
		else {
			return true 
				&& !(e instanceof KeyboardEvent && e.key === "Delete")
				&& !(e instanceof KeyboardEvent && e.key === "Escape")
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