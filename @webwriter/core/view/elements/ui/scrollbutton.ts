import { LitElement, css, html } from "lit"
import { customElement, property } from "lit/decorators.js"
import { isOverflownX, isOverflownY } from "../../../model/utility"

@customElement("ww-scroll-button")
export class ScrollButton extends LitElement {

	static get styles() {
		return css`
			sl-icon-button[disabled] {
				visibility: hidden !important;
			}
		`
	}

	constructor() {
		super()
		new ResizeObserver(() => this.requestUpdate()).observe(this.getTarget() as any)
		this.getTarget()?.addEventListener("slotchange", () => this.requestUpdate())
	}

	@property({type: Object})
	getTarget = () => this.parentElement

	@property({type: Number})
	amount: number = 200

	@property({type: String})
	direction: "left" | "right" | "top" | "bottom"

	@property({type: String})
	behavior: ScrollToOptions["behavior"] = "smooth"

	@property({type: Number})
	slowness: number = 100

	@property({type: String})
	visible: "auto" | "always" = "auto" 

	ref: number

	scrollTarget = () => {
		const backwards = ["left", "top"].includes(this.direction)
		const horizontal = ["left", "right"].includes(this.direction)
		this.getTarget()?.scrollBy({
			behavior: this.behavior,
			[horizontal? "left": "top"]: (backwards? -1: 1) * this.amount 
		})
		// return window.requestAnimationFrame(this.scrollTarget)
	}

	startScrollingTarget = () => {
		this.ref = window.requestAnimationFrame(this.scrollTarget)
	}

	stopScrollingTarget = () => {
		window.cancelAnimationFrame(this.ref)
	}

	render() {
		const horizontal = ["left", "right"].includes(this.direction)
		const isOverflown = horizontal? isOverflownX: isOverflownY
		return this.visible === "always" || isOverflown(this.getTarget() as any)
			? html`<sl-icon-button
				name="chevron-${this.direction}"
				?disabled=${!isOverflown(this.getTarget() as any)}
				@mousedown=${this.startScrollingTarget}
				@mouseup=${this.stopScrollingTarget}
			></sl-icon-button>`
			: null
	}
}