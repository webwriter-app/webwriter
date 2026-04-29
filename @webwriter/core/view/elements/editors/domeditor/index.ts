import { LitElement, html, css } from "lit"
import { customElement, property, queryAsync } from "lit/decorators.js"
import { localized } from "@lit/localize"
import { emitCustomEvent } from "#utility"
import { keyed } from "lit/directives/keyed.js"
import scopedCustomElementRegistry from "@webcomponents/scoped-custom-element-registry/src/scoped-custom-element-registry.js?raw"
import {ImportMap} from "@jspm/import-map"
import { ifDefined } from "lit/directives/if-defined.js"

import domEditorController from "./domeditor?bundledstring"
import baseStyleStr from "#model/schemas/resource/plugins/base.css?raw"
import baseThemeStr from "#model/schemas/resource/themes/base.css?raw"
import shoelaceThemeStr from "@shoelace-style/shoelace/dist/themes/light.css?raw"

const scopedCustomElementRegistryBlob = new Blob([scopedCustomElementRegistry], {type: "text/javascript"})
const scopedCustomElementRegistryUrl = URL.createObjectURL(scopedCustomElementRegistryBlob)

type EditorIFrameElement = HTMLIFrameElement & {
  contentDocument: {body: HTMLElement}
  contentWindow: typeof globalThis
}

@localized()
@customElement("ww-dom-editor")
export class DOMEditorComponent extends LitElement {
  
  @property({type: String, attribute: false})
  contentScript: string

  @property({type: String, attribute: false})
  bundleID: string

  @property({attribute: false})
  preloadedModules: string[] = []

  @property({type: String, attribute: false})
  contentStyle: string

  @property({type: String, attribute: true})
  placeholder: string

  @property({type: Object, attribute: false})
  windowListeners: Partial<Record<keyof WindowEventMap, any>> = {}

  @property({type: Array, attribute: false})
  preventedShortcuts: string[] = []

  @property({attribute: false})
  accessor importMap: ImportMap

  @property({attribute: true})
  accessor url: string

  @property({attribute: true, type: Boolean, reflect: true})
  loaded: boolean = true

  get documentLang() {
    return this?.document?.documentElement?.lang
  }

  firstInitialized = true

  async initialize() {
    if(this.url) {
      return this.initializePreviewFrame()
    }
    await this.initializeIFrame()
    emitCustomEvent(this, "ww-initialized", {first: this.firstInitialized})
    this.firstInitialized = false
  }

  redispatch(e: Event) {
    return this.dispatchEvent(new (e as any).constructor(e.type, e))
  }

  createScript(src: string, defer=true, async=true) {
    const script = this.document.createElement("script")
    script.src = src
    script.defer = defer
    script.async = async
    script.type = "module"
    // script.setAttribute("blocking", "render")
    script.classList.add("◆", "◆editor-only")
    return script
  }

  createScriptInline(textContent: string) {
    const script = this.document.createElement("script")
    script.textContent = textContent
    script.type = "module"
    script.classList.add("◆", "◆editor-only")
    return script
  }

  createStyleInline(textContent: string, editorOnly=true) {
    const style = this.document.createElement("style")
    style.textContent = textContent
    editorOnly && style.classList.add("◆", "◆editor-only")
    return style
  }

  createStyleLink(href: string) {
    const link = this.document.createElement("link")
    link.rel = "stylesheet"
    link.href = href
    link.setAttribute("blocking", "render")
    link.classList.add("◆", "◆editor-only")
    return link
  }

  async initializePreviewFrame() {
    const iframe = this.shadowRoot?.querySelector("iframe")
    for(const el of Array.from(iframe?.contentDocument?.body.querySelectorAll("a") ?? [])) {
      el.target = "_blank"
    }
  }

  async initializeIFrame() {
    this.iframe = this.shadowRoot?.querySelector("iframe") as any

    // pass down search params
    const url = new URL(`ws://${location.hostname}:1234`)
    const outerUrl = new URL(location.href)
    outerUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v))
    this.window.SYNC_URL = url.href

    // Controller injection
    this.head.append(this.createScriptInline(domEditorController))
    this.head.append(this.createStyleInline(shoelaceThemeStr))
    this.head.append(this.createStyleInline(baseStyleStr))
    this.head.append(this.createStyleInline(baseThemeStr, false))
    
    // Scoped custom elements polyfill injection
    const scopedRegistryScript = this.createScript(scopedCustomElementRegistryUrl, false, false)
    this.head.append(scopedRegistryScript)
    
    // Dependency injection
    const importMap = !this.importMap? "": `<script type="importmap" data-ww-editing>${JSON.stringify(this.importMap.toJSON(), undefined, 2)}</script>`
    const scriptUrls = !this.importMap? []: Object.keys(this.importMap.imports)
      .filter(k => k.endsWith(".js"))
      .map(k => this.importMap.resolve(k))
    const styleUrls = !this.importMap? []: Object.keys(this.importMap.imports)
      .filter(k => k.endsWith(".css"))
      .map(k => this.importMap.resolve(k))
    const scripts = scriptUrls.map(url => this.createScript(url, false, false))
    const styles = styleUrls.map(url => this.createStyleLink(url))
    this.head.insertAdjacentHTML("beforeend", importMap)
    this.head.append(...scripts, ...styles)

    // Custom editor behavior
    this.window.console = console
    this.window.onerror = window.onerror
    this.window.onunhandledrejection = window.onunhandledrejection
    this.window.addEventListener("focus", () => this.dispatchEvent(new Event("focus", {bubbles: true, composed: true})))
    const createElement = this.document.createElement
    this.document.createElement = function(tagName: string, options: ElementCreationOptions) {
      const el = createElement.call(this, tagName, options)
      if(tagName.includes("-") && tagName !== "comment-") {
        el.id = "ww-" + crypto.randomUUID()
      }
      return el
    }
    for(const [eventName, listener] of Object.entries(this.windowListeners)) {
      this.window.addEventListener(eventName, listener)
    }
    this.window.addEventListener("keydown", e => {
      const keyExpr = [e.ctrlKey? "ctrl": null, e.altKey? "alt": null, e.shiftKey? "shift": null, e.metaKey? "meta": null, e.key].filter(k => k).join("+")
      if(this.preventedShortcuts.includes(keyExpr)) {
        e.preventDefault()
      }
    })
  }

  iframe: EditorIFrameElement

  @queryAsync("iframe")
  iframeReady: Promise<any>

  get document() {
    return this.iframe?.contentDocument
  }

  get head() {
    return this.iframe?.contentDocument?.head
  }

  get body() {
    return this.iframe?.contentDocument?.body
  }

  get documentElement() {
    return this.iframe?.contentDocument?.documentElement
  }

  get window() {
    return this.iframe?.contentWindow
  }

  async import(moduleSpecifier: string) {
    await this.iframeReady
    return this.iframe.contentWindow.eval(`import("${moduleSpecifier}")`)
  }

  async importString(str: string) {
    await this.iframeReady
    const url = this.window.URL.createObjectURL(new this.window.Blob([str], {type: "text/javascript"}))
    this.import(url)
  }

  async importCSS(src: string) {
    await this.iframeReady
    const link = this.document.createElement("link")
    link.rel = "stylesheet"
    link.type = "text/css"
    link.href = src
    this.document.head.appendChild(link)
  }

  async importCSSString(str: string) {
    await this.iframeReady
    const url = this.window.URL.createObjectURL(new this.window.Blob([str], {type: "text/css"}))
    this.importCSS(url)
  }

  static get styles() {
    return css`
      :host {
        display: contents;
      }

      iframe {
        border: none;
        display: block;
        width: 100%;
        user-select: none;
      }
    `
  }

  render() {
    return keyed(this.bundleID + String(this.url), html`<iframe part="iframe" src=${ifDefined(this.url)} @load=${() => this.initialize()} srcdoc=${ifDefined(!this.url? "": undefined)}></iframe>`)
  }
}