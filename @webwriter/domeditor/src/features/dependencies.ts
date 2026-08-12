import { EditorFeature } from "."
import { DOMEditor } from "../domeditor"
import {isLoadWidgetsMessage, loadWidgetsMessage, type LoadWidgetsMessage} from "../editor-bridge"
import {packageInsertionItems, WebWriterPackageRegistry} from "../packages"

export class DependencyFeature extends EditorFeature {
  private readonly packageRegistry = new WebWriterPackageRegistry()
  private widgetAssets: HTMLElement[] = []
  private widgetLoadSequence = 0

  actions = {
    [loadWidgetsMessage]: (message: LoadWidgetsMessage) => this.loadWidgets(message),
  }

  constructor(editor: DOMEditor) {
    super(editor)
    this.#replaceCustomElementsDefine()
  }

  /** Resolves pinned widget-package assets and mounts them in the iframe. */
  async loadWidgets(message: LoadWidgetsMessage) {
    if(!isLoadWidgetsMessage(message)) throw new TypeError("Invalid load-widgets message")

    const sequence = ++this.widgetLoadSequence
    const widgetReferences = [...new Map(message.widgets.map(widget => [
      `${widget.name}@${widget.version}`,
      widget,
    ])).values()]
    const packages = await Promise.all(widgetReferences.map(widget => this.packageRegistry.getPackage(widget)))
    if(sequence !== this.widgetLoadSequence) return
    globalThis.DOMEDITOR_PACKAGE_ITEMS = packageInsertionItems(packages)

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
      script.classList.add("◆", "◆editor-only")
      return script
    })
    this.widgetAssets = [...styles, ...scripts]
    document.head.append(...this.widgetAssets)
    this.editor.features.insertion.menu.requestUpdate()
  }

  disable() {
    this.widgetLoadSequence++
    this.widgetAssets.forEach(element => element.remove())
    this.widgetAssets = []
    globalThis.DOMEDITOR_PACKAGE_ITEMS = []
    super.disable()
  }

  #replaceCustomElementsDefine() {
    const define = customElements.define
    customElements.define = function(tagName: string, constructor: CustomElementConstructor, options?: {extends: string}) {
      if(customElements.get(tagName)) {
        console.warn(`Attempted to re-register custom element tag name '${tagName}'`)
      }
      else {
        define.call(this, tagName, constructor, options)
      }
    }
  }
}
