import {LitElement, html, css, TemplateResult} from "lit"
import {customElement, property, query} from "lit/decorators.js"
import { localized, msg } from "@lit/localize"
import { EditorState } from "prosemirror-state"
import {Node, Fragment, Attrs} from "prosemirror-model"
import { classMap } from "lit/directives/class-map.js"
import { ifDefined } from "lit/directives/if-defined.js"
import { SlDropdown } from "@shoelace-style/shoelace"

import { App, URLFileInput } from "#view"
import { License, Locale, Person, ThemeEditingSettings, deleteHeadElement, getHeadElement, getHeadElementAll, initialHeadState, moveHeadElement, upsertHeadElement } from "#model"
import { capitalizeWord, emitCustomEvent } from "#utility"

type Field<T=any> = {
  name: string,
  label?: string,
  element:  "meta" | "pragma" | "encoding" | "title" | "base" | "link",
  type: T,
  multiple?: boolean,
  multiline?: boolean,
  advanced?: boolean,
  options?: string[],
  priorityOptions?: string[],
  fixed?: boolean
}

@localized()
@customElement("ww-metaeditor")
export class MetaEditor extends LitElement {

  static metaFields = {
    title: {name: "title", label: msg("Title"), element: "title" as const, type: String, fixed: true},
    keywords: {name: "keywords", label: msg("Keywords"), element: "meta" as const, type: String, multiple: true, fixed: true},
    description: {name: "description", label: msg("Description"), element: "meta" as const, type: String, multiline: true, fixed: true},
    author: {name: "author", label: msg("Author"), element: "meta" as const, type: Person, fixed: true},
    license: {name: "license", label: msg("License"), element: "meta" as const, type: License, options: License.spdxLicenseKeys, priorityOptions: ["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-NC-4.0", "CC-BY-ND-4.0", "CC-BY-NC-SA-4.0", "CC-BY-NC-ND-4.0"], fixed: true},
    language: {name: "language", label: msg("Language"), element: "meta" as const, type: Locale, fixed: true},
    generator: {name: "generator", label: msg("Generator"), element: "meta" as const, type: String, fixed: true}
  }

  static standardMetaKeys = [
    "keywords",
    "author",
    "license",
    "language",
    "application-name",
    "generator",
    "referrer",
    "theme-color",
    "color-scheme"
  ]

  static defaultElementFields = {
    meta: {
      name: "",
      element: "meta" as const,
      type: String 
    },
    link: {
      name: "",
      element: "link" as const,
      type: String
    },
    base: {
      name: "base URL",
      element: "base" as const, 
      type: URL,
      fixed: true
    },
    pragma: {
      name: "http-equiv",
      element: "pragma" as const,
      type: String
    },
    encoding: {
      name: "encoding",
      element: "encoding" as const,
      type: String,
      fixed: true
    },
    title: MetaEditor.metaFields.title
  }

  static getDefaultElementField(node: Node) {
    if(["base", "title", "link"].includes(node.type.name)) {
      return (this.defaultElementFields as any)[node.type.name]
    }
    else if(node.type.name === "meta") {
      const isPragma = node.type.name === "meta" && node.attrs["http-equiv"] !== undefined
      const isEncoding = node.type.name === "meta" && node.attrs["charset"] !== undefined
      const isMetaField = node.type.name === "meta" && Object.keys(this.metaFields).includes(node.attrs["name"])
      if(isMetaField) {
        return (this.metaFields as any)[node.attrs["name"]]
      }
      else if(isPragma) {
        return this.defaultElementFields.pragma
      }
      else if(isEncoding) {
        return this.defaultElementFields.encoding
      }
      else {
        return this.defaultElementFields.meta
      }
    }
  }

  static standardRelValues = [
    "alternate",
    "canonical",
    "dns-prefetch",
    "help",
    "icon",
    "manifest",
    "me",
    "modulepreload",
    "next",
    "pingback",
    "preconnect",
    "prefetch",
    "preload",
    "prerender",
    "prev",
    "search",
  ]

  static standardPragmaValues = [
    "content-security-policy",
    "content-type",
    "default-style",
    "x-ua-compatible",
    "refresh"
  ]

  static typeNames = new Map<any, string>([
    [URL, "url"],
    [Date, "date"],
    [String, "text"]
  ])

  @property({type: Object, attribute: false})
  head$: EditorState

  static get styles() {
    return css`

      :host {
        display: grid;
        grid-template-rows: max-content 1fr;
        grid-template-columns: 1fr;
        overflow: visible;
      }

      #content {
        overflow-y: auto;
        /*scrollbar-gutter: stable;*/
      }

      .multiline {
        grid-column: 2;
        grid-row: 2 / 4;
        align-self: stretch;
        display: flex;
        flex-direction: column;
      }

      .multiline sl-textarea {
        flex-grow: 1;
      }

      .multiline sl-textarea::part(form-control), .multiline sl-textarea::part(form-control-input), .multiline sl-textarea::part(base), .multiline sl-textarea::part(textarea) {
        height: 100%;
      }

      .panel {
        padding: 1rem;
        padding-top: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-auto-rows: min-content;
        align-items: flex-start;
        gap: 0.75rem;
      }

      .panel:not([data-active]) {
        display: none;
      }

      .panel:not(.advanced) .label.fixed .delete, .panel:not(.advanced) .move, .panel:not(.advanced) .more {
        display: none;
      }

      nav {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-right: var(--sl-spacing-small);
        min-height: 57px;
        user-select: none;
      }

      
      .advanced[data-active] {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 3ch;
      }

      .advanced[data-active] .add-information {
        width: 100%;
      }

      .advanced[data-active] .add-information::part(base) {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr min-content;
      }

      nav code {
        font-weight: bolder;
      }

      .code-card::part(body) {
        display: flex;
        flex-direction: column;
        padding: 0.5rem;
        gap: 0.5rem;
      }


      .code-card header {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 1ch;
      }

      .code-card:not(.theme) main ww-button {
        border: 1px solid var(--sl-color-gray-300);
        border-radius: var(--sl-border-radius-medium) 0 0 var(--sl-border-radius-medium);
        height: 100%;
        aspect-ratio: 1 / 1;
      }

      .code-card:not(.theme) main ww-urlfileinput::part(base) {
        border-radius: 0 var(--sl-border-radius-medium) var(--sl-border-radius-medium) 0;
      }

      #theme .code-card.theme, #theme .code-card.theme::part(base) {
        height: 100%;
      }

      .code-card.theme {
        grid-column: span 2;
      }

      #theme .code-card.theme::part(body) {
        height: 100%;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 1ch;
      }

      .code-card .label {
        margin-right: auto;
        font-weight: bolder;
        color: var(--sl-color-gray-800);
      }

      .code-card sl-icon {
        font-size: 1.375rem;
        aspect-ratio: 1 / 1;
      }

      .add-information {
        height: 100%;
      }

      .add-information::part(base) {
        height: 100%;
        display: grid;
        grid-template-columns: 1fr min-content;
        grid-template-rows: 1fr;
        align-items: flex-end;
      }

      .add-information sl-button::part(label) {
        display: flex;
        flex-direction: row;
        align-items: center;
        height: 100%;
        gap: 1ch;
      }

      sl-select::part(form-control) {
        display: flex;
        flex-direction: column;
      }

      ww-personinput::part(form-control-label) {
        width: 100%;
        height: 100%
      }

      sl-select::part(expand-icon)::slotted {
        width: 100%;
        height: 100%;
      }

      .label {
        width: 100%;
        display: flex;
        justify-content: space-between;
      }

      .label ww-button::part(icon) {
        font-size: 16px;
      }

      .label ww-combobox::part(base) {
        border: none;
        padding: 0;
        min-height: unset;
      }

      .label ww-combobox {
        min-width: 50%;
      }

      .label ww-combobox::part(input) {
        padding: 0;
      }

      .link .label ww-combobox {
        min-width: 50%;
      }

      .add.code, .add.code::part(base) {
        height: 100%;
        min-height: 100px;
      }

      ww-combobox[disabled]::part(base) {
        border: none;
      }

      .generator > label {
        margin-bottom: var(--sl-spacing-3x-small);
      }

      .generator code {
        min-height: 44px;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid var(--sl-color-gray-300);
        border-radius: var(--sl-input-border-radius-medium);
        box-sizing: border-box;
      }

      .generator code:hover {
        cursor: not-allowed;
        background: var(--sl-color-gray-50);
      }

      .delete {
        --sl-color-primary-400: var(--sl-color-danger-400);
        --sl-color-primary-600: var(--sl-color-danger-600);
      }

      .code-card.theme sl-select {
        width: 100%;
      }

      .code-card.theme::part(base) {
        border: 2px solid var(--sl-color-neutral-300);
        min-height: 73px;
      }

      .attributes::part(body) {
        display: flex;
        flex-direction: column;
        gap: 1ch;
      }

      .dialog.buttons {
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        gap: 1ch;
      }

      sl-checkbox::part(label) {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 1ch;
      }

      .noscript {
        position: relative;
        border: 3px dotted darkgray;
        border-radius: var(--sl-border-radius-medium);
        padding: 2rem;
        display: flex;
        flex-direction: column;
        gap: 2ch;
      }

      .noscript[data-placeholder]::after {
        content: attr(data-placeholder);
        color: var(--sl-color-gray-400);
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        width: 100%;
      }

      .noscript > label {
        position: absolute;
        background: white;
        top: -0.85em;
        left: calc(0.5rem - 6px);
        padding: 0 6px;
        font-weight: bold;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 1ch;
      }

      .noscript > label sl-icon {
        font-size: 24px;
      }

      .noscript .buttons {
        position: absolute;
        background: white;
        top: -0.85em;
        right: 1ch;
        padding: 2px;
      }

      .head-html-label {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 1ch;
      }

      #metrics-list {
        list-style: none;
        padding-left: 0;
        display: flex;
        flex-direction: row;
        gap: 4ch;
        width: 100%;
        justify-content: space-around;
        grid-column: span 2;

        & li {
          display: grid;
          grid-template-rows: 1fr 1fr;
          grid-template-columns: max-content max-content;
          flex-direction: row;
          align-items: center;
          height: 48px;
          gap: 4px;

          & sl-icon {
            width: 48px;
            height: 48px;
            grid-row: span 2;
          }

          & b {
            font-size: 0.8rem;
            font-weight: bolder;
          }

          & sl-format-bytes, & sl-format-number {
            font-family: var(--sl-font-mono);
            font-size: 0.8rem;
          }
        }
      }

      .theme-select::part(display-input) {
        display: none;
      }

      .theme-select::part(combobox) {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        padding-left: 0;
      }

      .theme-option::part(label) {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
      }

      .theme-option[slot=prefix] code {
        display: none;
      }

      .theme-option::part(checked-icon) {
        display: none;
      }

      @media only screen and (max-width: 800px) {
        .panel {
          display: flex;
          flex-direction: column;
          align-items: stretch;
        }
      }
    `
  }

  @property({attribute: false, state: true})
  editingNode?: Node

  @property({attribute: false, state: true})
  editingPos?: number

  @property({type: Object, attribute: false})
  bodyAttrs: Attrs = {}

  @property({type: Object, attribute: false})
  app: App

  @property({type: Object, attribute: false})
  editorState: EditorState

  @property({attribute: false, state: true})
  advanced = false
  
  static elementIcons: Record<Field["element"], string | undefined> = {
    "link": "link",
    "encoding": "letter-e",
    "pragma": "letter-p",
    "base": "circles-relation",
    "title": undefined,
    "meta": undefined
  }

  getNodeValue(node?: Node) {
    if(!node) {
      return ""
    }
    const isLink = node.type.name === "link"
    const isPragma = node.type.name === "meta" && node.attrs["http-equiv"]
    const isEncoding = node.type.name === "meta" && node.attrs["charset"]
    const isTitle = node.type.name === "title"
    const isBase = node.type.name === "base"
    if(isLink || isBase) {
      return node.attrs["href"] ?? ""
    }
    else if(isPragma) {
      return node.attrs["content"] ?? ""
    }
    else if(isEncoding) {
      return node.attrs["charset"] ?? ""
    }
    else if(isTitle) {
      return node.textContent ?? ""
    }
    else {
      return node.attrs["content"] ?? ""
    }
  }

  handleFieldChange(element: Field["element"], value: string, key?: string, pos?: number, name?: string) {
    if(element === "pragma") {
      this.updateState(upsertHeadElement(this.head$,
        "meta",
        {content: value},
        undefined,
        (node, npos) => node.type.name === "meta" && node.attrs["http-equiv"] !== undefined && (pos ?? npos) === npos
      ))
    }
    else if(element === "encoding") {
      this.updateState(upsertHeadElement(this.head$,
        "meta",
        {"charset": value},
        undefined,
        (node, npos) => node.type.name === "meta" && node.attrs["charset"] !== undefined && (pos ?? npos) === npos
      ))
    }
    else if(element === "title") {
      this.updateState(upsertHeadElement(this.head$,
        "title",
        undefined,
        this.head$.schema.text(value),
        (node, npos) => node.type.name === "title"
      ))
    }
    else if(element === "base") {
      this.updateState(upsertHeadElement(this.head$,
        "base",
        {"href": value},
        undefined,
        (node, npos) => node.type.name === "base"
      ))
    }
    else if(element === "meta") {
      this.updateState(upsertHeadElement(this.head$,
        "meta",
        {"content": value, ...name? {name}: undefined},
        undefined,
        (node, npos) => node.type.name === "meta" && (!key || key === node.attrs.name)  && (pos ?? npos) === npos
      ))
      if(name === "language") {
        this.updateState(upsertHeadElement(this.head$, "head", {htmlAttrs: {...this.head$.doc.attrs.htmlAttrs, lang: value}}, undefined, node => node.type.name === "head"))
        if(this.app.store.ui.propagateLang) {
          emitCustomEvent(this, "ww-update-lang", {value}) 
        }
      }
    }
    else if(element === "link") {
      this.updateState(upsertHeadElement(this.head$,
        "meta",
        {"content": value, ...name? {rel: name}: undefined},
        undefined,
        (node, npos) => node.type.name === "link" && (!key || key === node.attrs.rel) && (pos ?? npos) === npos
      ))
    }
  }

  handleFieldDelete(pos: number) {
    this.updateState(deleteHeadElement(this.head$,
      (node, npos) => pos === npos
    ))
  }

  handleFieldRename(element: "meta" | "link", value: any, pos: number) {
    if(element === "meta") {
      this.updateState(upsertHeadElement(this.head$,
        "meta",
        {"name": value},
        undefined,
        (node, npos) => node.type.name === "meta" && (pos ?? npos) === npos
      ))
    }
    else if(element === "link") {
      this.updateState(upsertHeadElement(this.head$,
        "link",
        {"rel": value.join(" ")},
        undefined,
        (node, npos) => node.type.name === "link" && (pos ?? npos) === npos
      ))
    }
    else if(element === "pragma") {
      this.updateState(upsertHeadElement(this.head$,
        "meta",
        {"http-equiv": value},
        undefined,
        (node, npos) => node.type.name === "meta" && (pos ?? npos) === npos
      ))
    }
  }

  handleResetClick() {
    this.updateState(initialHeadState())
  }

  getElementLabel(name: string, element: string, fixed: boolean, node?: Node) {
    if(fixed && element === "meta") {
      return capitalizeWord(name)
    }
    else if (fixed) {
      return capitalizeWord(element)
    }
    else if(element === "pragma") {
      return "http-equiv"
    }
    else if(element === "link") {
      return node?.attrs.rel.split(" ") ?? []
    }
    else {
      return capitalizeWord(node?.attrs.name ?? "")
    }
  }

  getElementNameSuggestions(element: Field["element"]) {
    if(element === "link") {
      return MetaEditor.standardRelValues
    }
    else {
      return []
    }
  }

  getElementPlaceholder(element: Field["element"]) {
    if(element === "link") {
      return msg("Relationship")
    }
    else {
      return msg("Name")
    }
  }

  Field({name, label, element, type, multiline, multiple, options, priorityOptions, fixed}: Field, node?: Node, pos?: number, parent?: Node) {
    let value = this.getNodeValue(node)
    const finalName = this.getElementLabel(name, element, !!fixed, node)
    const suggestions = this.getElementNameSuggestions(element)
    const placeholder = this.getElementPlaceholder(element)

    const labelTemplate = html`<label slot="label" class=${classMap({"label": true, fixed: !!fixed})}>
      <ww-combobox placeholder=${placeholder} size="small" .value=${label ?? finalName} @click=${(e: any) => e.stopImmediatePropagation()} ?suggestions=${suggestions.length > 0} ?multiple=${element === "link"} @sl-change=${(e: any) => {this.handleFieldRename(element as any, e.target.value, pos!); e.stopImmediatePropagation()}} ?inert=${!!fixed || element === "pragma"}>
        ${suggestions.map(v => html`<sl-option value=${v}>${v}</sl-option>`)}
      </ww-combobox>
      ${name === "generator" || node?.attrs.name === "generator"? null: html`<div>
        <ww-button
          class="move"
          variant="icon"
          icon="arrow-up"
          @click=${(e: any) => {e.stopImmediatePropagation(); this.moveElement(node!, "up", parent)}}
          title=${msg("Move up")}
        ></ww-button>
        <ww-button
          class="move"
          variant="icon"
          icon="arrow-down"
          @click=${(e: any) => {e.stopImmediatePropagation(); this.moveElement(node!, "down", parent)}}
          title=${msg("Move down")}
        ></ww-button>
        <ww-button
          class="more"
          variant="icon"
          icon="dots"
          @click=${(e: any) => {e.stopImmediatePropagation(); this.editingNode = node; this.editingPos = pos}}
          title=${msg("Advanced Options")}
        ></ww-button>
        <ww-button
          class="delete"
          variant="icon"
          icon="trash"
          @click=${(e: any) => {e.stopImmediatePropagation(); this.handleFieldDelete(pos!)}}
          title=${msg("Remove field")}
        ></ww-button>
      </div>`
      }
    </label>`

    if(type === License) {
      const optionTemplate = (option: string) => html`<sl-option value=${option}>
        <small><b>${option}</b></small>
        <div>${new License(option).name}</div>
      </sl-option>`
      return html`<ww-licenseinput suggestions .value=${value} @sl-change=${(e: any) => this.handleFieldChange(element, e.target.value, name, pos, !fixed? undefined: name)}>
        ${!priorityOptions? null: html`
          ${priorityOptions.map(optionTemplate)}
          <sl-divider></sl-divider>
        `}
        ${options?.map(optionTemplate)}
        ${labelTemplate}
      </ww-licenseinput>`
    }

    else if(type === Person) {
      return html`<ww-personinput .value=${value} @sl-change=${(e: any) => this.handleFieldChange(element, e.target.value, name, pos, !fixed? undefined: name)}>
        ${labelTemplate}
      </ww-personinput>`
    }

    else if(type === Locale) {
      value = this.head$.doc.attrs?.htmlAttrs?.lang
      const preferredLangs = Locale.preferredLanguageCodes.map(code => Locale.getLanguageInfo(code))
      const otherLangs = Locale.languageInfos.filter(({code}) => !navigator.languages.includes(code))
      return html`<sl-select value=${value} hoist @sl-change=${(e: any) => this.handleFieldChange(element, e.target.value, name, pos, !fixed? undefined: name)}>
        ${labelTemplate}
        ${preferredLangs
          .map(({code, name, nativeName}) => html`
            <sl-option value=${code}>${name} (${nativeName})</sl-option>
          `)
        }
        <sl-divider></sl-divider>
        ${otherLangs
          .map(({code, name, nativeName}) => html`
            <sl-option value=${code}>${name} (${nativeName})</sl-option>
          `)
        }
      </sl-select>`
    }
    
    else if (name === "generator") {
      return html`<div class="generator">
        ${labelTemplate}
        <code>${value}</code>
      </div>`
    }

    const icon = MetaEditor.elementIcons[element]
    return multiline
      ? html`<div class="multiline">
        ${labelTemplate}
      <sl-textarea size="small" resize="none" name=${name} .value=${value} @sl-change=${(e: any) => this.handleFieldChange(element, e.target.value, name, pos, !fixed? undefined: name)}>

      </sl-textarea></div>`
      : html`<ww-combobox type=${ifDefined(MetaEditor.typeNames.get(type))} ?multiple=${!!multiple} ?suggestions=${element === "pragma"} .value=${value} @sl-change=${(e: any) => this.handleFieldChange(element, e.target.value, name, pos, !fixed? undefined: name)}>
        ${labelTemplate}
        ${icon? html`<sl-icon slot="prefix" name=${icon}></sl-icon>`: null}
        ${element !== "pragma"? null: MetaEditor.standardPragmaValues.map(v => html`
          <sl-option value=${v}>${v}</sl-option>
        `)}
      </ww-combobox>`
  }

  NoScript(node: Node, pos: number, content: {node: Node, pos: number}[], parent?: Node) {
    return html`<div class="noscript" data-placeholder=${ifDefined(content.length === 0? msg("Move meta/link/style elements up/down into this element"): undefined)}>
      <label>
        <sl-icon name="code-off"></sl-icon>
        <span>${msg("NoScript")}</span>
      </label>
      <div class="buttons">
        <ww-button
          class="move"
          variant="icon"
          icon="arrow-up"
          @click=${(e: any) => {e.stopImmediatePropagation(); this.moveElement(node, "up", parent)}}
          title=${msg("Move up")}
        ></ww-button>
        <ww-button
          class="move"
          variant="icon"
          icon="arrow-down"
          @click=${(e: any) => {e.stopImmediatePropagation(); this.moveElement(node, "down", parent)}}
          title=${msg("Move down")}
        ></ww-button>
        <ww-button
            class="more-button"
            variant="icon"
            icon="dots-vertical"
            @click=${(e: any) => {e.stopImmediatePropagation(); this.editingNode = node; this.editingPos = pos}}
            title=${msg("Advanced Options")}
          ></ww-button>
        <ww-button class="delete" variant="icon" icon="trash" @click=${() => this.deleteElement(pos)}></ww-button>
      </div>
      ${content.map(({node: n, pos}) => this.NodeElement(n, pos, node))}
    </div>`
  }

  insertNew(id: string, attrs?: {}): EditorState {
    if(id === "meta") {
      return upsertHeadElement(this.head$, "meta", {name: "", content: "", ...attrs})
    }
    else if(id === "base") {
      return upsertHeadElement(this.head$, "base", attrs)
    }
    else if(id === "link") {
      return upsertHeadElement(this.head$, "link", {rel: "", href: "", ...attrs})
    }
    else if(id === "title") {
      return upsertHeadElement(this.head$, "title", attrs)
    }
    else if(id === "encoding") {
      return upsertHeadElement(this.head$, "meta", {charset: "utf-8", ...attrs})
    }
    else if(id === "pragma") {
      return upsertHeadElement(this.head$, "meta", {"http-equiv": "", ...attrs})
    }
    else if(id === "style" || id === "script" || id === "noscript") {
      return upsertHeadElement(this.head$, id, attrs)
    }
    else {
      return this.head$
    }
      
  }

  handleAddClick(id: string) {
    if(id === "trigger") {
      return
    }
    this.updateState(this.insertNew(id)!)
  }



  @query(".add-information sl-dropdown")
  addInformationDropdown: SlDropdown

  AddInformationButton(full=false) {
    return html`<sl-button-group class="add-information">
      ${!full? null: html`
        <sl-button id="script" outline @click=${() => this.handleAddClick("script")}>
          <sl-icon name="plus"></sl-icon>
          ${msg("Script")}
        </sl-button>
        <sl-button id="style" outline @click=${() => this.handleAddClick("style")}>
        <sl-icon name="plus"></sl-icon>
        ${msg("Style")}
      </sl-button>
      `}
      <sl-button id="meta" outline @click=${() => this.handleAddClick("meta")}>
        <sl-icon name="plus"></sl-icon>
        ${full? msg("Meta"): msg("Metadata")}
      </sl-button>
      ${!full? null: html`
        <sl-dropdown placement="bottom-end">
          <sl-button id="trigger" slot="trigger" outline caret></sl-button>
          <sl-menu .containingElement=${this}>
            <sl-menu-item @click=${() => this.handleAddClick("link")}>
              <sl-icon id="link" slot="prefix" name="plus"></sl-icon>
              ${msg("Link")} <code  id="link">${"(<link>)"}</code>
            </sl-menu-item>
            <sl-menu-item ?disabled=${this.baseExists} @click=${(e: any) => {this.handleAddClick("base"); this.addInformationDropdown.hide()}}>
              <sl-icon slot="prefix" name="plus"></sl-icon>
              ${msg("Base URL")} <code>${"(<base>)"}</code>
            </sl-menu-item>
            <sl-menu-item @click=${() => this.handleAddClick("pragma")}>
              <sl-icon slot="prefix" name="plus"></sl-icon>
              ${msg("Pragma")} <code>${"(<meta http-equiv=...>)"}</code>
            </sl-menu-item>
            <sl-menu-item ?disabled=${this.encodingExists} @click=${(e: any) => {this.handleAddClick("encoding"); this.addInformationDropdown.hide()}}
            >
              <sl-icon slot="prefix" name="plus"></sl-icon>
              ${msg("Encoding")} <code>${"(<meta charset=...>)"}</code>
            </sl-menu-item>
              <sl-menu-item @click=${(e: any) => {this.handleAddClick("noscript"); this.addInformationDropdown.hide()}}>
                <sl-icon slot="prefix" name="plus"></sl-icon>
                ${msg("NoScript")} <code>${"(<noscript>)"}</code>
              </sl-menu-item>
          </sl-menu>
        </sl-dropdown>
      `}
    </sl-button-group>`
  }

  getCodeLabel(node: Node, {theme, style, script}: Record<string, boolean>) {
    if(theme) {
      return msg("Theme")
    }
    else if(style) {
      return msg("Style")
    }
    else if(script) {
      return msg("Script")
    }
  }

  setTheme(value: string) {
    const allThemes = this.app.store.packages.allThemes as any
    if(!(value in allThemes)) {
      throw Error(`${value} is not a theme`)
    }
    else {
      this.updateState(upsertHeadElement(
        this.head$,
        "style",
        {data: {"data-ww-theme": value}},
        this.head$.schema.text(allThemes[value].source),
        node => node.attrs?.data && node.attrs.data["data-ww-theme"] !== undefined
      ))
    }
  }

  deleteElement(pos: number) {
    this.updateState(deleteHeadElement(this.head$, (_, p) => pos === p))
  }

  moveElement(node: Node, direction: "up" | "down", parent?: Node) {
    this.updateState(moveHeadElement(this.head$, node, direction, parent))
  }

  async handleCodeValueChange(e: Event & {target: URLFileInput}, node: Node, pos: number) {
    const url = e.target.value
    const isBlob = e.target.isBlob
    let newName = node.type.name as "link" | "style" | "script"
    let newAttrs = node.attrs
    let newContent = node.content as Node | Fragment | undefined
    const blob = await (await fetch(url)).blob()
    const text = await blob.text()
    const type = blob.type
    if(["link", "style"].includes(node.type.name) && isBlob) {
      newName = "style"
      newAttrs = node.attrs
      newContent = node.type.schema.text(text)
    }
    else if(["link", "style"].includes(node.type.name) && !isBlob) {
      newName = "link"
      newAttrs = {...newAttrs, rel: "stylesheet", href: url}
      newContent = undefined
    }
    else if(node.type.name === "script" && isBlob) {
      newName = "script"
      newAttrs = {...newAttrs, src: undefined, type: url? type: undefined}
      newContent = node.type.schema.text(text)
    }
    else if(node.type.name === "script" && !isBlob) {
      newName = "script"
      newAttrs = {...newAttrs, src: url, type: url? type: undefined}
      newContent = undefined
    }

    this.updateState(upsertHeadElement(
      this.head$,
      newName,
      newAttrs,
      newContent,
      (node, npos) => pos === npos
    ))
  }

  Code(node: Node, pos: number, parent?: Node) {
    const script = node.type.name === "script"
    const style = !script
    const theme = style && node.attrs?.data["data-ww-theme"] !== undefined
    const classes = {"code-card": true, script, style, theme}

    const allThemes = this.app.store.packages.allThemes

    const cardBodyLabel = html`
      <sl-icon name=${script? "code-dots": "brush"}></sl-icon>
      <span class="label">${this.getCodeLabel(node, classes)}</span>
    `

    const themeOption = (id: string, theme: ThemeEditingSettings, slot?: string) => html`<sl-option class="theme-option" value=${id} slot=${ifDefined(slot)}>
      <span>${theme?.label?._ ?? msg("Unnamed Theme")}</span>
      <code>${id}</code>
    </sl-option>`

    const cardBody = theme
      ? html`
        <header>
          ${cardBodyLabel}
        </header>
        <main>
          <sl-select class="theme-select" hoist value=${node.attrs.data["data-ww-theme"]} @sl-change=${(e: any) => this.setTheme(e.target.value)}>
            ${Object.entries(allThemes).map(t => themeOption(...t))}
            ${themeOption(node.attrs.data["data-ww-theme"], (allThemes as any)[node.attrs.data["data-ww-theme"]], "prefix")}
          </sl-select>
        </main>
      `: html`
        <header>
          ${cardBodyLabel}
          <ww-button
            class="move"
            variant="icon"
            icon="arrow-up"
            @click=${(e: any) => {e.stopImmediatePropagation(); this.moveElement(node, "up", parent)}}
            title=${msg("Move up")}
          ></ww-button>
          <ww-button
            class="move"
            variant="icon"
            icon="arrow-down"
            @click=${(e: any) => {e.stopImmediatePropagation(); this.moveElement(node, "down", parent)}}
            title=${msg("Move down")}
          ></ww-button>
          <ww-button variant="icon" icon="dots-vertical" @click=${(e: any) => {e.stopImmediatePropagation(); this.editingNode = node; this.editingPos = pos}}></ww-button>
          <ww-button class="delete" variant="icon" icon="trash" @click=${() => this.deleteElement(pos)}></ww-button>
        </header>
        <main>
          <ww-urlfileinput
            ?linkonly=${node.type.name === "link"}
            @sl-change=${(e: any) => this.handleCodeValueChange(e, node, pos)}
          ></ww-urlfileinput>
        </main>
      `

    return html`<sl-card class=${classMap(classes)}>${cardBody}</sl-card>`
  }

  AddCodeButton(type: "script" | "style") {
    return html`<ww-button
      class="add code"
      icon="plus"
      outline
      @click=${() => this.handleAddClick(type)}>
        ${type === "script"? msg("Script"): msg("Style")}
      </ww-button>`
  }

  onClickTab(e: any) {
    this.activeTab = e.target.panel
    this.dispatchEvent(new CustomEvent("ww-click-tab", {bubbles: true, composed: true}))
  }

  @property({type: String, attribute: true})
  activeTab: string | null = null

  updateState(state: EditorState) {
    this.head$ = state
    this.dispatchEvent(new CustomEvent("ww-update", {composed: true, bubbles: true, detail: {state}}))
  }

  getNodeOfField(element: Field["element"], key?: string) {
    return getHeadElement(this.head$, node => {
      if(element === "link") {
        return node.type.name === "link" && (!key || key === node.attrs.rel)
      }
      else if(element === "pragma") {
        const isPragma = node.type.name === "meta" && node.attrs["http-equiv"] !== undefined
        return isPragma
      }
      else if(element === "encoding") {
        const isEncoding = node.type.name === "meta" && node.attrs["charset"] !== undefined
        return isEncoding
      }
      else if(element === "title") {
        return node.type.name === "title"
      }
      else if (element === "base") {
        return node.type.name === "base"
      }
      else {
        return node.type.name === "meta" && (!key || key === node.attrs.name)
      }
    })
  }

  get allNodes() {
    return getHeadElementAll(this.head$, (node, _, parent) => {
      return node.type.name !== "text" && this.head$.doc === parent
    })
  }

  get themeNode() {
    return getHeadElement(this.head$, node => (node.attrs.data ?? {})["data-ww-theme"] !== undefined)
  }

  get otherFieldNodes() {
    const mainNodes = Object.entries(MetaEditor.metaFields)
      .map(([k, v]) => this.getNodeOfField(v.element, k)?.node)
    return this.allNodes
      .filter(({node, pos}) => {
        return node.type.name === "meta" && node.attrs["http-equiv"] === undefined && node.attrs["charset"] === undefined
      })
      .filter(({node, pos}) => !mainNodes.includes(node))
  }

  get baseExists() {
    return this.allNodes.some(({node}) => node.type.name === "base") 
  }

  get encodingExists() {
    return this.allNodes.some(({node}) => node.type.name === "meta" && node.attrs["charset"] !== undefined) 
  }
  
  NodeElement(node: Node, pos: number, parent?: Node): TemplateResult {
    if(["script", "style"].includes(node.type.name)) {
      return this.Code(node, pos, parent)
    }
    else if(node.type.name === "noscript") {
      const content = getHeadElementAll(this.head$, (_, __, parent) => parent === node && node.type.name !== "text")
      return this.NoScript(node, pos, content, parent)
    }
    else {
      return this.Field(MetaEditor.getDefaultElementField(node), node, pos, parent)
    }
  }

  get htmlPseudoNode() {
    return {
      type: {
        name: "html"
      },
      attrs: this.head$.doc.attrs.htmlAttrs
    } as Node
  }

  get bodyPseudoNode() {
    return {
      type: {
        name: "body"
      },
      attrs: this.bodyAttrs
    } as Node
  }

  handleConfirmAttrs(e: any) {
    const {type, attrs, content} = e.target.node
    let newState = this.head$
    if(type.name === "head") {
      let matcher = (node: Node) => node.type.name === "head"
      newState = upsertHeadElement(this.head$, "head", attrs, content, matcher)
    }
    else if (type.name === "html") {
      let matcher = (node: Node) => node.type.name === "head"
      newState = upsertHeadElement(this.head$, "head", {htmlAttrs: attrs}, content, matcher)
    }
    else if (type.name === "body") {
      this.bodyAttrs = attrs
      return this.dispatchEvent(new CustomEvent("ww-change-body-attrs"))
    }
    else {
      let matcher = (_: Node, pos: number) => pos === this.editingPos
      newState = upsertHeadElement(this.head$, type.name, attrs, content, matcher)
    }
    this.updateState(newState)
  }

  Metrics() {
    const {graphemeCount, wordCount, sentenceCount} = this.app.store.document
    const lang = this.app.store.ui.locale
    return html`<ul id="metrics-list">
      <li>
        <sl-icon name="binary"></sl-icon> 
        <b>${msg("File Size")}</b>
        <sl-format-bytes lang=${lang}></sl-format-bytes>
      </li>
      <li>
        <sl-icon name="letter-c-small"></sl-icon> 
        <b>${msg("Characters")}</b>
        <sl-format-number value=${graphemeCount} lang=${lang}></sl-format-number>
      </li>
      <li>
        <sl-icon name="letter-w-small"></sl-icon> 
        <b>${msg("Words")}</b>
        <sl-format-number value=${wordCount} lang=${lang}></sl-format-number>
      </li>
      <li>
        <sl-icon name="letter-s-small"></sl-icon> 
        <b>${msg("Sentences")}</b>
        <sl-format-number value=${sentenceCount} lang=${lang}></sl-format-number>
      </li>
    </ul>
    `
  }

	render() {
    const mainInformationFields = Object.values(MetaEditor.metaFields)
      .map(v => {
        const {node, pos} = this.getNodeOfField(v.element, v.name) ?? {node: this.head$.schema.node(v.element)}
        return this.Field(v, node, pos)
      })
    const otherInformationFields = this.otherFieldNodes.map(({node, pos}) => {
      const field = MetaEditor.getDefaultElementField(node)
      return this.Field(field, node, pos)
    })
    const themeCode = this.themeNode? this.Code(this.themeNode.node, this.themeNode.pos): undefined

    return html`
      <nav>
        <div>
          <sl-tab slot="nav" @click=${this.onClickTab} ?active=${this.activeTab === "meta"} panel="meta">${msg("Metadata")}</sl-tab>
          <sl-tab slot="nav" @click=${this.onClickTab} ?active=${this.activeTab === "metrics"} panel="metrics">${msg("Metrics")}</sl-tab>
        </div>
        <div>
          <ww-button id="advanced" variant="icon" icon=${this.advanced? "badge-filled": "badge"} @click=${() => this.advanced = !this.advanced} title=${msg("Toggle advanced options")}></ww-button>
          <ww-button id="reset" variant="icon" icon="rotate" @click=${this.handleResetClick} title=${msg("Reset information, styles and scripts")}></ww-button>
          <ww-button id="more" variant="icon" icon="dots-vertical" @click=${(e: any) => {e.stopImmediatePropagation(); this.editingNode = this.head$.doc; this.editingPos = 0}}></ww-button>
        </div>
      </nav>
      <div id="content">
        <div id="meta" class=${"panel" + (this.advanced? " advanced": "")} ?data-active=${this.activeTab === "meta"}>
          ${this.advanced? html`
            ${this.allNodes.map(({node, pos}) => this.NodeElement(node, pos))}
            ${this.AddInformationButton(true)}
          `: html`
            ${themeCode}
            ${mainInformationFields}
            ${otherInformationFields}
            ${this.AddInformationButton()}
          `}
        </div>
        <div id="assets" class="panel" ?data-active=${this.activeTab === "assets"}>
        </div>
        <div id="metrics" class="panel" ?data-active=${this.activeTab === "metrics"}>
          ${this.Metrics()}
        </div>
      </div>
      <ww-attributesdialog
        ?open=${!!this.editingNode}
        .node=${this.editingNode}
        @sl-after-hide=${() => this.editingNode = undefined}
        @ww-confirm=${(e: any) => this.handleConfirmAttrs(e)}>
        ${!["head", "html", "body"].includes(this.editingNode?.type.name!)? null: html`
          <div class="head-html-label" slot="label">
            <span>${msg("Edit ")}</span>
            <sl-button-group>
              <sl-button
                variant=${this.editingNode?.type.name === "html"? "primary": "default"}
                @click=${() => {this.editingNode = this.htmlPseudoNode; this.editingPos = undefined}}
                id="html">
                ${"<html>"}
              </sl-button>
              <sl-button
                variant=${this.editingNode?.type.name === "head"? "primary": "default"}
                @click=${() => {this.editingNode = this.head$.doc; this.editingPos = undefined}}
                id="head">
                ${"<head>"}
              </sl-button>
              <sl-button  
                variant=${this.editingNode?.type.name === "body"? "primary": "default"}
                @click=${() => {this.editingNode = this.bodyPseudoNode; this.editingPos = undefined}}
                id="body">
                ${"<body>"}
              </sl-button>
            </sl-button-group>
          </div>
        `}
      </ww-attributesdialog>
    `
	}
}