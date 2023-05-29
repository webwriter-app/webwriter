import { localized, msg } from "@lit/localize"
import { SlAnimation } from "@shoelace-style/shoelace"
import { LitElement, css, html } from "lit"
import { customElement, query, property } from "lit/decorators.js"
import spdx from "spdx-license-list"

@localized()
@customElement("ww-license-picker")
export class LicensePicker extends LitElement {

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

		(this as any)[key] = value

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
		if(!Object.keys(LicensePicker.LICENSES).includes(value)) {
			this.ccChoice = "no"
		}
		this.emitChange(value)
	}

	static LICENSES = {
		"All rights reserved": {
			icons: null as string[] | null,
			iconLibrary: null as string | null,
			fullLabel: "All rights reserved"
		},
		"CC-BY-NC-ND-4.0": {
			icons: ["o.cc", "o.cc-by", "o.nc", "o.nd"],
			fullLabel: "Creative Commons Attribution Non Commercial No Derivatives 4.0 International"
		},
		"CC-BY-NC-SA-4.0": {
			icons: ["o.cc", "o.cc-by", "o.nc", "o.sa"],
			fullLabel: "Creative Commons Attribution Non Commercial Share Alike 4.0 International"
		},
		"CC-BY-NC-4.0": {
			icons: ["o.cc", "o.cc-by", "o.nc"],
			fullLabel: "Creative Commons Attribution Non Commercial 4.0 International"
		},
		"CC-BY-ND-4.0": {
			icons: ["o.cc", "o.cc-by", "o.nd"],
			fullLabel: "Creative Commons Attribution No Derivatives 4.0 International"
		},
		"CC-BY-SA-4.0": {
			icons: ["o.cc", "o.cc-by", "o.sa"],
			fullLabel: "Creative Commons Attribution Share Alike 4.0 International"
		},
		"CC-BY-4.0": {
			icons: ["o.cc", "o.cc-by"],
			fullLabel: "Creative Commons Attribution 4.0 International"
		},
		"CC0-1.0": {
			icons: ["o.cc", "o.zero"],
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
		<sl-radio-group label=${label} value=${(this as any)[key]} fieldset>
			${options.map(({value, label}, i) => html`
				<sl-radio-button
					name="option"
					value=${value}
					?checked=${(this as any)[key] === value}
					?disabled=${disabled}
					@click=${() => this.setChoice(key, value)}>
					${label}
				</sl-radio-button>
			`)}
		</sl-radio-group>`

	render() {
		return html`
			<span tabindex=${0} class="license" spellcheck=${false}>
				<sl-input ?disabled=${this.disabled} value=${this.value} ?spellcheck=${false} @sl-change=${(e: any) => this.handleChange(e.target.value)} @focusin=${this.handleOpen}></sl-input>
				${null && (LicensePicker.LICENSES as any)[this.value]?.icons?.map((name: string) => html`<sl-icon name=${name}></sl-icon>`)}
				${this.href? html`<a href=${this.href} target="_blank"><sl-icon name="box-arrow-up-right"></sl-icon></a>`: null}
			</span>
			<sl-animation name="fadeIn" easing="ease" duration=${500} iterations=${1}>
				<sl-card class="choices">
					${this.radioGroupTemplate(
						"ccChoice",
						msg("License as Creative Commons OER?"), 
						[{value: "yes", label: "Yes"}, {value: "no", label: "No"}]
					)}
					${this.radioGroupTemplate(
						"attributionChoice",
						msg("Require attribution?"), 
						[{value: "yes", label: "Yes"}, {value: "no", label: "No"}],
						this.ccChoice === "no"
					)}
					${this.radioGroupTemplate(
						"adaptationChoice",
						msg("Allow adaptations?"), 
						[{value: "yes", label: "Yes"}, {value: "shareAlike", label: "Yes, but share alike"}, {value: "no", label: "No"}],
						this.ccChoice === "no"
					)}
					${this.radioGroupTemplate(
						"commercialChoice",
						msg("Allow commercial use?"), 
						[{value: "yes", label: "Yes"}, {value: "no", label: "No"}],
						this.ccChoice === "no"
					)}
				</sl-card>
			</sl-animation>
		`
	}
}