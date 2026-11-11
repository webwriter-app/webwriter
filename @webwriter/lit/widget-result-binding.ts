import {isWidgetResultType, validateWidgetResult, WidgetResultConflict, type WidgetResult, type WidgetResultStorage, type WidgetResultType} from "./widget-result-storage"

export type WidgetResultStatus = {state: "loading" | "ready" | "saving" | "saved" | "error" | "conflict", message?: string}

export function widgetResultBlock(widget: Element) {
  return Array.from(widget.children).find((child): child is HTMLScriptElement => child.localName === "script"
    && child.namespaceURI === "http://www.w3.org/1999/xhtml" && child.getAttribute("slot") === "data"
    && isWidgetResultType(child.getAttribute("type")) && !child.hasAttribute("src"))
}

/** Bind the current authored result block to a storage destination. */
export class WidgetResultBinding {
  private readonly controller = new AbortController()
  private revision: string | null = null
  private readonly loadBase: string
  private observed: string
  private saved: string
  private ready = false
  private saving = false
  private status: WidgetResultStatus = {state: "loading"}
  private readonly widget: Element
  private readonly setting: string | null

  constructor(
    readonly block: HTMLScriptElement,
    readonly type: WidgetResultType,
    private defaults: string,
    private storage: WidgetResultStorage,
    private update: (status: WidgetResultStatus) => void,
  ) {
    this.widget = block.parentElement!
    this.setting = this.widget.getAttribute("standalone")?.trim() ?? null
    this.loadBase = this.observed = this.saved = block.textContent ?? ""
    block.addEventListener("datarequest", this.request, {signal: this.controller.signal})
    void this.load()
  }

  private get current() {
    return this.widget.isConnected && (this.widget.getAttribute("standalone")?.trim() ?? null) === this.setting && widgetResultBlock(this.widget) === this.block && this.block.type === this.type
  }

  get dirty() { return this.block.textContent !== (this.ready ? this.saved : this.loadBase) }

  private request = (event: Event) => {
    if(event.target !== this.block || event.defaultPrevented) return
    event.preventDefault()
    this.notify(this.ready ? "datachange" : "datapending")
  }

  private notify(type: string, detail = {}) {
    this.block.dispatchEvent(new CustomEvent(type, {bubbles: true, detail: {mode: "local", ...detail}}))
  }

  private report(state: WidgetResultStatus["state"], message?: string) {
    this.status = {state, message}
    this.update(this.status)
    if(state === "loading") this.notify("datapending")
    if(state === "saving" || state === "saved" || state === "error" || state === "conflict") {
      this.notify("datapersistence", {state: state === "saving" ? "pending" : state === "saved" ? "saved" : "error", message})
    }
  }

  private fail(error: unknown) {
    if(this.controller.signal.aborted) return
    const message = error instanceof Error ? error.message : String(error)
    if(!this.ready) this.notify("dataerror", {message})
    this.report(error instanceof WidgetResultConflict ? "conflict" : "error", message)
  }

  private async load() {
    const signal = this.controller.signal
    this.report("loading")
    try {
      const stored = await this.storage.load(signal)
      if(signal.aborted || !this.current) return
      if(stored && stored.type !== this.type) throw new Error("The saved result uses a different format.")
      if(stored) validateWidgetResult(stored)
      this.revision = stored?.revision ?? null
      const text = stored?.text ?? this.defaults
      this.saved = this.type === "application/json" ? text.replace(/</g, "\\u003c") : text
      const changedDuringLoad = this.block.textContent !== this.loadBase
      if(!changedDuringLoad && this.block.textContent !== this.saved) this.block.textContent = this.saved
      this.observed = this.block.textContent ?? ""
      this.ready = true
      this.notify("datachange")
      if(stored && changedDuringLoad && this.dirty) this.fail(new WidgetResultConflict())
      else {
        this.report(stored ? "saved" : "ready")
        void this.flush()
      }
    }
    catch(error) { this.fail(error) }
  }

  changed() {
    if(!this.ready || this.controller.signal.aborted) return
    const text = this.block.textContent ?? ""
    if(text === this.observed) return
    this.observed = text
    this.notify("datachange")
    if(this.status.state === "error") this.report("ready")
    void this.flush()
  }

  retry() {
    if(this.status.state !== "error") return
    if(!this.ready) void this.load()
    else {
      this.report("ready")
      void this.flush()
    }
  }

  private async flush() {
    if(!this.ready || this.saving || this.status.state === "conflict" || this.status.state === "error") return
    const signal = this.controller.signal
    this.saving = true
    try {
      while(!signal.aborted && this.current && this.dirty) {
        const result: WidgetResult = {type: this.type, text: this.block.textContent ?? ""}
        validateWidgetResult(result)
        this.report("saving")
        const revision = await this.storage.save(result, this.revision, signal)
        if(signal.aborted || !this.current) return
        this.revision = revision
        this.saved = result.text
      }
      if(!signal.aborted && this.status.state === "saving") this.report("saved")
    }
    catch(error) { this.fail(error) }
    finally { this.saving = false }
  }

  destroy() {
    this.controller.abort()
    this.notify("datarelease")
  }
}
