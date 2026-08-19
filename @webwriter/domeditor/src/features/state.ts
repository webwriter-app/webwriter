import {EditorFeature} from "."
import {aiEditReviewEvent, type AIEditReviewAction} from "../editor-bridge"

const maximumAIHTMLLength = 1_000_000
const dangerousElements = "script, iframe, object, embed, base, meta[http-equiv='refresh'], link[rel='import']"
const urlAttributes = new Set(["href", "src", "xlink:href", "action", "formaction", "poster"])

const safeURL = (value: string) => {
  const normalized = value.trim().toLowerCase().replaceAll(/[\u0000-\u0020]+/g, "")
  return !normalized.startsWith("javascript:")
    && !normalized.startsWith("vbscript:")
    && !normalized.startsWith("data:text/html")
    && !normalized.startsWith("data:image/svg+xml")
}

/** Removes active content from model-authored HTML before it enters the live
 * document. Existing document code remains untouched unless the user approves
 * a full replacement, whose replacement body is sanitized here as well. */
const sanitizeAIContent = (root: ParentNode) => {
  let removed = 0
  root.querySelectorAll(dangerousElements).forEach(element => {
    element.remove()
    removed++
  })
  root.querySelectorAll<HTMLElement>("*").forEach(element => {
    for(const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const editorClass = name === "class"
        ? attribute.value.split(/\s+/).filter(className => !className.startsWith("◆"))
        : null
      if(name.startsWith("on")
        || name === "srcdoc"
        || name === "contenteditable"
        || name === "spellcheck"
        || name === "data-webwriter-editor-only"
        || urlAttributes.has(name) && !safeURL(attribute.value)
        || name === "style" && /(?:expression\s*\(|javascript\s*:|data\s*:\s*text\/html)/i.test(attribute.value)) {
        element.removeAttribute(attribute.name)
        removed++
      }
      else if(editorClass) {
        if(editorClass.length) element.setAttribute("class", editorClass.join(" "))
        else element.removeAttribute("class")
      }
    }
    if(element instanceof HTMLTemplateElement) removed += sanitizeAIContent(element.content)
  })
  return removed
}

const checkedAIHTML = (html: unknown) => {
  if(typeof html !== "string") throw new TypeError("The replacement HTML must be a string")
  if(html.length > maximumAIHTMLLength) throw new RangeError("The proposed HTML is too large to apply safely")
  return html
}

const serializeFragment = (fragment: DocumentFragment) => {
  const container = document.createElement("div")
  container.append(fragment)
  return container.innerHTML
}

/** Realm-independent state transfer used when package changes reload the
 * iframe and, with it, the custom-element registry. */
export class StateFeature extends EditorFeature {
  private activeAIEditId: string | null = null
  private aiEditSequence = 0
  private readonly aiEditMarkers = new Map<string, string>()
  private readonly aiEditResults = new Map<string, {scope: "document" | "selection", removedUnsafeItems: number}>()
  private reviewToolbar: HTMLElement | null = null

  private replaceDocument(html: string) {
    const parsed = new DOMParser().parseFromString(checkedAIHTML(html), "text/html")
    const removedUnsafeItems = sanitizeAIContent(parsed.body)
    const nodes = Array.from(parsed.body.childNodes, node => document.importNode(node, true))
    document.body.replaceChildren(...nodes)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(document.body)
    range.collapse(false)
    selection?.addRange(range)
    return {scope: "document" as const, removedUnsafeItems, nodes}
  }

  private replaceSelection(html: string) {
    const selection = document.getSelection()
    if(!selection?.rangeCount || !selection.anchorNode || !document.body.contains(selection.anchorNode)) {
      throw new Error("There is no document selection to replace")
    }
    const template = document.createElement("template")
    template.innerHTML = checkedAIHTML(html)
    const removedUnsafeItems = sanitizeAIContent(template.content)
    const range = selection.getRangeAt(0)
    const fragment = template.content
    const nodes = Array.from(fragment.childNodes)
    const last = fragment.lastChild
    const fallbackTarget = range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement
    range.deleteContents()
    range.insertNode(fragment)
    selection.removeAllRanges()
    const caret = document.createRange()
    if(last?.parentNode) caret.setStartAfter(last)
    else caret.setStart(range.startContainer, Math.min(range.startOffset, range.startContainer.childNodes.length))
    caret.collapse(true)
    selection.addRange(caret)
    return {scope: "selection" as const, removedUnsafeItems, nodes, fallbackTarget}
  }

  private markAIEdit(editId: string, nodes: Node[], fallbackTarget?: Element | null) {
    const marker = `◆ai-edit-${++this.aiEditSequence}`
    const targets = nodes.flatMap(node => node instanceof Element
      ? [node]
      : node.parentElement ? [node.parentElement] : [])
    if(!targets.length && fallbackTarget) targets.push(fallbackTarget)
    if(!targets.length) targets.push(document.body)
    new Set(targets).forEach(target => target.classList.add(marker, "◆ai-preview-change"))
    this.aiEditMarkers.set(editId, marker)
  }

  private targetsForAIEdit(editId: string) {
    const marker = this.aiEditMarkers.get(editId)
    return marker ? Array.from(document.getElementsByClassName(marker)) as HTMLElement[] : []
  }

  private clearAIEditMarkers(editId: string, keepTarget = false) {
    const marker = this.aiEditMarkers.get(editId)
    this.targetsForAIEdit(editId).forEach(target => {
      target.classList.remove("◆ai-preview-change", "◆ai-preview-pulse")
      if(!keepTarget && marker) target.classList.remove(marker)
    })
    if(!keepTarget) this.aiEditMarkers.delete(editId)
  }

  private postReviewChoice(editId: string, action: AIEditReviewAction) {
    const detail = {editId, action}
    const handled = !window.dispatchEvent(new CustomEvent(aiEditReviewEvent, {
      detail,
      bubbles: true,
      composed: true,
      cancelable: true,
    }))
    if(handled) return
    const target = window.parent === window ? window : window.parent
    target.postMessage({type: aiEditReviewEvent, detail}, "*")
  }

  private lockForAIReview(editId: string, summary: string) {
    this.activeAIEditId = editId
    document.documentElement.classList.add("◆ai-review-active")
    this.editor.lockEditing(this)

    this.reviewToolbar?.remove()
    const toolbar = document.createElement("aside")
    toolbar.className = "◆editor-only ◆ai-review-toolbar"
    toolbar.setAttribute("role", "dialog")
    toolbar.setAttribute("aria-label", "Review AI document change")
    const copy = document.createElement("div")
    copy.className = "◆ai-review-copy"
    const label = document.createElement("strong")
    label.textContent = "AI change preview"
    const description = document.createElement("span")
    description.textContent = summary
    copy.append(label, description)
    const actions = document.createElement("div")
    actions.className = "◆ai-review-actions"
    for(const [action, text] of [["reject", "Reject"], ["accept", "Accept"]] as const) {
      const button = document.createElement("button")
      button.type = "button"
      button.dataset.action = action
      button.textContent = text
      button.addEventListener("click", () => this.postReviewChoice(editId, action))
      actions.append(button)
    }
    toolbar.append(copy, actions)
    document.documentElement.append(toolbar)
    this.reviewToolbar = toolbar
  }

  private unlockAfterAIReview(editId: string) {
    if(this.activeAIEditId !== editId) return
    this.activeAIEditId = null
    this.reviewToolbar?.remove()
    this.reviewToolbar = null
    document.documentElement.classList.remove("◆ai-review-active")
    this.editor.unlockEditing(this)
  }

  private previewAIEdit(editId: string, summary: string, scope: "document" | "selection", html: string) {
    if(this.activeAIEditId) throw new Error("Another AI document change is already awaiting review")
    const result = this.editor.doc.captureDOMChange(editId, () => {
      const replacement = scope === "document" ? this.replaceDocument(html) : this.replaceSelection(html)
      this.markAIEdit(editId, replacement.nodes, "fallbackTarget" in replacement ? replacement.fallbackTarget : document.body)
      return replacement
    })
    this.aiEditResults.set(editId, {scope: result.scope, removedUnsafeItems: result.removedUnsafeItems})
    this.lockForAIReview(editId, summary)
    this.gotoAIEdit(editId)
    return {status: "previewing", scope: result.scope, removedUnsafeItems: result.removedUnsafeItems}
  }

  private gotoAIEdit(editId: string) {
    const target = this.targetsForAIEdit(editId)[0]
    if(!target) return {status: "unavailable", message: "The changed content is no longer in the document"}
    target.scrollIntoView?.({block: "center", behavior: "smooth"})
    target.classList.remove("◆ai-preview-pulse")
    // Restart the animation when Go to is used repeatedly.
    void target.offsetWidth
    target.classList.add("◆ai-preview-pulse")
    setTimeout(() => target.classList.remove("◆ai-preview-pulse"), 1200)
    return {status: "located"}
  }
  actions = {
    snapshotState: ({}: {type: "snapshotState"}) => this.editor.doc.snapshot(),
    serializeDocument: ({offline = false}: {type: "serializeDocument", offline?: boolean}) =>
      this.editor.serializeHTML(offline),
    readAIDocument: ({}: {type: "readAIDocument"}) => {
      const html = this.editor.toHTML(true)
      const maximumLength = 200_000
      return {
        html: html.slice(0, maximumLength),
        text: document.body.innerText.slice(0, maximumLength),
        truncated: html.length > maximumLength,
      }
    },
    readAISelection: ({}: {type: "readAISelection"}) => {
      const selection = document.getSelection()
      if(!selection?.rangeCount || !selection.anchorNode || !document.body.contains(selection.anchorNode)) {
        return {html: "", text: "", collapsed: true}
      }
      const range = selection.getRangeAt(0)
      const fragment = range.cloneContents()
      sanitizeAIContent(fragment)
      const html = serializeFragment(fragment)
      return {
        html: html.slice(0, 100_000),
        text: range.toString().slice(0, 100_000),
        collapsed: range.collapsed,
        truncated: html.length > 100_000,
      }
    },
    replaceAIDocument: ({html}: {type: "replaceAIDocument", html: string}) => {
      const result = this.replaceDocument(html)
      this.editor.doc.syncFromDOM()
      return {status: "applied", scope: result.scope, removedUnsafeItems: result.removedUnsafeItems}
    },
    replaceAISelection: ({html}: {type: "replaceAISelection", html: string}) => {
      const result = this.replaceSelection(html)
      this.editor.doc.syncFromDOM()
      return {status: "applied", scope: result.scope, removedUnsafeItems: result.removedUnsafeItems}
    },
    previewAIDocument: ({editId, summary, html}: {type: "previewAIDocument", editId: string, summary: string, html: string}) =>
      this.previewAIEdit(editId, summary, "document", html),
    previewAISelection: ({editId, summary, html}: {type: "previewAISelection", editId: string, summary: string, html: string}) =>
      this.previewAIEdit(editId, summary, "selection", html),
    acceptAIEdit: ({editId}: {type: "acceptAIEdit", editId: string}) => {
      if(this.activeAIEditId !== editId || !this.editor.doc.hasCapturedChange(editId)) {
        throw new Error("This AI change is no longer awaiting review")
      }
      this.clearAIEditMarkers(editId, true)
      this.unlockAfterAIReview(editId)
      const result = this.aiEditResults.get(editId)
      return {status: "applied", ...result}
    },
    rejectAIEdit: ({editId}: {type: "rejectAIEdit", editId: string}) => {
      if(this.activeAIEditId !== editId) throw new Error("This AI change is no longer awaiting review")
      this.clearAIEditMarkers(editId)
      const undone = this.editor.doc.undoCapturedChange(editId)
      this.aiEditResults.delete(editId)
      this.unlockAfterAIReview(editId)
      return {status: undone ? "rejected" : "unavailable"}
    },
    gotoAIEdit: ({editId}: {type: "gotoAIEdit", editId: string}) => this.gotoAIEdit(editId),
    undoAIEdit: ({editId}: {type: "undoAIEdit", editId: string}) => {
      if(this.activeAIEditId) throw new Error("Finish reviewing the pending AI change first")
      this.clearAIEditMarkers(editId)
      const undone = this.editor.doc.undoCapturedChange(editId)
      this.aiEditResults.delete(editId)
      return {status: undone ? "undone" : "unavailable"}
    },
  } as const

  disable() {
    this.activeAIEditId = null
    this.reviewToolbar?.remove()
    this.reviewToolbar = null
    document.documentElement.classList.remove("◆ai-review-active")
    this.editor.unlockEditing(this)
    super.disable()
  }
}
