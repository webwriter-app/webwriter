import { LitElement, html, css } from "lit"
import { customElement, property } from "lit/decorators.js"
import {ifDefined} from "lit/directives/if-defined.js"
import { localized } from "@lit/localize"

import { OptionDeclaration, BooleanOptionDeclaration, ColorOptionDeclaration, DateOptionDeclaration, DatetimeLocalOptionDeclaration, EmailOptionDeclaration, NumberOptionDeclaration, ObjectOptionDeclaration, PasswordOptionDeclaration, SelectOptionDeclaration, StringOptionDeclaration, TelOptionDeclaration, TimeOptionDeclaration, UrlOptionDeclaration, LitElementWw, ActionDeclaration, } from "@webwriter/lit"
import { camelCaseToSpacedCase, capitalizeWord, emitCustomEvent } from "../../model/utility"
import { EditorState } from "prosemirror-state"

function getLocalized(localizationObj?: Record<string, string>) {
  const obj = localizationObj ?? {}
  return obj[document.documentElement.lang] ?? Object.values(obj)[0] ?? undefined
}

@localized()
@customElement("ww-widget-options")
export class WidgetOptions extends LitElement {

  static styles = css`

    :host {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .action-button, .action-button::part(base) {
      width: 100%;
    }
  `

  @property({attribute: false})
  widget: HTMLElement | LitElement | LitElementWw

  @property({attribute: false})
  editorState: EditorState

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

  get actions() {
    const proto = this.widget.constructor
    if("actions" in proto) {
      const staticActions = (proto as typeof LitElementWw).actions
      const actions = (this.widget as LitElementWw).actions
      return {...staticActions, ...actions}
    }
    else {
      return {}
    }
  }

  render() {
    return [
      ...Object.entries(this.options).map(([k, v]) => this.Option(k, v)),
      ...Object.entries(this.actions).map(([k, v]) => this.Action(k, v))
    ]
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

  async handleActionClick(funcName: string) {
    await (this.widget as any)[funcName]()
    emitCustomEvent(this, "ww-focus-editor")
  }

  Action(funcName: string, decl: ActionDeclaration) {
    return html`<sl-button class="action-button" size="small" title=${ifDefined(decl?.description)} @click=${() => this.handleActionClick(funcName)}>
      ${decl?.label?._ ?? camelCaseToSpacedCase(funcName, true)}
    </sl-button>`
  }

  setWidgetAttribute(el: HTMLElement, key: string, value?: string | boolean) {
    /*typeof value === "boolean" || value === undefined
      ? el.toggleAttribute(key, !!value)
      : el.setAttribute(key, value)
    el.children.length? el.ownerDocument.body.focus(): el.focus()*/
    this.dispatchEvent(new CustomEvent("ww-set-attribute", {bubbles: true, composed: true, detail: {el, key, value}}))
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
    console.log(attr, value)
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
      min=${ifDefined((decl as any).min)}
      max=${ifDefined((decl as any).max)}
      step=${ifDefined((decl as any).step)}
    >
      <sl-icon-button slot="suffix" name="corner-down-left"></sl-icon-button>
    </sl-input>`
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
    const value = this.widget?.getAttribute(attr) ?? undefined ?? (decl?.options ?? [])[0]?.value
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