import { EditorFeature } from "."
import { DOMEditor } from "../domeditor"
import {isLoadWidgetsMessage, loadWidgetsMessage, type LoadWidgetsMessage} from "../editor-bridge"
import {packageInsertionItems, packageWidgetSchemaDefinitions, WebWriterPackageRegistry} from "../packages"
import {Schema} from "../schema"
import {markWidgetsEditable} from "../utility"
import {LOCAL_PACKAGE_ROUTE_PREFIX} from "../local-package-worker"

export class DependencyFeature extends EditorFeature {
  private readonly packageRegistry = new WebWriterPackageRegistry()
  private widgetAssets: HTMLElement[] = []
  private widgetLoadSequence = 0
  private readonly pendingAssetCancellations = new Set<() => void>()
  private widgetTags = new Set<string>()
  private widgetContentObserver: MutationObserver | null = null
  private readonly handleWidgetContent = (mutations: MutationRecord[]) => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      markWidgetsEditable(node, this.widgetTags)
    }))
  }

  actions = {
    [loadWidgetsMessage]: (message: LoadWidgetsMessage) => this.loadWidgets(message),
  }

  constructor(editor: DOMEditor) {
    super(editor)
  }

  /** Resolves pinned widget-package assets and mounts them in the iframe. */
  async loadWidgets(message: LoadWidgetsMessage) {
    if(!isLoadWidgetsMessage(message)) throw new TypeError("Invalid load-widgets message")

    const sequence = ++this.widgetLoadSequence
    // A newer request supersedes any asset barrier from the previous request.
    // Resolve those waits so an old action cannot remain pending forever.
    this.pendingAssetCancellations.forEach(cancel => cancel())
    this.pendingAssetCancellations.clear()
    const suppliedPackages = new Map((message.packages ?? []).map(pkg => [`${pkg.name}@${pkg.version}`, pkg]))
    const widgetReferences = [...new Map(message.widgets.map(widget => [
      `${widget.name}@${widget.version}`,
      widget,
    ])).values()]
    const packages = await Promise.all(widgetReferences.map(widget => (
      suppliedPackages.get(`${widget.name}@${widget.version}`) ?? this.packageRegistry.getPackage(widget)
    )))
    if(sequence !== this.widgetLoadSequence) return
    globalThis.DOMEDITOR_PACKAGE_ITEMS = packageInsertionItems(packages)
    const widgetDefinitions = packageWidgetSchemaDefinitions(packages)
    this.editor.schema = new Schema()
    this.editor.schema.extendWidgets(widgetDefinitions)
    this.widgetTags = new Set(widgetDefinitions.map(({tagName}) => tagName.toLowerCase()))
    markWidgetsEditable(document.body, this.widgetTags)

    this.widgetAssets.forEach(element => element.remove())
    const styles = [...new Set(packages.flatMap(pkg => pkg.styles))].map(href => {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = href
      link.classList.add("◆", "◆editor-only")
      return link
    })
    const scripts = [...new Set(packages.flatMap(pkg => pkg.scripts))].map(src => {
      const script = document.createElement("script")
      script.type = "module"
      script.src = src
      // Package bundles are an explicit trusted-code boundary. The editor
      // frame's nonce admits these resources while blocking authored scripts.
      script.nonce = this.editor.trustedScriptNonce
      script.classList.add("◆", "◆editor-only")
      return script
    })
    this.widgetAssets = [...styles, ...scripts]
    const assetLoads = this.widgetAssets.map(element => {
      const url = element instanceof HTMLLinkElement ? element.href : (element as HTMLScriptElement).src
      const local = new URL(url, document.baseURI).pathname.startsWith(LOCAL_PACKAGE_ROUTE_PREFIX)
      return new Promise<void>((resolve, reject) => {
        let settled = false
        const settle = (callback: () => void) => {
          if(settled) return
          settled = true
          this.pendingAssetCancellations.delete(cancel)
          callback()
        }
        const cancel = () => settle(resolve)
        this.pendingAssetCancellations.add(cancel)
        element.addEventListener("load", () => settle(resolve), {once: true})
        element.addEventListener("error", () => settle(() => reject(new Error(
          `${local ? "Local package" : "Package"} ${element instanceof HTMLLinkElement ? "stylesheet" : "script"} failed to load: ${url}`,
        ))), {once: true})
      })
    })
    document.head.append(...this.widgetAssets)
    await Promise.all(assetLoads)
    if(sequence !== this.widgetLoadSequence) return
    this.editor.features.insertion.menu.requestUpdate()
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    const FrameMutationObserver = document.defaultView?.MutationObserver ?? MutationObserver
    const observer = new FrameMutationObserver(this.handleWidgetContent)
    try {
      observer.observe(document.body, {childList: true, subtree: true})
      this.widgetContentObserver = observer
    }
    catch {
      // Scoped-registry initialization can replace the iframe document while
      // features are being constructed. A stale target must not abort the
      // remaining editor and bridge initialization.
      observer.disconnect()
    }
  }

  disable() {
    if(!this.isEnabled) return
    this.widgetLoadSequence++
    this.pendingAssetCancellations.forEach(cancel => cancel())
    this.pendingAssetCancellations.clear()
    this.widgetContentObserver?.disconnect()
    this.widgetContentObserver = null
    this.widgetAssets.forEach(element => element.remove())
    this.widgetAssets = []
    this.widgetTags.clear()
    globalThis.DOMEDITOR_PACKAGE_ITEMS = []
    super.disable()
  }
}
