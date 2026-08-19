import * as Y from "yjs"
import {DocumentListenerMap, EditorFeature} from "."
import {
  type VersionHistoryChanges,
  type VersionHistoryComment,
  type VersionHistoryState,
  type VersionHistoryUser,
} from "../editor-bridge"
import {modifierKeyDown, isOnApple} from "../utility"

type StoredCheckpoint = {
  id: string
  timestamp: number
  label: string
  user: VersionHistoryUser
  changes: VersionHistoryChanges
  source: string
}

type StoredComment = VersionHistoryComment

const checkpointLimit = 60
const checkpointDelay = 700
const historyMarkerClasses = ["◆history-added", "◆history-removed", "◆history-modified"] as const

const emptyChanges = (): VersionHistoryChanges => ({added: 0, removed: 0, modified: 0})

const firstInitial = (value: string) =>
  Array.from(value).find(character => /[\p{L}\p{N}]/u.test(character)) ?? ""

const userInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const initials = words.length > 1
    ? words.slice(0, 2).map(firstInitial).join("")
    : Array.from(words[0] ?? "").map(firstInitial).join("").slice(0, 2)
  const fallback = firstInitial(name) || "?"
  return Array.from((initials || fallback).toLocaleUpperCase()).slice(0, 2).join("")
}

/** Collaborative document checkpoints, previews, comments, undo, and redo. */
export class HistoryFeature extends EditorFeature {
  #checkpoints!: Y.Array<StoredCheckpoint>
  #comments!: Y.Array<StoredComment>
  readonly #historyOrigin = {source: "domeditor-version-history"}
  #checkpointTimer: ReturnType<typeof setTimeout> | undefined
  #previewCheckpointId: string | null = null
  #previewChanges: VersionHistoryState["preview"] = null
  #restoring = false

  actions = {
    undo: ({}: {type: "undo"}) => {
      this.editor.doc.undo()
    },
    redo: ({}: {type: "redo"}) => {
      this.editor.doc.redo()
    },
    getVersionHistory: ({}: {type: "getVersionHistory"}) => {
      this.#flushCheckpoint()
      return this.state()
    },
    previewVersionCheckpoint: ({checkpointId}: {type: "previewVersionCheckpoint", checkpointId: string}) => {
      this.#previewCheckpoint(checkpointId)
      const state = this.state()
      this.postState(state)
      return state
    },
    clearVersionPreview: ({}: {type: "clearVersionPreview"}) => {
      this.clearPreview()
      const state = this.state()
      this.postState(state)
      return state
    },
    revertVersionCheckpoint: ({checkpointId}: {type: "revertVersionCheckpoint", checkpointId: string}) =>
      this.#revertCheckpoint(checkpointId),
    addVersionComment: ({checkpointId, text}: {type: "addVersionComment", checkpointId: string, text: string}) =>
      this.#addComment(checkpointId, text),
  } as const

  activeListeners: DocumentListenerMap = {
    "keydown": ev => {
      const key = ev.key.toLowerCase()
      const isUndo = key === "z" && modifierKeyDown(ev) && !ev.shiftKey
      const isMacRedo = isOnApple() && key === "z" && modifierKeyDown(ev) && ev.shiftKey
      const isWinLinuxRedo = !isOnApple() && key === "y" && modifierKeyDown(ev)
      if(isUndo) {
        ev.preventDefault()
        this.editor.doc.undo()
      }
      else if(isMacRedo || isWinLinuxRedo) {
        ev.preventDefault()
        this.editor.doc.redo()
      }
    },
  }

  readonly #handleHistoryChange = () => this.postState()

  readonly #handleTransaction = (transaction: Y.Transaction) => {
    if(!this.#isDocumentTransaction(transaction)) return
    if(this.#previewCheckpointId) this.#previewCheckpoint(this.#previewCheckpointId)
    if(transaction.local && !this.#restoring) this.#queueCheckpoint()
    if(this.#previewCheckpointId) this.postState()
  }

  enable() {
    if(this.isEnabled) return
    this.#checkpoints = this.editor.doc.doc.getArray<StoredCheckpoint>("version-history")
    this.#comments = this.editor.doc.doc.getArray<StoredComment>("version-history-comments")
    super.enable()
    this.#checkpoints.observe(this.#handleHistoryChange)
    this.#comments.observe(this.#handleHistoryChange)
    this.editor.doc.doc.on("afterTransaction", this.#handleTransaction)
    if(this.#checkpoints.length === 0) this.#recordCheckpoint("Document created")
    else this.postState()
  }

  disable() {
    if(!this.isEnabled) return
    if(this.#checkpointTimer !== undefined) clearTimeout(this.#checkpointTimer)
    this.#checkpointTimer = undefined
    this.#checkpoints.unobserve(this.#handleHistoryChange)
    this.#comments.unobserve(this.#handleHistoryChange)
    this.editor.doc.doc.off("afterTransaction", this.#handleTransaction)
    this.clearPreview()
    super.disable()
  }

  state(): VersionHistoryState {
    const comments = this.#comments.toArray()
      .map(comment => ({...comment, user: {...comment.user}}))
      .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id))
    const commentCounts = new Map<string, number>()
    comments.forEach(comment => commentCounts.set(comment.checkpointId, (commentCounts.get(comment.checkpointId) ?? 0) + 1))
    const checkpoints = this.#checkpoints.toArray()
      .map(({source: _source, ...checkpoint}) => ({
        ...checkpoint,
        user: {...checkpoint.user},
        changes: {...checkpoint.changes},
        commentCount: commentCounts.get(checkpoint.id) ?? 0,
      }))
      .sort((left, right) => right.timestamp - left.timestamp || right.id.localeCompare(left.id))
    return {
      checkpoints,
      comments,
      preview: this.#previewChanges ? {...this.#previewChanges} : null,
    }
  }

  postState(state = this.state()) {
    if(this.isEnabled) this.editor.postHistoryState(state)
  }

  clearPreview() {
    this.#previewCheckpointId = null
    this.#previewChanges = null
    for(const element of Array.from(document.querySelectorAll<HTMLElement>("[class]"))) {
      element.classList.remove(...historyMarkerClasses)
      if(!element.classList.length) element.removeAttribute("class")
    }
  }

  #queueCheckpoint() {
    if(this.#checkpointTimer !== undefined) clearTimeout(this.#checkpointTimer)
    this.#checkpointTimer = setTimeout(() => {
      this.#checkpointTimer = undefined
      this.#recordCheckpoint()
    }, checkpointDelay)
  }

  #flushCheckpoint() {
    if(this.#checkpointTimer === undefined) return
    clearTimeout(this.#checkpointTimer)
    this.#checkpointTimer = undefined
    this.#recordCheckpoint()
  }

  #recordCheckpoint(label?: string) {
    const source = this.editor.toHTML()
    const previous = this.#checkpoints.toArray().at(-1)
    if(previous?.source === source) return previous
    const user = this.#localUser()
    const checkpoint: StoredCheckpoint = {
      id: this.#id("checkpoint"),
      timestamp: Date.now(),
      label: label ?? `Edited by ${user.name}`,
      user,
      changes: previous ? this.#diff(previous.source, source) : emptyChanges(),
      source,
    }
    this.editor.doc.doc.transact(() => {
      this.#checkpoints.push([checkpoint])
      const overflow = this.#checkpoints.length - checkpointLimit
      if(overflow > 0) this.#checkpoints.delete(0, overflow)
    }, this.#historyOrigin)
    return checkpoint
  }

  #addComment(checkpointId: string, value: string) {
    this.#flushCheckpoint()
    if(!this.#checkpoint(checkpointId)) throw new Error("That version is no longer available")
    const text = value.trim()
    if(!text) throw new TypeError("Enter a comment before adding it")
    if(text.length > 2000) throw new TypeError("History comments cannot exceed 2000 characters")
    const comment: StoredComment = {
      id: this.#id("comment"),
      checkpointId,
      timestamp: Date.now(),
      text,
      user: this.#localUser(),
    }
    this.editor.doc.doc.transact(() => this.#comments.push([comment]), this.#historyOrigin)
    const state = this.state()
    this.postState(state)
    return state
  }

  #revertCheckpoint(checkpointId: string) {
    this.#flushCheckpoint()
    const checkpoint = this.#checkpoint(checkpointId)
    if(!checkpoint) throw new Error("That version is no longer available")
    const restored = new DOMParser().parseFromString(checkpoint.source, "text/html")
    this.clearPreview()
    this.#restoring = true
    this.editor.doc.stopCapturing()
    this.editor.doc.stopObserve()
    try {
      this.#replaceAttributes(document.body, restored.body)
      document.body.replaceChildren(...Array.from(restored.body.childNodes, node => document.importNode(node, true)))
      const editorHeadNodes = Array.from(document.head.childNodes).filter(node =>
        node instanceof Element && node.matches(".◆editor-only, [data-webwriter-editor-only]"),
      )
      document.head.replaceChildren(...editorHeadNodes)
      document.head.append(...Array.from(restored.head.childNodes, node => document.importNode(node, true)))
      const language = restored.documentElement.getAttribute("lang")
      if(language === null) document.documentElement.removeAttribute("lang")
      else document.documentElement.setAttribute("lang", language)
      this.editor.doc.clearSelection()
      this.editor.doc.syncFromDOM()
    }
    finally {
      this.editor.doc.startObserve()
      this.editor.doc.stopCapturing()
      this.#restoring = false
    }
    const restoredCheckpoint = this.#recordCheckpoint(`Restored ${checkpoint.label}`)!
    this.#previewCheckpoint(restoredCheckpoint.id)
    const state = this.state()
    this.postState(state)
    return state
  }

  #replaceAttributes(target: Element, source: Element) {
    const internalClasses = Array.from(target.classList).filter(name => name.startsWith("◆"))
    for(const attribute of Array.from(target.attributes)) {
      if(this.editor.ignoreAttrs.some(name => name.toLowerCase() === attribute.name.toLowerCase())) continue
      target.removeAttribute(attribute.name)
    }
    for(const attribute of Array.from(source.attributes)) {
      if(this.editor.ignoreAttrs.some(name => name.toLowerCase() === attribute.name.toLowerCase())) continue
      if(attribute.name.toLowerCase() !== "class") target.setAttribute(attribute.name, attribute.value)
    }
    const authoredClasses = Array.from(source.classList).filter(name => !name.startsWith("◆"))
    const classNames = Array.from(new Set([...authoredClasses, ...internalClasses]))
    if(classNames.length) target.setAttribute("class", classNames.join(" "))
    else target.removeAttribute("class")
  }

  #previewCheckpoint(checkpointId: string) {
    const checkpoint = this.#checkpoint(checkpointId)
    this.clearPreview()
    if(!checkpoint) return
    this.#previewCheckpointId = checkpointId
    const changes = this.#diff(checkpoint.source, this.editor.toHTML(), true)
    this.#previewChanges = {
      checkpointId,
      ...changes,
      isCurrent: changes.added === 0 && changes.removed === 0 && changes.modified === 0,
    }
  }

  #checkpoint(checkpointId: string) {
    return this.#checkpoints.toArray().find(checkpoint => checkpoint.id === checkpointId)
  }

  #isDocumentTransaction(transaction: Y.Transaction) {
    const roots = new Set<unknown>([
      this.editor.doc.body,
      this.editor.doc.head,
      this.editor.doc.headElement,
    ])
    for(const changedType of transaction.changedParentTypes.keys()) {
      let current: any = changedType
      while(current) {
        if(roots.has(current)) return true
        current = current.parent
      }
    }
    return false
  }

  #localUser(): VersionHistoryUser {
    const clientId = this.editor.doc.awareness.clientID
    const value = this.editor.doc.awareness.getLocalState()?.user
    const user = value && typeof value === "object" ? value as {name?: unknown, color?: unknown} : {}
    const name = typeof user.name === "string" && user.name.trim()
      ? user.name.trim()
      : `User ${clientId.toString(36).toUpperCase()}`
    const color = typeof user.color === "string" && user.color.trim() ? user.color.trim() : "#64748b"
    return {clientId, name, initials: userInitials(name), color}
  }

  #id(kind: string) {
    return globalThis.crypto?.randomUUID?.()
      ?? `${kind}-${this.editor.doc.doc.clientID.toString(36)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }

  #diff(beforeSource: string, afterSource: string, highlight = false) {
    const parser = new DOMParser()
    const before = parser.parseFromString(beforeSource, "text/html")
    const after = highlight ? document : parser.parseFromString(afterSource, "text/html")
    const changes = emptyChanges()
    if(before.documentElement.getAttribute("lang") !== after.documentElement.getAttribute("lang")) changes.modified++
    this.#diffElement(before.head, after.head, changes, false)
    this.#diffElement(before.body, after.body, changes, highlight)
    return changes
  }

  #diffElement(before: Element, after: Element, changes: VersionHistoryChanges, highlight: boolean) {
    if(this.#attributeSignature(before) !== this.#attributeSignature(after)) {
      changes.modified++
      if(highlight) this.#mark(after, "◆history-modified")
    }
    const beforeChildren = this.#authoredChildren(before)
    const afterChildren = this.#authoredChildren(after)
    const sharedLength = Math.min(beforeChildren.length, afterChildren.length)
    for(let index = 0; index < sharedLength; index++) {
      const previous = beforeChildren[index]
      const current = afterChildren[index]
      if(previous.nodeType !== current.nodeType
        || previous instanceof Element && current instanceof Element
          && (previous.localName !== current.localName || previous.namespaceURI !== current.namespaceURI)) {
        changes.removed++
        changes.added++
        if(highlight) {
          this.#mark(after, "◆history-removed")
          this.#mark(current, "◆history-added", after)
        }
        continue
      }
      if(previous instanceof Element && current instanceof Element) {
        this.#diffElement(previous, current, changes, highlight)
      }
      else if(previous.textContent !== current.textContent) {
        changes.modified++
        if(highlight) this.#mark(current, "◆history-modified", after)
      }
    }
    for(const current of afterChildren.slice(sharedLength)) {
      changes.added++
      if(highlight) this.#mark(current, "◆history-added", after)
    }
    if(beforeChildren.length > sharedLength) {
      changes.removed += beforeChildren.length - sharedLength
      if(highlight) this.#mark(after, "◆history-removed")
    }
  }

  #authoredChildren(element: Element) {
    return Array.from(element.childNodes).filter(node => {
      if(node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE && node.nodeType !== Node.COMMENT_NODE) {
        return false
      }
      return !(node instanceof Element && node.matches(".◆editor-only, [data-webwriter-editor-only]"))
    })
  }

  #attributeSignature(element: Element) {
    return Array.from(element.attributes)
      .flatMap(attribute => {
        if(this.editor.ignoreAttrs.some(name => name.toLowerCase() === attribute.name.toLowerCase())) return []
        if(attribute.name.toLowerCase() !== "class") return [[attribute.name, attribute.value] as const]
        const className = attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆")).join(" ")
        return className ? [[attribute.name, className] as const] : []
      })
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${name}=${value}`)
      .join("\u0000")
  }

  #mark(node: Node, className: typeof historyMarkerClasses[number], fallback?: Element) {
    const element = node instanceof Element ? node : fallback ?? node.parentElement
    element?.classList.add(className)
  }
}
