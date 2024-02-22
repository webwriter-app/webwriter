import { LitElement, TemplateResult, css, html } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { styleMap } from "lit/directives/style-map.js"

import { camelCaseToSpacedCase, prettifyPackageName, unscopePackageName } from "../../utility"
import { Mark } from "prosemirror-model"
import { classMap } from "lit/directives/class-map.js"
import { localized, msg } from "@lit/localize"
import { Command } from "../../viewmodel"
import { spreadProps } from "@open-wc/lit-helpers"
import "../elements/stylepickers"

import { ifDefined } from "lit/directives/if-defined.js"
import { App } from ".."
import { AllSelection, EditorState, TextSelection } from "prosemirror-state"
import {GapCursor} from "prosemirror-gapcursor"

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

  @property({attribute: false})
  app: App
  
  @property({type: Object, attribute: false})
  editorState: EditorState

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

  emitRemoveMark = (markType: string) => this.dispatchEvent(
    new CustomEvent("ww-remove-mark", {composed: true, bubbles: true, detail: {
      element: this.activeElement, markType
    }})
  )

  emitClickName = (widget?: Element) => this.dispatchEvent(
    new CustomEvent("ww-click-name", {composed: true, bubbles: true, detail: {
      widget
    }})
  )

  emitHoverBreadcrumb = (element: Element) => this.dispatchEvent( 
    new CustomEvent("ww-hover-breadcrumb", {composed: true, bubbles: true, detail: {element}})
  )

  emitClickBreadcrumb = (element: Element) => this.dispatchEvent(
    new CustomEvent("ww-click-breadcrumb", {composed: true, bubbles: true, detail: {element}})
  )

  get isActiveElementContainer() {
    return !this.activeElement?.classList?.contains("ww-widget") ?? false
  }

  get isActiveElementWidget() {
    return this.activeElement?.classList?.contains("ww-widget") ?? false
  }

  get allSelected() {
    return this.editorState.selection instanceof AllSelection
  }

  get gapSelected() {
    return this.editorState.selection instanceof GapCursor
  }

  get textSelected() {
    return this.editorState.selection instanceof TextSelection
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
        flex-direction: column;
        flex-wrap: wrap;
        gap: 8px;
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


      div[part=inline-commands] {
        display: flex;
        justify-content: space-between;
      }

      div[part=block-commands] {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
        grid-auto-rows: 1fr;
        margin-top: 2px;

        & .layout-command {
          grid-row: 2;
        }
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

        & ww-button::part(base) {
          padding: 0;
        }
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

      ww-fontpicker[inert], .inline-commands.color[inert] {
        opacity: 0.5;
      }

      #element-breadcrumb::part(base) {
        border-bottom: 2px solid var(--sl-color-gray-600);
      }

      #element-breadcrumb sl-breadcrumb-item ww-button::part(base)
      {
        display: flex;
        flex-direction: row;
        align-items: center;
      }

      #element-breadcrumb sl-breadcrumb-item::part(label)
      {
        display: flex;
        flex-direction: row;
        align-items: center;
        color: inherit;
      }

      #element-breadcrumb sl-breadcrumb-item:last-of-type ww-button::part(base) {
        gap: 0.5ch;
      }

      #element-breadcrumb sl-breadcrumb-item::part(separator) {
        margin: -4px;
        display: inline flex;
      }

      #element-breadcrumb .separator-button {
        transform: rotate(-12.5deg);
      }

      #element-breadcrumb ww-button::part(base) {
        padding: 0;
      }

      .children-dropdown[data-no-siblings] .dropdown-trigger {
        visibility: hidden;
      }

      .media-toolbox {
        & .switches {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-auto-rows: 1fr;
          gap: 2px;
          & sl-switch {
            font-size: smaller;
          }
        }
        [data-hidden] {
          display: none;
        }
      }

      .details-toolbox {
        & sl-switch {
          font-size: smaller;
        }
      }

      .heading-toolbox, .list-toolbox {
        width: 100%;

        & sl-radio-group::part(button-group), & sl-radio-group::part(button-group__base) {
          width: 100%;
        }

        & sl-radio-button {
          flex-grow: 1;

          &::part(label) {
            padding: 0;
            width: 18px;
            height: 18px;
            margin: auto auto;
          }
        }
      }

      .dropdown-trigger {
        width: 18px;
        margin-left: 2px;
      }

      .dropdown-trigger::part(icon) {
        width: 16px;
        height: 16px;
      }

      .children-dropdown::part(trigger) {
        margin-bottom: -5px;
      }

      .children-dropdown[data-empty] {
        display: none;
      }

      .children-dropdown-menu {
        // background: var(--sl-color-gray-100);
        padding: 2px 1ch;
        font-size: var(--sl-button-font-size-medium);
        color: var(--sl-color-gray-700);

        & sl-menu-item::part(checked-icon) {
          display: none;
        }

        & sl-menu-item::part(submenu-icon) {
          display: none;
        }

        & sl-menu-item::part(label) {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 0.5ch;
          font-size: 0.9rem;
          font-family: var(--sl-font-sans);
          font-weight: 500;
        }

        & sl-menu-item sl-icon {
          width: 20px;
        }
      }
      
    `
  }

  MarkCommands = () => this.app.commands.markCommands.filter(v => !v.tags?.includes("advanced") || v.active).map(v => {
    const classes = {
      "inline-commands": true,
      "applied": Boolean(v.active),
      "color": v.tags?.includes("color") ?? false
    }
		return html`
    <span class=${classMap(classes)} ?inert=${classes.color}>
      <ww-button
        ${spreadProps(v.toObject())}
        tabindex=${0}
        name=${v.icon ?? "circle-fill"}
        @click=${() => v.run()}
        variant="icon"
      ></ww-button>
      <sl-color-picker value=${v.value}></sl-color-picker>
    </span>
    `
	})

  LayoutCommands = (el: HTMLElement) => this.app.commands.layoutCommands.map(v => {

    const classes = {
      "block-command": true,
      "layout-command": true,
      "applied": Boolean(v.active),
      "color": v.tags?.includes("color") ?? false
    }

		return html`
    <span id=${v.id} class=${classMap(classes)}>
      <ww-button
        inert disabled style="color: darkgray"
        ${spreadProps(v.toObject())}
        tabindex=${0}
        name=${v.icon ?? "circle-fill"}
        @click=${() => v.run()}
        variant="icon"
      ></ww-button>
    </span>
    `
	})

  Pickers = (el: HTMLElement) => this.app.commands.layoutCommands.map(v => {
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
        <ww-lineheightpicker value=${v.value} @change=${(e: any) => v.run({value: e.target.value})}></ww-lineheightpicker>
      `
    }
    else if(v.id === "background") {
      picker = html`
        <ww-backgroundpicker value=${v.value} @change=${(e: any) => v.run({value: e.target.value})}></ww-backgroundpicker>
      `
    }
    else if(v.id === "textAlign") {
      picker = html`
        <ww-alignmentpicker value=${v.value} @change=${(e: any) => v.run({value: e.target.value})}></ww-alignmentpicker>
      `
    }

    return picker? html`<div class="picker" id=${v.id}>
      ${picker}
      <ww-button variant="icon" class="picker-icon" icon=${v.icon ?? "square"}></ww-button>
    </div>`: null

  })

  ElementCommands = (el: HTMLElement) => this.app.commands.elementCommands.map(cmd => {
    return html`
      <ww-button
        ${spreadProps(cmd.toObject())}
        tabindex=${0}
        name=${cmd.icon ?? "circle-fill"}
        @click=${() => cmd.run()}
        @mouseenter=${() => cmd.preview()}
        @mouseleave=${() => cmd.preview()}
        variant="icon"
      ></ww-button>
  `
  })

  BlockToolbox = (el: HTMLElement) => {
    return html`<div class="block-toolbox">
      <div class="block-options">
        ${this.ElementBreadcrumb()}
        <div part="block-commands">
          ${this.ElementCommands(el)}
          ${this.LayoutCommands(el)}
        </div>
      </div>
      </div>
      <div class="pickers">
        ${this.Pickers(el)}
      </div>
    `
  }

  InlineToolbox = () => {
    const {fontFamilyCommand, fontSizeCommand} = this.app.commands
    const fontFamilies = fontFamilyCommand.value
    const fontSizes = fontSizeCommand.value
    return html`<div class="inline-toolbox">
      <ww-fontpicker
        fontFamily=${ifDefined(fontFamilies.length > 0? fontFamilies[0]: undefined)}
        fontSize=${ifDefined(fontSizes.length > 0? fontSizes[0]: undefined)}
        recommendedOnly
        @ww-change-font-family=${(e: any) => fontFamilyCommand.run(e.detail)}
        @ww-change-font-size=${(e: any) => fontSizeCommand.run(e.detail)}
        inert
      ></ww-fontpicker>
      ${this.MarkCommands()}
      ${this.ActiveInlineFields()}
      <span id="inline-toolbox-label">
        ${msg("Text")}
        <sl-icon name="text-size"></sl-icon>
      </span>
    </div>`
  }

  static getMediaContainerOf(el: HTMLElement) {
    const containerTags = ["img", "audio", "video", "object", "embed", "iframe", "portal"]
    const tag = el.tagName.toLowerCase()
    if(containerTags.includes(tag)) {
      return el
    }
    else if(["source", "track"].includes(tag)) {
      return el.parentElement
    }
    else if(tag === "figure") {
      return el.querySelector(containerTags.join(", "))
    }
    else if(tag === "figcaption") {
      return el.parentElement?.querySelector(containerTags.join(", ")) ?? null
    }
    else if(tag === "picture") {
      return el.querySelector("img")
    }
    else if(tag === "img") {
      const parentTag = el.parentElement?.tagName.toLowerCase()
      return parentTag === "picture"? el.parentElement!: el
    }
    else {
      return null
    }
  }

  MediaToolbox(el: HTMLElement) {
    const conEl = Toolbox.getMediaContainerOf(el)!
    const tag = conEl?.tagName.toLowerCase() ?? ""
    const isMedia = ["audio", "video", "picture", "object", "embed", "iframe", "portal", "img"].includes(tag)
    const isAudioVideo = ["audio", "video"].includes(tag)
    const isVideo = ["video"].includes(tag)
    const isImg = ["img"].includes("tag")
    return html`<div class="media-toolbox" @sl-change=${(e: any) => e.target.tagName === "SL-SWITCH"? this.emitSetAttribute(conEl, e.target.id, e.target.checked? "": undefined): this.emitSetAttribute(conEl, e.target.id, e.target.value)}>
      <sl-input size="small" value=${conEl?.getAttribute("src") ?? ""} id="src" ?data-hidden=${!isMedia} label=${msg("Source")} placeholder=${msg("URL")}></sl-input>
      <sl-input size="small" value=${conEl?.getAttribute("alt") ?? ""} id="alt" ?data-hidden=${!isImg} label=${msg("Alternate text")} placeholder=${msg("Short description")}></sl-input>
      <sl-input size="small" value=${conEl?.getAttribute("poster") ?? ""} id="poster" ?data-hidden=${!isVideo} label=${msg("Poster")} placeholder=${msg("URL")}></sl-input>
      <aside class="switches">
        <sl-switch size="small" ?checked=${conEl?.hasAttribute("autoplay") ?? false} id="autoplay" ?data-hidden=${!isAudioVideo}>${msg("Autoplay")}</sl-switch>
        <sl-switch size="small" ?checked=${conEl?.hasAttribute("controls") ?? false} id="controls" ?data-hidden=${!isAudioVideo}>${msg("Controls")}</sl-switch>
        <sl-switch size="small" ?checked=${conEl?.hasAttribute("loop") ?? false} id="loop" ?data-hidden=${!isAudioVideo}>${msg("Loop")}</sl-switch>
        <sl-switch size="small" ?checked=${conEl?.hasAttribute("mute") ?? false} id="mute" ?data-hidden=${!isAudioVideo}>${msg("Mute")}</sl-switch>
      </aside>
    </div>`
  }

  emitSetAttribute(el: Element, key: string, value: string | undefined) {
    this.dispatchEvent(new CustomEvent("ww-set-attribute", {bubbles: true, composed: true, detail: {el, key, value}}))
  }

  DetailsToolbox(el: HTMLDetailsElement) {
    console.log(el)
    return html`<div class="details-toolbox">
      <sl-switch id="open" size="small" ?checked=${el.open} @sl-change=${() => this.emitSetAttribute(el, "open", !el.open? "": undefined)}>${msg("Open")}</sl-switch>
    </div>`
  }

  HeadingToolbox(el: HTMLHeadingElement) {
    const tag = el.tagName.toLowerCase()
    return html`<div class="heading-toolbox">
      <sl-radio-group value=${tag} size="small" @sl-change=${(e: any) => {
        const newEl = el.ownerDocument.createElement(e.target.value) as HTMLHeadingElement
        el.getAttributeNames().forEach(k => newEl.setAttribute(k, el.getAttribute(k)!))
        newEl.replaceChildren(...Array.from(el.childNodes))
        el.replaceWith(newEl)
      }}>
        <sl-radio-button value="h1"><sl-icon name="h-1"></sl-icon></sl-radio-button>
        <sl-radio-button value="h2"><sl-icon name="h-2"></sl-icon></sl-radio-button>
        <sl-radio-button value="h3"><sl-icon name="h-3"></sl-icon></sl-radio-button>
        <sl-radio-button value="h4"><sl-icon name="h-4"></sl-icon></sl-radio-button>
        <sl-radio-button value="h5"><sl-icon name="h-5"></sl-icon></sl-radio-button>
        <sl-radio-button value="h6"><sl-icon name="h-6"></sl-icon></sl-radio-button>
      </sl-radio-group>
    </div>`
  }

  ListToolbox(el: HTMLOListElement | HTMLUListElement) {
    const tag = el.tagName.toLowerCase()
    return html`<div class="list-toolbox">
      <sl-radio-group value=${tag} size="small" @sl-change=${(e: any) => {
        const newEl = el.ownerDocument.createElement(e.target.value) as HTMLOListElement | HTMLUListElement
        el.getAttributeNames().forEach(k => newEl.setAttribute(k, el.getAttribute(k)!))
        newEl.replaceChildren(...Array.from(el.childNodes))
        el.replaceWith(newEl)
      }}>
        <sl-radio-button value="ul"><sl-icon name="list"></sl-icon></sl-radio-button>
        <sl-radio-button value="ol"><sl-icon name="list-numbers"></sl-icon></sl-radio-button>
      </sl-radio-group>
    </div>`
  }



  ActiveInlineFields = () => {
    const cmds = this.app.commands.markCommands.filter(cmd => cmd.active && cmd.fields)
    return cmds.map(cmd => html`<div class="inline-field-group">
      <sl-icon name=${cmd.icon ?? "square"}></sl-icon>
      ${Object.entries(cmd.fields!).map(([key, field]) => this.InlineCommandField(cmd, key, field.type, field.placeholder))}
      <ww-button variant="icon" icon="x" @click=${() => this.emitRemoveMark(cmd.id)}></ww-button>
    </div>`)
  }

  BlockOption: (cmd: Command) => TemplateResult = (cmd: Command) => {
    const groupedCommands = this.app.commands.layoutCommands.filter(otherCmd => cmd.group && otherCmd.group === cmd.group)
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

  BlockHeader = (el: HTMLElement) => {
    const {nodeCommands} = this.app.commands
    const cmd = nodeCommands.find(cmd => cmd.id === el.tagName.toLowerCase())
    return html`<div @click=${() => this.emitClickName()} class="block-header">
      <sl-icon class="current-icon" name=${cmd?.icon ?? "asterisk"}></sl-icon>
      <span tabIndex=${-1} id="name">
        ${cmd?.label ?? msg(`Mixed Content`)}
      </span>
    </div>`
  }

  InlineCommandField = (cmd: Command, key: string, type: "string" | "number" | "boolean", placeholder?: string, value?: any) => {
    if(type === "string" || type === "number") {
      return html`<sl-input 
        value=${cmd.value.attrs[key] ?? ""}
        placeholder=${placeholder ?? ""}
        class="field" 
        type=${type === "string"? "text": "number"}
        @sl-change=${(e: any) => cmd.run({[key]: e.target.value})}
      ></sl-input>`
    }
    else {
      return html`<sl-checkbox class="field"></sl-checkbox>`
    }
  }

  get activeElementPath() {
    let el = this.activeElement
    const ancestors = [] as HTMLElement[]
    while(el) {
      const tagsToExclude = ["html", "body", ...this.app.commands.markCommands.map(cmd => cmd.id)].map(k => k.toUpperCase())
      if(!(tagsToExclude.includes(el.tagName))) {
        ancestors.unshift(el)
      }
      el = el.parentElement
    }
    return ancestors
  }

  get activeElementSiblings() {
    let el = this.activeElement
    const tagsToExclude = [...this.app.commands.markCommands.map(cmd => cmd.id)].map(k => k.toUpperCase())
    return Array.from(el?.parentElement?.children ?? [])
      .filter(child => !tagsToExclude.includes(child.tagName) && child !== el)
  }

  isCustomElement(el: Element) {
    return !!el.ownerDocument.defaultView?.customElements.get(el.tagName.toLowerCase())
  }


  ElementBreadcrumbItem(el: Element, isLast=false, menuItem=false): TemplateResult {
    const elementName = el.tagName.toLowerCase()
    const isCustomElement = this.isCustomElement(el)
    const isCommandEl = elementName in this.app.commands.commands

    const children = Array.from(el.children)
      .filter(child => !child.classList.contains("ProseMirror-trailingBreak"))
      .filter(child => !["a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "del", "dfn", "em", "i", "ins", "kbd", "q", "ruby", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var"].includes(child.tagName.toLowerCase()))

    const separator = menuItem? null: html`<sl-dropdown slot="separator" class="children-dropdown" ?data-empty=${children.length === 0}>
      <ww-button
        class="separator-button"
        variant="icon"
        icon="slash"
        slot="trigger"
      ></ww-button>
      <sl-menu class="children-dropdown-menu">
        ${children.map(child => this.ElementBreadcrumbItem(child, false, true))}
      </sl-menu>
    </sl-dropdown>`

    if(isCustomElement) {
      const content = html`<ww-button
        title=${elementName}
        variant="icon"
        icon="package"
        @click=${() => this.emitClickBreadcrumb(el)}
        @hover=${() => this.emitHoverBreadcrumb(el)}
      >
        ${!isLast? null: prettifyPackageName(elementName, "all", true)}
      </ww-button>`
      return !menuItem
        ? html`<sl-breadcrumb-item>${content}${separator}</sl-breadcrumb-item>`
        : html`<sl-menu-item>${content}</sl-menu-item>`
    }
    else if(isCommandEl) {
      const cmd = (this.app.commands.commands as Record<string, Command>)[elementName]
      const content = html`<ww-button
        variant="icon"
        icon=${cmd?.icon ?? "square"}
        @click=${() => this.emitClickBreadcrumb(el)}
        @hover=${() => this.emitHoverBreadcrumb(el)}
      >
        ${!isLast? null: cmd.label}
      </ww-button>`
      return !menuItem
        ? html`<sl-breadcrumb-item>${content}
        ${separator}</sl-breadcrumb-item>`
        : html`<sl-menu-item>${content}</sl-menu-item>`
    }
    else {
      return html``
    }
  }

  ElementBreadcrumb() {
    if(this.allSelected || this.gapSelected) {
      return html`<sl-breadcrumb id="element-breadcrumb">
        <ww-button variant="icon"><i>${this.allSelected? msg("Everything"): msg("Gap")}</i></ww-button>
      </sl-breadcrumb>`
    }
    const els = this.activeElementPath
    return html`<sl-breadcrumb id="element-breadcrumb">
      ${els.map((el, i) => this.ElementBreadcrumbItem(el, i === els.length - 1))}
    </sl-breadcrumb>`

    /*
    const {nodeCommands} = this.app.commands
    let pathParts = []
    for(const [i, el] of this.activeElementPath.entries()) {
      const cmd = nodeCommands.find(cmd => cmd.id === el.tagName.toLowerCase())
      const isLast = i === this.activeElementPath.length - 1
      if(!isLast) {
        pathParts.push(html`<sl-breadcrumb-item>
        <ww-button
          variant="icon"
          icon=${cmd?.icon ?? "square"}
          @click=${() => this.emitClickBreadcrumb(el)}
          @hover=${() => this.emitHoverBreadcrumb(el)}
        ></ww-button>
      </sl-breadcrumb-item>`)
      }
      else {
        const siblingCmds = this.activeElementSiblings
          .map(el => ({el, scmd: nodeCommands.find(cmd => cmd.id === el.tagName.toLowerCase())!}))
          .filter(scmd => scmd)
        const siblingMenuItems = siblingCmds.map(({el, scmd}) => html`
          <sl-menu-item
            @click=${() => this.emitClickBreadcrumb(el)}
            @hover=${() => this.emitHoverBreadcrumb(el)}
          >
            <sl-icon name=${scmd.icon ?? "square"}></sl-icon>
            ${scmd.label}
          </sl-menu-item>
        `)
        siblingMenuItems.length > 0? pathParts.push(html`<sl-breadcrumb-item>
          <sl-dropdown class="sibling-dropdown" ?data-no-siblings=${siblingCmds.length === 0} skidding=${-12}>
            <ww-button slot="trigger" variant="icon" icon=${cmd?.icon ?? "square"}>
              ${cmd?.label}
              <ww-button variant="icon" icon="chevron-down" class="dropdown-trigger" @click=${() => this.emitClickBreadcrumb(el)} @hover=${() => this.emitHoverBreadcrumb(el)}></ww-button>
            </ww-button>
            <sl-menu class="sibling-dropdown-menu">
              ${siblingMenuItems}
            </sl-menu>
          </sl-dropdown>
        </sl-breadcrumb-item>`): pathParts.push(html`<sl-breadcrumb-item>
          <ww-button variant="icon" icon=${cmd?.icon ?? "square"} @click=${() => this.emitClickBreadcrumb(el)} @hover=${() => this.emitHoverBreadcrumb(el)}>${cmd?.label}</ww-button>
        </sl-breadcrumb-item>`)
      }
    }
    return html`<sl-breadcrumb id="element-breadcrumb">
      ${pathParts}
      <sl-icon name="slash" slot="separator"></sl-icon>
    </sl-breadcrumb>`
    */
  }

  ContextToolbox(el: HTMLElement) {
    const tag = el.tagName.toLowerCase()
    if(["figure", "figcaption", "img", "source", "track", "picture", "audio", "video", "object", "embed", "iframe", "portal"].includes(tag)) {
      return this.MediaToolbox(el)
    }
    else if(tag === "details") {
      return this.DetailsToolbox(el as HTMLDetailsElement)
    }
    else if(["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
      return this.HeadingToolbox(el as HTMLHeadingElement)
    }
    else if(["ul", "ol"].includes(tag)) {
      return this.ListToolbox(el as HTMLOListElement | HTMLUListElement)
    }
    else if(this.app.store.packages.widgetTagNames.includes(tag)) {
      return html`<ww-widget-options .widget=${el}></ww-widget-options>`
    }
  }

  render() {
    /*        <sl-icon-button tabindex="-1" class="delete" title="Delete widget" name="trash" @click=${this.emitDeleteWidget} @mouseenter=${this.emitMouseEnterDeleteWidget} @mouseleave=${this.emitMouseLeaveDeleteWidget}></sl-icon-button> */
    if(this.activeElement) {
      return html`
        ${this.BlockToolbox(this.activeElement)}
        ${this.activeElementPath.map(el => this.ContextToolbox(el))}
        ${this.textSelected? this.InlineToolbox(): null}
      `
    }
    else {
      return null
    }
  }
}