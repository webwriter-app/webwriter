import * as Y from "yjs"
import {DocumentListenerMap, EditorFeature} from "."
import {
  type VersionHistoryChanges,
  type VersionHistoryComment,
  type VersionHistoryState,
  type VersionHistoryUser,
} from "../editor-bridge"
import {isEditorOwnedAttribute, isOnApple, modifierKeyDown} from "../utility"
import {userInitials} from "../user-identity"
import {hydrateWidgetGroupings} from "../widget-grouping-dom"

type StoredCheckpoint = {
  id: string
  timestamp: number
  label: string
  user: VersionHistoryUser
  changes: VersionHistoryChanges
  source: string
}

type StoredComment = VersionHistoryComment

type StoredVersion = StoredCheckpoint & {checkpointIds: string[]}

const checkpointDelay = 700
const unsavedVersionId = "unsaved"

const emptyChanges = (): VersionHistoryChanges => ({added: 0, removed: 0, modified: 0})
const isEditorOnlyNode = (node: Node) => Boolean(
  (node instanceof Element ? node : node.parentElement)?.closest(".◆editor-only, [data-webwriter-editor-only]"),
)

/** Collaborative document checkpoints, previews, comments, undo, and redo. */
export class HistoryFeature extends EditorFeature {
  #checkpoints!: Y.Array<StoredCheckpoint>
  #comments!: Y.Array<StoredComment>
  #versions!: Y.Array<StoredVersion>
  readonly #historyOrigin = {source: "domeditor-version-history"}
  #checkpointTimer: ReturnType<typeof setTimeout> | undefined
  #previewCheckpointId: string | null = null
  #previewChanges: VersionHistoryState["preview"] = null
  #previewCurrentSource: string | null = null
  #currentCheckpointId: string | null = null
  #restoring = false
  #previewObserver: MutationObserver | undefined
  #previewAttributeNames = new WeakMap<Element, Map<string, string>>()

  actions = {
    undo: ({}: {type: "undo"}) => {
      this.editor.doc.undo()
    },
    redo: ({}: {type: "redo"}) => {
      this.editor.doc.redo()
    },
    getVersionHistory: ({}: {type: "getVersionHistory"}) => {
      if(!this.#previewCheckpointId) this.editor.doc.syncFromDOM()
      this.#flushCheckpoint()
      return this.state()
    },
    prepareVersionSave: async ({offline = false}: {type: "prepareVersionSave", offline?: boolean}) => {
      this.editor.doc.syncFromDOM()
      this.#flushCheckpoint()
      const checkpointId = this.#recordCheckpoint().id
      // serializeHTML clones synchronously before bundling offline assets.
      // Capture both snapshots in this action, before another edit can arrive.
      return {checkpointId, source: await this.editor.serializeHTML(offline)}
    },
    recordVersionSave: ({checkpointId}: {type: "recordVersionSave", checkpointId: string}) =>
      this.#recordVersion(checkpointId),
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
    // Document transactions can arrive for every small DOM mutation. Keep the
    // edit path cheap and serialize only at the debounce or a state boundary.
    // Capture remote and local edits through the same history boundary.
    this.#queueCheckpoint()
  }

  enable() {
    if(this.isEnabled) return
    this.#checkpoints = this.editor.doc.doc.getArray<StoredCheckpoint>("version-history")
    this.#comments = this.editor.doc.doc.getArray<StoredComment>("version-history-comments")
    this.#versions = this.editor.doc.doc.getArray<StoredVersion>("version-history-saves")
    super.enable()
    this.#checkpoints.observe(this.#handleHistoryChange)
    this.#comments.observe(this.#handleHistoryChange)
    this.#versions.observe(this.#handleHistoryChange)
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
    this.#versions.unobserve(this.#handleHistoryChange)
    this.editor.doc.doc.off("afterTransaction", this.#handleTransaction)
    this.clearPreview()
    this.#currentCheckpointId = null
    super.disable()
  }

  state(): VersionHistoryState {
    this.#synchronizeCurrentCheckpoint()
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
    const source = this.#previewCurrentSource ?? this.#source()
    const saved = this.#versions.toArray().sort((left, right) => left.timestamp - right.timestamp)
    const assigned = new Set(saved.flatMap(version => version.checkpointIds))
    const pending = checkpoints.filter(checkpoint => !assigned.has(checkpoint.id))
    const versions = saved.map(({source: versionSource, ...version}) => ({
      ...version,
      user: {...version.user},
      changes: {...version.changes},
      checkpointIds: [...version.checkpointIds].reverse(),
      commentCount: commentCounts.get(version.id) ?? 0,
      isUnsaved: false,
      isCurrent: versionSource === source,
    })).reverse()
    if(!saved.length || pending.length || saved.at(-1)!.source !== source) {
      versions.unshift({
        id: unsavedVersionId,
        timestamp: pending[0]?.timestamp ?? checkpoints[0]?.timestamp ?? Date.now(),
        label: "Unsaved changes",
        user: this.#localUser(),
        changes: this.#diff(saved.at(-1)?.source ?? this.#checkpoints.toArray()[0]?.source ?? source, source),
        checkpointIds: pending.map(checkpoint => checkpoint.id),
        commentCount: 0,
        isUnsaved: true,
        isCurrent: true,
      })
    }
    return {
      checkpoints,
      versions,
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
    this.#previewObserver?.disconnect()
    const wasPreviewing = this.#previewCheckpointId !== null
    this.#previewCheckpointId = null
    this.#previewChanges = null
    this.#previewCurrentSource = null
    if(!wasPreviewing) return false
    this.#restoring = true
    let appliedQueuedChanges = false
    try {
      appliedQueuedChanges = this.editor.doc.resumeDOMSync()
    }
    finally {
      this.#restoring = false
      this.editor.unlockEditing(this)
    }
    if(appliedQueuedChanges) this.#recordCheckpoint("Collaborative changes")
    return appliedQueuedChanges
  }

  allowsActionDuringPreview(type: string) {
    return !this.#previewCheckpointId || [
      "getVersionHistory",
      "previewVersionCheckpoint",
      "clearVersionPreview",
      "revertVersionCheckpoint",
      "recordVersionSave",
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
    const source = this.#source()
    const matchingCheckpoint = this.#checkpoints.toArray().at(-1)
    if(matchingCheckpoint?.source === source) {
      const previousCheckpointId = this.#currentCheckpointId
      this.#currentCheckpointId = matchingCheckpoint.id
      if(previousCheckpointId !== matchingCheckpoint.id) this.postState()
      return matchingCheckpoint
    }
    const previous = this.#checkpoints.toArray().at(-1)
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
    }, this.#historyOrigin)
    return checkpoint
  }

  #recordVersion(checkpointId: string) {
    const checkpoint = this.#checkpoints.toArray().find(checkpoint => checkpoint.id === checkpointId)
    if(!checkpoint) throw new Error("That save is no longer available")
    const checkpoints = this.#checkpoints.toArray()
    const assigned = new Set(this.#versions.toArray().flatMap(version => version.checkpointIds))
    const previous = this.#versions.toArray().at(-1)
    const version: StoredVersion = {
      ...checkpoint,
      id: this.#id("version"),
      timestamp: Date.now(),
      label: "Saved version",
      user: this.#localUser(),
      changes: this.#diff(previous?.source ?? checkpoints[0].source, checkpoint.source),
      checkpointIds: checkpoints.slice(0, checkpoints.indexOf(checkpoint) + 1)
        .filter(entry => !assigned.has(entry.id)).map(entry => entry.id),
    }
    this.editor.doc.doc.transact(() => this.#versions.push([version]), this.#historyOrigin)
    return this.state()
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
    this.#recordCheckpoint(`Restored ${checkpoint.label}`)
    const state = this.state()
    this.postState(state)
    return state
  }

  /** Checkpoints hold the authored document without the runtime assets
   * added for detached copies, which the live editor must not load. */
  #source() {
    return this.editor.toHTML(false, false)
  }

  #applySource(source: string) {
    const restored = new DOMParser().parseFromString(source, "text/html")
    this.#replaceAttributes(document.documentElement, restored.documentElement)
    this.#replaceAttributes(document.body, restored.body)
    document.body.replaceChildren(...Array.from(restored.body.childNodes, node => document.importNode(node, true)))
    const editorHeadNodes = Array.from(document.head.childNodes).filter(node =>
      node instanceof Element && node.matches(".◆editor-only, [data-webwriter-editor-only]"),
    )
    document.head.replaceChildren(...editorHeadNodes)
    document.head.append(...Array.from(restored.head.childNodes, node => document.importNode(node, true)))
    hydrateWidgetGroupings(document)
  }

  #replaceAttributes(target: Element, source: Element) {
    const internalClasses = Array.from(target.classList).filter(name => name.startsWith("◆"))
    for(const attribute of Array.from(target.attributes)) {
      if(this.editor.ignoreAttrs.some(name => name.toLowerCase() === attribute.name.toLowerCase())
        || isEditorOwnedAttribute(target, attribute.name)) continue
      target.removeAttribute(attribute.name)
    }
    for(const attribute of Array.from(source.attributes)) {
      if(this.editor.ignoreAttrs.some(name => name.toLowerCase() === attribute.name.toLowerCase())
        || isEditorOwnedAttribute(source, attribute.name)) continue
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
    if(!this.#previewCheckpointId) {
      this.#previewCurrentSource = this.#source()
      this.editor.doc.pauseDOMSync()
      this.editor.lockEditing(this, {keepEditingMode: true})
    }
    this.#previewObserver?.disconnect()
    this.#previewCheckpointId = checkpointId
    this.#applySource(checkpoint.source)
    const changes = this.#diff(checkpoint.source, this.#previewCurrentSource!)
    this.#previewChanges = {
      checkpointId,
      ...changes,
      isCurrent: changes.added === 0 && changes.removed === 0 && changes.modified === 0,
    }
    this.#observePreview()
    return false
  }

  #checkpoint(checkpointId: string) {
    if(checkpointId === unsavedVersionId) {
      const source = this.#previewCurrentSource ?? this.#source()
      return {id: unsavedVersionId, source, label: "Unsaved changes"}
    }
    return this.#versions.toArray().find(version => version.id === checkpointId)
      ?? this.#checkpoints.toArray().find(checkpoint => checkpoint.id === checkpointId)
  }

  /** MutationObserver is the boundary for native, widget, and direct DOM edits.
   * Roll back the actual records so preview nodes and widget instances survive. */
  #observePreview() {
    this.#previewObserver ??= new MutationObserver(records => {
      records.push(...this.#previewObserver!.takeRecords())
      const checkpoint = this.#previewCheckpointId && this.#checkpoint(this.#previewCheckpointId)
      if(!checkpoint || this.#source() === checkpoint.source) return
      this.#previewObserver!.disconnect()
      try {
        for(const record of records.reverse()) {
          if(isEditorOnlyNode(record.target)) continue
          if(record.type === "attributes") {
            const target = record.target as Element
            const name = record.attributeName!
            if(this.editor.ignoreAttrs.includes(name) || isEditorOwnedAttribute(target, name)) continue
            if(name === "class") {
              const markers = Array.from(target.classList).filter(value => value.startsWith("◆"))
              const authored = (record.oldValue ?? "").split(/\s+/).filter(value => value && !value.startsWith("◆"))
              const value = [...authored, ...markers].join(" ")
              if(value) target.setAttribute("class", value)
              else target.removeAttribute("class")
              continue
            }
            if(record.oldValue === null) target.removeAttributeNS(record.attributeNamespace, name)
            else {
              const qualifiedName = this.#previewAttributeNames.get(target)?.get(`${record.attributeNamespace ?? ""}:${name}`) ?? name
              target.setAttributeNS(record.attributeNamespace, qualifiedName, record.oldValue)
            }
          }
          else if(record.type === "characterData") record.target.nodeValue = record.oldValue
          else {
            for(const node of record.addedNodes) {
              if(!isEditorOnlyNode(node) && node.parentNode === record.target) record.target.removeChild(node)
            }
            const next = record.nextSibling?.parentNode === record.target ? record.nextSibling : null
            for(const node of record.removedNodes) {
              if(!isEditorOnlyNode(node)) record.target.insertBefore(node, next)
            }
          }
        }
      }
      finally { this.#observePreview() }
    })
    const options = {subtree: true, childList: true, characterData: true, characterDataOldValue: true,
      attributes: true, attributeOldValue: true}
    this.#previewObserver.observe(document.documentElement, options)
    const roots: ParentNode[] = [document]
    for(let index = 0; index < roots.length; index++) {
      for(const element of roots[index].querySelectorAll("*")) {
        this.#previewAttributeNames.set(element, new Map(Array.from(element.attributes, attribute =>
          [`${attribute.namespaceURI ?? ""}:${attribute.localName}`, attribute.name],
        )))
      }
      for(const template of roots[index].querySelectorAll("template")) {
        this.#previewObserver.observe(template.content, options)
        roots.push(template.content)
      }
    }
  }

  #synchronizeCurrentCheckpoint() {
    if(this.#previewCheckpointId) return null
    const source = this.#source()
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
      this.editor.doc.documentAttributes,
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
    if(this.#attributeSignature(before.documentElement) !== this.#attributeSignature(after.documentElement)) changes.modified++
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
      return !isEditorOnlyNode(node)
    })
  }

  #attributeSignature(element: Element) {
    return Array.from(element.attributes)
      .flatMap(attribute => {
        if(this.editor.ignoreAttrs.some(name => name.toLowerCase() === attribute.name.toLowerCase())
          || isEditorOwnedAttribute(element, attribute.name)) return []
        if(attribute.name.toLowerCase() !== "class") return [[attribute.name, attribute.value] as const]
        const className = attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆")).join(" ")
        return className ? [[attribute.name, className] as const] : []
      })
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${name}=${value}`)
      .join("\u0000")
  }

}
