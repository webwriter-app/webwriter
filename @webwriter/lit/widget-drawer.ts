import {LitElement, css, html, nothing, type PropertyValues} from "lit"
import {live} from "lit/directives/live.js"
import {renderWidgetOptionField, renderWidgetOptions} from "./widget-option-controls"
import {widgetOptionControlStyles} from "./widget-option-controls.styles"
import {
  isWidgetFileFormat, matchesWidgetFileFormat, readWidgetOption, validWidgetOptionValue, widgetActionState,
  widgetActionRows, widgetConversionMethod, widgetDeclarations, widgetOptionAttributeValue, widgetOptionGroupState, widgetReferenceOption,
  type UnknownRecord, type WidgetActionState, type WidgetOptionValue,
} from "./widget-options"
import {widgetResultBlock, WidgetResultBinding, type WidgetResultStatus} from "./widget-result-binding"
import {BrowserWidgetResultStorage, HttpWidgetResultStorage, isWidgetResultType, widgetResultEndpoint, widgetResultKey, type WidgetResultStorage, type WidgetResultType} from "./widget-result-storage"

export type WidgetStorageDestination = {kind: "browser"} | {kind: "http", url: string}
type FileSelection = {accept: string, multiple?: boolean, select: (files: File[]) => Promise<void>}

const authoredDefaults = new WeakMap<HTMLScriptElement, {type: WidgetResultType, text: string}>()
const browser: WidgetStorageDestination = {kind: "browser"}

/** Opt-in settings, actions, conversions, and result storage for a widget.
 * Register this component in the widget's scoped registry and pass the widget. */
export class WidgetDrawer extends LitElement {
  static properties = {
    widget: {attribute: false},
    storageFor: {attribute: false},
  }

  static styles = [widgetOptionControlStyles, /* @__PURE__ */ css`
    :host { display: block; min-inline-size: 0; font: 0.875rem/1.4 system-ui, sans-serif; color: #263548; }
    details { min-inline-size: 0; }
    .drawer { border: 1px solid #c5ccd5; border-radius: .4rem; background: #fff; }
    .drawer > summary { cursor: pointer; padding: .45rem .65rem; font-weight: 600; }
    .contents { display: grid; gap: .65rem; padding: 0 .65rem .65rem; }
    .widget-options { min-width: 0; }
    .develop-field { display: grid; gap: .3rem; min-width: 0; }
    .develop-field.widget-option-checkbox { display: flex; }
    .develop-field-label, .storage-controls label { font-weight: 600; }
    .develop-field-help { color: #4f6075; font-size: .75rem; }
    .widget-option-group { font-size: inherit; }
    .widget-options .widget-option-field :is(input:not([type="checkbox"], [type="radio"], [type="range"]), textarea),
    input, select, button { font: inherit; }
    select, #storage-url, button {
      box-sizing: border-box; max-inline-size: 100%; min-inline-size: 0; padding: .22rem .4rem;
      border: 1px solid #c5ccd5; border-radius: .25rem; background: #fff; color: inherit;
    }
    button { cursor: pointer; white-space: normal; overflow-wrap: anywhere; }
    button:disabled { cursor: default; opacity: .55; }
    :is(button, input, select, summary):focus-visible { outline: 2px solid #3977c7; outline-offset: 2px; }
    .widget-action { width: 100%; }
    .widget-action[data-intent="danger"], .error { color: #a72c25; }
    .choice-group, .conversion-group { display: flex; flex-wrap: wrap; gap: .25rem; }
    .choice-group > * { flex: 1 1 auto; }
    .storage-controls {
      display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: .3rem .5rem;
      min-width: 0; border-top: 1px solid #dce3ec; padding-block-start: .5rem;
    }
    .storage-endpoint { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .3rem; }
    .widget-option-value > input[type="color"] { flex: 0 1 auto; inline-size: 3rem; }
    @media print { :host { display: none; } }
  `]

  declare widget?: HTMLElement
  /** Override storage construction, for example to supply an authenticated fetch. */
  declare storageFor?: (destination: WidgetStorageDestination, key: string) => WidgetResultStorage
  private target?: HTMLElement
  private observer?: MutationObserver
  private setting?: string
  private identity?: string
  private key?: string
  private destination?: WidgetStorageDestination
  private draftKind: WidgetStorageDestination["kind"] = "browser"
  private draftUrl = ""
  private binding?: WidgetResultBinding
  private defaults?: {block: HTMLScriptElement, type: string, text: string}
  private status?: WidgetResultStatus
  private running?: symbol
  private actionError?: {name: string, message: string}
  private fileSelection?: FileSelection

  connectedCallback() {
    super.connectedCallback()
    this.requestUpdate()
  }

  disconnectedCallback() {
    this.detach()
    super.disconnectedCallback()
  }

  protected willUpdate(changes: PropertyValues) {
    if(this.isConnected && this.target !== this.widget) {
      this.detach()
      this.target = this.widget
      if(this.target) {
        this.target.addEventListener("optionschange", this.optionsChanged)
        this.observer = new MutationObserver(records => {
          const widget = this.target
          if(!records.some(({target}) => target === widget || target.parentNode === widget || this.binding?.block.contains(target))) return
          this.sync()
          this.requestUpdate()
        })
        this.observer.observe(this.target, {attributes: true, characterData: true, childList: true, subtree: true})
      }
    }
    if(changes.has("storageFor") && this.binding) {
      this.binding.destroy()
      this.binding = undefined
      this.status = undefined
    }
    this.sync()
  }

  private optionsChanged = (event: Event) => {
    if(event.target === this.target) this.requestUpdate()
  }

  private detach() {
    this.observer?.disconnect()
    this.observer = undefined
    this.target?.removeEventListener("optionschange", this.optionsChanged)
    this.target = undefined
    this.reset()
  }

  private reset() {
    this.binding?.destroy()
    this.binding = undefined
    this.defaults = undefined
    this.status = undefined
    this.running = undefined
    this.fileSelection = undefined
    this.actionError = undefined
    this.setting = undefined
    this.key = undefined
    this.destination = undefined
  }

  private active(widget = this.target): widget is HTMLElement {
    return !!widget && widget === this.target && this.isConnected && widget.isConnected && widget.hasAttribute("standalone")
  }

  private get preferenceKey() { return `${this.key}:destination:${this.setting}` }

  private browserStorage() {
    const storage = this.ownerDocument.defaultView?.localStorage
    if(!storage) throw new Error("Browser storage is unavailable.")
    return storage
  }

  private endpoint(url: string) {
    if(!url.trim()) throw new Error("Enter a storage endpoint.")
    return widgetResultEndpoint(url.trim(), this.ownerDocument.baseURI).href
  }

  private sync() {
    const widget = this.target
    if(!this.active(widget)) {
      if(this.setting !== undefined) this.reset()
      return
    }
    const setting = widget.getAttribute("standalone")!.trim()
    // Recompute the path when the widget identity changes or the drawer reconnects.
    const identity = widget.id
    if(setting !== this.setting || identity !== this.identity) {
      this.binding?.destroy()
      this.binding = undefined
      this.status = undefined
      this.setting = setting
      this.identity = identity
      this.key = widgetResultKey(widget)
      let preference: string | null = null
      try { preference = this.browserStorage().getItem(this.preferenceKey) }
      catch { /* Remote storage can operate without browser preferences. */ }
      const url = preference ?? setting
      this.draftKind = url ? "http" : "browser"
      this.draftUrl = url || setting
      try {
        this.destination = url ? {kind: "http", url: this.endpoint(url)} : browser
        if(this.destination.kind === "http") this.draftUrl = this.destination.url
      }
      catch { this.destination = undefined }
    }
    const block = widgetResultBlock(widget)
    const type = block?.type
    if(this.binding && (this.binding.block !== block || this.binding.type !== type)) {
      this.binding.destroy()
      this.binding = undefined
      this.status = undefined
    }
    if(!block || !isWidgetResultType(type)) {
      this.defaults = undefined
      return
    }
    if(this.defaults?.block !== block || this.defaults.type !== type) {
      const savedDefaults = authoredDefaults.get(block)
      const defaults = savedDefaults?.type === type ? savedDefaults : {type, text: block.textContent ?? ""}
      authoredDefaults.set(block, defaults)
      this.defaults = {block, ...defaults}
    }
    if(!this.binding && this.destination && !this.status) this.bind(block, type)
    this.binding?.changed()
  }

  private bind(block: HTMLScriptElement, type: WidgetResultType) {
    if(!this.destination || !this.defaults || !this.key) return
    try {
      const storage = this.storageFor?.(this.destination, this.key) ?? (this.destination.kind === "browser"
        ? new BrowserWidgetResultStorage(this.browserStorage(), this.key)
        : new HttpWidgetResultStorage(new URL(this.destination.url)))
      this.binding = new WidgetResultBinding(block, type, this.defaults.text, storage, status => {
        this.status = status
        this.requestUpdate()
      })
    }
    catch(error) {
      this.status = {state: "error", message: this.message(error)}
      block.dispatchEvent(new CustomEvent("datapersistence", {bubbles: true,
        detail: {state: "error", mode: "local", message: this.status.message}}))
    }
  }

  private chooseStorage = (event: Event) => {
    const kind = (event.currentTarget as HTMLSelectElement).value
    if(kind === "http") this.draftKind = "http"
    else if(this.switchStorage(browser)) this.draftKind = "browser"
    this.requestUpdate()
  }

  private applyStorage = (event: SubmitEvent) => {
    event.preventDefault()
    const input = (event.currentTarget as HTMLFormElement).querySelector<HTMLInputElement>("#storage-url")
    if(!input) return
    let url: string
    try { url = this.endpoint(input.value) }
    catch(error) {
      input.setCustomValidity(this.message(error))
      input.reportValidity()
      return
    }
    if(this.switchStorage({kind: "http", url})) this.draftUrl = url
    this.requestUpdate()
  }

  private switchStorage(destination: WidgetStorageDestination) {
    if(this.status?.state === "saving") return false
    if(destination.kind === this.destination?.kind
      && (destination.kind === "browser" || this.destination.kind === "http" && this.destination.url === destination.url)) {
      if(this.status?.state === "error") {
        if(this.binding) this.binding.retry()
        else {
          this.status = undefined
          this.sync()
        }
      }
      return true
    }
    if(this.binding?.dirty && !this.confirm("Switch storage and discard the unsaved result?")) return false
    this.binding?.destroy()
    this.binding = undefined
    this.status = undefined
    this.destination = destination
    try { this.browserStorage().setItem(this.preferenceKey, destination.kind === "http" ? destination.url : "") }
    catch { /* The active destination can still be changed for this visit. */ }
    this.sync()
    return true
  }

  private message(error: unknown) { return error instanceof Error ? error.message : String(error) }

  private confirm(text: string) { return this.ownerDocument.defaultView?.confirm?.(text) === true }

  private locale(widget: Element) {
    return widget.closest("[lang]")?.getAttribute("lang")
      ?? widget.ownerDocument.documentElement.lang ?? "en"
  }

  private option(widget: HTMLElement, name: string, declaration: unknown) {
    const option = readWidgetOption(widget, name, declaration, this.locale(widget))
    return widgetReferenceOption(widget, option, widget.getRootNode() as Document | ShadowRoot,
      element => element.namespaceURI === "http://www.w3.org/1999/xhtml" && element.localName.includes("-") && element.matches(":defined"))
  }

  private setOption = (name: string, value: WidgetOptionValue) => {
    const widget = this.target
    if(!this.active(widget)) return
    const declarations = widgetDeclarations(widget, "options")
    if(!Object.hasOwn(declarations, name)) return
    const option = this.option(widget, name, declarations[name])
    if(option.hidden || option.disabled || option.readOnly || !validWidgetOptionValue(option, value, widget)) {
      this.requestUpdate()
      return
    }
    try {
      if(option.attribute === null) (widget as unknown as UnknownRecord)[name] = value
      else {
        const attribute = option.attribute.toLowerCase()
        if(attribute.startsWith("on") || ["srcdoc", "style", "class", "is", "contenteditable", "spellcheck", "data-webwriter-editor-only", "standalone"].includes(attribute)) {
          throw new TypeError(`The ${attribute} attribute cannot be set as an option.`)
        }
        const text = widgetOptionAttributeValue(option.type, value, option.multiple)
        if(text === null) widget.removeAttribute(option.attribute)
        else {
          const url = text.toLowerCase().replace(/[\u0000-\u0020]/g, "")
          if(["href", "src", "xlink:href", "action", "formaction", "poster", "cite", "data"].includes(attribute)
            && /^(?:javascript:|vbscript:|data:(?:text\/html|image\/svg\+xml))/.test(url)) throw new TypeError("The option contains an unsafe URL.")
          widget.setAttribute(option.attribute, text)
        }
      }
      this.actionError = undefined
    }
    catch(error) { this.actionError = {name: "", message: this.message(error)} }
    this.requestUpdate()
  }

  private action(widget: HTMLElement, name: string) {
    const declarations = widgetDeclarations(widget, "actions")
    const method = Object.hasOwn(declarations, name) ? widgetConversionMethod(widget, name) : undefined
    return method ? {method, state: widgetActionState(name, declarations[name], this.locale(widget))} : undefined
  }

  private async run(name: string, operation: () => Promise<void>) {
    if(this.running) return
    const invocation = this.running = Symbol()
    this.actionError = undefined
    this.requestUpdate()
    try { await operation() }
    catch(error) {
      if(this.running === invocation) this.actionError = {name, message: this.message(error)}
    }
    finally {
      if(this.running === invocation) {
        this.running = undefined
        this.requestUpdate()
      }
    }
  }

  private invoke = (name: string) => {
    const widget = this.target
    if(!this.active(widget) || this.running || this.fileSelection) return
    const action = this.action(widget, name)
    if(!action || action.state.hidden || action.state.disabled) return
    if(action.state.confirm && !this.confirm(action.state.confirm)) return
    const invoke = async (files?: File[]) => {
      const current = this.action(widget, name)
      if(!this.active(widget) || current?.method !== action.method || current.state.hidden || current.state.disabled
        || current.state.confirm !== action.state.confirm || JSON.stringify(current.state.input) !== JSON.stringify(action.state.input)) return
      if(files && !current.state.input?.multiple && files.length !== 1) return
      await this.run(name, async () => {
        if(files) await action.method.call(widget, files)
        else await action.method.call(widget)
      })
    }
    if(action.state.input) this.pick({accept: action.state.input.accept ?? "", multiple: action.state.input.multiple, select: invoke})
    else void invoke()
  }

  private pick(selection: FileSelection) {
    const input = this.renderRoot.querySelector<HTMLInputElement>("input[type=file]")!
    input.accept = selection.accept
    input.multiple = selection.multiple === true
    input.value = ""
    this.fileSelection = selection
    try { input.click() }
    catch(error) {
      this.fileSelection = undefined
      this.actionError = {name: "", message: this.message(error)}
    }
    this.requestUpdate()
  }

  private filePicked = (event: Event) => {
    const selection = this.fileSelection
    this.fileSelection = undefined
    this.requestUpdate()
    if(!selection || event.type === "cancel") return
    const files = Array.from((event.currentTarget as HTMLInputElement).files ?? [])
    if(files.length) void selection.select(files)
  }

  private formats(widget: HTMLElement, direction: "convertFrom" | "convertTo") {
    return Object.entries(widgetDeclarations(widget, direction))
      .filter(([format, declaration]) => isWidgetFileFormat(format) && widgetConversionMethod(widget, declaration))
      .map(([format]) => format)
  }

  private convert(widget: HTMLElement, direction: "convertFrom" | "convertTo", format: string) {
    if(!this.active(widget) || this.running || this.fileSelection) return
    const lookup = () => {
      const declarations = widgetDeclarations(widget, direction)
      return Object.hasOwn(declarations, format) ? widgetConversionMethod(widget, declarations[format]) : undefined
    }
    const method = lookup()
    if(!method) return
    const execute = async (files?: File[]) => this.run(`${direction}:${format}`, async () => {
      if(!this.active(widget) || lookup() !== method) return
      const file = files?.[0]
      if(direction === "convertFrom" && (!file || !matchesWidgetFileFormat(file, format))) {
        throw new TypeError(`Choose a ${format} file to import.`)
      }
      const snapshot = file ? widget.outerHTML : null
      const result: unknown = await (file ? method.call(widget, file) : method.call(widget))
      if(!this.active(widget) || lookup() !== method || result === null || result === false) return
      if(snapshot !== null && snapshot !== widget.outerHTML) throw new Error("The widget changed before the file could be imported.")
      if(file) {
        if(typeof result !== "function") throw new TypeError("A file importer must return a function that applies the imported content.")
        result.call(widget)
      }
      else {
        const view = widget.ownerDocument.defaultView!
        if(!(result instanceof view.File) || !result.name || !matchesWidgetFileFormat(result, format)) {
          throw new TypeError(`The widget must return a ${format} file.`)
        }
        const url = view.URL.createObjectURL(result)
        const link = widget.ownerDocument.createElement("a")
        link.href = url
        link.download = result.name
        link.click()
        view.setTimeout(() => view.URL.revokeObjectURL(url), 1000)
      }
    })
    if(direction === "convertFrom") this.pick({accept: format, select: execute})
    else void execute()
  }

  private renderActions(actions: WidgetActionState[]) {
    const button = (action: WidgetActionState) => html`<div class="widget-action-item">
      <button type="button" class="widget-action" data-intent=${action.intent ?? nothing}
        ?disabled=${action.disabled || this.running || this.fileSelection} @click=${() => this.invoke(action.name)}>${action.label}</button>
      ${action.description ? html`<span class="develop-field-help">${action.description}</span>` : nothing}
      ${action.disabled && action.disabledReason ? html`<span class="develop-field-help">${action.disabledReason}</span>` : nothing}
      ${this.actionError?.name === action.name ? html`<span class="widget-action-error" role="alert">${this.actionError.message}</span>` : nothing}
    </div>`
    return html`<div class="widget-actions">${widgetActionRows(actions).map(row => row.length === 1
      ? button(row[0]) : html`<div class="choice-group widget-action-group" role="group">${row.map(button)}</div>`)}</div>`
  }

  private renderConversions(widget: HTMLElement) {
    const imports = this.formats(widget, "convertFrom")
    const exports = this.formats(widget, "convertTo")
    if(!imports.length && !exports.length) return nothing
    const buttons = (formats: string[], direction: "convertFrom" | "convertTo", label: string) => formats.map(format => html`
      <button type="button" ?disabled=${this.running || this.fileSelection}
        @click=${() => this.convert(widget, direction, format)}>${label} ${format}</button>
    `)
    return html`<div class="conversion-group" role="group" aria-label="Import and export">
      ${buttons(imports, "convertFrom", "Import")}${buttons(exports, "convertTo", "Export")}
    </div>`
  }

  private renderStorage() {
    const saving = this.status?.state === "saving"
    return html`<form class="storage-controls" @submit=${this.applyStorage}>
      <label for="storage-kind">Autosave to</label>
      <select id="storage-kind" .value=${live(this.draftKind)} ?disabled=${saving} @change=${this.chooseStorage}>
        <option value="browser">This browser</option><option value="http">Remote endpoint</option>
      </select>
      ${this.draftKind === "http" ? html`<div class="storage-endpoint">
        <input id="storage-url" type="text" inputmode="url" spellcheck="false" required
          aria-label="Endpoint URL" placeholder="Endpoint URL" .value=${live(this.draftUrl)} @input=${(event: Event) => {
            const input = event.currentTarget as HTMLInputElement
            input.setCustomValidity("")
            this.draftUrl = input.value
          }}>
        <button type="submit" ?disabled=${saving}>Apply</button>
      </div>` : nothing}
    </form>`
  }

  protected render() {
    const widget = this.target
    if(!this.active(widget)) return nothing
    const options = Object.entries(widgetDeclarations(widget, "options")).map(([name, declaration]) => this.option(widget, name, declaration))
    const actions = Object.keys(widgetDeclarations(widget, "actions")).flatMap(name => {
      const action = this.action(widget, name)
      return action ? [action.state] : []
    })
    const groups = Object.entries(widgetDeclarations(widget, "optionGroups"))
      .map(([name, declaration]) => widgetOptionGroupState(name, declaration, this.locale(widget)))
    const controls = renderWidgetOptions(options, actions, groups,
      option => renderWidgetOptionField(option, this.setOption), actions => this.renderActions(actions))
    const conversions = this.renderConversions(widget)
    if(controls === nothing && conversions === nothing && !this.defaults) return nothing
    return html`<details class="drawer" part="drawer">
      <summary part="summary">Widget settings</summary>
      <div class="contents">
        ${controls}${conversions}
        ${this.running ? html`<span role="status">Working…</span>` : nothing}
        ${this.actionError && !actions.some(action => action.name === this.actionError?.name)
          ? html`<p class="error" role="alert">${this.actionError.message}</p>` : nothing}
        ${this.defaults ? this.renderStorage() : nothing}
      </div>
    </details>
    <input type="file" hidden @change=${this.filePicked} @cancel=${this.filePicked}>`
  }
}
