import { LitElement, css, html } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { styleMap } from "lit/directives/style-map.js"

import { camelCaseToSpacedCase, prettifyPackageName, unscopePackageName } from "../../utility"
import { Mark } from "prosemirror-model"
import { classMap } from "lit/directives/class-map.js"
import { localized, msg } from "@lit/localize"
import { CommandEntry, CommandEvent } from "../../viewmodel"
import { spreadProps } from "@open-wc/lit-helpers"

import { FontPicker } from "../elements"

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
  setFontFamilyCommand: CommandEntry

  @property({type: Object, attribute: false})
  setFontSizeCommand: CommandEntry

  @property({type: Array, attribute: false})
	paragraphCommands: CommandEntry[] = []

	@property({type: Array, attribute: false})
	activeMarks: Mark[]

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

  get isActiveElementText() {
    return (this.activeElement?.tagName === "P") ?? false
  }

  get isActiveElementWidget() {
    return this.activeElement?.classList?.contains("ww-widget") ?? false
  }

  static get styles() {
    return css`

      :host {
        user-select: none;
        -webkit-user-select: none;
        background: rgb(241, 241, 241);
        display: flex;
        flex-direction: row;
        gap: 0.125rem;
        align-items: center;
        user-select: none;
        -webkit-user-select: none;
        font-size: 0.95rem;
        padding-right: 1ch;
      }

      #name {
        text-decoration: underline;
        text-decoration-color: var(--sl-color-primary-400);
        text-decoration-thickness: 2px;
        cursor: pointer;
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
      }

      .mark-command.applied {
        background: var(--sl-color-primary-200);
        border-radius: 4px;
      }

      div[part=mark-commands] {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
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

      .text-toolbox {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      div[part=mark-commands] {
        display: flex;
        justify-content: space-between;
      }

      div[part=paragraph-commands] {
        display: flex;
      }

      div[part=paragraph-commands] #name {
        margin-right: auto;
      }

      .paragraph-command.applied {
        background: var(--sl-color-primary-200);
        border-radius: 4px;
      }


    `
  }

  MarkCommands = () => this.markCommands.map(v => 	{

    const classes = {
      "mark-command": true,
      "applied": Boolean(v.active)
    }
    const activeMark = this.activeMarks.find(mark => mark.type.name === null)

		return html`
    <span class=${classMap(classes)}>
      <ww-button
        ${spreadProps(v)}
        tabindex=${0}
        name=${v.icon ?? "circle-fill"}
        @click=${() => this.dispatchEvent(CommandEvent(v.id))}
        variant="icon"
      ></ww-button>
      ${Object.entries(v.fields ?? {}).map(([fk, fv]) => this.MarkCommandField(v.id, fk, fv.type, fv.placeholder, activeMark))}
    </span>
    `
	})

  ParagraphCommands = () => this.paragraphCommands.map(v => {

    const classes = {
      "paragraph-command": true,
      "applied": Boolean(v.active)
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
    </span>
    `
	})

  TextToolbox = () => {
    return html`<div class="text-toolbox">
      <div part="paragraph-commands">
      <span tabIndex=${-1} id="name" @click=${() => this.emitClickName()}>${msg("Paragraph")}</span>
        ${this.ParagraphCommands()}
      </div>
      <ww-fontpicker
        fontFamily=${this.setFontFamilyCommand.value}
        fontSize=${this.setFontSizeCommand.value}
        @ww-change-font-family=${(e: any) => this.dispatchEvent(CommandEvent(this.setFontFamilyCommand.id, e.detail))}
        @ww-change-font-size=${(e: any) => this.dispatchEvent(CommandEvent(this.setFontSizeCommand.id, e.detail))}
      ></ww-fontpicker>
      <div part="mark-commands">
        ${this.MarkCommands()}
      </div>
    </div>`
  }

  FontPicker = () => {
    return html`<ww-combobox>
    </ww-combobox>`
  }

  MarkCommandField = (markType: string, key: string, type: "string" | "number" | "boolean", placeholder?: string, activeMark?: Mark) => {
    if(type === "string" || type === "number") {
      return html`<sl-input 
        value=${activeMark?.attrs[key] ?? ""}
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
    if(this.activeElement && this.isActiveElementText) {
      return this.TextToolbox()
    }
    else if(this.activeElement && this.isActiveElementWidget) {
      const name = prettifyPackageName(this.activeElement.tagName.toLowerCase())
      return html`
        <span id="name" @click=${() => this.emitClickName(this.activeElement ?? undefined)} title=${this.activeElement.id}>${name}</span>
        <!--<sl-icon-button class="meta" title="Edit metadata" name="tags"></sl-icon-button>-->
        <sl-icon-button tabindex="-1" class="delete" title="Delete widget" name="trash" @click=${this.emitDeleteWidget} @mouseenter=${this.emitMouseEnterDeleteWidget} @mouseleave=${this.emitMouseLeaveDeleteWidget}></sl-icon-button>
      `
    }
    else {
      return null
    }
  }
}