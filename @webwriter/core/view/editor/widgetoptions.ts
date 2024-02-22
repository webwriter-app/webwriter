import { LitElement, html, css } from "lit"
import { customElement, property } from "lit/decorators.js"
import {ifDefined} from "lit/directives/if-defined.js"
import { localized } from "@lit/localize"

import { OptionDeclaration, BooleanOptionDeclaration, ColorOptionDeclaration, DateOptionDeclaration, DatetimeLocalOptionDeclaration, EmailOptionDeclaration, NumberOptionDeclaration, ObjectOptionDeclaration, PasswordOptionDeclaration, SelectOptionDeclaration, StringOptionDeclaration, TelOptionDeclaration, TimeOptionDeclaration, UrlOptionDeclaration, LitElementWw } from "@webwriter/lit"
import { capitalizeWord } from "../../utility"

function getLocalized(localizationObj?: Record<string, string>) {
  const obj = localizationObj ?? {}
  return obj[document.documentElement.lang] ?? Object.values(obj)[0] ?? undefined
}

@localized()
@customElement("ww-widget-options")
export class WidgetOptions extends LitElement {

  @property({attribute: false})
  widget: HTMLElement | LitElement | LitElementWw

  get options() {
    const proto = this.widget.constructor
    if("options" in proto) {
      const staticOptions = (proto as typeof LitElementWw).options
      const options = (this.widget as LitElementWw).options
      return {...staticOptions, ...options}
    }
    else {
      return {}
    }
  }

  render() {
    return Object.entries(this.options).map(([k, v]) => this.Option(k, v))
  }

  Option(attr: string, decl: OptionDeclaration) {
    if(decl.type === "color") {
      return this.ColorOption(attr, decl)
    }
    else if(decl.type === "boolean" || (decl.type as any)?.name === "Boolean") {
      return this.BooleanOption(attr, decl as BooleanOptionDeclaration)
    }
    else if(decl.type === "select") {
      return this.SelectOption(attr, decl)
    }
    else {
      return this.InputOption(attr, decl as any)
    }
  }

  setWidgetAttribute(el: HTMLElement, key: string, value?: string | boolean) {
    typeof value === "boolean" || value === undefined
      ? el.toggleAttribute(key, !!value)
      : el.setAttribute(key, value)
    el.ownerDocument.body.focus()
    // this.dispatchEvent(new CustomEvent("ww-set-attribute", {bubbles: true, composed: true, detail: {el, key, value}}))
  }

  BooleanOption(attr: string, decl: BooleanOptionDeclaration) {
    const checked = !!this.widget?.hasAttribute(attr)
    return html`<sl-switch
      size="small"
      ?checked=${checked}
      @sl-change=${(e: any) => this.setWidgetAttribute(this.widget, attr, e.target.checked)} title=${getLocalized(decl.description)}
    >
      ${getLocalized(decl.label) ?? capitalizeWord(attr)}
    </sl-switch>`
  }

  InputOption(attr: string, decl: StringOptionDeclaration | NumberOptionDeclaration | DateOptionDeclaration | DatetimeLocalOptionDeclaration | EmailOptionDeclaration | PasswordOptionDeclaration |TelOptionDeclaration | TimeOptionDeclaration | UrlOptionDeclaration) {
    const value = this.widget?.getAttribute(attr) ?? undefined
    const type = (typeof decl.type === "string"? decl.type: decl.type?.name.toLowerCase().replace("string", "text")) ?? "text"
    console.log("input")
    return html`<sl-input
      @sl-change=${(e: any) => this.setWidgetAttribute(this.widget, attr, e.target.value)}
      size="small"
      value=${ifDefined(value)}
      label=${getLocalized(decl.label) ?? capitalizeWord(attr)}
      title=${ifDefined(getLocalized(decl.description))}
      placeholder=${ifDefined(getLocalized(decl.placeholder))}
      type=${type as any}
      minlength=${ifDefined(decl.minlength)}
      maxlength=${ifDefined(decl.minlength)}
      autocapitalize=${ifDefined(decl.autocapitalize)}
      spellcheck=${ifDefined(decl.spellcheck)}
      autocapitalize=${ifDefined(decl.autocapitalize)}
      min=${ifDefined((decl as any).min)}
      max=${ifDefined((decl as any).max)}
      step=${ifDefined((decl as any).step)}
    ></sl-input>`
  }

  ObjectOption(attr: string, decl: ObjectOptionDeclaration) {
    // TODO
  }

  ColorOption(attr: string, decl: ColorOptionDeclaration) {
    const value = this.widget?.getAttribute(attr) ?? undefined
    return html`<sl-color-picker
        value=${ifDefined(value)}
        @sl-change=${(e: any) => this.setWidgetAttribute(this.widget, attr, e.target.value)}
        .swatches=${decl.swatches ?? []}
      >
    </sl-color-picker>`
  }

  SelectOption(attr: string, decl: SelectOptionDeclaration) {
    const value = this.widget?.getAttribute(attr) ?? undefined
    return html`<sl-select
      size="small"
      label=${ifDefined(getLocalized(decl.label))}
      title=${ifDefined(decl.description)}
      value=${ifDefined(value)}
      ?multiple=${!!decl.multiple}
      @sl-change=${(e: any) => this.setWidgetAttribute(this.widget, attr, e.target.value)}
    >
      ${decl.options?.map(opt => html`
        <sl-option value=${opt.value} title=${ifDefined(getLocalized(opt.description))}>
          ${getLocalized(opt.label) ?? capitalizeWord(opt.value)}
        </sl-option>
      `)}
    </sl-select>`
  }
}