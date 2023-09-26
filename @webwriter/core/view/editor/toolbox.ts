import { LitElement, TemplateResult, css, html } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { styleMap } from "lit/directives/style-map.js"

import { camelCaseToSpacedCase, prettifyPackageName, unscopePackageName } from "../../utility"
import { Mark } from "prosemirror-model"
import { classMap } from "lit/directives/class-map.js"
import { localized, msg } from "@lit/localize"
import { CommandEntry, CommandEvent } from "../../viewmodel"
import { spreadProps } from "@open-wc/lit-helpers"
import "../elements/stylepickers"

import { ifDefined } from "lit/directives/if-defined.js"

@localized()
@customElement("ww-toolbox")
export class Toolbox extends LitElement {

  @query("div")
  div: HTMLElement

  cleanup: CallableFunction

  inlineTooltip: boolean = false

	emitChangeWidget = (name: string) => {
		this.dispatchEvent(new CustomEvent("ww-change-widget", {composed: true, bubbles: true, detail: {name: unscopePackageName(name)}}))
	}

	emitCommand = (id: string) => {
		this.dispatchEvent(CommandEvent(id))
	}

	@property({type: Array, attribute: false})
	inlineCommands: CommandEntry[] = []

  @property({type: Object, attribute: false})
  fontFamilyCommand: CommandEntry

  @property({type: Object, attribute: false})
  fontSizeCommand: CommandEntry

  @property({type: Array, attribute: false})
	blockCommands: CommandEntry[] = []

  @property({type: Object, attribute: false})
  activeElement: HTMLElement | null

  emitDeleteWidget = () => this.dispatchEvent(
    new CustomEvent("ww-delete-widget", {composed: true, bubbles: true, detail: {
      widget: this.activeElement
    }})
  )

  emitMouseEnterDeleteWidget = () => this.dispatchEvent(
    new CustomEvent("ww-mouse-enter-delete-widget", {composed: true, bubbles: true, detail: {
      widget: this.activeElement
    }})
  )

  emitMouseLeaveDeleteWidget = () => this.dispatchEvent(
    new CustomEvent("ww-mouse-leave-delete-widget", {composed: true, bubbles: true, detail: {
      widget: this.activeElement
    }})
  )

  emitInlineFieldInput = (markType: string, key: string, value: string | number | boolean) => this.dispatchEvent(
    new CustomEvent("ww-inline-field-input", {composed: true, bubbles: true, detail: {
      element: this.activeElement, key, value, markType
    }})
  )

  emitClickName = (widget?: Element) => this.dispatchEvent(
    new CustomEvent("ww-click-name", {composed: true, bubbles: true, detail: {
      widget
    }})
  )

  get isActiveElementContainer() {
    return !this.activeElement?.classList?.contains("ww-widget") ?? false
  }

  get isActiveElementWidget() {
    return this.activeElement?.classList?.contains("ww-widget") ?? false
  }

  static get styles() {
    return css`

      sl-icon {
        width: unset;
        height: unset;
      }

      :host {
        user-select: none;
        -webkit-user-select: none;
        background: var(--sl-color-gray-100);
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 32px;
        align-items: center;
        user-select: none;
        -webkit-user-select: none;
        font-size: 0.95rem;
        margin-right: 2ch;
        align-items: flex-start;
        padding-bottom: 1ch;
      }

      :host > * {
        max-width: 200px;
      }

      #name:hover {
        color: var(--sl-color-primary-600);
      }

      .delete:hover::part(base) {
        color: var(--sl-color-danger-600);
      }

      sl-icon-button::part(base) {
        padding: var(--sl-spacing-3x-small);
      }

      .inline-commands {
        font-size: 1.25rem;
        display: inline-flex;
        flex-direction: row;
        align-items: center;
        --icon-size: 20px;
      }

      .inline-commands.applied {
        background: var(--sl-color-primary-200) !important;
        border-radius: 4px;
      }

      .color sl-button::part(base) {
        padding-bottom: 0;
      }

      .color {
        display: flex;
        flex-direction: column;
        font-size: 0px;
      }

      .color:hover sl-color-picker::part(trigger)::before, .color:hover sl-color-picker::part(trigger) {
        height: 20px;
        border-bottom: none;
      } 

      .color sl-color-picker::part(trigger) {
        font-size: 0px;
        height: 6px;
        width: 20px;
        background: transparent;
      }

      .color sl-color-picker::part(base) {
        background: var(--sl-color-gray-300);
      }

      .color sl-color-picker::part(trigger)::before {
        border-radius: 2px;
        border: none;
        width: 20x;
        box-shadow: none;
      }

      :is(.inline-commands, .block-command):not(.color) sl-color-picker {
        display: none;
      }

      div[part=inline-commandss] {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 3px;
      }

      .inline-commands:not(.applied) .field {
        display: none;
      }

      .field, .field::part(base), .field::part(input) {
        height: 25px;
        font-size: 0.65rem;
      }

      .field::part(input) {
        padding: 1ch;
      }

      .block-toolbox {
        display: flex;
        flex-direction: column;
        gap: 24px;
        width: 100%;
      }

      .block-header {
        display: flex;
        flex-direction: row;
        align-items: flex-end;
        gap: 1ch;
        box-sizing: border-box;
        height: 2rem;
        border-bottom: 2px solid var(--sl-color-gray-600);
        color: var(--sl-color-gray-800);
        align-self: stretch;
        padding-right: 5px;
        --icon-size: 24px;
        font-size: 1.125rem;
        padding-bottom: 5px;
      }
 
      .container-picker-select sl-option::part(checked-icon) {
        display: none;
      }

      .container-picker-select sl-option::part(base) {
        padding: 0;
      }

      .container-picker-select sl-option::part(label) {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        padding: 0.25rem;
        gap: 1rem;
      }

      .container-picker:has(.container-picker-select[open]) {
        background-color: white;
        transition: background-color 0.1s;
        box-shadow: var(--sl-shadow-medium);
        border: 1px solid var(--sl-color-neutral-800);
        border-radius: var(--sl-border-radius-small);
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
      }

      .container-picker-select:not([open]) {
        background: white;
        box-shadow: var(--sl-shadow-medium);
        border: 1px solid var(--sl-color-neutral-800);
        border-radius: var(--sl-border-radius-small);
      }

      .container-picker-select::part(combobox) {
        border: 1px solid transparent;
        box-shadow: unset;
        min-height: unset;
        height: 32px;
        width: 32px;
        padding: 4px;
        --icon-size: 24px;
      }

      .container-picker #name {
        padding: 0.25rem;
        padding-right: 1rem;
        flex-grow: 1;
      }

      .container-picker:has(.container-picker-select[open]) #name {
        margin-left: 0.75px;
      }

      .container-picker-select::part(listbox) {
        min-width: 300px;
        padding: 0;
        width: max-content;
        border: 1px solid var(--sl-color-neutral-800);
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        margin-left: -1px;
        margin-top: 1px;
      }

      .container-picker-select::part(display-input) {
        display: none;
      }


      div[part=inline-commandss] {
        display: flex;
        justify-content: space-between;
      }

      div[part=block-commands] {
        display: flex;
        margin-top: 2px;
      }

      div[part=block-commands] #name {
        margin-right: auto;
      }

      .widget-name {
        text-decoration: solid underline var(--sl-color-primary-400) 2px;
        cursor: pointer;
      }

      .block-command.applied {
        background: var(--sl-color-primary-200);
        border-radius: 4px;
      }

      .block-command ww-button::part(icon) {
        width: 24px;
        height: 24px;
        --icon-size: 24px;
      }

      .block-option:not([data-secondary])::part(base) {
        height: 3rem;
      }

      .block-option:not([data-secondary]) > sl-icon {
        --icon-size: 28px;
      }

      .block-option[data-secondary] > sl-icon {
        --icon-size: 20px;
      }


      .block-option[data-secondary]::part(label) {
        padding: 0.5rem;
      }

      .block-option[data-secondary] span {
        display: none;
      }

      .secondary-options {
        margin-left: auto;
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
      }

      .block-option[aria-selected=true] .block-option[aria-selected=false]:not(:hover)::part(label) {
        color: white;
      }

      .block-option[data-secondary] .secondary-options {
        display: none;
      }

      .block-option[data-secondary]::part(base):hover {
        background: var(--sl-color-gray-200);
      }

      .divider {
        display: none;
        width: calc(100% - 10px);
        border-bottom: 1px solid var(--sl-color-gray-600);
        border-left: 0;
        border-right: 0;
        margin-top: 10px;
        margin-bottom: 9px;
        margin-left: 5px;
        margin-right: 5px;
      }

      .pickers {
        display: grid;
        gap: 16px 8px;
        grid-template-columns: 1fr 1fr;
        grid-auto-rows: 40px;
        grid-auto-flow: dense;
      }

      .pickers:not(:has( *)) {
        display: none;
      }

      .picker#blockBorder, .picker#blockTextAlign {
        grid-column: span 2;
      }

      .picker {
        border: 1px solid var(--sl-color-gray-800);
        padding: 4px;
        border-radius: var(--sl-border-radius-small);
        position: relative;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
      }

      .picker > * {
        --sl-input-focus-ring-color: transparent;
      }

      .picker:focus-within {
        outline: var(--sl-focus-ring);
        outline-color: var(--sl-input-focus-ring-color);
      }

      .picker:focus-within .picker-icon {
        color: var(--sl-color-primary-700);
      }

      .picker-icon {
        position: absolute;
        top: -15px;
        left: 5px;
        --icon-size: 20px;
        width: 20px;
        height: 20px;
        background: var(--sl-color-gray-100);
        color: var(--sl-color-primary-600);
      }

      .inline-toolbox {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
        grid-template-rows: min-content min-content min-content;
        position: relative;
        gap: 4px;
      }

      #inline-toolbox-label {
        position: absolute;
        top: 0;
        right: 5px;
        font-size: 0.75rem;
        font-weight: 600;
        display: flex;
        justify-content: flex-end;
        align-items: flex-end;
        gap: 1ch;
        border-bottom: 2px solid var(--sl-color-gray-600);
        color: var(--sl-color-gray-800);
      }

      #inline-toolbox-label sl-icon {
        height: 1em;
        width: 1em;
      }

      .inline-toolbox ww-fontpicker {
        grid-column: span 4;
        grid-row: span 2;
        order: 0;
      }

      .inline-toolbox .inline-commands.color {
        grid-row: span 2;
        order: 1;
        justify-content: flex-start;
        flex-direction: column-reverse;
      }

      .inline-toolbox .inline-field-group {
        grid-column: span 6;
        order: 3;
        color: var(--sl-color-primary-600);
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0.5ch;
        margin-top: 0.5ch;
      }

      .inline-toolbox .inline-field-group sl-input {
        flex-grow: 1;
      }

      .inline-toolbox .inline-field-group sl-input::part(base):not(:active):not(:focus-within) {
        background: none;
      }

      .inline-toolbox .inline-commands {
        order: 2;
      }

      .block-options {
        display: flex;
        flex-direction: column;
      }
      
    `
  }

  InlineCommands = () => this.inlineCommands.filter(cmd => !cmd.tags?.includes("inline")).map(v => {
    const classes = {
      "inline-commands": true,
      "applied": Boolean(v.active),
      "color": v.tags?.includes("color") ?? false
    }
		return html`
    <span class=${classMap(classes)}>
      <ww-button
        ${spreadProps(v)}
        tabindex=${0}
        name=${v.icon ?? "circle-fill"}
        @click=${() => this.dispatchEvent(CommandEvent(v.id))}
        variant="icon"
      ></ww-button>
      <sl-color-picker value=${v.value}></sl-color-picker>
    </span>
    `
	})

  BlockCommands = () => this.blockCommands.map(v => {

    const classes = {
      "block-command": true,
      "applied": Boolean(v.active),
      "color": v.tags?.includes("color") ?? false
    }

		return html`
    <span id=${v.id} class=${classMap(classes)}>
      <ww-button
        inert disabled style="color: darkgray"
        ${spreadProps(v)}
        tabindex=${0}
        name=${v.icon ?? "circle-fill"}
        @click=${() => this.dispatchEvent(CommandEvent(v.id))}
        variant="icon"
      ></ww-button>
    </span>
    `
	})

  Pickers = () => this.blockCommands.map(v => {
    let picker = null
    if(!v.active) {
      return null
    }
    if(v.id === "border") {
      picker = html`
        <ww-borderpicker></ww-borderpicker>
      `
    }
    else if(v.id === "padding") {
      picker = html`
        <ww-paddingpicker></ww-paddingpicker>
      `
    }
    else if(v.id === "margin") {
      picker = html`
        <ww-marginpicker></ww-marginpicker>
      `
    }
    else if(v.id === "lineHeight") {
      picker = html`
        <ww-lineheightpicker value=${v.value} @change=${(e: any) => this.dispatchEvent(CommandEvent(v.id, {value: e.target.value}))}></ww-lineheightpicker>
      `
    }
    else if(v.id === "background") {
      picker = html`
        <ww-backgroundpicker value=${v.value} @change=${(e: any) => this.dispatchEvent(CommandEvent(v.id, {value: e.target.value}))}></ww-backgroundpicker>
      `
    }
    else if(v.id === "textAlign") {
      picker = html`
        <ww-alignmentpicker value=${v.value} @change=${(e: any) => this.dispatchEvent(CommandEvent(v.id, {value: e.target.value}))}></ww-alignmentpicker>
      `
    }

    return picker? html`<div class="picker" id=${v.id}>
      ${picker}
      <ww-button variant="icon" class="picker-icon" icon=${v.icon ?? "square"}></ww-button>
    </div>`: null

  })

  BlockToolbox = () => {
    return html`<div class="block-toolbox">
      <div class="block-options">
        ${this.BlockHeader()}
        <div part="block-commands">
          ${this.BlockCommands()}
        </div>
      </div>
      ${this.InlineToolbox()}
      </div>
      <div class="pickers">
        ${this.Pickers()}
      </div>
    `
  }

  InlineToolbox = () => {
    const fontFamilies = this.fontFamilyCommand.value
    const fontSizes = this.fontSizeCommand.value
    return html`<div class="inline-toolbox">
      <ww-fontpicker
        fontFamily=${ifDefined(fontFamilies.length > 0? fontFamilies[0]: undefined)}
        fontSize=${ifDefined(fontSizes.length > 0? fontSizes[0]: undefined)}
        recommendedOnly
        @ww-change-font-family=${(e: any) => this.dispatchEvent(CommandEvent(this.fontFamilyCommand.id, e.detail))}
        @ww-change-font-size=${(e: any) => this.dispatchEvent(CommandEvent(this.fontSizeCommand.id, e.detail))}
      ></ww-fontpicker>
      ${this.InlineCommands()}
      ${this.ActiveInlineFields()}
      <span id="inline-toolbox-label">
        ${msg("Text")}
        <sl-icon name="text-size"></sl-icon>
      </span>
    </div>`
  }

  ActiveInlineFields = () => {
    const cmds = this.inlineCommands.filter(cmd => cmd.active && cmd.fields)
    return cmds.map(cmd => html`<div class="inline-field-group">
      <sl-icon name=${cmd.icon ?? "square"}></sl-icon>
      ${Object.entries(cmd.fields!).map(([key, field]) => this.InlineCommandField(cmd.id, key, field.type, field.placeholder))}
    </div>`)
  }

  BlockOption: (cmd: CommandEntry) => TemplateResult = (cmd: CommandEntry) => {
    const groupedCommands = this.blockCommands.filter(otherCmd => cmd.group && otherCmd.group === cmd.group)
    const secondary = cmd.group && (groupedCommands[0] !== cmd)
    return html`
      <sl-option title=${secondary? cmd.label ?? "": ""} class="block-option" ?data-secondary=${secondary} value=${cmd.id}>
        <sl-icon name=${cmd.icon ?? "square"}></sl-icon>
        <span>${cmd.label ?? cmd.id}</span>
        <div class="secondary-options">
          ${!secondary? groupedCommands.slice(1).map(this.BlockOption): null}
        </div>
      </sl-option>
    `
  }

  BlockHeader = () => {
    const activeCommands = this.blockCommands.filter(cmd => cmd.active ?? false)
    const activeBlockCommand = activeCommands.length === 1
      ? activeCommands[0]
      : undefined
    return html`<div @click=${() => this.emitClickName()} class="block-header">
      <sl-icon class="current-icon" slot="prefix" name=${activeBlockCommand?.icon ?? "asterisk"}></sl-icon>
      <span tabIndex=${-1} id="name">
        ${activeBlockCommand?.label ?? msg(`Mixed Content`)}
      </span>
    </div>`
  }

  InlineCommandField = (markType: string, key: string, type: "string" | "number" | "boolean", placeholder?: string, value?: any) => {
    if(type === "string" || type === "number") {
      return html`<sl-input 
        value=${value ?? ""}
        placeholder=${placeholder ?? ""}
        class="field" 
        type=${type === "string"? "text": "number"}
        @sl-input=${(e: any) => this.emitInlineFieldInput(markType, key, e.target.value)}
      ></sl-input>`
    }
    else {
      return html`<sl-checkbox class="field"></sl-checkbox>`
    }
  }

  render() {
    if(this.activeElement && this.isActiveElementContainer) {
      return this.BlockToolbox()
    }
    else if(this.activeElement && this.isActiveElementWidget) {
      const name = prettifyPackageName(this.activeElement.tagName.toLowerCase())
      return html`
        <span class="widget-name" id="name" @click=${() => this.emitClickName(this.activeElement ?? undefined)} title=${this.activeElement.id}>${name}</span>
        <!--<sl-icon-button class="meta" title="Edit metadata" name="tags"></sl-icon-button>-->
        <sl-icon-button tabindex="-1" class="delete" title="Delete widget" name="trash" @click=${this.emitDeleteWidget} @mouseenter=${this.emitMouseEnterDeleteWidget} @mouseleave=${this.emitMouseLeaveDeleteWidget}></sl-icon-button>
      `
    }
    else {
      return null
    }
  }
}