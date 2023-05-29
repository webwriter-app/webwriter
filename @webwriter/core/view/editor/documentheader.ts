import {LitElement, html, css, PropertyValueMap} from "lit"
import {customElement, property, query, queryAll, queryAsync} from "lit/decorators.js"
import { Attributes } from "@webwriter/model"
import { SlDetails, SlInput, SlTextarea } from "@shoelace-style/shoelace"
import { localized, msg } from "@lit/localize"

import { camelCaseToSpacedCase} from "../../utility"
import { Combobox } from ".."
import { ExplorableEditor } from "./editor"


@localized()
@customElement("ww-document-header")
export class DocumentHeader extends LitElement {

	static shadowRootOptions = {...LitElement.shadowRootOptions, delegatesFocus: true}

	@property({type: Object, attribute: false})
	docAttributes: Attributes

	@property({type: Array, attribute: false})
	revisions: any

	@property({type: Boolean})
	editable: boolean

	@query("sl-details")
	slDetails: SlDetails

	@queryAsync("sl-details")
	slDetailsAsync: Promise<SlDetails>

	@query("#headline")
	headline: SlInput

	@queryAsync("#headline")
	headlineAsync: Promise<SlInput>

	@queryAll("sl-tab-panel[aria-hidden=false] sl-input, sl-tab-panel[aria-hidden=false] sl-textarea, sl-tab-panel[aria-hidden=false] ww-combobox")
	inputFields: Array<SlInput | SlTextarea | Combobox>

	parentElement: ExplorableEditor
	
	focus() {
		this.headline.focus()
	}

	emitAttributeChange = (key: string, value: any) => this.dispatchEvent(
		new CustomEvent("ww-attribute-change", {composed: true, bubbles: true, detail: {key, value}})
	)

	handleAttributeChange = (e: InputEvent, id?: string, i?: number) => {
		const {value} = e.target as HTMLInputElement
		const key = id ?? (e.target as HTMLInputElement).id
		this.emitAttributeChange(key, value)
	}

  inputTemplate = (key: keyof Attributes) => html`<sl-input 
    id=${key}
    @sl-change=${this.handleAttributeChange}
    value=${this.docAttributes[key] as string}
    placeholder=${camelCaseToSpacedCase(key)}
		?disabled=${!this.editable}
		@keydown=${this.handleInputFieldKeyDown}
		filled
  ></sl-input>`

  textareaTemplate = (key: keyof Attributes) => html`<sl-textarea 
    id=${key}
    @sl-change=${this.handleAttributeChange}
		@keydown=${this.handleInputFieldKeyDown}
    value=${this.docAttributes[key] as string}
    placeholder=${camelCaseToSpacedCase(key)}
		rows=${3}
		maxlength=${280}
		filled
		?disabled=${!this.editable}
		resize="none"
  ></sl-textarea>`

	comboboxTemplate = (key: keyof Attributes) => html`<ww-combobox
		multiple
		placeholder=${camelCaseToSpacedCase(key)}
		filled
		?disabled=${!this.editable}
		@keydown=${this.handleInputFieldKeyDown}
	></ww-combobox>`

	revisionTemplate = ({date, author}: any[number], i: number) => html`<div class="revision">
		<sl-input @sl-change=${(e: any) => this.handleAttributeChange(e, "author", i)} value=${author} placeholder=${camelCaseToSpacedCase("author")}></sl-input>
		<sl-format-date id="dateModified" .date=${date}></sl-format-date>
	</div>`

	revisionPlaceholder = () => html`<div class="revision">
		<sl-format-date .date=${new Date()}></sl-format-date>
		${this.inputTemplate("author")}
	</div>`

	constructor() {
		super()
		this.addEventListener("focusout", e => {
			this.slDetails.hide()
		})
	}

	emitFocusDown() {
		this.dispatchEvent(new CustomEvent("ww-focus-down", {composed: true, bubbles: true}))
	}

	handleHeadlineKeyDown = (e: KeyboardEvent) => {
		if(e.key === "ArrowDown") {
			e.stopImmediatePropagation()
			if(this.slDetails.open && this.shadowRoot?.activeElement === this.headline) {
				this.inputFields[0].focus()
			}
			else {
				this.emitFocusDown()
			}
		}
		else if(["ArrowLeft", "ArrowRight", " "].includes(e.key)) {
			e.stopImmediatePropagation()
		}
		// e.stopPropagation()
	}

	handleInputFieldKeyDown = (e: KeyboardEvent) => {
		const inputFields = [...this.inputFields]
		const fieldIndex = inputFields.indexOf(this.shadowRoot?.activeElement as any)
		if(e.key === "ArrowDown" && fieldIndex !== -1) {
			if(fieldIndex < inputFields.length - 1) {
				e.stopPropagation()
				inputFields[fieldIndex + 1].focus()
			}
		}
		else if(e.key === "ArrowUp" && fieldIndex !== -1) {
			e.stopPropagation()
			const field = fieldIndex === 0? this.headline: inputFields[fieldIndex - 1]
			field.focus()
		}
	}

	protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
		// this.headlineAsync.then(headline => headline.focus())
	}

  static get styles() {
    return css`

			:host {
				display: contents;
			}

			#header-left-panel {
				grid-column: 1;
			}

      sl-details {
        border-bottom: 2px solid darkgray;
        padding-bottom: 0.5rem;
				grid-column: 2;
      }

			#header-right-panel {
				grid-column: 3;
			}

      sl-input::part(base), sl-textarea::part(base), ww-combobox {
        border: none;
      }

			sl-input:not(#headline), sl-textarea, ww-combobox {
				margin: 0.25rem;
			}

      sl-input:focus::part(base), sl-textarea:focus::part(base) {
        z-index: 1000;
      }

			.general-information::part(base) {
				display: flex;
				flex-direction: column;
			}

      .version-information {
        display: flex;
				flex-direction: row;
				gap: 0.5rem;
				padding-left: 8px;
      }

			.version-information-header {
				display: flex;
				flex-direction: row;
				align-items: center;
				justify-content: flex-start;
				gap: 0.5rem;
			}

			.version-information-header::part(base) {
				padding: 0;
				margin-bottom: 0.25rem;
			}

			.semantic-information {
				display: contents;
			}

			sl-tab-group {
				--track-color: transparent;
			}

			sl-tab-panel[aria-hidden=true] {
				display: none;
			}

			sl-tab-group::part(nav) {
				border-left: var(--track-width) solid darkgray;
			}

			sl-tab::part(base) {
				display: flex;
				flex-direction: row;
				justify-content: space-between;
				gap: 0.25rem;
				padding-right: 0;
			}

			sl-tab-panel:not(.general-information)::part(base) {
				display: grid;
				grid-template-columns: 1fr 1fr;
			}

			sl-tab-panel::part(base) {
				padding: 0;
				padding-right: 1rem;
				border: none;
			}

      sl-details::part(base) {
        border: none;
      }

      sl-details::part(header) {
        padding: 0;
      }

      sl-details::part(content) {
        padding: 0;
      }

      #headline {
        width: 95%;
      }

      #headline::part(base) {
        font-weight: bold;
        font-size: 1.25rem;
      }

      #headline::part(input) {
        padding-left: 0.25rem;
      }

			.revision > * {
				display: inline-block;
			}

      sl-input[disabled]::part(base), sl-textarea[disabled]::part(base) {
        background: none;
				cursor: auto;
				opacity: 1;
      }

			sl-input[disabled][value=""]:not(#headline), ww-combobox[disabled][value=""],  ww-combobox[disabled]:not([value]), sl-textarea[disabled][value=""] {
				display: none;
			}
    `
  }


	render() {
		const attrs = this.docAttributes
		const empty = !Object.keys(attrs).filter(k => !["license", "author"].includes(k)).some(k => attrs[k])

		return empty && !this.editable? null: html`
			<div id="header-left-panel"></div>
			<sl-details part="details" tabindex=${-1}>
        <sl-input 
          id="headline"
					?disabled=${!this.editable}
          @sl-change=${this.handleAttributeChange}
          value=${this.docAttributes["headline"] as string}
          placeholder=${msg("Headline")}
          slot="summary"
          @keydown=${this.handleHeadlineKeyDown}
					@click=${(e: any) => e.stopPropagation()}
        ></sl-input>
				<sl-tab-group placement="end">
					<sl-tab slot="nav" panel="general-information" active>
						<sl-icon name="file-earmark-text"></sl-icon>
						<span>${msg("General")}</span>
					</sl-tab>
					<sl-tab slot="nav" panel="educational-information">
						<sl-icon name="mortarboard"></sl-icon>
						<span>${msg("Educational")}</span>
					</sl-tab>
					<sl-tab slot="nav" panel="accessibility-information">
						<sl-icon name="people"></sl-icon>
						<span>${msg("Accessibility")}</span>
					</sl-tab>
					<!--
					<sl-tab slot="nav" panel="custom-information">
						<sl-icon name="braces-asterisk"></sl-icon>
						<span>Custom</span>
					</sl-tab>
					-->
					<sl-tab-panel class="general-information" name="general-information" active>
						<div class="semantic-information">
							${this.comboboxTemplate("keywords")}
							${this.textareaTemplate("description")}
						</div>
						<div class="version-information">
							<div class="version-information-header">
								<sl-icon name="clock-history"></sl-icon>
							</div>
							${this.revisions.length > 0
								? this.revisions.map(this.revisionTemplate)
								: this.revisionPlaceholder()
							}
						</div>
					</sl-tab-panel>
					<sl-tab-panel class="educational-information" name="educational-information">
          ${this.comboboxTemplate("learningResourceType")}
          ${this.comboboxTemplate("educationalUse")}
          ${this.comboboxTemplate("assesses")}
          ${this.comboboxTemplate("teaches")}
          ${this.comboboxTemplate("educationalLevel")}
          ${this.comboboxTemplate("competencyRequired")}
          ${this.comboboxTemplate("typicalAgeRange")}
					</sl-tab-panel>
					<sl-tab-panel class="accessibility-information" name="accessibility-information">
						${this.comboboxTemplate("inLanguage")}
						${this.comboboxTemplate("interactivityType")}
						${this.comboboxTemplate("accessMode")}
						${this.comboboxTemplate("accessModeSufficient")}
						${this.comboboxTemplate("accessibilityControl")}
						${this.comboboxTemplate("accessibilityFeature")}
						${this.comboboxTemplate("accessibilityHazard")}
					</sl-tab-panel>
				</sl-tab-group>
      </sl-details>
			<div id="header-right-panel"></div>
		`
	}
}