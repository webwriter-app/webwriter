import { localized } from "@lit/localize"
import { SlCheckbox, SlSelect, SlTabGroup } from "@shoelace-style/shoelace"
import { html, css, LitElement } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { ZodBoolean, ZodLiteral, ZodSchema, ZodUnion } from "zod"

import { Settings, SettingSpec, KeymapEntry } from "../../viewmodel"

@localized()
@customElement("ww-configurator")
export class Configurator extends LitElement {

  @property({attribute: false})
  specs: Settings

  @property({attribute: false})
  specLabels: Record<string, string>

  @property({attribute: false})
  values: Record<string, Record<string, any>>

  @property()
  activeTab: string | null 

  static get styles() {
    return css`
      :host {
        position: relative;
        height: 100%;
        display: block;
      }

      sl-tab-group {
        height: 100%;
      }

      sl-tab::part(base) {
        padding: var(--sl-spacing-small);
      }

      sl-tab-group::part(base) {
        height: 100%;
      }

      sl-tab::part(base) {
        padding-right: 2ch;
      }

      sl-tab-group::part(body) {
        padding-top: 1rem;
        overflow-y: auto;
        height: 100%;
      }

      .setting-group[active] {
        height: 100%;
      }

      sl-tab-group {
        height: 100%;
      }

      sl-tab-panel::part(base) {
        padding: var(--sl-spacing-small);
        height: 100%;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      sl-tab-panel[name=pre-a]::part(base) {
        padding: 0;
      }

      label {
        display: inline-flex;
        gap: 1ch;
      }

      .help-text {
        margin-top: var(--sl-spacing-3x-small);
        font-size: var(--sl-font-size-small);
        color: var(--sl-color-neutral-500);
      }
    `
  }

  static SettingGroup(key: string, specs: Record<string, SettingSpec>, values: Record<string, any>, onChange: (groupKey: string, key: string, value: any) => any, label: string) {
    const keys = Object.keys(specs).filter(k => !specs[k]?.hidden)
    return keys.length === 0? null: html`
      <sl-tab slot="nav" panel=${key}>
        ${label}
      </sl-tab>
      <sl-tab-panel class="setting-group" name=${key}>
        ${keys.map(k => Configurator.Setting(key, k, specs[k].schema, values[k], onChange, specs[k].label ?? k))}
      </sl-tab-panel>
    `
  }

  static Setting(groupKey: string, key: string, schema: ZodSchema, value: any, onChange: (groupKey: string, key: string, value: any) => any, label: string) {
    if(schema instanceof ZodUnion && schema._def.options.every((opt: ZodSchema) => opt instanceof ZodLiteral)) {
      const options = schema._def.options as ZodLiteral<any>[]
      return html`<sl-select value=${value} @sl-change=${(e: Event) => onChange(groupKey, key, (e.target as SlSelect).value)}>
        <label slot="label">
          ${key === "locale" && html`<sl-icon name="translate"></sl-icon>`}
          ${label}
        </label>
        <span slot="help-text">${schema.description}</span>
        ${options.map(opt => html`
          <sl-option value=${String(opt.value)}>
            ${opt.description ?? String(opt.value)}
          </sl-option>
        `)}
      </sl-select>`
    }
    else if(schema instanceof ZodBoolean) {
      return html`<sl-checkbox
        ?checked=${value}
        @sl-change=${(e: Event) => onChange(groupKey, key, (e.target as SlCheckbox).checked)}
        
      >
        <label>${label}</label><br>
        <span class="help-text">${schema.description}</span>
      </sl-checkbox>`
    }
    else {
      return html`${key}`
    }
  }

  emitChange = (groupKey: string, key: string, value: any) => this.dispatchEvent(new CustomEvent(
    "ww-change",
    {detail: {groupKey, key, value}}
  ))

  @query("sl-tab-group") tabGroup: SlTabGroup

  render() {
    const keys = Object.keys(this.specs)
    return html`
      <sl-tab-group>
        <sl-tab active slot="nav" panel="pre-a" @click=${() => this.tabGroup.show("pre-a")}>
          <slot name="pre-tab-a"></slot>
        </sl-tab>
        <sl-tab-panel name="pre-a" active>
          <slot name="pre-tab-panel-a"></slot>
        </sl-tab-panel>
        ${keys.map(k => Configurator.SettingGroup(k, this.specs[k], this.values[k], this.emitChange, this.specLabels[k]))}
        <sl-tab slot="nav" panel="post-a" @click=${() => this.tabGroup.show("post-a")}>
          <slot name="post-tab-a"></slot>
        </sl-tab>
        <sl-tab-panel name="post-a">
          <slot name="post-tab-panel-a"></slot>
        </sl-tab-panel>
      </sl-tab-group>
    `
  }
}