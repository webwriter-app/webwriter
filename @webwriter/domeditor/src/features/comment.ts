import {EditorFeature} from "."
import {isAtomicEditingElement} from "../utility"
import type {CommentState} from "../editor-bridge"

const markerPrefix = "webwriter:comment:"
const markerPattern = /^webwriter:comment:(node|start|end):([A-Za-z0-9]+)(?::(.*))?$/

export type CommentMarkerKind = "node" | "start" | "end"

export type CommentAuthor = {
  id: string
  name: string
}

export type CommentMarker = {
  kind: CommentMarkerKind
  id: string
  text: string
  author: CommentAuthor
  createdAt: number
  editedAt: number
}

type CommentMetadata = Pick<CommentMarker, "author" | "createdAt" | "editedAt">

type NodeComment = {
  kind: "node"
  id: string
  text: string
  author: CommentAuthor
  createdAt: number
  editedAt: number
  marker: Comment
}

type SpanComment = {
  kind: "span"
  id: string
  text: string
  author: CommentAuthor
  createdAt: number
  editedAt: number
  marker: Comment
  start: Comment
  end: Comment
}

type DocumentComment = NodeComment | SpanComment

type CommentSelection = {
  range: Range
  backwards: boolean
}

type BoundaryBookmark = {
  container: Node
  offset: number
  before: Node | null
  after: Node | null
}

type SelectionBookmark = {
  start: BoundaryBookmark
  end: BoundaryBookmark
  backwards: boolean
}

type CommentThread = {
  comments: DocumentComment[]
  range: Range
}

type HighlightRegistry = {
  set(name: string, highlight: unknown): void
  delete(name: string): boolean | void
}

type HighlightConstructor = new (...ranges: Range[]) => unknown

const commentHighlightName = "webwriter-comments"

function encodeCommentText(text: string) {
  // Hyphens are encoded explicitly so arbitrary plain text can never create
  // the forbidden "--" sequence inside an HTML comment token.
  return encodeURIComponent(text).replace(/-/g, "%2D")
}

function decodeCommentText(text: string) {
  try {
    return decodeURIComponent(text)
  }
  catch {
    return null
  }
}

const legacyMetadata = (): CommentMetadata => ({
  author: {id: "", name: "Unknown user"},
  createdAt: 0,
  editedAt: 0,
})

export function parseCommentMarker(node: Node): CommentMarker | null {
  if(!(node instanceof Comment)) return null
  const match = node.data.match(markerPattern)
  if(!match) return null
  const [, kind, id, encodedText] = match
  if(kind === "end") {
    return encodedText === undefined ? {kind, id, text: "", ...legacyMetadata()} : null
  }
  if(encodedText === undefined) return null
  const fields = encodedText.split(":")
  if(fields[0] === "v2") {
    if(fields.length !== 6) return null
    const text = decodeCommentText(fields[1])
    const authorId = decodeCommentText(fields[2])
    const authorName = decodeCommentText(fields[3])
    const createdAt = Number(fields[4])
    const editedAt = Number(fields[5])
    if(text === null || authorId === null || authorName === null
      || !Number.isSafeInteger(createdAt) || createdAt < 0 || createdAt > 8_640_000_000_000_000
      || !Number.isSafeInteger(editedAt) || editedAt < createdAt || editedAt > 8_640_000_000_000_000) return null
    return {
      kind: kind as "node" | "start",
      id,
      text,
      author: {id: authorId, name: authorName || "Unknown user"},
      createdAt,
      editedAt,
    }
  }
  const text = decodeCommentText(encodedText)
  return text === null ? null : {kind: kind as "node" | "start", id, text, ...legacyMetadata()}
}

function markerData(kind: CommentMarkerKind, id: string, text = "", metadata?: CommentMetadata) {
  if(kind === "end") return `${markerPrefix}${kind}:${id}`
  const author = metadata?.author ?? legacyMetadata().author
  return [
    `${markerPrefix}${kind}:${id}:v2`,
    encodeCommentText(text),
    encodeCommentText(author.id),
    encodeCommentText(author.name),
    metadata?.createdAt ?? 0,
    metadata?.editedAt ?? 0,
  ].join(":")
}

/** Plain-text annotations represented entirely by authored DOM Comment nodes. */
export class CommentFeature extends EditorFeature {
  private observer: MutationObserver | null = null
  private stateRefreshQueued = false
  private highlighting = true
  private paneOpen = false
  private paneSelection: Range | null = null
  private readonly repositionCommentUI = () => {
    if(this.isEnabled) this.renderBauble(this.comments())
  }

  activeListeners = {
    selectionchange: () => this.repositionCommentUI(),
  }

  actions = {
    toggleComment: ({text}: {type: "toggleComment", text: string}) => this.toggleComment(text),
    setCommentText: ({text}: {type: "setCommentText", text: string}) => this.setCommentText(text),
    removeAllComments: ({}: {type: "removeAllComments"}) => this.removeAllComments(),
    previousComment: ({}: {type: "previousComment"}) => this.previousComment(),
    nextComment: ({}: {type: "nextComment"}) => this.nextComment(),
    setCommentHighlighting: ({enabled}: {type: "setCommentHighlighting", enabled: boolean}) =>
      this.setCommentHighlighting(enabled),
  } as const

  enable() {
    if(this.isEnabled) return
    super.enable()
    const FrameMutationObserver = document.defaultView?.MutationObserver
    if(FrameMutationObserver) {
      this.observer = new FrameMutationObserver(() => this.queueStateRefresh())
      try {
        this.observer.observe(document.body, {childList: true, characterData: true, subtree: true})
      }
      catch {
        // Scoped-registry startup can briefly pair the iframe document with a
        // MutationObserver from the document being replaced. Commands and
        // selection changes still refresh comment UI synchronously.
        this.observer.disconnect()
        this.observer = null
      }
    }
    window.addEventListener("resize", this.repositionCommentUI)
    window.addEventListener("scroll", this.repositionCommentUI, {capture: true, passive: true})
    this.renderCommentUI()
  }

  disable() {
    this.observer?.disconnect()
    this.observer = null
    window.removeEventListener("resize", this.repositionCommentUI)
    window.removeEventListener("scroll", this.repositionCommentUI, true)
    this.highlightRegistry()?.delete(commentHighlightName)
    this.closeThreadPane()
    this.editor.appendix.querySelector(".◆comment-bauble")?.remove()
    this.stateRefreshQueued = false
    super.disable()
  }

  getState(): CommentState {
    const comments = this.comments()
    const context = this.getSelection()
    const active = context ? comments.filter(comment => this.isActive(comment, context.range)) : []
    const text = active.length && active.every(comment => comment.text === active[0].text)
      ? active[0].text
      : ""
    return {
      canComment: context !== null,
      active: active.length > 0,
      text,
      activeCount: active.length,
      count: comments.length,
      highlighting: this.highlighting,
    }
  }

  toggleComment(text: string) {
    const context = this.getSelection()
    if(!context) return false
    const active = this.comments().filter(comment => this.isActive(comment, context.range))
    if(active.length) return this.removeComments(active, context)
    this.insertComment(context.range, text, context.backwards, true)
    this.renderCommentUI()
    this.editor.postCommentState()
    return true
  }

  setCommentHighlighting(enabled: boolean) {
    if(this.highlighting === enabled) return false
    this.highlighting = enabled
    this.renderCommentUI()
    this.editor.postCommentState()
    return true
  }

  private insertComment(range: Range, text: string, backwards = false, select = false) {
    const id = this.createId()
    const metadata = this.newMetadata()
    if(range.collapsed) {
      const marker = document.createComment(markerData("node", id, text, metadata))
      this.insertBoundary(marker, range.startContainer, range.startOffset)
      if(select) this.setSelectionAfter(marker)
    }
    else {
      const start = document.createComment(markerData("start", id, text, metadata))
      const end = document.createComment(markerData("end", id))
      const startContainer = range.startContainer
      const startOffset = range.startOffset
      const endContainer = range.endContainer
      const endOffset = range.endOffset
      this.insertBoundary(end, endContainer, endOffset)
      this.insertBoundary(start, startContainer, startOffset)
      if(select) this.selectSpan(start, end, backwards)
    }
    return id
  }

  /** Updates every comment applying to the selection without changing its range. */
  setCommentText(text: string) {
    const context = this.getSelection()
    if(!context) return false
    const active = this.comments().filter(comment => this.isActive(comment, context.range))
    const changed = active.filter(comment => comment.text !== text)
    if(!changed.length) return false
    for(const comment of changed) {
      comment.marker.data = markerData(comment.kind === "node" ? "node" : "start", comment.id, text, {
        author: comment.author,
        createdAt: comment.createdAt,
        editedAt: Math.max(Date.now(), comment.createdAt),
      })
    }
    this.renderCommentUI()
    this.editor.postCommentState()
    return true
  }

  removeAllComments() {
    const markers = this.markers()
    if(!markers.length) return false
    const context = this.getSelection()
    const bookmark = context ? this.bookmarkSelection(context, new Set(markers.map(({node}) => node))) : null
    markers.forEach(({node}) => node.remove())
    if(bookmark) this.restoreBookmark(bookmark)
    this.renderCommentUI()
    this.editor.postCommentState()
    return true
  }

  previousComment() {
    return this.stepComment(-1)
  }

  nextComment() {
    return this.stepComment(1)
  }

  private stepComment(direction: -1 | 1) {
    const comments = this.comments()
    if(!comments.length) return false
    const context = this.getSelection()
    const active = context
      ? comments.map((comment, index) => this.isActive(comment, context.range) ? index : -1).filter(index => index >= 0)
      : []

    let index: number
    if(active.length) {
      index = direction > 0 ? active.at(-1)! + 1 : active[0] - 1
    }
    else if(context) {
      const point = context.range.cloneRange()
      point.collapse(true)
      if(direction > 0) {
        index = comments.findIndex(comment => this.compareMarkerToPoint(comment.marker, point) > 0)
        if(index < 0) index = 0
      }
      else {
        index = -1
        for(let candidate = comments.length - 1; candidate >= 0; candidate--) {
          if(this.compareMarkerToPoint(comments[candidate].marker, point) < 0) {
            index = candidate
            break
          }
        }
        if(index < 0) index = comments.length - 1
      }
    }
    else {
      index = direction > 0 ? 0 : comments.length - 1
    }

    const comment = comments[(index + comments.length) % comments.length]
    if(comment.kind === "span") this.selectSpan(comment.start, comment.end, false)
    else this.selectNodeComment(comment.marker)
    this.scrollCommentIntoView(comment)
    this.editor.postCommentState()
    return true
  }

  private comments() {
    const comments: DocumentComment[] = []
    const starts = new Map<string, {
      marker: Comment
      text: string
      author: CommentAuthor
      createdAt: number
      editedAt: number
    }>()
    for(const {node, marker} of this.markers()) {
      if(marker.kind === "node") {
        comments.push({
          kind: "node",
          id: marker.id,
          text: marker.text,
          author: marker.author,
          createdAt: marker.createdAt,
          editedAt: marker.editedAt,
          marker: node,
        })
      }
      else if(marker.kind === "start") {
        if(!starts.has(marker.id)) starts.set(marker.id, {
          marker: node,
          text: marker.text,
          author: marker.author,
          createdAt: marker.createdAt,
          editedAt: marker.editedAt,
        })
      }
      else {
        const start = starts.get(marker.id)
        if(!start) continue
        comments.push({
          kind: "span",
          id: marker.id,
          text: start.text,
          author: start.author,
          createdAt: start.createdAt,
          editedAt: start.editedAt,
          marker: start.marker,
          start: start.marker,
          end: node,
        })
        starts.delete(marker.id)
      }
    }
    return comments.sort((a, b) => a.marker.compareDocumentPosition(b.marker) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1)
  }

  private markers() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT)
    const markers: {node: Comment, marker: CommentMarker}[] = []
    while(walker.nextNode()) {
      const node = walker.currentNode as Comment
      const marker = parseCommentMarker(node)
      if(marker) markers.push({node, marker})
    }
    return markers
  }

  private commentRange(comment: DocumentComment) {
    return comment.kind === "span"
      ? this.spanRange(comment.start, comment.end)
      : this.nodeCommentRange(comment.marker)
  }

  private threads(comments = this.comments()) {
    const threads: CommentThread[] = []
    for(const comment of comments) {
      const range = this.commentRange(comment)
      if(!range) continue
      const thread = threads.find(candidate => this.rangesHaveSameContent(candidate.range, range))
      if(thread) thread.comments.push(comment)
      else threads.push({comments: [comment], range})
    }
    return threads
  }

  private highlightRegistry() {
    return (globalThis.CSS as unknown as {highlights?: HighlightRegistry} | undefined)?.highlights ?? null
  }

  private highlightConstructor() {
    return (globalThis as unknown as {Highlight?: HighlightConstructor}).Highlight ?? null
  }

  private syncHighlights(comments: DocumentComment[]) {
    const registry = this.highlightRegistry()
    if(!registry) return
    registry.delete(commentHighlightName)
    if(!this.highlighting) return
    const Highlight = this.highlightConstructor()
    if(!Highlight) return
    const ranges = comments.map(comment => this.commentRange(comment)).filter((range): range is Range => range !== null)
    if(ranges.length) registry.set(commentHighlightName, new Highlight(...ranges))
  }

  private renderCommentUI(forcePane = false) {
    if(!this.isEnabled) return
    const comments = this.comments()
    this.syncHighlights(comments)
    this.renderBauble(comments)
    if(this.paneOpen && (forcePane || !this.threadPaneHasFocus())) this.renderThreadPane(comments)
  }

  private threadPaneHasFocus() {
    const pane = this.editor.appendix.querySelector(".◆comment-thread-pane")
    const active = this.editor.appendix.activeElement
    return pane !== null && active !== null && pane.contains(active)
  }

  private renderBauble(comments: DocumentComment[]) {
    const appendix = this.editor.appendix
    appendix.querySelector(".◆comment-bauble")?.remove()
    const context = this.getSelection()
    if(!context) return
    const threads = this.threads(comments).filter(thread =>
      thread.comments.some(comment => this.selectionIntersects(comment, context.range)),
    )
    if(!threads.length) return

    const button = document.createElement("button")
    button.type = "button"
    button.className = "◆ ◆editor-only ◆comment-bauble"
    button.setAttribute("part", "comment-bauble")
    button.setAttribute("aria-label", `Open ${threads.length} comment ${threads.length === 1 ? "thread" : "threads"}`)
    button.textContent = threads.length === 1 ? "💬" : `💬 ${threads.length}`
    button.addEventListener("pointerdown", event => {
      event.preventDefault()
      event.stopPropagation()
    })
    button.addEventListener("click", event => {
      event.stopPropagation()
      this.openThreadPane(context.range)
    })
    appendix.append(button)
    this.positionBauble(button, context.range)
  }

  private positionBauble(button: HTMLElement, range: Range) {
    const rect = this.rangeRect(range)
    if(!rect) return
    const width = button.getBoundingClientRect().width || 32
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))
    button.style.left = `${left}px`
    button.style.top = `${Math.max(8, rect.top - 34)}px`
  }

  private rangeRect(range: Range) {
    try {
      const rect = range.getBoundingClientRect()
      if(rect.width || rect.height) return rect
      const element = range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement
      return element?.getBoundingClientRect() ?? rect
    }
    catch {
      return null
    }
  }

  private openThreadPane(range: Range) {
    this.paneOpen = true
    this.paneSelection = range.cloneRange()
    this.renderThreadPane(this.comments())
  }

  private closeThreadPane() {
    this.paneOpen = false
    this.paneSelection = null
    document.body.shadowRoot?.querySelector(".◆comment-thread-pane")?.remove()
  }

  private renderThreadPane(comments: DocumentComment[]) {
    const selectedRange = this.connectedPaneSelection()
    if(!selectedRange) {
      this.closeThreadPane()
      return
    }
    const appendix = this.editor.appendix
    let pane = appendix.querySelector<HTMLElement>(".◆comment-thread-pane")
    if(!pane) {
      pane = document.createElement("aside")
      pane.className = "◆ ◆editor-only ◆comment-thread-pane"
      pane.setAttribute("part", "comment-thread-pane")
      pane.setAttribute("aria-label", "Comment threads")
      for(const type of ["pointerdown", "click", "keydown"] as const) {
        pane.addEventListener(type, event => event.stopPropagation())
      }
      pane.addEventListener("focusout", () => queueMicrotask(() => {
        if(this.paneOpen && !this.threadPaneHasFocus()) this.renderThreadPane(this.comments())
      }))
      appendix.append(pane)
    }

    const threads = this.threads(comments).filter(thread =>
      thread.comments.some(comment => this.selectionIntersects(comment, selectedRange)),
    )
    const exactThreadExists = threads.some(thread => this.isExactThread(thread, selectedRange))
    pane.replaceChildren()

    const header = document.createElement("header")
    header.className = "◆comment-pane-header"
    const title = document.createElement("h2")
    title.textContent = threads.length === 1 ? "Comment thread" : "Comment threads"
    const close = this.paneButton("Close", () => this.closeThreadPane())
    close.classList.add("◆comment-pane-close")
    close.setAttribute("aria-label", "Close comment threads")
    header.append(title, close)
    pane.append(header)

    const list = document.createElement("div")
    list.className = "◆comment-thread-list"
    for(const thread of threads) list.append(this.renderThread(thread))
    if(!exactThreadExists) list.append(this.renderNewThreadComposer())
    pane.append(list)
  }

  private renderThread(thread: CommentThread) {
    const section = document.createElement("section")
    section.className = "◆comment-thread"
    section.setAttribute("aria-label", "Comment thread")
    thread.comments.forEach((comment, index) => section.append(this.renderCommentCard(comment, index === 0)))

    const composer = document.createElement("div")
    composer.className = "◆comment-composer"
    const input = document.createElement("textarea")
    input.rows = 2
    input.placeholder = "Write a reply…"
    input.setAttribute("aria-label", "Reply text")
    const add = this.paneButton("Add reply", () => {
      if(this.addReply(thread.comments[0].id, input.value)) input.value = ""
    })
    composer.append(input, add)
    section.append(composer)
    return section
  }

  private renderCommentCard(comment: DocumentComment, primary: boolean) {
    const article = document.createElement("article")
    article.className = `◆comment-card ${primary ? "◆comment-primary" : "◆comment-reply"}`

    const header = document.createElement("header")
    const author = document.createElement("strong")
    author.textContent = comment.author.name
    const role = document.createElement("span")
    role.textContent = primary ? "Primary" : "Reply"
    header.append(author, role)

    const time = document.createElement("time")
    time.textContent = this.commentTimeText(comment)
    if(comment.editedAt) time.dateTime = new Date(comment.editedAt).toISOString()

    const input = document.createElement("textarea")
    input.rows = 3
    input.value = comment.text
    input.setAttribute("aria-label", `${primary ? "Primary comment" : "Reply"} by ${comment.author.name}`)
    input.addEventListener("change", () => this.updateCommentTextById(comment.id, input.value))

    const remove = this.paneButton(primary ? "Remove comment" : "Remove reply", () =>
      this.removeCommentById(comment.id),
    )
    remove.classList.add("◆comment-remove")
    article.append(header, time, input, remove)
    return article
  }

  private renderNewThreadComposer() {
    const section = document.createElement("section")
    section.className = "◆comment-thread ◆comment-new-thread"
    const title = document.createElement("h3")
    title.textContent = "Start a new thread for this selection"
    const input = document.createElement("textarea")
    input.rows = 3
    input.placeholder = "Write a comment…"
    input.setAttribute("aria-label", "New thread comment")
    const add = this.paneButton("Start thread", () => {
      if(this.startThread(input.value)) input.value = ""
    })
    section.append(title, input, add)
    return section
  }

  private paneButton(label: string, action: () => void) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "◆comment-pane-button"
    button.textContent = label
    button.addEventListener("click", action)
    return button
  }

  private connectedPaneSelection() {
    const range = this.paneSelection
    if(!range || !range.startContainer.isConnected || !range.endContainer.isConnected) return null
    return range
  }

  private isExactThread(thread: CommentThread, range: Range) {
    if(!range.collapsed) return this.rangesHaveSameContent(thread.range, range)
    return thread.comments.some(comment => comment.kind === "node" && this.isActive(comment, range))
  }

  private startThread(text: string) {
    const range = this.connectedPaneSelection()?.cloneRange()
    if(!range) return false
    try {
      const id = this.insertComment(range, text)
      const comment = this.comments().find(candidate => candidate.id === id)
      const commentRange = comment && this.commentRange(comment)
      if(commentRange) this.paneSelection = commentRange.cloneRange()
      this.editor.postCommentState()
      this.renderCommentUI(true)
      return true
    }
    catch {
      return false
    }
  }

  private addReply(primaryId: string, text: string) {
    const thread = this.threads().find(candidate => candidate.comments.some(comment => comment.id === primaryId))
    if(!thread) return false
    const id = this.createId()
    const metadata = this.newMetadata()
    const primary = thread.comments[0]
    if(primary.kind === "node") {
      let reference: Node = primary.marker
      for(const comment of thread.comments) {
        if(comment.kind === "node" && comment.marker.parentNode === reference.parentNode
          && comment.marker.compareDocumentPosition(reference) & Node.DOCUMENT_POSITION_PRECEDING) {
          reference = comment.marker
        }
      }
      reference.parentNode?.insertBefore(
        document.createComment(markerData("node", id, text, metadata)),
        reference.nextSibling,
      )
    }
    else {
      const innermost = [...thread.comments].reverse().find(comment => comment.kind === "span") as SpanComment | undefined
      const range = innermost ? this.spanRange(innermost.start, innermost.end) : thread.range.cloneRange()
      if(!range) return false
      const startContainer = range.startContainer
      const startOffset = range.startOffset
      const endContainer = range.endContainer
      const endOffset = range.endOffset
      this.insertBoundary(document.createComment(markerData("end", id)), endContainer, endOffset)
      this.insertBoundary(document.createComment(markerData("start", id, text, metadata)), startContainer, startOffset)
    }
    this.editor.postCommentState()
    this.renderCommentUI(true)
    return true
  }

  private updateCommentTextById(id: string, text: string) {
    const comment = this.comments().find(candidate => candidate.id === id)
    if(!comment || comment.text === text) return false
    comment.marker.data = markerData(comment.kind === "node" ? "node" : "start", id, text, {
      author: comment.author,
      createdAt: comment.createdAt,
      editedAt: Math.max(Date.now(), comment.createdAt),
    })
    this.editor.postCommentState()
    this.renderCommentUI()
    return true
  }

  private removeCommentById(id: string) {
    const comment = this.comments().find(candidate => candidate.id === id)
    if(!comment) return false
    const context = this.getSelection()
    if(context) this.removeComments([comment], context)
    else {
      comment.marker.remove()
      if(comment.kind === "span") comment.end.remove()
      this.editor.postCommentState()
    }
    this.renderCommentUI(true)
    return true
  }

  private commentTimeText(comment: DocumentComment) {
    if(!comment.createdAt) return "Creation time unavailable"
    const created = new Date(comment.createdAt).toLocaleString()
    if(comment.editedAt > comment.createdAt) {
      return `Created ${created} · Edited ${new Date(comment.editedAt).toLocaleString()}`
    }
    return `Created ${created}`
  }

  private appliesTo(comment: DocumentComment, range: Range) {
    const commentRange = this.commentRange(comment)
    if(!commentRange) return false
    if(range.collapsed) return this.containsPoint(commentRange, range)
    return this.rangesOverlap(commentRange, range)
  }

  private selectionIntersects(comment: DocumentComment, range: Range) {
    return this.appliesTo(comment, range) || this.isActive(comment, range)
  }

  private isActive(comment: DocumentComment, range: Range) {
    if(range.collapsed) {
      if(comment.kind === "node" && this.isImmediatelyAfter(comment.marker, range)) return true
      return this.appliesTo(comment, range)
    }
    const commentRange = comment.kind === "span"
      ? this.spanRange(comment.start, comment.end)
      : this.nodeCommentRange(comment.marker)
    return commentRange !== null && this.rangesHaveSameContent(commentRange, range)
  }

  private spanRange(start: Comment, end: Comment) {
    if(!start.isConnected || !end.isConnected) return null
    const range = document.createRange()
    try {
      range.setStartAfter(start)
      range.setEndBefore(end)
      return range
    }
    catch {
      return null
    }
  }

  private nodeCommentRange(marker: Comment) {
    if(!marker.isConnected || !marker.parentNode) return null
    let target = marker.previousSibling
    while(target && parseCommentMarker(target)) target = target.previousSibling
    const range = document.createRange()
    try {
      if(target) range.selectNode(target)
      else if(marker.parentNode === document.body) range.selectNodeContents(document.body)
      else range.selectNode(marker.parentNode)
      return range
    }
    catch {
      return null
    }
  }

  private containsPoint(container: Range, point: Range) {
    return this.comparePoints(container, true, point, true) <= 0
      && this.comparePoints(container, false, point, true) >= 0
  }

  private rangesOverlap(a: Range, b: Range) {
    return this.comparePoints(a, true, b, false) < 0
      && this.comparePoints(a, false, b, true) > 0
  }

  private comparePoints(a: Range, aStart: boolean, b: Range, bStart: boolean) {
    const first = document.createRange()
    const second = document.createRange()
    first.setStart(aStart ? a.startContainer : a.endContainer, aStart ? a.startOffset : a.endOffset)
    first.collapse(true)
    second.setStart(bStart ? b.startContainer : b.endContainer, bStart ? b.startOffset : b.endOffset)
    second.collapse(true)
    return first.compareBoundaryPoints(Range.START_TO_START, second)
  }

  private compareMarkerToPoint(marker: Comment, point: Range) {
    const markerPoint = document.createRange()
    markerPoint.setStartBefore(marker)
    markerPoint.collapse(true)
    return markerPoint.compareBoundaryPoints(Range.START_TO_START, point)
  }

  private isImmediatelyAfter(marker: Comment, point: Range) {
    if(!point.collapsed || !marker.parentNode || point.startContainer !== marker.parentNode) return false
    return point.startOffset === Array.from(marker.parentNode.childNodes).indexOf(marker) + 1
  }

  private rangesHaveSameContent(a: Range, b: Range) {
    return this.pointsHaveNoAuthoredContentBetween(
      a.startContainer,
      a.startOffset,
      b.startContainer,
      b.startOffset,
    ) && this.pointsHaveNoAuthoredContentBetween(
      a.endContainer,
      a.endOffset,
      b.endContainer,
      b.endOffset,
    )
  }

  private pointsHaveNoAuthoredContentBetween(
    aContainer: Node,
    aOffset: number,
    bContainer: Node,
    bOffset: number,
  ) {
    const a = document.createRange()
    const b = document.createRange()
    a.setStart(aContainer, aOffset)
    a.collapse(true)
    b.setStart(bContainer, bOffset)
    b.collapse(true)
    const order = a.compareBoundaryPoints(Range.START_TO_START, b)
    if(order === 0) return true
    const between = document.createRange()
    if(order < 0) {
      between.setStart(aContainer, aOffset)
      between.setEnd(bContainer, bOffset)
    }
    else {
      between.setStart(bContainer, bOffset)
      between.setEnd(aContainer, aOffset)
    }
    const fragment = between.cloneContents()
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ALL)
    while(walker.nextNode()) {
      const node = walker.currentNode
      if(node instanceof Text && node.data.length > 0) return false
      if(node instanceof Comment && !parseCommentMarker(node)) return false
      if(node instanceof Element) return false
    }
    return true
  }

  private getSelection(): CommentSelection | null {
    const selection = document.getSelection()
    if(!selection?.anchorNode || !selection.focusNode || selection.rangeCount !== 1) return null
    if(!this.inAuthoredBody(selection.anchorNode) || !this.inAuthoredBody(selection.focusNode)) return null
    if(this.inNonEditableOrAtomicContent(selection.anchorNode) || this.inNonEditableOrAtomicContent(selection.focusNode)) {
      return null
    }
    return {range: selection.getRangeAt(0).cloneRange(), backwards: this.isBackwards(selection)}
  }

  private inAuthoredBody(node: Node) {
    return node === document.body || document.body.contains(node)
  }

  private inNonEditableOrAtomicContent(node: Node) {
    let element = node instanceof Element ? node : node.parentElement
    while(element && element !== document.body) {
      const parent = element.parentElement
      if(element.getAttribute("contenteditable") === "false" || isAtomicEditingElement(element)) return true
      element = parent
    }
    return false
  }

  private isBackwards(selection: Selection) {
    const {anchorNode, focusNode} = selection
    if(!anchorNode || !focusNode) return false
    if(anchorNode === focusNode) return selection.anchorOffset > selection.focusOffset
    return anchorNode.compareDocumentPosition(focusNode) === Node.DOCUMENT_POSITION_PRECEDING
  }

  private removeComments(comments: DocumentComment[], context: CommentSelection) {
    const removed = new Set<Comment>(comments.flatMap(comment => comment.kind === "span"
      ? [comment.start, comment.end]
      : [comment.marker]))
    const bookmark = this.bookmarkSelection(context, removed)
    for(const comment of comments) {
      if(comment.kind === "span") {
        comment.start.remove()
        comment.end.remove()
      }
      else comment.marker.remove()
    }
    this.restoreBookmark(bookmark)
    this.renderCommentUI()
    this.editor.postCommentState()
    return true
  }

  private restoreRange(range: Range, backwards: boolean) {
    const selection = document.getSelection()
    if(!selection) return
    try {
      selection.setBaseAndExtent(
        backwards ? range.endContainer : range.startContainer,
        backwards ? range.endOffset : range.startOffset,
        backwards ? range.startContainer : range.endContainer,
        backwards ? range.startOffset : range.endOffset,
      )
    }
    catch {
      // Concurrent DOM edits may invalidate an endpoint; leave the browser's
      // safest surviving selection in place.
    }
  }

  private bookmarkSelection(context: CommentSelection, removed: Set<Comment>): SelectionBookmark {
    return {
      start: this.bookmarkBoundary(context.range.startContainer, context.range.startOffset, removed),
      end: this.bookmarkBoundary(context.range.endContainer, context.range.endOffset, removed),
      backwards: context.backwards,
    }
  }

  private bookmarkBoundary(container: Node, offset: number, removed: Set<Comment>): BoundaryBookmark {
    if(container instanceof Text) return {container, offset, before: null, after: null}
    const children = Array.from(container.childNodes)
    let before: Node | null = null
    let after: Node | null = null
    for(let index = offset - 1; index >= 0; index--) {
      if(!removed.has(children[index] as Comment)) {
        before = children[index]
        break
      }
    }
    for(let index = offset; index < children.length; index++) {
      if(!removed.has(children[index] as Comment)) {
        after = children[index]
        break
      }
    }
    return {container, offset, before, after}
  }

  private restoreBookmark(bookmark: SelectionBookmark) {
    const start = this.restoreBoundary(bookmark.start)
    const end = this.restoreBoundary(bookmark.end)
    if(!start || !end) return
    const range = document.createRange()
    try {
      range.setStart(start.container, start.offset)
      range.setEnd(end.container, end.offset)
      this.restoreRange(range, bookmark.backwards)
    }
    catch {
      // The authored nodes around a saved boundary may have been replaced by
      // a concurrent edit. Preserve the browser's surviving selection.
    }
  }

  private restoreBoundary(bookmark: BoundaryBookmark) {
    if(bookmark.container instanceof Text && bookmark.container.isConnected) {
      return {container: bookmark.container as Node, offset: Math.min(bookmark.offset, bookmark.container.length)}
    }
    if(bookmark.after?.isConnected && bookmark.after.parentNode) {
      return {
        container: bookmark.after.parentNode,
        offset: Array.from(bookmark.after.parentNode.childNodes).indexOf(bookmark.after as ChildNode),
      }
    }
    if(bookmark.before?.isConnected && bookmark.before.parentNode) {
      return {
        container: bookmark.before.parentNode,
        offset: Array.from(bookmark.before.parentNode.childNodes).indexOf(bookmark.before as ChildNode) + 1,
      }
    }
    if(bookmark.container.isConnected) {
      return {container: bookmark.container, offset: Math.min(bookmark.offset, bookmark.container.childNodes.length)}
    }
    return null
  }

  private insertBoundary(marker: Comment, container: Node, offset: number) {
    if(container instanceof Text && container.parentNode) {
      if(offset === 0) container.parentNode.insertBefore(marker, container)
      else if(offset === container.length) container.parentNode.insertBefore(marker, container.nextSibling)
      else {
        const after = container.splitText(offset)
        after.parentNode!.insertBefore(marker, after)
      }
      return
    }
    container.insertBefore(marker, container.childNodes.item(offset))
  }

  private setSelectionAfter(marker: Comment) {
    const selection = document.getSelection()
    if(!selection || !marker.parentNode) return
    const offset = Array.from(marker.parentNode.childNodes).indexOf(marker) + 1
    selection.setPosition(marker.parentNode, offset)
  }

  private selectSpan(start: Comment, end: Comment, backwards: boolean) {
    const range = this.spanRange(start, end)
    if(range) this.restoreRange(range, backwards)
  }

  private selectNodeComment(marker: Comment) {
    const range = this.nodeCommentRange(marker)
    if(range) this.restoreRange(range, false)
  }

  private scrollCommentIntoView(comment: DocumentComment) {
    const node = comment.kind === "node"
      ? comment.marker.previousElementSibling ?? comment.marker.parentElement
      : comment.start.parentElement
    node?.scrollIntoView?.({block: "nearest"})
  }

  private createId() {
    const uuid = globalThis.crypto?.randomUUID?.().replace(/-/g, "")
    if(uuid) return uuid
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.replace(/[^A-Za-z0-9]/g, "")
  }

  private newMetadata(): CommentMetadata {
    const clientId = this.editor.doc.awareness.clientID
    const value = this.editor.doc.awareness.getLocalState()?.user
    const user = value && typeof value === "object" ? value as {name?: unknown} : {}
    const name = typeof user.name === "string" && user.name.trim()
      ? user.name.trim()
      : `User ${clientId.toString(36).toUpperCase()}`
    const now = Date.now()
    return {
      author: {id: String(clientId), name},
      createdAt: now,
      editedAt: now,
    }
  }

  private queueStateRefresh() {
    if(this.stateRefreshQueued) return
    this.stateRefreshQueued = true
    queueMicrotask(() => {
      this.stateRefreshQueued = false
      if(this.isEnabled) {
        this.renderCommentUI()
        this.editor.postCommentState()
        // Keep selection-path state last after DOM mutations because comment
        // nodes participate in authored child-node paths.
        this.editor.postSelectionPath()
      }
    })
  }
}
