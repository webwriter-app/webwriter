import {LitElement, html, css, PropertyValueMap} from "lit"
import {customElement, property, query, queryAll, queryAsync} from "lit/decorators.js"
import { Attributes } from "@webwriter/model"
import { camelCaseToSpacedCase} from "../../utility"
import { SlAnimation, SlDetails, SlInput, SlTextarea, registerIconLibrary } from "@shoelace-style/shoelace"
import spdx from "spdx-license-list"

import { WwCombobox } from "./uielements"
import { ExplorableEditor } from "./editor"



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
	inputFields: Array<SlInput | SlTextarea | WwCombobox>

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
		<sl-input @sl-change=${e => this.handleAttributeChange(e, "author", i)} value=${author} placeholder=${camelCaseToSpacedCase("author")}></sl-input>
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
			if(this.slDetails.open && this.shadowRoot.activeElement === this.headline) {
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
		const fieldIndex = inputFields.indexOf(this.shadowRoot.activeElement as any)
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
          placeholder=${camelCaseToSpacedCase("headline")}
          slot="summary"
          @keydown=${this.handleHeadlineKeyDown}
					@click=${e => e.stopPropagation()}
        ></sl-input>
				<sl-tab-group placement="end">
					<sl-tab slot="nav" panel="general-information" active>
						<sl-icon name="file-earmark-text"></sl-icon>
						<span>General</span>
					</sl-tab>
					<sl-tab slot="nav" panel="educational-information">
						<sl-icon name="mortarboard"></sl-icon>
						<span>Educational</span>
					</sl-tab>
					<sl-tab slot="nav" panel="accessibility-information">
						<sl-icon name="people"></sl-icon>
						<span>Accessibility</span>
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
		value=${this.docAttributes[key] as string}
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
        ${this.inputTemplate("author", "Anonymous")}
      </div>
			<ww-license-picker value=${this.docAttributes.license == undefined || this.docAttributes.license === ""? "All rights reserved": this.docAttributes.license} @ww-change=${e => this.emitAttributeChange("license", e.detail.value)} ?disabled=${!this.editable}></ww-license-picker>
	  `
	}
}

@customElement("ww-license-picker")
export class WwLicensePicker extends LitElement {

	tabIndex = 0

	@query(".choices")
	choicesElement: HTMLDivElement

	@query(".license")
	licenseElement: HTMLSpanElement

	@query("sl-animation")
	animationElement: SlAnimation

	@property({type: Boolean, attribute: true, reflect: true})
	opened: boolean = false

	@property({type: Boolean, attribute: true})
	disabled: boolean = false

	@property({type: String, attribute: true, reflect: true})
	value: string = ""

	@property({state: true})
	private ccChoice: "yes" | "no" = "no"

	@property({state: true})
	private attributionChoice: "yes" | "no" = "yes"

	@property({state: true})
	private adaptationChoice: "yes" | "shareAlike" | "no" = "shareAlike"

	@property({state: true})
	private commercialChoice: "yes" | "no" = "yes"

	
	@property({type: Boolean})
	editable: boolean

	constructor() {
		super()
		registerIconLibrary("cc", {resolver: name => `./assets/cc/${name}.svg`})
		this.addEventListener("blur", this.handleClose)
	}

	emitChange = (value: string) => this.dispatchEvent(
		new CustomEvent("ww-change", {bubbles: true, composed: true, detail: {value}})
	)

	focus() {
		this.licenseElement.focus()
		this.handleOpen()
	}

	async handleOpen() {
		if(this.disabled) {
			return
		}
		this.opened = !this.opened
		await this.updateComplete
		this.choicesElement.scrollIntoView({behavior: "smooth"})
		this.animationElement.name = "fadeIn"
		this.animationElement.play = true
	}

	async handleClose() {
		this.animationElement.addEventListener("sl-finish", () => this.opened = false, {once: true})
		this.animationElement.name = "fadeOut"
		this.animationElement.duration = 250
		this.animationElement.play = true
	}

	get href() {
		return spdx[this.value]?.url
	}

	setChoice(key: string, value: string) {
		if(key === "attributionChoice" && value === "no") {
			this.adaptationChoice = "yes"
			this.commercialChoice = "yes"
		}
		else if((key === "adaptationChoice" || key === "commercialChoice") && value !== "yes") {
			this.attributionChoice = "yes"
		}

		this[key] = value

		const cc = this.ccChoice === "yes"
		const choices = {
			"BY": this.attributionChoice === "yes",
			"NC": this.commercialChoice === "no",
			"SA": this.adaptationChoice === "shareAlike",
			"ND": this.adaptationChoice === "no"
		}

		if(cc && !Object.values(choices).some(v => v)) {
			return this.emitChange("CC0-1.0")
		}
		else if(key === "ccChoice" && value === "no") {
			return this.emitChange("All rights reserved")
		}

		cc? this.emitChange(`CC-${Object.entries(choices).filter(([_, v]) => v).map(([k, _]) => k).join("-") || "0"}-4.0`): null
	}

	handleChange(value: string) {
		if(!Object.keys(WwLicensePicker.LICENSES).includes(value)) {
			this.ccChoice = "no"
		}
		this.emitChange(value)
	}

	static LICENSES = {
		"All rights reserved": {
			icons: null as string[],
			iconLibrary: null as string,
			fullLabel: "All rights reserved"
		},
		"CC-BY-NC-ND-4.0": {
			icons: ["cc", "by", "nc", "nd"],
			iconLibrary: "cc",
			fullLabel: "Creative Commons Attribution Non Commercial No Derivatives 4.0 International"
		},
		"CC-BY-NC-SA-4.0": {
			icons: ["cc", "by", "nc", "sa"],
			iconLibrary: "cc",
			fullLabel: "Creative Commons Attribution Non Commercial Share Alike 4.0 International"
		},
		"CC-BY-NC-4.0": {
			icons: ["cc", "by", "nc"],
			iconLibrary: "cc",
			fullLabel: "Creative Commons Attribution Non Commercial 4.0 International"
		},
		"CC-BY-ND-4.0": {
			icons: ["cc", "by", "nd"],
			iconLibrary: "cc",
			fullLabel: "Creative Commons Attribution No Derivatives 4.0 International"
		},
		"CC-BY-SA-4.0": {
			icons: ["cc", "by", "sa"],
			iconLibrary: "cc",
			fullLabel: "Creative Commons Attribution Share Alike 4.0 International"
		},
		"CC-BY-4.0": {
			icons: ["cc", "by"],
			iconLibrary: "cc",
			fullLabel: "Creative Commons Attribution 4.0 International"
		},
		"CC0-1.0": {
			icons: ["cc", "zero"],
			iconLibrary: "cc",
			fullLabel: "Creative Commons Zero v1.0 Universal"
		}
	}

	static get styles() {
		return css`

			:host {
				position: relative;
			}

			.license {
				font-size: 0.75rem;
				display: flex;
				flex-direction: row;
				align-items: center;
				gap: 0.25rem;
				user-select: none;
				-moz-user-select: none;
			}
			
			:host([disabled]) .license {
				color: black !important;
				cursor: "text" !important;
			}

			.choices {
				display: none;
				position: absolute;
				top: 100%;
				right: 0;
				padding-top: 0.5rem;
				padding-bottom: 1rem;
			}

			.choices::part(body) {
				background: #f1f1f1;
				display: flex;
				flex-direction: column;
				gap: 0.5rem;
			}

			:host([opened]) .choices {
					display: block;
			}

			sl-radio-group::part(base) {
				padding: 0;
				border: 0;
			}

			sl-input::part(base) {
				border: 0;
				font-size: 0.75rem;
			}
			
			sl-input::part(input) {
				padding: 2px;
				text-align: right;
			}

			:host([disabled]) sl-input::part(base) {
				background: none;
				cursor: auto;
				opacity: 1;
			}

			sl-input, sl-input::part(base), sl-input::part(input) {
				height: 1rem;
			}

			sl-icon {
				font-size: 0.75rem;
			}
		`
	}

	radioGroupTemplate = (key: string, label: string, options: {value: string, label: string}[], disabled: boolean = false) => html`
		<sl-radio-group label=${label} value=${this[key]} fieldset>
			${options.map(({value, label}, i) => html`
				<sl-radio-button
					name="option"
					value=${value}
					?checked=${this[key] === value}
					?disabled=${disabled}
					@click=${() => this.setChoice(key, value)}>
					${label}
				</sl-radio-button>
			`)}
		</sl-radio-group>`

	render() {
		return html`
			<span tabindex=${0} class="license" spellcheck=${false}>
				<sl-input ?disabled=${this.disabled} value=${this.value} ?spellcheck=${false} @sl-change=${e => this.handleChange(e.target.value)} @focusin=${this.handleOpen}></sl-input>
				${null && WwLicensePicker.LICENSES[this.value]?.icons?.map(name => html`<sl-icon library="cc" name=${name}></sl-icon>`)}
				${this.href? html`<a href=${this.href} target="_blank"><sl-icon name="box-arrow-up-right"></sl-icon></a>`: null}
			</span>
			<sl-animation name="fadeIn" easing="ease" duration=${500} iterations=${1}>
				<sl-card class="choices">
					${this.radioGroupTemplate(
						"ccChoice",
						"License as Creative Commons OER?", 
						[{value: "yes", label: "Yes"}, {value: "no", label: "No"}]
					)}
					${this.radioGroupTemplate(
						"attributionChoice",
						"Require attribution?", 
						[{value: "yes", label: "Yes"}, {value: "no", label: "No"}],
						this.ccChoice === "no"
					)}
					${this.radioGroupTemplate(
						"adaptationChoice",
						"Allow adaptations?", 
						[{value: "yes", label: "Yes"}, {value: "shareAlike", label: "Yes, but share alike"}, {value: "no", label: "No"}],
						this.ccChoice === "no"
					)}
					${this.radioGroupTemplate(
						"commercialChoice",
						"Allow commercial use?", 
						[{value: "yes", label: "Yes"}, {value: "no", label: "No"}],
						this.ccChoice === "no"
					)}
				</sl-card>
			</sl-animation>
		`
	}
}