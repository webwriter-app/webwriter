import {LitElement, html, css, PropertyValueMap} from "lit"
import {customElement, property, query, queryAll, queryAsync} from "lit/decorators.js"
import {repeat} from "lit/directives/repeat.js"
import {classMap} from "lit/directives/class-map.js"

import {PackagerController} from "../../state"
import { Document, Block, BlockElement, BlockElementConstructor, Attributes } from "webwriter-model"
import { camelCaseToSpacedCase, namedNodeMapToObject, prettifyPackageName } from "../../utility"
import { SlAlert, SlAnimation, SlDetails, SlInput, SlRadioButton, SlSelect, SlTextarea } from "@shoelace-style/shoelace"

import { WwCombobox } from "./uielements"

@customElement("ww-document-editor")
export class DocumentEditor extends LitElement {

	constructor() {
		super()
		this.addEventListener("keydown", e => e.key === "ArrowUp" || e.key === "ArrowDown"
				? this.focusNext(e.key.split("Arrow")[1] as "Up" | "Down")
				: null
		)
		this.classList.add("loading")
	}

	@property({type: Array, attribute: false})
	revisions: Document["revisions"]

	@property({type: Number})
	docID: Document["id"]

	@property({type: Object})
	docAttributes: Document["attributes"]

	@property({type: Array})
	content: Document["content"]

	@property({type: Boolean})
	loadingPackages: boolean

	@property({type: String})
	appendBlockType: string

	@property({type: Array})
	packageModules: PackagerController["packageModules"]
	@query("*")
	firstChild: HTMLElement

	@queryAll("ww-block-section")
	blockSections: NodeListOf<BlockSection>

	@queryAll("ww-document-header, ww-block-section, ww-append-block-widget, ww-document-footer")
	sections: NodeListOf<DocumentHeader | BlockSection | AppendBlockWidget | DocumentFooter>

	getDocAttribute(key: string, asArray=true): Document["attributes"][string] {
		const attr = this.docAttributes[key]
		return attr == null || Array.isArray(attr) || !asArray? attr: [attr]
	}

	emitSelectTabTitle = () => this.dispatchEvent(
		new CustomEvent("ww-select-tab-title", {composed: true, bubbles: true, detail: {id: this.docID}})
	)

	focusFirstBlock() {
		this.sections[0]?.focus()
	}

	focusNext = (direction: "Up" | "Down" = "Down") => {
		let currentElement = this.shadowRoot.activeElement as DocumentHeader | BlockSection | AppendBlockWidget | DocumentFooter
		let currentIndex = Array.from(this.sections).indexOf(currentElement)
		let nextElement: DocumentHeader | BlockSection | AppendBlockWidget | DocumentFooter
		if(direction === "Down") {
			nextElement = this.sections[Math.min(currentIndex + 1, this.sections.length - 1)]
		}
		else if(direction === "Up") {
			nextElement = this.sections[Math.max(0, currentIndex - 1)]
		}
		currentElement.blur()
		nextElement.focus()
	}

	emitDeleteBlock = (i: number) => this.dispatchEvent(
		new CustomEvent("ww-delete-block", {composed: true, bubbles: true, detail: {i}})
	)

	firstUpdated() {
		this.classList.remove("loading")
	}

	static get styles() {
		return css`

			@keyframes fade-in {
				from {
					opacity: 0;
				}
				to {
					opacity: 1;	
				}
			}

			:host {
				display: contents;
			}

			:host > * {
				animation: fade-in 0.3s ease-in;
			}

			ww-append-block-widget {
				grid-column: 2;
				height: 100%;
				gap: 1rem;
			}

			.delete-block-button::part(base):hover {
				color: red;
			}

			.delete-block-button::part(base):focus {
				color: red;
			}

			.delete-block-button::part(base):active {
				color: darkred;
			}
			
			.loading-packages-spinner-container {
				display: flex;
				width: 100%;
				flex-direction: row;
				justify-content: center;
				padding: 1rem;
				grid-column: 2;
				font-size: 2rem;
			}

      ww-document-header {
        grid-column: 2;
      }

      ww-document-footer {
        grid-column: 2;
      }
		`
	}

	render() {
    const content = !this.loadingPackages? html`
    ${repeat(this.content, b => (b as any).id, (block, i) => html`
      <ww-block-section 
				.block=${block} 
				.elementConstructor=${this.packageModules[block.attributes.type]}
				@ww-block-change=${e => {e.detail.i = i}}>
        <sl-icon-button
          slot="left-panel"
          class="delete-block-button"
          @click=${() => this.emitDeleteBlock(i)}
          name="trash">
        </sl-icon-button>
      </ww-block-section>
    `)}
      <ww-append-block-widget value=${this.appendBlockType} .blockTypes=${Object.keys(this.packageModules)}></ww-append-block-widget>
  `: html`<div class="loading-packages-spinner-container"><sl-spinner></sl-spinner></div>`
		
    return html`
      <ww-document-header .docAttributes=${this.docAttributes} .revisions=${this.revisions}></ww-document-header>
      ${content}
      <ww-document-footer .docAttributes=${this.docAttributes}></ww-document-footer>
    ` 
	}
}

@customElement("ww-block-section")
export class BlockSection extends LitElement {

	constructor() {
		super()
		this.addEventListener("focus", () => this.element.focus())
	}

	@property({type: Object, attribute: false})
	block: Block
	
	@property({type: Object, attribute: false})
	element: BlockElement

	@property({type: Object, attribute: false})
	elementConstructor: BlockElementConstructor

	@query("sl-animation")
	animation: SlAnimation

	@queryAsync(".block-element")
	blockElementAsync: BlockElement

	observer: MutationObserver

	@property({type: Boolean, attribute: true, reflect: true})
	hasActions: boolean

	async connectedCallback() {
		super.connectedCallback()
		if(!this.elementConstructor) {
			return
		}
		this.element = new this.elementConstructor()
		this.element.block = this.block
		this.element.editable = true
		this.element.printable = false
		Object.entries(this.element.block.attributes).forEach(([k, v]) => this.element[k] = v)
		this.element.classList.add("block-element")
		this.observer = new MutationObserver((mutations, observer) => {
			this.emitBlockChange()
		})
		this.observer.observe(this.shadowRoot, {attributes: true, subtree: true})
		this.hasActions = !!(await this.blockElementAsync).shadowRoot.querySelector("[part=action]")
	}

	disconnectedCallback(): void {
		this.observer?.disconnect()
	}

	protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
		this.animation.play = true
		this.addEventListener("sl-finish", e => this.focus(), {once: true})
	}

	emitBlockChange = () => this.dispatchEvent(
		new CustomEvent("ww-block-change", {composed: true, bubbles: true, detail: {
			attributes: namedNodeMapToObject(this.element.attributes),
			content: [] // TODO: Implement nested updates
		}})
	)

	static get styles() {
		return css`
			:host {
				display: contents;
			}

			:host(:not(:focus-within)) .left-panel {
				visibility: hidden;
			}

			@media screen and (min-width: 1080px) {
				.left-panel {
					grid-column: 1;
				}

				.block-element, .block-element::part(base) {
					grid-column: 2;
				}

				.block-element::part(action) {
					grid-column: 3;
					margin: 0 0.5rem;
					max-width: 600px;
				}
			}

			@media screen and (max-width: 1080px) {
				.left-panel {
					grid-column: 1;
				}

				:host([hasActions]) .left-panel  {
					grid-row: span 2;
				}

				.block-element, .block-element::part(base) {
					grid-column: 2;
				}

				.block-element::part(action) {
					grid-column: 2;
					margin: 0;
				}
			}


		`
	}

	focus() {
		this.element?.focus()
	}

	render() {

		return html`
			<ww-side-panel class="left-panel">
				<slot name="left-panel"></slot>
			</ww-side-panel>
			<sl-animation name="fadeIn" easing="easeIn" iterations=${1} duration=${100}>
				${this.elementConstructor? this.element: html`
				<sl-alert class="block-element" variant="warning" open>
					<sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
					<span>Unknown widget ${this.block.attributes.type} - Use the package manager to install it.</span>
				</sl-alert>
				`}
				${this.hasActions? null: html`<div style="grid-column: 3"></div>`}
			</sl-animation>
		`
	}
}

@customElement("ww-document-header")
class DocumentHeader extends LitElement {

	static shadowRootOptions = {...LitElement.shadowRootOptions, delegatesFocus: true}

	@property({type: Object, attribute: false})
	docAttributes: Attributes

	@property({type: Array, attribute: false})
	revisions: Document["revisions"]

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

	parentElement: DocumentEditor
	
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
		resize="none"
  ></sl-textarea>`

	comboboxTemplate = (key: keyof Attributes) => html`<ww-combobox
		multiple
		placeholder=${camelCaseToSpacedCase(key)}
		filled
		@keydown=${this.handleInputFieldKeyDown}
	></ww-combobox>`

	revisionTemplate = ({date, author}: Document["revisions"][number], i: number) => html`<div class="revision">
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

	handleHeadlineKeyDown = (e: KeyboardEvent) => {
		if(e.key === "ArrowDown") {
			e.stopImmediatePropagation()
			if(this.slDetails.open && this.shadowRoot.activeElement === this.headline) {
				this.inputFields[0].focus()
			}
			else {
				this.dispatchEvent(new KeyboardEvent("keydown", e))
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
		this.headlineAsync.then(headline => headline.focus())
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
    `
  }


	render() {
		const attrs = this.docAttributes
		return html`
			<div id="header-left-panel"></div>
			<sl-details tabindex=${-1}>
        <sl-input 
          id="headline"
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
					<sl-tab slot="nav" panel="custom-information">
						<sl-icon name="braces-asterisk"></sl-icon>
						<span>Custom</span>
					</sl-tab>
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
class DocumentFooter extends LitElement {

	@property({type: Object, attribute: false})
	docAttributes: Pick<Attributes, "license" | "author" | "dateCreated" | "dateModified">

	@queryAsync("#author")
	authorAsync: Promise<SlInput>

	@queryAll("#author, ww-license-picker")
	footerFields: Element[]

	emitAttributeChange = (key: string, value: any) => this.dispatchEvent(
		new CustomEvent("ww-attribute-change", {composed: true, bubbles: true, detail: {key, value}})
	)

	handleAttributeChange = (e: InputEvent) => {
		const {id, value} = e.target as HTMLInputElement
		this.emitAttributeChange(id, value)
	}

	inputTemplate = (key: keyof Attributes) => html`<sl-input 
		id=${key}
		@sl-change=${this.handleAttributeChange}
		value=${this.docAttributes[key] as string}
		placeholder=${camelCaseToSpacedCase(key)}
	></sl-input>`

	focus() {
		this.authorAsync.then(author => author.focus())
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
		`
	}

	render() {
		const empty = !this.docAttributes.author

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
        ${this.inputTemplate("author")}
      </div>
			<ww-license-picker></ww-license-picker>
	  `
	}
}

@customElement("ww-license-picker")
class WwLicensePicker extends LitElement {

	tabIndex = 0

	@query(".choices")
	choicesElement: HTMLDivElement

	@query(".license")
	licenseElement: HTMLSpanElement

	@query("sl-animation")
	animationElement: SlAnimation

	@property({type: Boolean, attribute: true, reflect: true})
	opened: boolean = false

	@property({state: true})
	private ccChoice: "yes" | "no" = "no"

	@property({state: true})
	private attributionChoice: "yes" | "no" = "yes"

	@property({state: true})
	private adaptationChoice: "yes" | "shareAlike" | "no" = "shareAlike"

	@property({state: true})
	private commercialChoice: "yes" | "no" = "yes"

	constructor() {
		super()
		this.tabIndex = 0
		this.addEventListener("blur", this.handleClose)
	}

	emitChange = () => this.dispatchEvent(
		new Event("change", {bubbles: true, composed: true})
	)

	focus() {
		this.licenseElement.focus()
		this.handleOpen()
	}

	async handleOpen() {
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

	setChoice(key: string, value: string) {
		if(key === "attributionChoice" && value === "no") {
			this.adaptationChoice = "yes"
			this.commercialChoice = "yes"
		}
		else if((key === "adaptationChoice" || key === "commercialChoice") && value !== "yes") {
			this.attributionChoice = "yes"
		}
		this[key] = value
	}

	get value() {
		const cc = this.ccChoice === "yes"
		const choices = {
			"BY": this.attributionChoice === "yes",
			"NC": this.commercialChoice === "no",
			"SA": this.adaptationChoice === "shareAlike",
			"ND": this.adaptationChoice === "no"
		}

		if(cc && !Object.values(choices).some(v => v)) {
			return "CC 0"
		}

		return !cc
			? "All rights reserved"
			: `CC ${Object.entries(choices).filter(([_, v]) => v).map(([k, _]) => k).join("-") || "0"}`
	}

	static LICENSES = {
		"All rights reserved": {
			icons: null as string[],
			iconLibrary: null as string,
			fullLabel: "All rights reserved"
		},
		"CC BY-NC-ND": {
			icons: ["cc", "by", "nc", "nd"],
			iconLibrary: "cc",
			fullLabel: "Creative Commons Attribution-NonCommercial-NoDerivatives"
		},
		"CC BY-NC-SA": {
			icons: ["cc", "by", "nc", "sa"],
			iconLibrary: "cc",
			fullLabel: "Creative Commons Attribution-NonCommercial-ShareAlike"
		},
		"CC BY-NC": {
			icons: ["cc", "by", "nc"],
			iconLibrary: "cc",
			fullLabel: "Creative Commons Attribution-NonCommercial"
		},
		"CC BY-ND": {
			icons: ["cc", "by", "nd"],
			iconLibrary: "cc",
			fullLabel: "Creative Commons Attribution-NoDerivatives"
		},
		"CC BY-SA": {
			icons: ["cc", "by", "sa"],
			iconLibrary: "cc",
			fullLabel: "Creative Commons Attribution-ShareAlike"
		},
		"CC BY": {
			icons: ["cc", "by"],
			iconLibrary: "cc",
			fullLabel: "Creative Commons Attribution"
		},
		"CC 0": {
			icons: ["cc", "zero"],
			iconLibrary: "cc",
			fullLabel: "Creative Commons 'No rights reserved'"
		}
	}

	static get styles() {
		return css`

			:host {
				position: relative;
			}

			.license {
				font-size: 0.75rem;
				cursor: pointer;
				display: flex;
				flex-direction: row;
				align-items: center;
				gap: 0.25rem;
				user-select: none;
				-moz-user-select: none;
			}

			.license:hover {
				color: var(--sl-color-primary-400);
				stroke: var(--sl-color-primary-400);
				fill: var(--sl-color-primary-400);
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

			:host([opened]) .license {
				color: var(--sl-color-primary-600);
				stroke: var(--sl-color-primary-600);
				fill: var(--sl-color-primary-600);
			}

			sl-radio-group::part(base) {
				padding: 0;
				border: none;
			}
		`
	}

	radioGroupTemplate = (key: string, label: string, options: {value: string, label: string}[], disabled: boolean = false) => html`
		<sl-radio-group label=${label} fieldset>
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
		<span tabindex=${0} class="license" @click=${this.handleOpen}>
			<span>${!this.opened? this.value: WwLicensePicker.LICENSES[this.value]?.fullLabel}</span>
			${WwLicensePicker.LICENSES[this.value]?.icons?.map(name => html`<sl-icon library="cc" name=${name}></sl-icon>`)}
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

@customElement("ww-append-block-widget")
class AppendBlockWidget extends LitElement {

	@property({type: Array, attribute: false})
	blockTypes: string[]

	@property({type: String, attribute: true, reflect: true})
	value: string

	@queryAsync("sl-radio-button")
	firstRadioButtonAsync: Promise<SlRadioButton>

	emitAppendBlock = () => this.dispatchEvent(
		new CustomEvent("ww-append-block", {composed: true, bubbles: true, detail: {type: this.value}})
	)

	focus() {
		this.firstRadioButtonAsync.then(rb => rb.focus())
	}

	handleRadioButtonKeydown = (e: KeyboardEvent) => {
		["ArrowUp", "ArrowDown"].includes(e.key) && e.stopImmediatePropagation()
		this.dispatchEvent(new KeyboardEvent("keydown", e))
	}

	static get styles() {
		return css`
			:host {
				display: flex;
				flex-direction: row;
				align-items: center;
				border-radius: 0.25rem;
			}
			
			sl-icon {
				font-size: 1.5rem;
			}

			sl-radio-button {
				--sl-color-primary-600: var(--sl-color-neutral-600);
			}
		`
	}

	render() {
		const mainTemplate = html`
			<sl-radio-group>
				${[...this.blockTypes].reverse().map(name => html`
					<sl-radio-button
						name="option"
						variant="neutral"
						value=${name}
						?checked=${name === this.value}
						@click=${() => {
							if(name === this.value) {
								this.emitAppendBlock()
							}
							else {
								this.value = name
							}
						}}
						@focus=${() => this.value = name}
						@keydown=${this.handleRadioButtonKeydown}>
						
						<sl-icon slot="prefix" name=${this.value === name? "plus": ""}></sl-icon>
						${prettifyPackageName(name)}
					</sl-radio-button>
				`)}
			</sl-radio-group>
		`
		return this.blockTypes.length > 0? mainTemplate: html`<sl-alert variant="warning" open>
			<sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
			<span>No widgets available. Get widgets with the package manager.</span>
		</sl-alert>`
	}
}