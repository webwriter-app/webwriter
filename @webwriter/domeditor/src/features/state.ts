import {EditorFeature} from "."
import {aiEditReviewEvent, type AIEditReviewAction} from "../editor-bridge"
import type {DOMChangePreview} from "../domdoc"
import {stripActiveContent} from "../active-content"
import {isMarkElement} from "../marks"

const maximumAIHTMLLength = 1_000_000
const aiOnlyAttributes = new Set(["contenteditable", "spellcheck", "data-webwriter-editor-only"])

/** Removes active content from model-authored HTML before it enters the live
 * document. Existing document code remains untouched unless the user approves
 * a full replacement, whose replacement body is sanitized here as well. */
const sanitizeAIContent = (root: ParentNode) => {
  return stripActiveContent(root, {
    removeAttribute: attribute => aiOnlyAttributes.has(attribute.name.toLowerCase()),
    removeClass: className => className.startsWith("◆"),
  })
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
  private aiPreview: DOMChangePreview | null = null
  private htmlEditRange: Range | null = null
  private htmlEditPending = false
  private readonly htmlEditTargets = new Set<HTMLElement>()
  private readonly htmlEditLock = {}

  get isHTMLSelectionEditPending() {
    return this.htmlEditPending
  }

  allowsActionDuringHTMLSelectionEdit(type: string) {
    return !this.htmlEditPending || [
      "setHTMLSelectionEditPending",
      "applyHTMLSelectionEdit",
      "discardHTMLSelectionEdit",
    ].includes(type)
  }

  private elementAtPath(path: number[] | undefined) {
    if(!path) return null
    let node: Node | null = document.body
    for(const index of path) node = node?.childNodes.item(index) ?? null
    return node instanceof Element ? node : node?.parentElement ?? null
  }

  /** The nearest authored element which can serve as an HTML-editing root.
   * Mark-drawer wrappers are formatting belonging to their containing root. */
  private htmlSelectionRoot(node: Node | null) {
    let element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element | null
    while(element && isMarkElement(element)) element = element.parentElement
    return element
  }

  private selectedHTMLRange(fallbackPath?: number[]) {
    const selection = document.getSelection()
    const hasSelection = Boolean(selection?.rangeCount && selection.anchorNode
      && document.body.contains(selection.anchorNode))
    if(hasSelection) {
      const range = selection!.getRangeAt(0).cloneRange()
      if(!range.collapsed) return range
      const container = this.htmlSelectionRoot(range.startContainer)
      if(container && container !== document.body && document.body.contains(container)) {
        range.selectNode(container)
        return range
      }
    }

    const fallback = this.htmlSelectionRoot(this.elementAtPath(fallbackPath))
    const range = document.createRange()
    if(fallback && fallback !== document.body && document.body.contains(fallback)) range.selectNode(fallback)
    else range.selectNodeContents(document.body)
    return range
  }

  private serializeHTMLRange(range: Range) {
    const fragment = range.cloneContents()
    this.editor.clearEditingArtifacts(fragment)
    return serializeFragment(fragment)
  }

  private pendingHTMLTargets(range: Range) {
    const exactChild = range.startContainer === range.endContainer
      && range.startContainer instanceof Element
      && range.endOffset === range.startOffset + 1
      ? range.startContainer.childNodes.item(range.startOffset)
      : null
    if(exactChild instanceof HTMLElement) return [exactChild]
    const common = range.commonAncestorContainer instanceof HTMLElement
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement
    if(common && common !== document.body) return [common]
    const children = Array.from(document.body.children).filter(element => {
      try {
        return range.intersectsNode(element)
      }
      catch {
        return false
      }
    }) as HTMLElement[]
    return children.length ? children : [document.body]
  }

  private markHTMLSelectionPending() {
    const range = this.htmlEditRange
    if(!range) throw new Error("HTML selection editing has not started")
    this.pendingHTMLTargets(range).forEach(target => {
      target.classList.add("◆", "◆html-source-pending")
      this.htmlEditTargets.add(target)
    })
    document.documentElement.classList.add("◆html-source-review-active")
    this.editor.lockEditing(this.htmlEditLock)
    this.htmlEditPending = true
  }

  private clearHTMLSelectionPending() {
    this.htmlEditTargets.forEach(target => {
      target.classList.remove("◆html-source-pending")
      if(!Array.from(target.classList).some(name => name !== "◆" && name.startsWith("◆"))) {
        target.classList.remove("◆")
      }
      if(!target.classList.length) target.removeAttribute("class")
    })
    this.htmlEditTargets.clear()
    document.documentElement.classList.remove("◆html-source-review-active")
    this.editor.unlockEditing(this.htmlEditLock)
    this.htmlEditPending = false
  }

  private restoreHTMLRange() {
    const range = this.htmlEditRange
    if(!range?.startContainer.isConnected || !range.endContainer.isConnected) return false
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    return true
  }

  private discardHTMLSelectionEdit() {
    this.clearHTMLSelectionPending()
    this.restoreHTMLRange()
    this.htmlEditRange = null
    return {status: "discarded" as const}
  }

  private applyHTMLSelectionEdit(html: string) {
    if(!this.htmlEditPending || !this.htmlEditRange) {
      throw new Error("There is no pending HTML selection change to apply")
    }
    const range = this.htmlEditRange
    if(!range.startContainer.isConnected || !range.endContainer.isConnected) {
      throw new Error("The selected content changed before the HTML could be applied")
    }
    const {fragment, removedUnsafeItems} = this.editor.parseHTMLFragment(checkedAIHTML(html))
    const nodes = Array.from(fragment.childNodes)
    this.clearHTMLSelectionPending()
    try {
      range.deleteContents()
      range.insertNode(fragment)
      const selection = document.getSelection()
      selection?.removeAllRanges()
      const applied = document.createRange()
      if(nodes.length && nodes[0].parentNode && nodes.at(-1)?.parentNode) {
        applied.setStartBefore(nodes[0])
        applied.setEndAfter(nodes.at(-1)!)
      }
      else {
        applied.setStart(range.startContainer, Math.min(range.startOffset, range.startContainer.childNodes.length))
        applied.collapse(true)
      }
      selection?.addRange(applied)
      this.editor.normalizeSurroundingElements(range.startContainer, ...nodes)
      this.editor.doc.syncFromDOM()
      this.htmlEditRange = null
      return {status: "applied" as const, removedUnsafeItems}
    }
    catch(error) {
      this.htmlEditRange = range
      this.markHTMLSelectionPending()
      throw error
    }
  }

  private replaceDocument(html: string) {
    const parsed = new DOMParser().parseFromString(checkedAIHTML(html), "text/html")
    const incoming = document.createDocumentFragment()
    incoming.append(...Array.from(parsed.body.childNodes, node => document.importNode(node, true)))
    const {fragment, removedUnsafeItems} = this.editor.prepareHTMLFragment(incoming)
    const nodes = Array.from(fragment.childNodes)
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
    const {fragment, removedUnsafeItems} = this.editor.prepareHTMLFragment(template.content)
    const range = selection.getRangeAt(0)
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

  private targetPath(target: Element) {
    const path: number[] = []
    let node: Node | null = target
    while(node && node !== document.body) {
      const parent: ParentNode | null = node.parentNode
      if(!parent) return null
      path.unshift(Array.from(parent.childNodes).indexOf(node as ChildNode))
      node = parent as Node
    }
    return node === document.body ? path : null
  }

  private targetAtPath(path: number[]) {
    let node: Node | null = document.body
    for(const index of path) node = node?.childNodes.item(index) ?? null
    return node instanceof Element ? node : node?.parentElement ?? null
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
    this.editor.postHostMessage({type: aiEditReviewEvent, detail})
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
    toolbar.addEventListener("keydown", event => event.stopPropagation())
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
    this.editor.addAppendix(toolbar)
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
    const preview = this.editor.doc.beginDOMPreview()
    try {
      const replacement = scope === "document" ? this.replaceDocument(html) : this.replaceSelection(html)
      this.markAIEdit(editId, replacement.nodes, "fallbackTarget" in replacement ? replacement.fallbackTarget : document.body)
      this.aiPreview = preview
      this.aiEditResults.set(editId, {scope: replacement.scope, removedUnsafeItems: replacement.removedUnsafeItems})
      this.lockForAIReview(editId, summary)
      this.gotoAIEdit(editId)
      return {status: "previewing", scope: replacement.scope, removedUnsafeItems: replacement.removedUnsafeItems}
    }
    catch(error) {
      preview.reject()
      this.aiPreview = null
      this.clearAIEditMarkers(editId)
      this.aiEditResults.delete(editId)
      throw error
    }
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
    beginHTMLSelectionEdit: ({path}: {type: "beginHTMLSelectionEdit", path?: number[]}) => {
      if(this.activeAIEditId) throw new Error("Finish reviewing the AI change before editing HTML")
      if(this.htmlEditPending) throw new Error("Apply or discard the pending HTML change first")
      if(path !== undefined && (!Array.isArray(path) || path.some(index => !Number.isInteger(index) || index < 0))) {
        throw new TypeError("The HTML selection path must contain non-negative integer indexes")
      }
      const range = this.selectedHTMLRange(path)
      this.htmlEditRange = range
      return {html: this.serializeHTMLRange(range)}
    },
    setHTMLSelectionEditPending: ({pending}: {type: "setHTMLSelectionEditPending", pending: boolean}) => {
      if(typeof pending !== "boolean") throw new TypeError("The pending state must be a boolean")
      if(!this.htmlEditRange) throw new Error("HTML selection editing has not started")
      if(pending === this.htmlEditPending) return {pending}
      if(pending) this.markHTMLSelectionPending()
      else this.clearHTMLSelectionPending()
      return {pending}
    },
    applyHTMLSelectionEdit: ({html}: {type: "applyHTMLSelectionEdit", html: string}) =>
      this.applyHTMLSelectionEdit(html),
    discardHTMLSelectionEdit: ({}: {type: "discardHTMLSelectionEdit"}) =>
      this.discardHTMLSelectionEdit(),
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
      const preview = this.aiPreview
      if(this.activeAIEditId !== editId || !preview?.active) {
        throw new Error("This AI change is no longer awaiting review")
      }
      const marker = this.aiEditMarkers.get(editId)
      const targetPaths = this.targetsForAIEdit(editId).flatMap(target => {
        const path = this.targetPath(target)
        return path ? [path] : []
      })
      this.clearAIEditMarkers(editId, true)
      this.aiPreview = null
      try {
        const accepted = preview.accept(editId)
        if(accepted && marker) {
          const targets = targetPaths.flatMap(path => {
            const target = this.targetAtPath(path)
            return target ? [target] : []
          })
          new Set(targets.length ? targets : [document.body]).forEach(target => target.classList.add(marker))
        }
        const result = this.aiEditResults.get(editId)
        return {status: accepted ? "applied" : "unavailable", ...result}
      }
      catch(error) {
        if(preview.active) preview.reject()
        this.aiEditMarkers.delete(editId)
        this.aiEditResults.delete(editId)
        throw error
      }
      finally {
        this.unlockAfterAIReview(editId)
      }
    },
    rejectAIEdit: ({editId}: {type: "rejectAIEdit", editId: string}) => {
      const preview = this.aiPreview
      if(this.activeAIEditId !== editId || !preview?.active) throw new Error("This AI change is no longer awaiting review")
      this.clearAIEditMarkers(editId)
      this.aiPreview = null
      const rejected = preview.reject()
      this.aiEditResults.delete(editId)
      this.unlockAfterAIReview(editId)
      return {status: rejected ? "rejected" : "unavailable"}
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
    if(!this.isEnabled) return
    this.aiPreview?.reject()
    this.aiPreview = null
    for(const editId of this.aiEditMarkers.keys()) this.clearAIEditMarkers(editId)
    this.aiEditResults.clear()
    this.activeAIEditId = null
    this.reviewToolbar?.remove()
    this.reviewToolbar = null
    document.documentElement.classList.remove("◆ai-review-active")
    this.clearHTMLSelectionPending()
    this.htmlEditRange = null
    this.editor.unlockEditing(this)
    super.disable()
  }
}
