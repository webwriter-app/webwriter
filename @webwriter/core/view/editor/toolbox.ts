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
	markCommands: CommandEntry[] = []

  @property({type: Object, attribute: false})
  fontFamilyCommand: CommandEntry

  @property({type: Object, attribute: false})
  fontSizeCommand: CommandEntry

  @property({type: Array, attribute: false})
	blockCommands: CommandEntry[] = []

  @property({type: Array, attribute: false})
  containerCommands: CommandEntry[] = []

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

  emitMarkFieldInput = (markType: string, key: string, value: string | number | boolean) => this.dispatchEvent(
    new CustomEvent("ww-mark-field-input", {composed: true, bubbles: true, detail: {
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

      .mark-command {
        font-size: 1.25rem;
        display: inline-flex;
        flex-direction: row;
        align-items: center;
        --icon-size: 20px;
      }

      .mark-command.applied {
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

      :is(.mark-command, .paragraph-command):not(.color) sl-color-picker {
        display: none;
      }

      div[part=mark-commands] {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 3px;
      }

      .mark-command:not(.applied) .field {
        display: none;
      }

      .field, .field::part(base), .field::part(input) {
        height: 25px;
        font-size: 0.65rem;
      }

      .field::part(input) {
        padding: 1ch;
      }

      .container-toolbox {
        display: flex;
        flex-direction: column;
        gap: 24px;
        width: 100%;
      }

      .container-header {
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


      div[part=mark-commands] {
        display: flex;
        justify-content: space-between;
      }

      div[part=paragraph-commands] {
        display: flex;
        margin-top: 2px;
      }

      div[part=paragraph-commands] #name {
        margin-right: auto;
      }

      .widget-name {
        text-decoration: solid underline var(--sl-color-primary-400) 2px;
        cursor: pointer;
      }

      .paragraph-command.applied {
        background: var(--sl-color-primary-200);
        border-radius: 4px;
      }

      .paragraph-command ww-button::part(icon) {
        width: 24px;
        height: 24px;
        --icon-size: 24px;
      }

      .container-option:not([data-secondary])::part(base) {
        height: 3rem;
      }

      .container-option:not([data-secondary]) > sl-icon {
        --icon-size: 28px;
      }

      .container-option[data-secondary] > sl-icon {
        --icon-size: 20px;
      }


      .container-option[data-secondary]::part(label) {
        padding: 0.5rem;
      }

      .container-option[data-secondary] span {
        display: none;
      }

      .secondary-options {
        margin-left: auto;
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
      }

      .container-option[aria-selected=true] .container-option[aria-selected=false]:not(:hover)::part(label) {
        color: white;
      }

      .container-option[data-secondary] .secondary-options {
        display: none;
      }

      .container-option[data-secondary]::part(base):hover {
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

      .mark-toolbox {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
        grid-template-rows: min-content min-content min-content;
        position: relative;
        gap: 4px;
      }

      #mark-toolbox-label {
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

      #mark-toolbox-label sl-icon {
        height: 1em;
        width: 1em;
      }

      .mark-toolbox ww-fontpicker {
        grid-column: span 4;
        grid-row: span 2;
        order: 0;
      }

      .mark-toolbox .mark-command.color {
        grid-row: span 2;
        order: 1;
        justify-content: flex-start;
        flex-direction: column-reverse;
      }

      .mark-toolbox .mark-field-group {
        grid-column: span 6;
        order: 3;
        color: var(--sl-color-primary-600);
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0.5ch;
        margin-top: 0.5ch;
      }

      .mark-toolbox .mark-field-group sl-input {
        flex-grow: 1;
      }

      .mark-toolbox .mark-field-group sl-input::part(base):not(:active):not(:focus-within) {
        background: none;
      }

      .mark-toolbox .mark-command {
        order: 2;
      }

      .container-options {
        display: flex;
        flex-direction: column;
      }
      
    `
  }

  MarkCommands = () => this.markCommands.filter(cmd => !cmd.tags?.includes("inline")).map(v => {
    const classes = {
      "mark-command": true,
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
      ${Object.entries(v.fields ?? {}).map(([fk, fv]) => this.MarkCommandField(v.id, fk, fv.type, fv.placeholder, v.value))}
    </span>
    `
	})

  BlockCommands = () => this.blockCommands.map(v => {

    const classes = {
      "paragraph-command": true,
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

  ContainerToolbox = () => {
    return html`<div class="container-toolbox">
      <div class="container-options">
        ${this.ContainerPicker()}
        <div part="paragraph-commands">
          ${this.BlockCommands()}
        </div>
      </div>
      ${this.MarkToolbox()}
      </div>
      <div class="pickers">
        ${this.Pickers()}
      </div>
    `
  }

  MarkToolbox = () => {
    const fontFamilies = this.fontFamilyCommand.value
    const fontSizes = this.fontSizeCommand.value
    return html`<div class="mark-toolbox">
      <ww-fontpicker
        fontFamily=${ifDefined(fontFamilies.length > 0? fontFamilies[0]: undefined)}
        fontSize=${ifDefined(fontSizes.length > 0? fontSizes[0]: undefined)}
        recommendedOnly
        @ww-change-font-family=${(e: any) => this.dispatchEvent(CommandEvent(this.fontFamilyCommand.id, e.detail))}
        @ww-change-font-size=${(e: any) => this.dispatchEvent(CommandEvent(this.fontSizeCommand.id, e.detail))}
      ></ww-fontpicker>
      ${this.MarkCommands()}
      ${this.ActiveMarkFields()}
      <span id="mark-toolbox-label">
        ${msg("Text")}
        <sl-icon name="text-size"></sl-icon>
      </span>
    </div>`
  }

  ActiveMarkFields = () => {
    const cmds = this.markCommands.filter(cmd => cmd.active && cmd.tags?.includes("inline"))
    return cmds.map(cmd => html`<div class="mark-field-group">
      <sl-icon name=${cmd.icon ?? "square"}></sl-icon>
      ${Object.entries(cmd.fields ?? {}).map(([key, field]) => this.MarkCommandField(cmd.id, key, field.type, field.placeholder))}
    </div>`)
  }

  ContainerOption: (cmd: CommandEntry) => TemplateResult = (cmd: CommandEntry) => {
    const groupedCommands = this.containerCommands.filter(otherCmd => cmd.group && otherCmd.group === cmd.group)
    const secondary = cmd.group && (groupedCommands[0] !== cmd)
    return html`
      <sl-option title=${secondary? cmd.label ?? "": ""} class="container-option" ?data-secondary=${secondary} value=${cmd.id}>
        <sl-icon name=${cmd.icon ?? "square"}></sl-icon>
        <span>${cmd.label ?? cmd.id}</span>
        <div class="secondary-options">
          ${!secondary
            ? groupedCommands.slice(1).map(this.ContainerOption)
            : null
          }
        </div>
      </sl-option>
    `
  }

  ContainerPicker = () => {
    const activeCommands = this.containerCommands.filter(cmd => cmd.active ?? false)
    const activeContainerCommand = activeCommands.length === 1
      ? activeCommands[0]
      : undefined
    return html`<div @click=${() => this.emitClickName()} class="container-header">
      <sl-icon class="current-icon" slot="prefix" name=${activeContainerCommand?.icon ?? "asterisk"}></sl-icon>
      <span tabIndex=${-1} id="name">
        ${activeContainerCommand?.label ?? msg(`Mixed Content`)}
      </span>
    </div>`
  }

  MarkCommandField = (markType: string, key: string, type: "string" | "number" | "boolean", placeholder?: string, value?: any) => {
    if(type === "string" || type === "number") {
      return html`<sl-input 
        value=${value ?? ""}
        placeholder=${placeholder ?? ""}
        class="field" 
        type=${type === "string"? "text": "number"}
        @sl-input=${(e: any) => this.emitMarkFieldInput(markType, key, e.target.value)}
      ></sl-input>`
    }
    else {
      return html`<sl-checkbox class="field"></sl-checkbox>`
    }
  }

  render() {
    if(this.activeElement && this.isActiveElementContainer) {
      return this.ContainerToolbox()
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