import {EditorFeature} from "."
import {getDocumentTemplate} from "../document-template"
import {$} from "../utility"

/** Body-equivalent document templates. The live role=document element is the
 * complete state; this feature mirrors its presence to a temporary BODY class
 * for presentation and provides the command for returning to the default
 * BODY root. */
export class TemplateFeature extends EditorFeature {
  readonly #marker = "◆template-active"
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
    setDocumentTemplate: ({template}: {
      type: "setDocumentTemplate"
      template: "body"
    }) => this.setTemplate(template),
  } as const

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
    body.classList.remove(this.#marker)
    if(!Array.from(body.classList).some(name => name !== "◆" && name.startsWith("◆"))) {
      body.classList.remove("◆")
    }
    if(!body.classList.length) body.removeAttribute("class")
  }

  private refresh() {
    const body = document.body
    if(this.#markedBody && this.#markedBody !== body) this.clearMarker(this.#markedBody)
    const active = Boolean(getDocumentTemplate(body))
    if(active) body.classList.add("◆", this.#marker)
    else this.clearMarker(body)
    this.#markedBody = active ? body : null
  }
}
