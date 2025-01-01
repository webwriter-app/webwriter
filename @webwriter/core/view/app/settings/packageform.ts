import { LitElement, html, css } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"
import spdxLicenseList from "spdx-license-list"
import { SlChangeEvent, getFormControls } from "@shoelace-style/shoelace"
import { DataInput } from "#view/elements/datainputs/datainput.js"
import { Person, License, SemVer } from "#model"

const RECOMMENDED_LICENSES = ["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause"].map(key => ({...spdxLicenseList[key], key}))

@localized()
@customElement("ww-package-form")
export class PackageForm extends LitElement {

  static optionKeys = ["generateLicense", "enableLiveReload", "preset"] as const

  static get defaults() {return {
    name: "",
    localPath: "",
    version: new SemVer("0.0.1"),
    license: new License("MIT"),
    author: new Person(""),
    keywords: ["webwriter-widget"],
    generateLicense: true,
    enableLiveReload: true,
    preset: "lit",
  }}

  @property({attribute: false})
  defaultValue = PackageForm.defaults

  @property({attribute: false})
  name = PackageForm.defaults.name

  @property({type: String, attribute: true, reflect: true})
  localPath: string = PackageForm.defaults.localPath

  @property({type: Boolean, state: true, attribute: true, reflect: true})
  get noPath() {
    return !this.localPath
  }

  @property({attribute: false})
  version = PackageForm.defaults.version

  @property({type: Object, attribute: false})
  license = PackageForm.defaults.license

  @property({attribute: false})
  author = PackageForm.defaults.author

  @property({type: Boolean, attribute: true})
  generateLicense = PackageForm.defaults.generateLicense
  
  @property({type: Boolean, attribute: true})
  enableLiveReload = PackageForm.defaults.enableLiveReload
  
  @property({type: String, attribute: true})
  preset = PackageForm.defaults.preset
  
  @property({type: Array, attribute: true})
  keywords = PackageForm.defaults.keywords

  @property({type: String, attribute: true, reflect: true})
  mode: "create" | "edit" = "edit"

  @property({type: Boolean, attribute: true, reflect: true})
  isImport = false

  @property({type: Boolean, attribute: true})
  loading = false

  @query("form")
  form: HTMLFormElement

  static styles = css`
    form {
      display: flex;
      flex-direction: column;
      gap: var(--sl-spacing-small);
    }

    form[inert] > [name] {
      opacity: 0.9;
      background: var(--sl-color-gray-100);
    }

    form footer {
      display: flex;
      flex-direction: row;
      justify-content: flex-end;
      gap: var(--sl-spacing-small);
    }

    sl-tag {
      cursor: default;
    }

    :host([mode=edit]) #create-fields {
      display: none;
    }

    :host([mode=edit][nopath]) :is([name]:not([name=localPath]), #create-fields) {
      display: none !important;
    }

    #create-fields {
      margin-top: 1ch;
      border: 1px solid var(--sl-color-gray-400);
      border-radius: var(--sl-border-radius-small);
      padding: 1ch;
      display: grid;
      grid-template-rows: 1fr 1fr;
      grid-template-columns: 1fr 1fr;
      gap: 0 1ch;
    }

    #create-fields [name=preset] {
      grid-row: span 2;
    }

    #reset {
      margin-right: auto;
    }
  `

  checkValidity() {
    return this.elements.every(el => el.checkValidity())
  }

  reportValidity() {
    return this.form.reportValidity()
  }
  
  handleSubmit = () => {
    if(this.reportValidity()) {
      this.dispatchEvent(new Event("submit"))
    }
  }

  handleCancel = () => {
    this.dispatchEvent(
      new CustomEvent("ww-cancel", {composed: true, bubbles: true})
    )
    this.reset()
  }

  handleFieldChange = (e: SlChangeEvent) => {
    const element = e.target! as unknown as DataInput
    (this as any)[element.name] = element.value
    this.dispatchEvent(new CustomEvent("ww-change-field", {bubbles: true, composed: true, detail: {name: element.name, valid: element.checkValidity()}}))
  }

  reset() {
    Object.keys(PackageForm.defaults).forEach(key => {
      (this as any)[key] = (this.defaultValue as any)[key]
    })
    this.requestUpdate()
  }

  get elements() {
    return getFormControls(this.form) as (Element & DataInput)[]
  }

  get value() {
    return Object.fromEntries(Object.keys(this.defaultValue)
    .filter(key => !PackageForm.optionKeys.includes(key as any))
    .map(key => {
      return [key, (this as any)[key]]
    })) as typeof PackageForm.defaults
  }

  set value(value: typeof PackageForm.defaults) {
    Object.keys(value).forEach(key => {
      (this as any)[key] = (value as any)[key]
    })
  }

  get defaultValueChanged() {
    return this.defaultValue.name !== PackageForm.defaults.name
  }

  get confirmText() {
    if(this.mode === "create") {
      return msg("Create")
    }
    else if(this.mode === "edit" && !this.isImport) {
      return msg("Apply")
    }
    else if(this.mode === "edit" && this.isImport && this.defaultValueChanged) {
      return msg("Apply and import")
    }
    else if(this.mode === "edit" && this.isImport && !this.defaultValueChanged) {
      return msg("Import")
    }
  }

  render() {
    return html`<form @sl-change=${this.handleFieldChange} ?inert=${this.loading}>
      <ww-pathinput
        value=${this.localPath ?? ""}
        required
        name="localPath"
        label="Local Path"
        help-text=${msg("Directory where package.json is located")}
      ></ww-pathinput>
      <ww-npmnameinput
        value=${this.name}
        required name="name"
        label="Package Name"
        ?validateAvailability=${!this.isImport}
        validateCustomElementName
        help-text=${msg("Both the tag of your widget and the name of your NPM package")}
      ></ww-npmnameinput>
      <ww-semverinput
        .value=${this.version as any}
        required
        name="version"
        label="Version"
      ></ww-semverinput>
      <ww-combobox
        .value=${this.keywords.slice(1)}
        name="keywords"
        multiple
        label="Keywords"
        help-text=${msg("Help the user find your widget")}>
        <sl-tag
          size="small"
          slot="values"
          title=${msg("This keyword is required for widgets")}>
          webwriter-widget
        </sl-tag>
      </ww-combobox>
      <ww-licenseinput
        .value=${this.license as any}
        suggestions
        name="license"
        label="License">
        ${RECOMMENDED_LICENSES.map(license => html`
          <sl-option value=${license.key}>
            ${license.name}
          </sl-option>
        `)}
      </ww-licenseinput>
      <ww-personinput
        .value=${this.author as any}
        name="author"
        label="Author"
      ></ww-personinput>
      <div id="create-fields">
        <sl-select 
          value=${this.preset}
          name="preset"
          value="lit"
          label="Preset">
          <sl-option value="lit">Lit</sl-option>
          <sl-option value="none">None</sl-option>
        </sl-select>
        <sl-checkbox
          name="generateLicense"
          ?checked=${this.generateLicense}>
          ${msg(html`Generate a <code>LICENSE</code> file`)}
        </sl-checkbox>
        <sl-checkbox
          name="enableLiveReload"
          ?checked=${this.enableLiveReload}>
          ${msg("Enable live reload")}
        </sl-checkbox>
      </div>
      <footer id="form-buttons">
        <ww-button
          id="reset"
          outline 
          variant="danger"
          @click=${this.reset}>
          ${!this.defaultValueChanged? msg("Reset"):msg("Reset changes")}
        </ww-button>
        <ww-button
          outline 
          variant="neutral"
          @click=${this.handleCancel}>
          ${!this.defaultValueChanged? msg("Cancel"):msg("Discard and cancel")}
        </ww-button>
        <ww-button
          variant="primary"
          type="submit"
          ?loading=${this.loading}
          @click=${this.handleSubmit}>
          ${this.confirmText}
        </ww-button>
      </footer>
    </form>`
  }
}