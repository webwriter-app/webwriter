import {LitElement, css, html, nothing} from "lit"
import {defineLanguagePicker} from "./language-picker.js"
import {renderWidgetOptionField, renderWidgetOptions, widgetOptionControlStyles} from "./widget-option-controls.js"
import {widgetActionRows, type WidgetActionState, type WidgetOptionGroupState, type WidgetOptionState, type WidgetOptionValue} from "./widget-options.js"

export {LanguagePicker, defineLanguagePicker} from "./language-picker.js"

export type WidgetOptionChangeDetail = {name: string, value: WidgetOptionValue}
export type WidgetOptionActionDetail = {name: string}

const styles = [widgetOptionControlStyles, css`
  :host {display: block; min-inline-size: 0;}
  :host([hidden]) {display: none;}
  .widget-options {min-width: 0;}
  .develop-field {display: flex; flex-direction: column; gap: .25rem;}
  .develop-field-help {display: block; font-size: .75em;}
  .widget-action-group {display: flex; flex-wrap: wrap; gap: .25rem;}
`]

/** Renders one normalized option. Apply `widget-option-change` to the owning widget and supply its updated state. */
export class WidgetOptionField extends LitElement {
  static properties = {option: {attribute: false}}
  static styles = styles

  declare option: WidgetOptionState | undefined

  protected render() {
    const option = this.option
    if(!option || option.hidden) return nothing
    return html`<div class="widget-options" part="field">${renderWidgetOptionField(option, (name, value) => {
      if(this.isConnected && this.option === option) {
        this.dispatchEvent(new CustomEvent<WidgetOptionChangeDetail>("widget-option-change", {
          bubbles: true, composed: true, detail: {name, value},
        }))
      }
    })}</div>`
  }
}

/** Renders options, actions and their groups for any host. The host handles the emitted changes and action requests. */
export class WidgetOptions extends LitElement {
  static properties = {
    options: {attribute: false},
    actions: {attribute: false},
    groups: {attribute: false},
  }
  static styles = styles

  declare options: WidgetOptionState[]
  declare actions: WidgetActionState[]
  declare groups: readonly WidgetOptionGroupState[]

  constructor() {
    super()
    this.options = []
    this.actions = []
    this.groups = []
  }

  protected render() {
    defineWidgetOptionElements()
    return renderWidgetOptions(this.options, this.actions, this.groups,
      option => html`<ww-option-field .option=${option}></ww-option-field>`,
      actions => this.#renderActions(actions))
  }

  #renderActions(actions: WidgetActionState[]) {
    if(!actions.length) return nothing
    const button = (action: WidgetActionState) => html`<div class="widget-action-item">
      <button type="button" class="widget-action" data-intent=${action.intent ?? nothing} ?disabled=${action.disabled}
        @click=${() => {
          if(action.disabled) return
          this.dispatchEvent(new CustomEvent<WidgetOptionActionDetail>("widget-option-action", {
            bubbles: true, composed: true, detail: {name: action.name},
          }))
        }}>${action.label}</button>
      ${action.description ? html`<span class="develop-field-help">${action.description}</span>` : nothing}
      ${action.disabled && action.disabledReason ? html`<span class="develop-field-help">${action.disabledReason}</span>` : nothing}
      ${action.error ? html`<span role="alert">${action.error}</span>` : nothing}
    </div>`
    return html`<div class="widget-actions">${widgetActionRows(actions).map(row => row.length === 1
      ? button(row[0])
      : html`<div class="choice-group widget-action-group" role="group">${row.map(button)}</div>`)}</div>`
  }
}

/**
 * Registers `<ww-option-field>`, `<ww-widget-options>`, and `<ww-language-picker>`.
 * The field takes an `option` property. The renderer takes `options`, `actions`
 * and `groups` properties. Listen for `widget-option-change` and
 * `widget-option-action` to apply changes and run actions on the owning widget.
 */
export function defineWidgetOptionElements() {
  const registry = globalThis.customElements
  if(!registry) return
  defineLanguagePicker()
  if(!registry.get("ww-option-field")) registry.define("ww-option-field", WidgetOptionField)
  if(!registry.get("ww-widget-options")) registry.define("ww-widget-options", WidgetOptions)
}

declare global {
  interface HTMLElementTagNameMap {
    "ww-option-field": WidgetOptionField
    "ww-widget-options": WidgetOptions
  }
  interface HTMLElementEventMap {
    "widget-option-change": CustomEvent<WidgetOptionChangeDetail>
    "widget-option-action": CustomEvent<WidgetOptionActionDetail>
  }
}
