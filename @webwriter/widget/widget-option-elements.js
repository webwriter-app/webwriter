import { LitElement, css, html, nothing } from "lit";
import { defineLanguagePicker } from "./language-picker.js";
import { renderWidgetOptionField, renderWidgetOptions, widgetOptionControlStyles } from "./widget-option-controls.js";
import { widgetActionRows } from "./widget-options.js";
import { LanguagePicker, defineLanguagePicker as defineLanguagePicker2 } from "./language-picker.js";
const styles = [widgetOptionControlStyles, css`
  :host {display: block; min-inline-size: 0;}
  :host([hidden]) {display: none;}
  .widget-options {min-width: 0;}
  .develop-field {display: flex; flex-direction: column; gap: .25rem;}
  .develop-field-help {display: block; font-size: .75em;}
  .widget-action-group {display: flex; flex-wrap: wrap; gap: .25rem;}
`];
class WidgetOptionField extends LitElement {
  static properties = { option: { attribute: false } };
  static styles = styles;
  render() {
    const option = this.option;
    if (!option || option.hidden) return nothing;
    return html`<div class="widget-options" part="field">${renderWidgetOptionField(option, (name, value) => {
      if (this.isConnected && this.option === option) {
        this.dispatchEvent(new CustomEvent("widget-option-change", {
          bubbles: true,
          composed: true,
          detail: { name, value }
        }));
      }
    })}</div>`;
  }
}
class WidgetOptions extends LitElement {
  static properties = {
    options: { attribute: false },
    actions: { attribute: false },
    groups: { attribute: false }
  };
  static styles = styles;
  constructor() {
    super();
    this.options = [];
    this.actions = [];
    this.groups = [];
  }
  render() {
    defineWidgetOptionElements();
    return renderWidgetOptions(
      this.options,
      this.actions,
      this.groups,
      (option) => html`<ww-option-field .option=${option}></ww-option-field>`,
      (actions) => this.#renderActions(actions)
    );
  }
  #renderActions(actions) {
    if (!actions.length) return nothing;
    const button = (action) => html`<div class="widget-action-item">
      <button type="button" class="widget-action" data-intent=${action.intent ?? nothing} ?disabled=${action.disabled}
        @click=${() => {
      if (action.disabled) return;
      this.dispatchEvent(new CustomEvent("widget-option-action", {
        bubbles: true,
        composed: true,
        detail: { name: action.name }
      }));
    }}>${action.label}</button>
      ${action.description ? html`<span class="develop-field-help">${action.description}</span>` : nothing}
      ${action.disabled && action.disabledReason ? html`<span class="develop-field-help">${action.disabledReason}</span>` : nothing}
      ${action.error ? html`<span role="alert">${action.error}</span>` : nothing}
    </div>`;
    return html`<div class="widget-actions">${widgetActionRows(actions).map((row) => row.length === 1 ? button(row[0]) : html`<div class="choice-group widget-action-group" role="group">${row.map(button)}</div>`)}</div>`;
  }
}
function defineWidgetOptionElements() {
  const registry = globalThis.customElements;
  if (!registry) return;
  defineLanguagePicker();
  if (!registry.get("ww-option-field")) registry.define("ww-option-field", WidgetOptionField);
  if (!registry.get("ww-widget-options")) registry.define("ww-widget-options", WidgetOptions);
}
export {
  LanguagePicker,
  WidgetOptionField,
  WidgetOptions,
  defineLanguagePicker2 as defineLanguagePicker,
  defineWidgetOptionElements
};
