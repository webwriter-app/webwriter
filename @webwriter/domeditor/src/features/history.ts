import * as Y from "yjs"
import {DocumentListenerMap, EditorFeature} from "."
import {
  type VersionHistoryChanges,
  type VersionHistoryComment,
  type VersionHistoryState,
  type VersionHistoryUser,
} from "../editor-bridge"
import {isOnApple, modifierKeyDown} from "../utility"
import {userInitials} from "../user-identity"

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

const emptyChanges = (): VersionHistoryChanges => ({added: 0, removed: 0, modified: 0})

/** Collaborative document checkpoints, previews, comments, undo, and redo. */
export class HistoryFeature extends EditorFeature {
  #checkpoints!: Y.Array<StoredCheckpoint>
  #comments!: Y.Array<StoredComment>
  readonly #historyOrigin = {source: "domeditor-version-history"}
  #checkpointTimer: ReturnType<typeof setTimeout> | undefined
  #previewCheckpointId: string | null = null
  #previewChanges: VersionHistoryState["preview"] = null
  #previewCurrentSource: string | null = null
  #currentCheckpointId: string | null = null
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
      const appliedQueuedChanges = this.#previewCheckpoint(checkpointId)
      const state = this.state()
      this.postState(state)
      return {...state, appliedQueuedChanges}
    },
    clearVersionPreview: ({}: {type: "clearVersionPreview"}) => {
      const appliedQueuedChanges = this.clearPreview()
      const state = this.state()
      this.postState(state)
      return {...state, appliedQueuedChanges}
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

  readonly #handleHistoryChange = () => {
    this.#synchronizeCurrentCheckpoint()
    this.postState()
  }

  readonly #handleTransaction = (transaction: Y.Transaction) => {
    if(!this.#isDocumentTransaction(transaction)) return
    if(this.#previewCheckpointId) return
    if(this.#restoring) return
    const local = transaction.local
    queueMicrotask(() => {
      if(!this.isEnabled || this.#previewCheckpointId || this.#restoring) return
      const previousCheckpointId = this.#currentCheckpointId
      if(this.#synchronizeCurrentCheckpoint()) {
        this.#cancelCheckpoint()
        if(previousCheckpointId !== this.#currentCheckpointId) this.postState()
        return
      }
      if(local) this.#queueCheckpoint()
    })
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
    else {
      this.#synchronizeCurrentCheckpoint()
      if(!this.#currentCheckpointId) this.#currentCheckpointId = this.#checkpoints.toArray().at(-1)?.id ?? null
      this.postState()
    }
  }

  disable() {
    if(!this.isEnabled) return
    this.#cancelCheckpoint()
    this.#checkpoints.unobserve(this.#handleHistoryChange)
    this.#comments.unobserve(this.#handleHistoryChange)
    this.editor.doc.doc.off("afterTransaction", this.#handleTransaction)
    this.clearPreview()
    this.#currentCheckpointId = null
    super.disable()
  }

  state(): VersionHistoryState {
    if(this.#synchronizeCurrentCheckpoint()) this.#cancelCheckpoint()
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
      .reverse()
    if(!checkpoints.some(checkpoint => checkpoint.id === this.#currentCheckpointId)) {
      this.#currentCheckpointId = checkpoints[0]?.id ?? null
    }
    return {
      checkpoints,
      comments,
      preview: this.#previewChanges ? {...this.#previewChanges} : null,
      currentCheckpointId: this.#currentCheckpointId,
      currentUserId: this.editor.doc.awareness.clientID,
    }
  }

  postState(state = this.state()) {
    if(this.isEnabled) this.editor.postHistoryState(state)
  }

  clearPreview() {
    const wasPreviewing = this.#previewCheckpointId !== null
    this.#previewCheckpointId = null
    this.#previewChanges = null
    this.#previewCurrentSource = null
    if(!wasPreviewing) return false
    this.#restoring = true
    try {
      return this.editor.doc.resumeDOMSync()
    }
    finally {
      this.#restoring = false
      this.editor.unlockEditing(this)
    }
  }

  allowsActionDuringPreview(type: string) {
    return !this.#previewCheckpointId || [
      "getVersionHistory",
      "previewVersionCheckpoint",
      "clearVersionPreview",
      "revertVersionCheckpoint",
    ].includes(type)
  }

  #queueCheckpoint() {
    this.#cancelCheckpoint()
    this.#checkpointTimer = setTimeout(() => {
      this.#checkpointTimer = undefined
      this.#recordCheckpoint()
    }, checkpointDelay)
  }

  #cancelCheckpoint() {
    if(this.#checkpointTimer !== undefined) clearTimeout(this.#checkpointTimer)
    this.#checkpointTimer = undefined
  }

  #flushCheckpoint() {
    if(this.#checkpointTimer === undefined) return
    this.#cancelCheckpoint()
    this.#recordCheckpoint()
  }

  #recordCheckpoint(label?: string) {
    const source = this.editor.toHTML()
    const previous = this.#checkpoints.toArray().at(-1)
    if(previous?.source === source) {
      this.#currentCheckpointId = previous.id
      return previous
    }
    const user = this.#localUser()
    const checkpoint: StoredCheckpoint = {
      id: this.#id("checkpoint"),
      timestamp: Date.now(),
      label: label ?? `Edited by ${user.name}`,
      user,
      changes: previous ? this.#diff(previous.source, source) : emptyChanges(),
      source,
    }
    this.#currentCheckpointId = checkpoint.id
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
    this.clearPreview()
    this.#restoring = true
    this.editor.doc.stopCapturing()
    this.editor.doc.stopObserve()
    try {
      this.#applySource(checkpoint.source)
      this.editor.doc.clearSelection()
      this.editor.doc.syncFromDOM()
    }
    finally {
      this.editor.doc.startObserve()
      this.editor.doc.stopCapturing()
      this.#restoring = false
    }
    this.#currentCheckpointId = checkpoint.id
    const state = this.state()
    this.postState(state)
    return state
  }

  #applySource(source: string) {
    const restored = new DOMParser().parseFromString(source, "text/html")
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
    if(!this.#previewCheckpointId) {
      if(this.editor.isEditingLocked && !this.editor.hasEditingLock(this)) {
        throw new Error("Finish the pending document review before previewing a version")
      }
      this.editor.doc.syncFromDOM()
      this.#flushCheckpoint()
    }
    const checkpoint = this.#checkpoint(checkpointId)
    if(!checkpoint) throw new Error("That version is no longer available")
    if(checkpointId === this.#currentCheckpointId) return this.clearPreview()
    if(!this.#previewCheckpointId) {
      this.#previewCurrentSource = this.editor.toHTML()
      this.editor.doc.pauseDOMSync()
      this.editor.lockEditing(this)
    }
    this.#previewCheckpointId = checkpointId
    this.#applySource(checkpoint.source)
    const changes = this.#diff(checkpoint.source, this.#previewCurrentSource!)
    this.#previewChanges = {
      checkpointId,
      ...changes,
      isCurrent: changes.added === 0 && changes.removed === 0 && changes.modified === 0,
    }
    return false
  }

  #checkpoint(checkpointId: string) {
    return this.#checkpoints.toArray().find(checkpoint => checkpoint.id === checkpointId)
  }

  #synchronizeCurrentCheckpoint() {
    if(this.#previewCheckpointId) return null
    const source = this.editor.toHTML()
    const checkpoints = this.#checkpoints.toArray()
    let checkpointId: string | null = null
    for(let index = checkpoints.length - 1; index >= 0; index--) {
      if(checkpoints[index].source === source) {
        checkpointId = checkpoints[index].id
        break
      }
    }
    if(checkpointId) this.#currentCheckpointId = checkpointId
    return checkpointId
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

  #diff(beforeSource: string, afterSource: string) {
    const parser = new DOMParser()
    const before = parser.parseFromString(beforeSource, "text/html")
    const after = parser.parseFromString(afterSource, "text/html")
    const changes = emptyChanges()
    if(before.documentElement.getAttribute("lang") !== after.documentElement.getAttribute("lang")) changes.modified++
    this.#diffElement(before.head, after.head, changes)
    this.#diffElement(before.body, after.body, changes)
    return changes
  }

  #diffElement(before: Element, after: Element, changes: VersionHistoryChanges) {
    if(this.#attributeSignature(before) !== this.#attributeSignature(after)) {
      changes.modified++
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
        continue
      }
      if(previous instanceof Element && current instanceof Element) {
        this.#diffElement(previous, current, changes)
      }
      else if(previous.textContent !== current.textContent) {
        changes.modified++
      }
    }
    changes.added += afterChildren.length - sharedLength
    if(beforeChildren.length > sharedLength) {
      changes.removed += beforeChildren.length - sharedLength
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

}
