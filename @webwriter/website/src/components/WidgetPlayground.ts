import { LitElement, html, css, PropertyValueMap } from "lit";
import { customElement, property, query, queryAsync } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import {minimalSetup, EditorView, basicSetup,} from "codemirror"
import {htmlLanguage, html as langHtml} from "@codemirror/lang-html"
import {syntaxTree} from "@codemirror/language"
import {EditorState, Compartment, Text, Range} from "@codemirror/state"
import {WidgetType, Decoration} from "@codemirror/view"

import SPDX_LICENSES from "spdx-license-list/simple"

import PENCIL_FILL from "bootstrap-icons/icons/pencil-fill.svg?raw"
import GIT from "bootstrap-icons/icons/git.svg?raw"
import GITHUB from "bootstrap-icons/icons/github.svg?raw"
import BOX_FILL from "bootstrap-icons/icons/box-fill.svg?raw"
import CARD_CHECKLIST from "bootstrap-icons/icons/card-checklist.svg?raw"
import X_LG from "bootstrap-icons/icons/x-lg.svg?raw"
import DOWNLOAD from "bootstrap-icons/icons/download.svg?raw"
import FILE_ARROW_DOWN from "bootstrap-icons/icons/file-arrow-down.svg?raw"
import PLAY_CIRCLE_FILL from "bootstrap-icons/icons/play-circle-fill.svg?raw"
const ICON = (x: string) => html`<img class="icon" src=${"data:image/svg+xml;utf8," + x}>`

import {IFrameObject, IFramePage, iframeResizer} from "iframe-resizer"
import iframeResizerContentRaw from "iframe-resizer/js/iframeResizer.contentWindow.min.js?raw"
import type { SyntaxNodeRef } from "@lezer/common";

export const tagName = "ww-widget-playground"

/**
 * Prettify a bytes number into human readable form.
 */
export function shortenBytes(n: number) {
  const k = n > 0 ? Math.floor((Math.log2(n)/10)) : 0
  const rank = (k > 0 ? 'kmgt'[k - 1] : '') + 'b'
  const count = Math.floor(n / Math.pow(1024, k))
  return count + rank
}

export type Person = {name: string, email?: string, url?: string}
export type Repository = {type: "git", url: string, directory?: string, provider?: string}


class RunWidget extends WidgetType {
  
  constructor(
    readonly i: number,
    readonly onClick: (e: Event) => void
  ) {super()}

  eq = (other: RunWidget) => this.i === other.i

  toDOM(view: EditorView): HTMLElement {
    const runButton = document.createElement("button")
    const img = document.createElement("img")
    img.setAttribute("src", "data:image/svg+xml;utf8," + PLAY_CIRCLE_FILL)
    runButton.appendChild(img)
    runButton.classList.add("run")
    runButton.title = "Run this script"
    runButton.setAttribute("data-i", String(this.i))
    runButton.addEventListener("click", this.onClick)
    return runButton
  }
}

@customElement(tagName)
export class WidgetPlayground extends LitElement {

  @property({attribute: true})
  name: string | undefined

  @property({attribute: true})
  homepage: string | undefined

  @property({attribute: true})
  widgetSrc: string | undefined

  @property({attribute: true})
  prettyName: string | undefined

  @property({attribute: true})
  description: string | undefined

  @property({attribute: true})
  version: string | undefined

  @property({attribute: true})
  license: string | undefined = "UNLICENSED"

  @property({attribute: true})
  bundleSize: {js: number, css: number} | undefined
  
  @property({attribute: true})
  installSize: number | undefined

  @property({type: Object, attribute: false})
  people: Person[] = []

  @property({type: Object, attribute: false})
  repository: Repository | undefined

  @property({type: Object, attribute: false})
  links: Record<string, string> = {}

  @property({type: Object, attribute: false})
  keywords: string[] = []

  @property({attribute: true, type: Boolean, reflect: true})
  editable: boolean = false

  @property({state: true})
  activeTab: string = "#markup"

  static get styles() {
    return css`
      main {
        display: grid;
        grid-template-columns: 2fr minmax(400px, 1fr);
        grid-template-rows: min-content 1fr;
        gap: 1rem;
        padding: 2rem;
        padding-top: 0;
        box-sizing: border-box;
        min-height: 800px;
      }

      header {
        grid-column: 1 / 3;
        grid-row: 1;
        display: grid;
        grid-template-columns: min-content 1fr min-content;
        grid-template-rows: min-content min-content min-content;
        gap: 0.25rem 1rem;
      }

      header h1, header h2, header p {
        margin: 0;
      }

      header h1 {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        background: var(--sl-color-gray-950);
        color: var(--sl-color-gray-50);
        padding: 1rem 2rem;
        grid-column: 1;
        grid-row: 1 / 4;
      }

      header #name {
        font-size: 1rem;
        font-weight: bold;
        font-family: var(--sl-font-mono);
        color: var(--sl-color-gray-800);
        text-decoration: underline;
      }

      header #version {
        font-family: var(--sl-font-mono);
      }

      header p {
        justify-self: start;
        grid-row: 2;
      }

      header #actions {
        grid-row: 1 / 4;
        grid-column: 3;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 1ch;
      }

      header #actions > * {
        padding: 0.4rem 0.5rem;
        border: 2px solid var(--sl-color-gray-800);
      }


      header #tag-area {
        grid-row: 3;
        grid-column: 2 / 3;
      }

      #preview {
        grid-column: 1 / 2;
        grid-row: 2 / 4;
        width: 100%;
        height: 100%;
        border: none;
        margin-top: calc(1.5rem + 3px);
      }

      .tab-panel {
        background: white;
        border: 2px solid var(--sl-color-gray-800);
        border-radius: 0 0 10px 10px;
      }

      :host(:not([editable])) #editor {
        display: none;
      }

      :host(:not([editable])) #preview {
        grid-column: 1 / 3;
      }

      #subheading {
        display: flex;
        flex-direction: row;
        gap: 2ch;
      }

      #people {
        font-style: italic;
        font-size: 0.9rem;
      }

      .person {
        text-decoration: none;
        color: inherit;
      }

      .person:hover {
        text-decoration: underline;
      }

      #tag-area {
        font-size: 0.8rem;
        padding-top: 0.2rem;
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 1ch;
      }

      #tag-area > *:not(.divider) {
        display: inline-flex;
        flex-direction: row;
        align-items: center;
        gap: 1ch;
        background: white;
        padding: 0.1rem 0.25rem;
        border: 1px solid var(--sl-color-gray-950);
        text-decoration: none;
        color: inherit;
        border-radius: 2px;
      }

      #tag-area > a[href]:hover {
        text-decoration: underline;
      }

      #official {
        border-width: 2px !important;
        font-weight: bold;
      }

      .divider {
        border: 1px solid var(--sl-color-gray-950);
      }

      #close, #edit {
        background: var(--sl-color-gray-100);
        cursor: pointer;
        line-height: 100%;
      }

      #close:hover, #edit:hover {
        background: var(--sl-color-gray-200);
      }

      #close:active, #active:hover {
        background: var(--sl-color-gray-300);
      }

      #editor {
        position: relative;
        height: 100%;
        grid-column: 2;
        grid-row: 2;
      }

      .tab[data-active] {
        z-index: 10;
        font-weight: bold;
      }


      .tab:not([data-active]) {
        opacity: 66%;
      }

      .tab-panel {
        z-index: 0;
        position: relative;
        height: 100%;
      }

      .tab-panel:not([data-active]) {
        display: none;
      }

      #repository:not([href]) {
        opacity: 66%;
        cursor: not-allowed;
      }

      .tab {
        margin-bottom: -2px;
        position: relative;
        background: white;
        cursor: pointer;
        padding: 0.5rem 1rem;
        border: 2px solid var(--sl-color-gray-950);
        border-bottom: 0;
        border-radius: 5px 5px 0 0;
        overflow-y: scroll !important;
        box-sizing: border-box;
      }

      #editor * {
        box-sizing: border-box;
      }

      #editor-tabs {
        height: 100%;
      }

      #editor nav {
        display: flex;
        flex-direction: row-reverse;
        justify-content: flex-start;
        gap: 0.5ch;
      }

      .cm-editor {
        outline: none !important;
        overflow-x: hidden !important;
      }

      .cm-line {
        position: relative;
      }

      .cm-editor button.run {
        position: absolute;
        top: 0;
        right: 1ch;
        border: none;
        background: none;
        cursor: pointer;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        padding: 4px;
        opacity: 50%;
      }

      .cm-editor button.run:hover {
        opacity: 90%;
      }

      .cm-editor button.run:active {
        opacity: 50%;
      }

    `
  }

  @query("iframe") // @ts-ignore
  iframe: HTMLIFrameElement

  @queryAsync("iframe") // @ts-ignore
  iframeReady: Promise<HTMLIFrameElement>

  get srcdoc() {
    const tag = this.name?.replaceAll(/^@.+\//g, "")
    return `<html>
      <head>
        <script id="widgetsrc" type="text/javascript" src=${this.widgetSrc + ".js"}></script>
        <link id="widgetstyle" rel="stylesheet" type="text/css" href=${this.widgetSrc + ".css"} />
        <style id="basestyle">
          body {
            max-width: 800px;
            margin: 5px;
            overflow: hidden;
          }
        </style>
      </head>
      <body><${tag}></${tag}>
<style></style>
<script></script></body>
</html>`
  }
  
  get document() {
    return this.iframe.contentDocument as Document
  }
  
  get head() {
    return (this.iframe.contentDocument as Document).head
  }
  
  get body() {
    return this.iframe?.contentDocument?.body
  }
  
  get window() {
    return this.iframe?.contentWindow as Window & typeof globalThis
  }

  @property({state: true})
  get innerMarkup() {
    return this.body?.innerHTML ?? ""
  }

  set innerMarkup(value: string) { // @ts-ignore
    this.observer.disconnect()
    this.body.innerHTML = value
    this.observer.observe(this.body as HTMLElement, {childList: true, subtree: true, attributes: true})
  }

  static providerIcon = {
    "none": ICON(GIT),
    "https": ICON(GIT),
    "http": ICON(GIT),
    "github": ICON(GITHUB),
    "gist": ICON(GITHUB),
    "bitbucket": ICON(GIT),
    "gitlab": ICON(GIT),
  }
  
  markupView: EditorView | undefined
  innerScriptView: EditorView | undefined
  innerStyleView: EditorView | undefined

  @query("#markup")
  markupNode: HTMLElement | undefined

  @query("#script")
  innerScriptNode: HTMLElement | undefined

  @query("#style")
  innerStyleNode: HTMLElement | undefined

  observer: MutationObserver

  evalScript = (e: Event) => {
    const i = parseInt((e.currentTarget as HTMLElement).getAttribute("data-i") as string)
    const {body, window} = this
    window.eval(body?.querySelectorAll("script").item(i).innerHTML ?? "")
  }

  protected async firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>) {
    await this.iframeReady
    await new Promise(r => setTimeout(r, 1000))
    let language = new Compartment
    let updateListenerExtension = EditorView.updateListener.of(update => {
      if(update.docChanged) {
        this.innerMarkup = String(update.state.doc)
      }
    })
    let decorationsExtension = EditorView.decorations.of(view => {
      let decorations: Range<Decoration>[] = []
      for(let {from, to} of view.visibleRanges) {
        let i = 0
        let prevNode: SyntaxNodeRef
        syntaxTree(view.state).iterate({from, to, enter: node => {
          if(node.name === "Script" && prevNode) {
            let deco = Decoration.widget({
              widget: new RunWidget(i, this.evalScript),
              side: 1
            })
            decorations.push(deco.range(prevNode.from))
            i++
          }
          prevNode = node
        }})
      }
      return Decoration.set(decorations)
    })
    this.markupView = new EditorView({
      doc: this.innerMarkup,
      extensions: [
        basicSetup,
        language.of(htmlLanguage.extension),
        EditorView.lineWrapping,
        updateListenerExtension,
        decorationsExtension
      ],
      parent: this.markupNode
    })
    iframeResizer({}, this.iframe)
    this.observer = new this.window.MutationObserver(() => {
      const state = this.markupView?.state
      // @ts-ignore
      this.markupView?.dispatch(state?.update({
        changes: {from: 0, to: state.doc.length, insert: this.innerMarkup}
      }))
    })
    this.observer.observe(this.body as HTMLElement, {childList: true, subtree: true, attributes: true})
  }

  disconnectedCallback(): void {
    this.observer.disconnect()
  }

  render() {
    const people = this.people.map((person, i) => html`<a class="person" href=${"mailto:" + person.email} title=${i === 0? "Author of the widget": "Contributor to the widget"}>${person.name}</a>${this.people.length === 1 || i === this.people.length? "": ", "}`)
    return !this.name? undefined: html`<main>
      <header>
        <h1><span>${this.prettyName ?? "Unnamed"}</span></h1>
        <span id="subheading">
          <a id="name" title="Technical name of the widget" href=${ifDefined(this.homepage)}>${this.name ?? "unnamed"}</a>
          <span id="version" title="Version of the widget">${this.version}</span> 
          <span id="people" title="Author and contributors">${people.length > 0? people: "Anonymous"}</span>
        </span>
        <div id="actions">
          <a id="close" title="Back to widget gallery" href="/widgets">${ICON(X_LG)}</a>
          <button id="edit" title="Edit this widget" @click=${() => this.editable = !this.editable}>${ICON(PENCIL_FILL)}</button>
        </div>
        <p>${this.description || html`<i>No description</i>`}</p>
        <div id="tag-area">
          ${this.name.startsWith("@webwriter/")? html`<span id="official" title="This widget comes pre-installed with WebWriter">Official</span>`: null}
          ${this.keywords.map(kw => html`<span>${kw}</span>`)}
          <span class="advanced divider"></span>
          <span class="advanced" title="Size of the installed package on disk">${ICON(DOWNLOAD)} Install Size: <code>${shortenBytes(this.installSize)}</code></span>
          <span class="advanced" title="Maximum size when bundled and minified into a worksheet (size may be smaller when dependencies are shared)">${ICON(FILE_ARROW_DOWN)} Bundle Size: <code>${shortenBytes(this.bundleSize.js + this.bundleSize.css)}</code></span>
          <a class="advanced" title="License chosen by the author" href=${ifDefined(SPDX_LICENSES.has(this.license)? `https://spdx.org/licenses/${encodeURIComponent(this.license)}`: undefined)}>
            ${ICON(CARD_CHECKLIST)}
            <span>License: ${this.license ?? "UNLICENSED"}</span>
          </a>
          <a class="advanced" title="Package the widget is distributed in" id="package" href=${this.links.npm}>
            ${ICON(BOX_FILL)}
            <code>Package</code>
          </a>
          <a id="repository" class="advanced" title=${this.repository.url? "Source code of the widget": "No source code available"} href=${ifDefined(this.repository?.url)}>
            ${WidgetPlayground.providerIcon[this.repository?.provider] ?? ICON(GIT)}
            <code>Code</code>
          </a>
        </div>
      </header>
      <iframe id="preview" srcdoc=${this.srcdoc}></iframe>
      <div id="editor">
        <nav>
          <button class="tab" data-target="#markup" @click=${(e: any) => this.activeTab = e.target.getAttribute("data-target")} ?data-active=${this.activeTab === "#markup"}>Live Code</button>
        </nav>
        <div id="editor-tabs">
          <div class="tab-panel" id="markup" ?data-active=${this.activeTab === "#markup"}></div>
        </div>
      </div>
    </main>`
  }
}