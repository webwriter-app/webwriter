import {clearPresentationState, setPresentationState} from "../presentation-state.js"
import {EditorFeature} from "."
import {getDocumentTemplate, isSoleDocumentContent, isViewportDocument, viewportDocumentStyles} from "../document-template"
import {documentLayoutMode} from "../document-layout"
import {$, removeEditorMarker} from "../utility"

/** Body-equivalent document templates. The live role=document element is the
 * complete state; this feature mirrors its presence to a temporary BODY class
 * for presentation and provides the command for returning to the default
 * BODY root. */
export class TemplateFeature extends EditorFeature {
  readonly #state = "template-active"
  #markedBody: HTMLElement | null = null
  readonly #observer = new MutationObserver(() => this.refresh())

  enable() {
    if(this.isEnabled) return
    super.enable()
    this.refresh()
    this.#observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["is", "role"],
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  disable() {
    if(!this.isEnabled) return
    this.#observer.disconnect()
    this.clearMarker(this.#markedBody)
    this.#markedBody = null
    super.disable()
  }

  actions = {
    setFillViewport: ({enabled}: {type: "setFillViewport", enabled: boolean}) => this.setFillViewport(enabled),
    setDocumentTemplate: ({template}: {
      type: "setDocumentTemplate"
      template: "body"
    }) => this.setTemplate(template),
  } as const

  canFillViewport(target: Element) {
    return (this.editor.features.selection.isCaptureSelection || $.isElementSelection)
      && target === this.editor.features.manipulation.styleTarget
      && documentLayoutMode() === "document" && isSoleDocumentContent(target)
      && !target.matches("p, h1, h2, h3, h4, h5, h6, hgroup, ul, ol, menu, dl, li, dt, dd, details, script, style, link, meta, template")
  }

  setFillViewport(enabled: boolean) {
    const target = this.editor.features.manipulation.styleTarget
    if(typeof enabled !== "boolean" || !target.isConnected || this.editor.isEditingLocked
      || !this.editor.allows("style", target) || !this.canFillViewport(target)) return false
    const end = this.editor.doc.beginUndoGroup()
    try {
      if(enabled) {
        // Captions belong to this item, never to opaque widget internals.
        if(!target.localName.includes("-") && !target.hasAttribute("is")) {
          if(target.localName === "table") (target as HTMLTableElement).caption?.remove()
          if(target.localName === "figure") {
            for(const caption of target.querySelectorAll(":scope > figcaption")) caption.remove()
          }
        }
        target.classList.remove("ww-float-left", "ww-float-right", "ww-float-none", "ww-float-sticky", "ww-full-width")
        if(!target.classList.length) target.removeAttribute("class")
        const style = (target as HTMLElement | SVGElement).style
        for(const name of Array.from(style)) {
          if(/^(?:float|clear|position|inset(?:-.*)?|top|right|bottom|left|z-index|margin(?:-.*)?|caption-side|text-align|--ww-(?:float|full-width|caption).*)$/.test(name)) style.removeProperty(name)
        }
        if(!style.length) target.removeAttribute("style")
        const roles = (target.getAttribute("role") ?? "").split(/\s+/).filter(role => role && role.toLowerCase() !== "document")
        target.setAttribute("role", ["document", ...roles].join(" "))
        if(!Array.from(document.head.querySelectorAll("style")).some(style => style.textContent === viewportDocumentStyles)) {
          const style = document.createElement("style")
          style.textContent = viewportDocumentStyles
          document.head.append(style)
        }
      }
      else if(isViewportDocument(target)) {
        const roles = (target.getAttribute("role") ?? "").split(/\s+/).filter(role => role && role.toLowerCase() !== "document")
        if(roles.length) target.setAttribute("role", roles.join(" "))
        else target.removeAttribute("role")
      }
      this.refresh()
      return true
    }
    finally { end() }
  }

  /** Returns to the default BODY root without discarding the widget or any of
   * its contents. Other authored role fallbacks remain intact. */
  setTemplate(type: "body") {
    const body = document.body
    const current = getDocumentTemplate(body)
    if(type === "body" && current) {
      const remainingRoles = (current.getAttribute("role") ?? "")
        .split(/\s+/)
        .filter(role => role && role.toLowerCase() !== "document")
      if(remainingRoles.length) current.setAttribute("role", remainingRoles.join(" "))
      else current.removeAttribute("role")
    }
    this.refresh()
    $.selectElement(body)
    this.editor.features.selection.processSelection()
    return Boolean(current)
  }

  private clearMarker(body: HTMLElement | null) {
    if(!body) return
    clearPresentationState(body, this.#state)
  }

  private refresh() {
    const body = document.body
    if(this.#markedBody && this.#markedBody !== body) this.clearMarker(this.#markedBody)
    const active = Boolean(getDocumentTemplate(body))
    if(active) setPresentationState(body, this.#state)
    else this.clearMarker(body)
    this.#markedBody = active ? body : null
  }
}
