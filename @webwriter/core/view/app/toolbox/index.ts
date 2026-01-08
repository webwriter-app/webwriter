import { LitElement, TemplateResult, css, html } from "lit"
import { customElement, property, query, queryAll } from "lit/decorators.js"
import {cache} from 'lit/directives/cache.js';
import { MathMLToLaTeX } from "mathml-to-latex"

import { emitCustomEvent, prettifyPackageName, unscopePackageName } from "#utility"
import { classMap } from "lit/directives/class-map.js"
import { localized, msg } from "@lit/localize"
import { Command, LayoutCommand } from "#viewmodel"
import { spreadProps } from "@open-wc/lit-helpers"

import { ifDefined } from "lit/directives/if-defined.js"
import { App, URLFileInput, TextPicker } from "#view"
import { AllSelection, EditorState, TextSelection } from "prosemirror-state"
import {GapCursor} from "prosemirror-gapcursor"
import {AIToolboxWidget} from "#view/app/toolbox/ai-widget";
// @ts-ignore
import {render as latexToMathML} from "temml/dist/temml.cjs"
import { SlColorPicker, SlTree } from "@shoelace-style/shoelace"
import { CSSPropertySpecs, MATHML_TAGS, Package } from "#model/index.js"
import { LitPickerElement } from "#view/elements/stylepickers/index.js"
import { findParentNodeClosestToPos } from "prosemirror-utils";
import "./widgetoptions"
import "./ai-widget"
import styles from "./index.style"

import ar from "emoji-picker-element/i18n/ar"
import de from "emoji-picker-element/i18n/de"
import en from "emoji-picker-element/i18n/en"
import es from "emoji-picker-element/i18n/es"
import fr from "emoji-picker-element/i18n/fr"
import id from "emoji-picker-element/i18n/id"
import it from "emoji-picker-element/i18n/it"
import ja from "emoji-picker-element/i18n/ja"
import nl from "emoji-picker-element/i18n/nl"
import pl from "emoji-picker-element/i18n/pl"
import pt_BR from "emoji-picker-element/i18n/pt_BR"
import pt_PT from "emoji-picker-element/i18n/pt_PT"
import ru from "emoji-picker-element/i18n/ru_RU"
import tr from "emoji-picker-element/i18n/tr"
import zh_hans from "emoji-picker-element/i18n/zh_CN"
import { Mark } from "prosemirror-model";
import { canAddCommentThread, CommentData } from "#model/schemas/resource/comment.js";

const emojiPickerTranslations = {ar, de, en, es, fr, id, it, ja, nl, pl, pt_BR, pt_PT, ru, tr, zh_hans}

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
  activeLayoutCommand: LayoutCommand | {id: "_comment"} | undefined

  @property({attribute: false})
  testStatus: any

  @property({type: Boolean})
  activeLayoutAdvanced = false

  @property({type: Boolean})
  activeOutline = false

  @property({type: Boolean})
  activeEmojiInput = false

  @property({type: Boolean, attribute: true, reflect: true})
  testMode = false

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

  static styles = styles

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

  get computedStyleOfActiveElement() {
    if(!this.activeElement) {
      return undefined
    }
    else {
      return this.app.activeEditor?.pmEditor.window.getComputedStyle(this.activeElement)
    }
  }

  get styleOfActiveElement() {
    if(!this.activeElement) {
      return undefined
    }
    else {
      return this.activeElement.style
    }
  }

  handleStyleChange = (e: any) => this.emitSetStyle(this.activeElement!, e.target.value)

  Pickers = (activeLayoutCommand?: Toolbox["activeLayoutCommand"]) => {
    const properties = html`
      <ww-box-picker class="style-picker" ?data-active=${this.activeLayoutCommand?.id === "boxStyle"} ?advanced=${this.activeLayoutAdvanced} @change=${this.handleStyleChange} .value=${this.styleOfActiveElement} .computedValue=${this.computedStyleOfActiveElement}></ww-box-picker>
      <ww-layout-picker class="style-picker" ?data-active=${this.activeLayoutCommand?.id === "layoutStyle"} ?advanced=${this.activeLayoutAdvanced} @change=${this.handleStyleChange} .value=${this.styleOfActiveElement} .computedValue=${this.computedStyleOfActiveElement}></ww-layout-picker>
      <ww-text-picker class="style-picker" ?data-active=${this.activeLayoutCommand?.id === "textStyle"} ?advanced=${this.activeLayoutAdvanced} @change=${this.handleStyleChange} .value=${this.styleOfActiveElement} .computedValue=${this.computedStyleOfActiveElement}></ww-text-picker>
      <ww-blending-picker class="style-picker" ?data-active=${this.activeLayoutCommand?.id === "blendingStyle"} ?advanced=${this.activeLayoutAdvanced} @change=${this.handleStyleChange} .value=${this.styleOfActiveElement} .computedValue=${this.computedStyleOfActiveElement}></ww-blending-picker>
      <ww-interactivity-picker class="style-picker" ?data-active=${this.activeLayoutCommand?.id === "interactivityStyle"} ?advanced=${this.activeLayoutAdvanced} @change=${this.handleStyleChange} .value=${this.styleOfActiveElement} .computedValue=${this.computedStyleOfActiveElement}></ww-interactivity-picker>
      <ww-miscellaneous-picker class="style-picker" ?data-active=${this.activeLayoutCommand?.id === "miscellaneousStyle"} ?advanced=${this.activeLayoutAdvanced} @change=${this.handleStyleChange} .value=${this.styleOfActiveElement} .computedValue=${this.computedStyleOfActiveElement}></ww-miscellaneous-picker>
      <div class="style-picker" ?data-active=${this.activeLayoutCommand?.id === "_comment"}>
        ${this.CommentToolbox(this.app.commands.commands.comment.value)}
      </div>`
    return html`<sl-popup class="pickers-popup" ?data-active=${this.activeLayoutCommand && !this.gapSelected} shift strategy="fixed" auto-size="both" active anchor=${ifDefined(activeLayoutCommand?.id)} .autoSizeBoundary=${document.body} shift-padding=${this.shiftPaddingStyling} placement="bottom-start">
      <h3>
        <span>${activeLayoutCommand?.id === "_comment"? msg("Comments"): (activeLayoutCommand as any)?.label}</span>
        ${activeLayoutCommand?.id === "_comment"? null: html`
          <sl-icon-button name=${this.activeLayoutAdvanced? "badge-filled": "badge"} @click=${() => this.activeLayoutAdvanced = !this.activeLayoutAdvanced} style="margin-left: 0.5ch;"></sl-icon-button>
          <sl-icon-button name="restore" style="margin-left: 0.25ch;" @click=${() => this.emitSetStyle(this.activeElement!, (this.shadowRoot!.querySelector(".style-picker[data-active]") as LitPickerElement).emptyValue as any)}></sl-icon-button>
        `}
        <sl-icon-button name="x" @click=${() => {this.activeLayoutCommand = undefined; this.activeLayoutAdvanced = false}}></sl-icon-button>  
      </h3>
      ${properties}
    </sl-popup>`
  }

  ElementCommands = () => this.app.commands.elementCommands.map(cmd => {
    return html`
      <ww-button
        ${spreadProps(cmd.toObject())}
        class=${"block-command" + (cmd.active? " applied": "")}
        ?data-active=${cmd.id === "_comment" && this.activeLayoutCommand?.id === "_comment"}
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
    const isFirst = this.#firstBlockToolboxRender
    this.#firstBlockToolboxRender = false
    return html`<div class="block-toolbox">
      <div class="block-options">
        ${this.ElementBreadcrumb()}
        <div part="block-commands">
          ${this.ElementCommands()}
          ${this.LayoutCommands(false)}
        </div>
      </div>
    </div>
    ${cache(this.activeLayoutCommand || isFirst? this.Pickers(this.activeLayoutCommand): undefined)}`
  }

  #firstBlockToolboxRender = true

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
      <ww-button class="icon" variant="icon" icon="mood-happy" id="emoji-trigger" ?data-active=${this.activeEmojiInput} @click=${() => this.activeEmojiInput = !this.activeEmojiInput}></ww-button>
      <ww-button variant="icon" ${spreadProps(clearFormattingCommand.toObject())} @click=${() => clearFormattingCommand.run()}></ww-button>
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
      <sl-popup ?active=${this.activeEmojiInput} anchor="emoji-trigger" placement="right" flip flip-fallback-placements="bottom">
        <emoji-picker .i18n=${(emojiPickerTranslations as any)?.[this.app.store.ui.locale] ?? emojiPickerTranslations.en} locale=${this.app.store.ui.locale} @emoji-click=${(e: any) => this.emitInsertText(e.detail.unicode)}></emoji-picker>
      </sl-popup>
      ${this.MarkCommands(true)}
      ${this.ActiveInlineFields()}
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
        <sl-switch size="small" ?checked=${conEl?.hasAttribute("muted") ?? false} id="muted" ?data-hidden=${!isAudioVideo}>${msg("Mute")}</sl-switch>
      </aside>
    </div>`
  }

  emitSetAttribute(el: Element, key: string, value?: string, tag?: string) {
    this.dispatchEvent(new CustomEvent("ww-set-attribute", {bubbles: true, composed: true, detail: {el, key, value, tag}}))
  }

  emitSetStyle(el: Element, style: Record<keyof CSSPropertySpecs, string>) {
    this.dispatchEvent(new CustomEvent("ww-set-style", {bubbles: true, composed: true, detail: {el, style}}))
  }

  emitInsertText(text: string) {
    this.dispatchEvent(new CustomEvent("ww-insert-text", {bubbles: true, composed: true, detail: {text}}))
  }

  emitSetHeadingLevel(el: HTMLHeadingElement, level: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
    this.dispatchEvent(new CustomEvent("ww-set-heading-level", {bubbles: true, composed: true, detail: {el, level}}))
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
        return this.emitSetHeadingLevel(el, e.target.value)
        const newEl = el.ownerDocument.createElement(e.target.value) as HTMLHeadingElement
        el.getAttributeNames().forEach(k => newEl.setAttribute(k, el.getAttribute(k)!))
        newEl.replaceChildren(...Array.from(el.childNodes))
        el.append("empty")
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

  handleMathChange = (el: MathMLElement & HTMLElement, e: any) => {
    try {
      latexToMathML(e.target.value, el, {annotate: true, throwOnError: true});
    }
    catch(err) {

    }
    this.app.activeEditor?.focus();
    this.app.activeEditor!.selectElementInEditor(el)
  }

  getMathValue = (el: MathMLElement & HTMLElement) => {
    const annotations = Array.from(el.querySelectorAll("annotation[encoding='application/x-tex']"))
    return annotations.reduce((acc, el) => acc + el.textContent, "") || MathMLToLaTeX.convert(el.outerHTML)
  }

  MathToolbox(el: MathMLElement & HTMLElement) {
    return html`<div class="math-toolbox">
      <sl-textarea autocapitalize="off" autocomplete="off" autocorrect="off" resize="none" value=${this.getMathValue(el)} id="math-input" size="small" placeholder=${"\\sqrt{a^2 + b^2}"} @keydown=${(e: any) => e.key === "Enter" && e.target.blur()} @sl-change=${(e: any) => this.handleMathChange(el, e)}>
        <span slot="label">${msg("TeX Formula")}</span>
        <sl-icon-button slot="label" name="corner-down-left" style="margin-left: auto;"></sl-icon-button>
      </sl-textarea>
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
        "comment-",
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
        "comment-",
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
        "html",
        "br",
        "wbr",
        "td",
        "tr",
        "thead",
        "tbody",
        "tfoot",
        "comment-",
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
        <sl-tree-item ?data-selected=${this.activeElement === this.app.activeEditor!.pmEditor.document?.body} @sl-expand=${(e: any) => e.target.parentElement instanceof SlTree && (this.activeOutline = true)} @sl-collapse=${(e: any) => e.target.parentElement instanceof SlTree && (this.activeOutline = false)}>
          ${this.activeOutline? this.ElementBreadcrumbItem(this.app.activeEditor!.pmEditor.document.body, true, false, true): breadcrumbPath}
          ${this.ElementTree(undefined, true)}
        </sl-tree-item>
      </sl-tree>
    </sl-breadcrumb>`
  }

  ElementTree(root: HTMLElement=this.app.activeEditor!.pmEditor.document?.body, unwrapped=false): TemplateResult | null {
    const content = root? html`${this.filterChildren(root.children, root.tagName.toLowerCase()).map(child => this.ElementTree(child as HTMLElement))}`: null
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
    }
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

  handleAddComment = () => {
    emitCustomEvent(this, "ww-add-comment")
  }

  handleUpdateComment = (el: SlTextarea | null, id: string | number, i=0) => {
    emitCustomEvent(this, "ww-update-comment", {id, i, change: {content: el?.value ?? "", email: (this.app.store.accounts.getAccount("pocketbase") as any)?.email, changed: Date.now()}})
  }

  handleDeleteComment = (id: string | number, i=0) => {
    emitCustomEvent(this, "ww-delete-comment", {id, i})
  }

  focusComments(id?: string, last=false) {
    const selector = `#comment-toolbox ${id? "#" + id: ""} sl-textarea${last? ":last-of-type": ""}`;
    (this.shadowRoot?.querySelector(selector) as SlTextarea).focus()
  }

  handleCommentKeydown = (e: KeyboardEvent) => {
    const el = e.target as SlTextarea
    if(e.key === "Enter" && !e.altKey) {
      e.preventDefault();
      el.blur()
    }
    else if(e.key === "Enter" && e.altKey) {
      e.preventDefault();
      const pos = el.input.selectionStart
      const endPos = el.input.selectionEnd
      const size = endPos - pos
      const str = size? el.value.slice(0, pos) + el.value.slice(endPos): el.value
      el.value = str.slice(0, pos) + "\n" + str.slice(pos)
      setTimeout(() => el.input.selectionStart = el.input.selectionEnd = pos + 1)
    }
  }

  CommentToolbox(commentMarks: Mark[]) {
    const sel = this.app.activeEditor?.state.selection
    const pos = sel?.from
    const threads: Array<[string, CommentData[]]> = [
      ...commentMarks.map(mark => [mark.attrs.id, mark.attrs.content]),
      ...(sel instanceof NodeSelection && Array.isArray(sel.node.attrs["=comment"])? [["node", sel.node.attrs["=comment"]]] as any: [])
    ]
    return html`<div id="comment-toolbox">
      ${threads.map(([id, content]) => html`
        ${content.map((data: CommentData, i: number) => html`
          <sl-textarea @keydown=${this.handleCommentKeydown} class="comment" ?data-first=${i === 0} size="small" resize="auto" rows="1" value=${data.content} @sl-change=${(e: any) => !e.target.value? this.handleDeleteComment(id === "node"? pos!: id, i): this.handleUpdateComment(e.target, id === "node"? pos!: id, i)}>
            <span class="comment-title" slot="label">
              <span title=${data.email ?? ""}>${`${data.name ?? data.email ?? msg("Anonymous")}${data.email && data.name? " (" + data.email + ")": ""}`}</span>
              <span>
                <sl-relative-time numeric="always" title=${Intl.DateTimeFormat(undefined, {dateStyle: "full", timeStyle: "medium"}).format(data.changed ?? Date.now())} format="narrow" sync .date=${new Date(data.changed ?? Date.now())}></sl-relative-time>
                <ww-button variant="icon" icon="x" @click=${() => this.handleDeleteComment(id === "node"? pos!: id, i)}></ww-button>
              </span>
            </span>
          </span>
        </sl-textarea>
        `)}  
        <ww-button ?disabled=${!content.at(-1)?.content} class="comment-add" icon="arrow-back-up" size="small" outline @click=${() => {
          this.handleUpdateComment(null, id === "node"? pos!: id, content.length)
          // setTimeout(() => this.focusComments(mark.attrs.id, true))
        }}>${msg("Reply")}</ww-button>
      `)}
      ${threads.length && threads.every(([id]) => id === "node")? undefined: html`
        <ww-button ?disabled=${!canAddCommentThread(this.app.activeEditor!.state)} icon="message-2-plus" @click=${() => this.handleAddComment()}>${msg("New thread")}</ww-button>  
      `}
    </div>`
  }

  TestNode(key: string, node: any): TemplateResult {
    if(node[TEST_RESULT]) {
      return html`<sl-tree-item class="result" ?data-passed=${node.passed}>
        <sl-icon class="test-passed" name=${node.passed? "circle-dashed-check": "circle-dashed-x"}></sl-icon>
        ${key}
      </sl-tree-item>`
    }
    else {
      return html`<sl-tree-item expanded>
        ${key}
        ${Object.keys(node).map(k => this.TestNode(k, node[k]))}
      </sl-tree-item>`
    }
  }

  TestEntry(id: string) {
    const data = this.app.store.packages.testStatus[id]
    const tree = this.app.store.packages.getTestTree(id)
    return html`
      <sl-tree-item class="test-root" ?selected=${data !== "disabled"} expanded>
        <sl-checkbox size="small" ?checked=${data !== "disabled"} @sl-change=${() => this.app.store.packages.toggleTestDisabled(id)}></sl-checkbox>
        ${prettifyPackageName(id.split("/tests/").at(-1)!)}
        ${typeof data === "string"? null: Object.keys(tree).map(k => this.TestNode(k, tree[k]))}
      </sl-tree-item>
    `
  }

  TestList = () => {
    const {testStatus, getTestTree, testingDisabled, testBundleID, nextTestId, local, testPkg, testRunOnReload} = this.app.store.packages
    return html`<div class="test-list">
      <div class="test-header">
        <sl-select size="small" value=${ifDefined(testPkg)} @change=${(e: any) => this.app.store.packages.testPkg = e.target.value}>
          ${local.map(pkg => html`<sl-option value=${pkg.id}>${pkg.name}</sl-option>`)}
        </sl-select>
        <div class="test-actions">
          <sl-button size="small" variant="primary" ?disabled=${testingDisabled} @click=${() => {
            this.app.store.packages.resetTests()
            this.app.store.packages.nextTestId && this.app.store.packages.runTest(this.app.store.packages.nextTestId)
          }}>
            <sl-icon name="player-play-filled"></sl-icon>
            <b>${msg("Run tests")}</b>
          </sl-button>
          <sl-checkbox size="small" ?checked=${testRunOnReload} @sl-change=${(e: any) => this.app.store.packages.testRunOnReload = e.target.checked}>${msg("Run on reload")}</sl-checkbox>
        </div>
      </div>
      <sl-tree>
        ${Object.keys(testStatus).map(id => this.TestEntry(id))}
      </sl-tree>
    </div>
    `
  }

  render() {
      return this.testMode? this.TestList(): html`
        ${this.BlockToolbox(this.activeElement)}
        <aside class="context-toolbox">${this.activeElementPath.map(el => this.ContextToolbox(el))}</aside>
        ${this.InlineToolbox()}
        <ww-ai-toolbox-widget .app=${this.app}></ww-ai-toolbox-widget>
        <sl-icon-button name="x" id="close-button" part="close-button"
                        @click=${() => emitCustomEvent(this, "ww-close")}></sl-icon-button>
      `
  }
}