import { LitElement, TemplateResult, css, html } from "lit"
import { customElement, property, query, queryAll } from "lit/decorators.js"
import {cache} from 'lit/directives/cache.js';

import { emitCustomEvent, prettifyPackageName, unscopePackageName } from "#utility"
import { classMap } from "lit/directives/class-map.js"
import { localized, msg } from "@lit/localize"
import { Command, LayoutCommand } from "#viewmodel"
import { spreadProps } from "@open-wc/lit-helpers"

import { ifDefined } from "lit/directives/if-defined.js"
import { App, URLFileInput, TextPicker } from "#view"
import { AllSelection, EditorState, TextSelection } from "prosemirror-state"
import {GapCursor} from "prosemirror-gapcursor"
// @ts-ignore
import {render as latexToMathML} from "temml/dist/temml.cjs"
import { SlColorPicker, SlTree } from "@shoelace-style/shoelace"
import { CSSPropertySpecs, MATHML_TAGS, Package } from "#model/index.js"
import { LitPickerElement } from "#view/elements/stylepickers/index.js"
import { findParentNodeClosestToPos } from "prosemirror-utils";
import "./widgetoptions"



@localized()
@customElement("ww-toolbox")
export class  Toolbox extends LitElement {

  static siteEmbedding: Record<string, {url: RegExp, replacer: (url: string) => string, access: string, icon?: string, label?: string}> = {
    "youtube": {url: /youtube\.com\/watch/, access: "https://youtube.com", icon: "brand-youtube", label: "YouTube", replacer: url => {
      return url.replace("/watch?v=", "/embed/")
    }},
    "vimeo": {url: /vimeo\.com.*\/\d+/, access: "https://vimeo.com", icon: "brand-vimeo", label: "Vimeo", replacer: url => {
      const id = url.match(/\/(\d+)/)![1]
      return `https://player.vimeo.com/video/${id}`
    }},
    "instagram": {url: /instagram\.com\/p\/\w+/, access: "https://instagram.com", icon: "brand-instagram", label: "Instagram", replacer: url => {
      return url + "/embed"
    }},
    "tiktok": {url: /tiktok\.com\/.*\/video\/\w+/, access: "https://tiktok.com", icon: "brand-tiktok", label: "TikTok", replacer: url => {
      const id = url.match(/video\/(\w+)/)![1]
      return `https://www.tiktok.com/embed/v2/${id}`
    }},
    "schooltube": {url:/schooltube\.com/, access: "https://schooltube.com", icon: "school", label: "Schooltube", replacer: url => {
      const id = url.match(/watch\/.*_(\w+)\.html/)![1]
      return `https://www.schooltube.com/embed/${id}`
    }},
    "dailymotion": {url: /dailymotion\.com\/video/, access: "https://dailymotion.com", icon: "circle-letter-d", label: "Dailymotion", replacer: url => {
      return url.replace("video/", "embed/video/")
    }},
    "internetarchive": {url: /archive\.org\//, access: "https://archive.org", icon: "building-bank", label: "Internet Archive", replacer: url => {
      const id = url.match(/details\/(.+)/)![1]
      return `https://archive.org/embed/${id}`
    }},
    "flickr": {url: /flickr\.com\/(.+)/, access: "https://flickr.com", icon: "brand-flickr", label: "Flickr", replacer: url => {
      const id = url.match(/flickr\.com\/(.+)/)![1]
      return `https://embedr.flickr.com/${id}`
    }},
    "miro": {url: /miro\.com\/app\/board/, access: "https://miro.com", icon: "circle-letter-m", label: "Miro", replacer: url => {
      const id = url.match(/miro\.com\/app\/board\/(.+)/)![1]
      return `https://miro.com/app/live-embed/${id}`
    }
    },
    "mentimeter": {url: /mentimeter\.com\//, access: "https://mentimeter.com", icon: "square-letter-m", label: "Mentimeter", replacer: url => {
      const id = url.match(/\/app\/presentation\/(\w+)\//)![1]
      return `https://www.mentimeter.com/app/presentation/${id}/embed`
    }},
    "figma": {url: /figma\.com/, access: "https://figma.com", icon: "brand-figma", label: "Figma", replacer: url => {
      const id = url.match(/https:\/\/www\.figma\.com\/file\/\w+\//)![0]
      return `https://www.figma.com/embed?embed_host=oembed&url=${encodeURIComponent(id)}`
    }},
  "pinterest": {url: /pinterest\.\w+\/pin\//, access: "https://pinterest.com", icon: "brand-pinterest", label: "Pinterest", replacer: url => {
    const id = url.match(/\/pin\/.*--(\d+)/)![1]
    return `https://assets.pinterest.com/ext/embed.html?id=${id}`
  }},
    "twitter": {url: /(twitter|x)\.com\//, access: "https://twitter.com", icon: "brand-x", label: "Twitter/X", replacer: url => url}, // TBD
    "facebook": {url: /facebook\.com/, access: "https://facebook.com", icon: "brand-facebook", label: "Facebook", replacer: url => url}, // TBD
    // "wikimedia": {}
  }

  @query("div")
  div: HTMLElement

  @queryAll("sl-color-picker")
  colorPickerEls: SlColorPicker[]

  cleanup: CallableFunction

  inlineTooltip: boolean = false

  connectedCallback(): void {
      super.connectedCallback()
      this.addEventListener("blur", () => this.colorPickerEls.forEach(el => el.dropdown.open = false))
      if(WEBWRITER_ENVIRONMENT.engine.name === "WebKit") {
        const sheet = new CSSStyleSheet()
        sheet.replaceSync(`:host { padding-left: 10px }`)
        this.shadowRoot!.adoptedStyleSheets = [...this.shadowRoot!.adoptedStyleSheets, sheet]
      }
  }

	emitChangeWidget = (name: string) => {
		this.dispatchEvent(new CustomEvent("ww-change-widget", {composed: true, bubbles: true, detail: {name: unscopePackageName(name)}}))
	}

  @property({attribute: false})
  app: App
  
  @property({type: Object, attribute: false})
  editorState: EditorState

  @property({type: Object, attribute: false})
  activeElement: HTMLElement | null

  @property({attribute: false})
  activeLayoutCommand: LayoutCommand | undefined

  @property({type: Boolean})
  activeLayoutAdvanced = false

  @property({type: Boolean})
  activeOutline = false

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

  emitMouseEnterPinSnippet = () => this.dispatchEvent(
    new CustomEvent("ww-mouse-enter-pin-snippet", {composed: true, bubbles: true, detail: {
      activeElement: this.activeElement
    }})
  )

  emitMouseLeavePinSnippet = () => this.dispatchEvent(
    new CustomEvent("ww-mouse-leave-pin-snippet", {composed: true, bubbles: true, detail: {
      activeElement: this.activeElement
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
    return !this.activeElement?.classList?.contains("ww-widget")
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
        align-items: flex-start;
        padding-left: 9px;
        margin-left: 1px;
        padding-bottom: 1ch;
        overflow: visible;
        scrollbar-width: thin;
        box-sizing: border-box;
        position: relative;
        min-width: 250px;
      }

      :host > * {
        max-width: 230px;
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

      :host(:not([advancedinline])) .inline-commands.advanced {
        display: none;
      }

      :host(:not([advancedstyling])) .layout-command.advanced {
        display: none;
      }

      .layout-command[data-active] {
        border: 2px solid var(--sl-color-gray-600);
        border-radius: 5px;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        z-index: 100;
        background: white;
        position: relative;
        &::after {
          content: "";
          display: block;
          position: absolute;
          width: 100%;
          height: 4px;
          left: -2px;
          bottom: -4px;
          background: white;
          z-index: 1000;
          border-left: inherit;
          border-right: inherit;
        }
      }

      .inline-commands:not(.more-inline-commands).applied {
        background: var(--sl-color-primary-200) !important;
        border-radius: 4px;
      }

      .more-inline-commands {
        color: var(--sl-color-gray-700);
      }

      :host(:not([advancedinline])) .more-inline-commands.applied {
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
        gap: 4px;
      }

      div[part=block-commands] #name {
        margin-right: auto;
      }

      .widget-name {
        text-decoration: solid underline var(--sl-color-primary-400) 2px;
        cursor: pointer;
      }

      .block-command {
        border: 2px solid transparent;
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

      .block-command ww-button {
        width: 100%;
        height: 100%;
      }

      .block-command ww-button::part(base) {
        padding: 0;
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

      .pickers-popup::part(popup) {
        z-index: 10;
        border: 2px solid var(--sl-color-gray-600);
        padding: 10px;
        padding-right: 5px;
        padding-top: 0;
        border-radius: 5px;
        background: white;
        overflow-y: auto;
        scrollbar-width: thin;
        width: 230px;
        box-sizing: border-box;
        margin-top: -2px;
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        min-width: 230px;
        overflow-x: clip;
        overflow-y: scroll;
      }

      .pickers-popup > h3 {
        display: flex;
        flex-direction: row;
        align-items: center;
        color: var(--sl-color-gray-600);
        margin: 0;
        margin-left: -10px;
        padding: 10px 0;
        padding-left: 10px;
        position: sticky;
        top: 0;
        left: 0;
        z-index: 10;
        background: white;

        & > sl-icon {
          margin-right: 1ch;
        }

        & > span {
          font-size: 0.875rem;
        }

        & > sl-icon-button {
          margin-left: auto;
        }
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
        grid-column: 1;
        grid-row: 2;
      }

      #inline-toolbox-label {
        position: absolute;
        top: 0;
        right: 5px;
        font-size: 0.75rem;
        font-weight: 600;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1ch;
        color: var(--sl-color-gray-800);
        min-width: calc(33% - 8px);
        
        & span {
          border-bottom: 2px solid var(--sl-color-gray-600);
        }
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
        height: min-content;
        width: min-content;
        overflow: visible;
        grid-row: span 2;
        order: 1;
        justify-content: flex-start;
        flex-direction: column-reverse;
        align-self: flex-end;
        justify-self: flex-end;
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
        min-height: 45px;
        width: 100%;
      }

      #element-breadcrumb sl-tree {
        width: 100%;
      }

      #element-breadcrumb sl-tree-item {
        --indent-size: var(--sl-spacing-small);
      }

      #element-breadcrumb sl-tree-item[data-selected] > sl-breadcrumb-item > ww-button::part(label) {
        text-decoration: 2px underline var(--sl-color-primary-400);
      }

      #element-breadcrumb sl-tree-item::part(expand-button) {
        padding: 0;
      }

      #element-breadcrumb sl-tree-item::part(item--selected) {
        border-color: transparent;
      }

      #element-breadcrumb sl-tree-item::part(label) {
        width: 100%;
        flex-wrap: wrap;
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
        width: 100%;

        & .switches {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-auto-rows: 1fr;
          gap: 4px;
          & sl-switch {
            font-size: smaller;
          }
        }
        [data-hidden] {
          display: none;
        }

        & .capture-pane {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          margin-top: 2px;
          margin-bottom: 4px;
          gap: 2px;

          & > * {
            flex-grow: 1;
          }
        }
      }

      .details-toolbox {
        & sl-switch {
          font-size: smaller;
        }
      }

      .math-toolbox {
        & sl-input::part(input) {
          font-family: monospace;
        }
        & sl-input::part(input)::placeholder {
          color: var(--sl-color-gray-400);
        }
      }

      .heading-toolbox, .paragraph-toolbox, .list-toolbox {
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

      .embeddings-explainer {
        
        padding-bottom: 1em;

        & .embeddings-list {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-auto-rows: 1fr;
          gap: 0.25rem;

          & > * {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 1ch;
            pointer-events: all;
            color: var(--sl-color-blue-200);
          }
        }
      }
      
      .context-toolbox {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .table-toolbox {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
        grid-template-rows: 1fr;
        border: 2px solid var(--sl-color-primary-800);
        border-radius: var(--sl-border-radius-medium);
        padding: 2px;
        color: var(--sl-color-primary-800);
        position: relative;
        margin-top: 0.5em;

        & .table-label {
          position: absolute;
          top: -0.8em;
          left: 3px;
          background: #f4f4f5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          padding: 0 3px;
          gap: 3px;

          & sl-icon {
            width: 1.1em;
            height: 1.1em;
          }
        }
      }

      .style-picker:not([data-active]) {
        display: none;
      }

      .pickers-popup:not([data-active]) {
        display: none;
      }

      /*
      @media only screen and (min-width: 1830px) {
        :host {
          display: grid;
          grid-template-columns: 1fr 1fr; 
          grid-template-rows: max-content max-content;
          gap: 1rem;
        }

        .context-toolbox {
          grid-row: span 2;
          grid-column: 2;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
      }*/

      .inline-toolbox:not([data-active]) {
        display: none;
      }

      #close-button {
        position: absolute;
        right: 0;
        top: 0;
        &::part(base) {
          padding: var(--sl-spacing-small);
        }
      }
          
      :host(.intro-target) * {
        animation: blink-color 1.5s linear infinite;
      } 

      @keyframes blink-color {
        50% {
          color: var(--sl-color-primary-600);
        }
      }
    `
  }
  


  MarkCommands = (advanced=false) => this.app.commands.markCommands.filter(v => advanced? v.tags?.includes("advanced"): !v.tags?.includes("advanced")).map(v => {
    const classes = {
      "inline-commands": true,
      "applied": Boolean(v.active),
      "advanced": !!v.tags?.includes("advanced"),
      "color": v.tags?.includes("color") ?? false
    }
		return html`
    <span class=${classMap(classes)}>
      <ww-button
        ${spreadProps(v.toObject())}
        tabindex=${0}
        name=${v.icon ?? "circle-fill"}
        @click=${(e: any) => v.run({value: e.target.parentElement.querySelector("sl-color-picker").value})}
        variant="icon"
      ></ww-button>
      <sl-color-picker value=${v.value} @sl-change=${(e: any) => v.run({value: e.target.value})}></sl-color-picker>
    </span>
    `
	})

  LayoutCommands = (advanced=false) => this.app.commands.layoutCommands.filter(cmd => advanced? cmd.tags?.includes("advanced"): !cmd.tags?.includes("advanced")).map(v => {

    const classes = {
      "block-command": true,
      "layout-command": true,
      "applied": Boolean(v.active),
      "advanced": !!v.tags?.includes("advanced"),
      "color": v.tags?.includes("color") ?? false
    }

		return html`
    <span id=${v.id} class=${classMap(classes)} ?data-active=${v === this.activeLayoutCommand && !this.gapSelected}>
      <ww-button
        ${spreadProps(v.toObject())}
        tabindex=${0}
        name=${v.icon ?? "circle-fill"}
        @click=${() => {v.run(); this.activeLayoutAdvanced = false}}
        variant="icon"
      ></ww-button>
    </span>
    `
	})

  Pickers = (activeLayoutCommand?: LayoutCommand) => {
    const properties = html`
      <ww-box-picker class="style-picker" ?data-active=${this.activeLayoutCommand?.id === "boxStyle"} ?advanced=${this.activeLayoutAdvanced} @change=${(e: any) => this.emitSetStyle(this.activeElement!, e.target.value)} .value=${this.activeElement? this.activeElement!.style as any: undefined} .computedValue=${this.activeElement? this.app.activeEditor?.pmEditor.window.getComputedStyle(this.activeElement): undefined}></ww-box-picker>
      <ww-layout-picker class="style-picker" ?data-active=${this.activeLayoutCommand?.id === "layoutStyle"} ?advanced=${this.activeLayoutAdvanced} @change=${(e: any) => this.emitSetStyle(this.activeElement!, e.target.value)} .value=${this.activeElement? this.activeElement!.style as any: undefined} .computedValue=${this.activeElement? this.app.activeEditor?.pmEditor.window.getComputedStyle(this.activeElement): undefined}></ww-layout-picker>
      <ww-text-picker class="style-picker" ?data-active=${this.activeLayoutCommand?.id === "textStyle"} ?advanced=${this.activeLayoutAdvanced} @change=${(e: any) => this.emitSetStyle(this.activeElement!, e.target.value)} .value=${this.activeElement? this.activeElement!.style as any: undefined} .computedValue=${this.activeElement? this.app.activeEditor?.pmEditor.window.getComputedStyle(this.activeElement): undefined}></ww-text-picker>
      <ww-blending-picker class="style-picker" ?data-active=${this.activeLayoutCommand?.id === "blendingStyle"} ?advanced=${this.activeLayoutAdvanced} @change=${(e: any) => this.emitSetStyle(this.activeElement!, e.target.value)} .value=${this.activeElement? this.activeElement!.style as any: undefined} .computedValue=${this.activeElement? this.app.activeEditor?.pmEditor.window.getComputedStyle(this.activeElement): undefined}></ww-blending-picker>
      <ww-interactivity-picker class="style-picker" ?data-active=${this.activeLayoutCommand?.id === "interactivityStyle"} ?advanced=${this.activeLayoutAdvanced} @change=${(e: any) => this.emitSetStyle(this.activeElement!, e.target.value)} .value=${this.activeElement? this.activeElement!.style as any: undefined} .computedValue=${this.activeElement? this.app.activeEditor?.pmEditor.window.getComputedStyle(this.activeElement): undefined}></ww-interactivity-picker>
      <ww-miscellaneous-picker class="style-picker" ?data-active=${this.activeLayoutCommand?.id === "miscellaneousStyle"} ?advanced=${this.activeLayoutAdvanced} @change=${(e: any) => this.emitSetStyle(this.activeElement!, e.target.value)} .value=${this.activeElement? this.activeElement!.style as any: undefined} .computedValue=${this.activeElement? this.app.activeEditor?.pmEditor.window.getComputedStyle(this.activeElement): undefined}></ww-miscellaneous-picker>`
    return html`<sl-popup class="pickers-popup" ?data-active=${this.activeLayoutCommand && !this.gapSelected} shift strategy="fixed" auto-size="both" active anchor=${ifDefined(activeLayoutCommand?.id)} .autoSizeBoundary=${document.body} shift-padding=${this.shiftPaddingStyling} placement="bottom-start">
      <h3>
        <!--<sl-icon name=${activeLayoutCommand?.icon ?? ""}></sl-icon>-->
        <span>${activeLayoutCommand?.label}</span>
        <sl-icon-button name=${this.activeLayoutAdvanced? "badge-filled": "badge"} @click=${() => this.activeLayoutAdvanced = !this.activeLayoutAdvanced} style="margin-left: 0.5ch;"></sl-icon-button>
        <sl-icon-button name="restore" style="margin-left: 0.25ch;" @click=${() => this.emitSetStyle(this.activeElement!, (this.shadowRoot!.querySelector(".picker[data-active]") as LitPickerElement).emptyValue as any)}></sl-icon-button>
        <sl-icon-button name="x" @click=${() => {this.activeLayoutCommand = undefined; this.activeLayoutAdvanced = false}}></sl-icon-button>
      </h3>
      ${properties}
    </sl-popup>`
  }

  ElementCommands = () => this.app.commands.elementCommands.map(cmd => {
    return html`
      <ww-button
        ${spreadProps(cmd.toObject())}
        tabindex=${0}
        name=${cmd.icon ?? "circle-fill"}
        @click=${() => {cmd.run(); cmd.preview()}}
        @mouseenter=${() => cmd.preview()}
        @mouseleave=${() => cmd.preview()}
        variant="icon"
      ></ww-button>
  `
  })

  BlockToolbox = (el: HTMLElement | null) => {
    return html`<div class="block-toolbox">
      <div class="block-options">
        ${this.ElementBreadcrumb()}
        <div part="block-commands">
          ${this.ElementCommands()}
          ${this.LayoutCommands(false)}
        </div>
      </div>
    </div>
    ${cache(this.activeLayoutCommand? this.Pickers(this.activeLayoutCommand): undefined)}`
  }

  @property({type: Boolean, attribute: true, reflect: true})
  advancedInline = false

  @property({type: Boolean, attribute: true, reflect: true})
  advancedStyling = false

  @property({type: Number, attribute: true, reflect: true})
  shiftPaddingStyling = 0

  InlineToolbox = () => {
    const {fontFamilyCommand, fontSizeCommand, clearFormattingCommand} = this.app.commands
    const fontFamilies = fontFamilyCommand.value
    const fontSizes = fontSizeCommand.value
    const advancedApplied = this.app.commands.markCommands.some(v => v.tags?.includes("advanced") && v.active)
    return html`<div class="inline-toolbox" ?data-active=${this.textSelected}>
      <ww-fontpicker
        .fontFamilies=${fontFamilies}
        .fontSizes=${fontSizes}
        defaultFontSize=${ifDefined(this.activeElement? getComputedStyle(this.activeElement).fontSize: undefined)}
        recommendedOnly
        @ww-change-font-family=${(e: any) =>fontFamilyCommand.run(e.detail)}
        @ww-change-font-size=${(e: any) => fontSizeCommand.run(e.detail)}
      ></ww-fontpicker>
      ${this.MarkCommands()}
      <span class=${classMap({"more-inline-commands": true, "inline-commands": true, "applied": advancedApplied})}>
        <ww-button
          tabindex=${0}
          title=${this.advancedInline? msg("Hide advanced text formatting"): msg("Show advanced text formatting")}
          icon=${this.advancedInline? "chevron-down": "chevron-left"}
          @click=${(e: any) => this.advancedInline = !this.advancedInline}
          variant="icon"
        ></ww-button>
      </span>
    ${this.MarkCommands(true)}
      ${this.ActiveInlineFields()}
      <span id="inline-toolbox-label">
        <ww-button variant="icon" ${spreadProps(clearFormattingCommand.toObject())} @click=${() => clearFormattingCommand.run()}></ww-button>
        <span>${msg("Text")}</span>
      </span>
    </div>`
  }

  TableToolbox = (el: HTMLTableElement) => {
    const commands = this.app.commands.tableCommands.filter(cmd => !cmd.tags?.includes("advanced"))
    return html`<div class="table-toolbox">
      <span class="table-label">
        <sl-icon name="table"></sl-icon>
        <span>${msg("Table")}</span>
      </span>
      ${commands.map(v => html`<ww-button
          ${spreadProps(v.toObject())}
          tabindex=${0}
          name=${v.icon ?? "circle-fill"}
          @click=${() => v.run()}
          variant="icon"
        ></ww-button>
        `
      )}
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

  handleMediaSetAttribute = (el: Element, e: CustomEvent) => {
    const target = e.target as HTMLElement
    if(target.tagName === "SL-SWITCH") {
      this.emitSetAttribute(el, target.id, (target as any).checked? "": undefined)
    }
    else if(target.tagName === "WW-URLFILEINPUT") {
      let url = (target as URLFileInput).value
      let type = undefined
      for(const spec of Object.values(Toolbox.siteEmbedding)) {
        if(spec.url.test(url)) {
          url = spec.replacer(url)
          type = "iframe"
          break
        }
      }
      this.emitSetAttribute(el, target.id, url, type)
    }
    else {
      this.emitSetAttribute(el, target.id, (target as any).value)
    }
  }

  static mediaTypeOfTag = {
    "audio": "audio",
    "video": "video",
    "picture": "image",
    "img": "image"
  }

  MediaToolbox(el: HTMLElement) {
    const conEl = Toolbox.getMediaContainerOf(el)!
    const tag = conEl?.tagName.toLowerCase() ?? ""
    const isMedia = ["audio", "video", "picture", "object", "embed", "iframe", "portal", "img"].includes(tag)
    const isAudio = tag === "audio"
    const isVideo = tag === "video"
    const isImg = tag === "img"
    const isPicture = tag === "picture"
    const isAudiovisual = isAudio || isVideo || isImg || isPicture
    const isAudioVideo = isAudio || isVideo
    return html`<div class="media-toolbox" @sl-change=${(e: any) => this.handleMediaSetAttribute(conEl, e)}>
      <ww-urlfileinput size="small" value=${conEl?.getAttribute("src") ?? ""} id="src" ?data-hidden=${!isMedia} placeholder=${msg("URL")} mediaType=${ifDefined((Toolbox.mediaTypeOfTag as any)[tag])} ?record=${isAudiovisual} ?capture=${isAudiovisual}>
        <span slot="label">
          ${msg("Source")}
          <sl-tooltip>
            <sl-icon-button name="info-circle"></sl-icon-button>
            <div class="embeddings-explainer" slot="content">
              <p>${msg("WebWriter supports embedding many different sources. Simply paste a link to content from:")}</p>
              <div class="embeddings-list">
                ${Object.values(Toolbox.siteEmbedding).map(spec => html`<a href=${spec.access} target="_blank">
                  <sl-icon name=${spec.icon ?? "world"}></sl-icon>
                  ${spec.label}
                </a>`)}
              </div>
            </div>
          </sl-tooltip>
        </span>
      </ww-urlfileinput>
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

  emitSetAttribute(el: Element, key: string, value?: string, tag?: string) {
    this.dispatchEvent(new CustomEvent("ww-set-attribute", {bubbles: true, composed: true, detail: {el, key, value, tag}}))
  }

  emitSetStyle(el: Element, style: Record<keyof CSSPropertySpecs, string>) {
    this.dispatchEvent(new CustomEvent("ww-set-style", {bubbles: true, composed: true, detail: {el, style}}))
  }

  DetailsToolbox(el: HTMLDetailsElement) {
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

  ParagraphToolbox(el: HTMLParagraphElement | HTMLPreElement) {
    const tag = el.tagName.toLowerCase()
    return html`<div class="paragraph-toolbox">
      <sl-radio-group value=${tag} size="small" @sl-change=${(e: any) => {
        const newEl = el.ownerDocument.createElement(e.target.value) as HTMLParagraphElement | HTMLPreElement
        el.getAttributeNames().forEach(k => newEl.setAttribute(k, el.getAttribute(k)!))
        newEl.replaceChildren(...Array.from(el.childNodes))
        el.replaceWith(newEl)
      }}>
        <sl-radio-button value="p"><sl-icon name="align-justified"></sl-icon></sl-radio-button>
        <sl-radio-button value="pre"><sl-icon name="code-dots"></sl-icon></sl-radio-button>
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

  MathToolbox(el: MathMLElement & HTMLElement) {
    return html`<div class="math-toolbox">
      <sl-input id="math-input" size="small" label="TeX" placeholder=${"\\sqrt{a^2 + b^2}"} @sl-change=${(e: any) => latexToMathML(e.target.value, el)}>
        <sl-icon-button slot="suffix" name="corner-down-left"></sl-icon-button>
      </sl-input>
    </div>`
  }

  SVGToolbox(el: SVGSVGElement & HTMLElement) {
    return html`<div class="svg-toolbox">
      <ww-urlfileinput size="small" id="svg-src" placeholder=${msg("SVG file")} mediaType="image/svg+xml" @sl-change=${async (e: any) => el.outerHTML = await e.target.getValueAsText()}>
        <span slot="label">
          ${msg("Source")}
          <sl-tooltip>
            <sl-icon-button name="info-circle"></sl-icon-button>
            <div class="embeddings-explainer" slot="content">
              <p>${msg("WebWriter can embed SVG directly in the document.")}</p>
            </div>
          </sl-tooltip>
        </span>
      </ww-urlfileinput>
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
      const tagsToExclude = [
        "html",
        "br",
        "wbr",
        ...this.app.commands.markCommands.map(cmd => cmd.id),
        ...MATHML_TAGS
      ]
      if(!(tagsToExclude.includes(el.tagName.toLowerCase())) && !(el.classList.contains("ProseMirror-widget"))) {
        ancestors.unshift(el)
      }
      el = el.parentElement
    }
    return ancestors
  }

  get activeElementPathSimple() {
    let el = this.activeElement
    const ancestors = [] as HTMLElement[]
    while(el) {
      const tagsToExclude = [
        "html",
        "br",
        "wbr",
        "td",
        "tr",
        "thead",
        "tbody",
        "tfoot",
        ...this.app.commands.markCommands.map(cmd => cmd.id),
        ...MATHML_TAGS
      ]
      if(!(tagsToExclude.includes(el.tagName.toLowerCase())) && !(el.classList.contains("ProseMirror-widget"))) {
        ancestors.unshift(el)
      }
      el = el.parentElement
    }
    return ancestors
  }

  get activeElementSiblings() {
    let el = this.activeElement
    return this.filterChildren(el?.parentElement?.children ?? [], el?.tagName.toLowerCase())
  }

  isCustomElement(el: Element) {
    return !!el.ownerDocument.defaultView?.customElements.get(el.tagName.toLowerCase())
  }

  private filterChildren(children: HTMLCollection | HTMLElement[], tag?: string) {
    if(tag && ["svg", "table", "math", "picture", "audio", "video"].includes(tag)) {
      return []
    }
    return (Array.isArray(children)? children: Array.from(children))
      .filter(child => !child.classList.contains("ProseMirror-trailingBreak") && !child.classList.contains("ProseMirror-widget"))
      .filter(child => ![
        "thead",
        "tbody",
        "tfoot",
        ...MATHML_TAGS,
        ...this.app.commands.markCommands.map(cmd => cmd.id),
      ].includes(child.tagName.toLowerCase()))
  }

  @property({attribute: false})
  childrenDropdownActiveElement: Element | null = null

  ElementBreadcrumbItem(el: Element, isLast=false, menuItem=false, hideSeparator=false): TemplateResult {
    const elementName = el.tagName.toLowerCase()
    const isCustomElement = this.isCustomElement(el)
    const isCommandEl = elementName in this.app.commands.commands
    const children = this.filterChildren(el.children, el?.tagName.toLowerCase())
    const separator = menuItem || hideSeparator? null: html`<sl-dropdown ?open=${this.childrenDropdownActiveElement === el} @sl-show=${() => this.childrenDropdownActiveElement = el} @sl-after-hide=${() => this.childrenDropdownActiveElement = null} slot="separator" class="children-dropdown" ?data-empty=${children.length === 0}>
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
      const pkg = Package.fromElement(el as HTMLElement)
      const icon = pkg? this.app.store.packages.packageIcons[pkg.id]: undefined
      const content = html`<ww-button
        title=${elementName}
        variant="icon"
        icon="package"
        src=${ifDefined(icon)}
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
    else if(el.tagName === "BODY") {
      const content = html`<ww-button
        title=${elementName}
        variant="icon"
        icon="file"
        @click=${() => this.emitClickBreadcrumb(el)}
        @hover=${() => this.emitHoverBreadcrumb(el)}
      >
        ${!isLast? null: msg("Document")}
      </ww-button>`
      return !menuItem
        ? html`<sl-breadcrumb-item>${content}${separator}</sl-breadcrumb-item>`
        : html`<sl-menu-item>${content}</sl-menu-item>`
    }
    else {
      const content = html`<ww-button
        title=${elementName}
        variant="icon"
        icon="alert-square"
        @click=${() => this.emitClickBreadcrumb(el)}
        @hover=${() => this.emitHoverBreadcrumb(el)}
      >
        ${!isLast? null: prettifyPackageName(elementName, "all", true)}
      </ww-button>`
      return !menuItem
        ? html`<sl-breadcrumb-item>${content}${separator}</sl-breadcrumb-item>`
        : html`<sl-menu-item>${content}</sl-menu-item>`
    }
  }

  ElementBreadcrumb() {
    const els = this.activeElementPathSimple
    const breadcrumbPath = html`
      ${els.map((el, i) => this.ElementBreadcrumbItem(el, i === els.length - 1))}
      ${this.gapSelected? html`
        <ww-button @click=${() => this.app.activeEditor?.focus()} variant="icon" icon="minus"></ww-button>
      `: null}
    `
    return html`<sl-breadcrumb id="element-breadcrumb">
      <sl-tree>
        <sl-tree-item ?data-selected=${this.activeElement === this.app.activeEditor!.pmEditor.document.body} @sl-expand=${(e: any) => e.target.parentElement instanceof SlTree && (this.activeOutline = true)} @sl-collapse=${(e: any) => e.target.parentElement instanceof SlTree && (this.activeOutline = false)}>
          ${this.activeOutline? this.ElementBreadcrumbItem(this.app.activeEditor!.pmEditor.document.body, true, false, true): breadcrumbPath}
          ${this.ElementTree(undefined, true)}
        </sl-tree-item>
      </sl-tree>
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

  ElementTree(root: HTMLElement=this.app.activeEditor!.pmEditor.document.body, unwrapped=false): TemplateResult {
    const content = html`${this.filterChildren(root.children, root?.tagName.toLowerCase()).map(child => this.ElementTree(child as HTMLElement))}`
    return unwrapped? content: html`<sl-tree-item ?data-selected=${this.activeElement === root}>${this.ElementBreadcrumbItem(root, true, false, true)}${content}</sl-tree-item>`
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
    }/*
    else if(["p", "pre"].includes(tag)) {
      return this.ParagraphToolbox(el as HTMLParagraphElement | HTMLPreElement)
    }*/
    else if(["ul", "ol"].includes(tag)) {
      return this.ListToolbox(el as HTMLOListElement | HTMLUListElement)
    }

    else if(tag === "table") {
      return this.TableToolbox(el as HTMLTableElement)
    }
    else if(this.app.store.packages.widgetTagNames.includes(tag)) {
      return html`<ww-widget-options .widget=${el} .editorState=${this.editorState} @ww-focus-editor=${() => this.app.activeEditor?.focus()}></ww-widget-options>`
    }
    else if(["math"].includes(tag)) {
      return this.MathToolbox(el)
    }
    else if(["svg"].includes(tag)) {
      return this.SVGToolbox(el as SVGSVGElement & HTMLElement)
    }
  }

  render() {
      return html`
        ${this.BlockToolbox(this.activeElement)}
        <aside class="context-toolbox">${this.activeElementPath.map(el => this.ContextToolbox(el))}</aside>
        ${this.InlineToolbox()}
        <sl-icon-button name="x" id="close-button" part="close-button" @click=${() => emitCustomEvent(this, "ww-close")}></sl-icon-button>
      `
  }
}