import { localized, msg } from "@lit/localize"
import { SlInput } from "@shoelace-style/shoelace"
import { Attributes } from "@webwriter/model"
import { LitElement, html, css } from "lit"
import { customElement, property, queryAsync, queryAll } from "lit/decorators.js"
import { camelCaseToSpacedCase } from "../../utility"


@localized()
@customElement("ww-document-footer")
export class DocumentFooter extends LitElement {

	@property({type: Object, attribute: false})
	docAttributes: Pick<Attributes, "license" | "author" | "dateCreated" | "dateModified">

	@property({type: Boolean})
	editable: boolean

	@queryAsync("#author")
	authorAsync: Promise<SlInput>

	@queryAll("#author, ww-license-picker")
	footerFields: Element[]

	emitAttributeChange = (key: string, value: any) => {
		this.dispatchEvent(
			new CustomEvent("ww-attribute-change", {composed: true, bubbles: true, detail: {key, value}})
		)
	}

	handleAttributeChange = (e: InputEvent) => {
		const {id, value} = e.target as HTMLInputElement
		this.emitAttributeChange(id, value)
	}

	inputTemplate = (key: keyof Attributes, placeholder: string) => html`<sl-input 
		id=${key}
		@sl-change=${this.handleAttributeChange}
		value=${(this.docAttributes as any)[key] as string}
		?disabled=${!this.editable}
		placeholder=${placeholder ?? camelCaseToSpacedCase(key)}
	></sl-input>`

	focus() {
		this.authorAsync.then(author => author.focus())
	}

	emitFocusUp() {
		this.dispatchEvent(new CustomEvent("ww-focus-up", {composed: true, bubbles: true}))
	}

	constructor() {
		super()
		this.addEventListener("keydown", e => e.key === "ArrowUp" && this.emitFocusUp())
	}

	static get styles() {
		return css`
			:host {
				display: flex;
				flex-direction: row;
				justify-content: space-between;
				border-top: 2px solid darkgray;
				padding-top: 0.25rem;
				padding-bottom: 1rem;
			}

			sl-input::part(base), sl-input::part(input), #copyrightNotice {
				border: none;
				font-size: 0.75rem;
				height: 0.9rem;
			}

			sl-input {
				display: inline-block;
			}

			sl-input::part(input) {
				padding: 0;
				padding-left: 0.25rem;
			}

			sl-input:last-child::part(input) {
				padding-left: 0;
				padding-right: 0.25rem;
			}

			sl-input::part(form-control-input) {
				display: flex;
				flex-direction: row;
				align-items: center;
			}

			#copyrightNotice {
				margin-top: auto;
			}

			sl-format-date {
				font-family: var(--sl-font-sans);
			}


			#copyrightNotice {
				text-align: center;
				display: flex;
				flex-direction: row;
				align-items: center;
				font-family: var(--sl-font-sans);
				gap: 0.25rem;
			}

			.license-option {
				display: flex;
				flex-direction: row;
				gap: 0.1rem;
				align-items: center;
				padding: 0.2rem;
			}

			.license-option > * {
				height: 16px;
				width: 16px;
			}

      sl-input[disabled]::part(base) {
        background: none;
				opacity: 1;
				cursor: auto;
      }
		`
	}

	render() {

    const dateCreated = (this.docAttributes.dateCreated ?? new Date()) as Date
    const dateModified = this.docAttributes.dateModified as Date
		return html`
			<div id="copyrightNotice" tabindex="0" @focus=${this.focus}>
        <span>©</span>
        <sl-format-date year="numeric" .date=${dateCreated}></sl-format-date>
        ${dateModified && html`
          <span>-</span>
          <sl-format-date  year="numeric" .date=${dateModified}></sl-format-date>
        `}
        ${this.inputTemplate("author", msg("Anonymous"))}
      </div>
			<ww-license-picker value=${this.docAttributes.license == undefined || this.docAttributes.license === ""? msg("All rights reserved"): this.docAttributes.license} @ww-change=${(e: CustomEvent) => this.emitAttributeChange("license", e.detail.value)} ?disabled=${!this.editable}></ww-license-picker>
	  `
	}
}