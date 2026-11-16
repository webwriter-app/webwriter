import {EditorFeature} from "."
import {createAnchorPositioner, isAtomicEditingElement, setPart} from "../utility"
import {commentReviewRequestEvent, type CommentState} from "../editor-bridge"
import {documentLayoutMode} from "../document-layout"
import {isAuthoredMutation} from "../editor-artifacts"
import messageCircle from "@tabler/icons/outline/message-circle.svg?raw"

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

/** A gap between siblings: after `anchor`, the last content before it, or at the start of `container`. */
type CommentBoundary = {
  container: Node
  anchor: Node | null
}

type CommentThread = {
  comments: DocumentComment[]
  start: CommentBoundary
  end: CommentBoundary
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
  /** Parsed markers, valid until the observer records a body mutation. */
  private cachedMarkers: {node: Comment, marker: CommentMarker}[] | null = null
  /** Comments and threads derived from the cached markers and dropped with them. */
  private cachedComments: DocumentComment[] | null = null
  private cachedThreads: CommentThread[] | null = null
  /** The comments whose live ranges the registered highlight already holds. */
  private highlighted: {registry: HighlightRegistry, comments: DocumentComment[]} | null = null
  private stateRefreshQueued = false
  private highlighting = true
  private bubbleContainer: HTMLElement | null = null
  private bubbles = new Map<Element, {button: HTMLButtonElement, id: string}>()
  private anchorPositioner: ReturnType<typeof createAnchorPositioner> | null = null
  private activeThreadId: string | null = null
  activeListeners = {
    selectionchange: () => this.renderCommentUI(),
  }
  actions = {
    selectComment: ({id}: {type: "selectComment", id: string}) => this.selectComment(id),
    addCommentReply: ({id, text}: {type: "addCommentReply", id: string, text: string}) => this.addReply(id, text),
    updateComment: ({id, text}: {type: "updateComment", id: string, text: string}) => this.updateCommentTextById(id, text),
    removeComment: ({id}: {type: "removeComment", id: string}) => this.removeCommentById(id),
    addComment: ({text}: {type: "addComment", text: string}) => this.addComment(text),
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
      this.observer = new FrameMutationObserver(records => {
        this.dropStaleCaches(records)
        if(!records.some(isAuthoredMutation)) return
        // With no comment markers there is no comment presentation to refresh
        // for a column width change. Selection and marks own the resize state.
        if(this.cachedMarkers?.length === 0 && this.editor.features.table.isResizeStyleBatch(records)) return
        this.queueStateRefresh()
      })
      try {
        this.observer.observe(document.body, {childList: true, characterData: true, characterDataOldValue: true, subtree: true,
          attributes: true, attributeOldValue: true, attributeFilter: ["class", "style", "hidden", "open"]})
      }
      catch {
        // Scoped-registry startup can briefly pair the iframe document with a
        // MutationObserver from the document being replaced. Commands and
        // selection changes still refresh comment UI synchronously.
        this.observer.disconnect()
        this.observer = null
      }
    }
    this.anchorPositioner = createAnchorPositioner(document)
    this.renderCommentUI()
  }

  disable() {
    if(!this.isEnabled) return
    this.observer?.disconnect()
    this.observer = null
    this.cachedMarkers = this.cachedComments = this.cachedThreads = null
    this.highlighted = null
    this.anchorPositioner?.destroy()
    this.anchorPositioner = null
    this.bubbles.clear()
    this.bubbleContainer?.remove()
    this.bubbleContainer = null
    this.highlightRegistry()?.delete(commentHighlightName)
    this.activeThreadId = null
    this.highlightRegistry()?.delete("webwriter-active-comment")
    this.stateRefreshQueued = false
    super.disable()
  }

  getState(): CommentState {
    const comments = this.comments()
    const context = this.getSelection()
    const active = context ? this.activeComments(comments, context.range) : []
    const text = active.length && active.every(comment => comment.text === active[0].text)
      ? active[0].text
      : ""
    return {
      canComment: context !== null && !context.range.collapsed && !this.isVoidTarget(this.elementTarget(context.range)),
      active: active.length > 0,
      text,
      activeCount: active.length,
      count: comments.length,
      highlighting: this.highlighting,
      threads: this.threads(comments).map(thread => ({
        id: thread.comments[0].id,
        target: thread.comments[0].kind === "node" ? "element" : "text",
        active: thread.comments.some(comment => comment.id === this.activeThreadId),
        comments: thread.comments.map(({id, text, author, createdAt, editedAt}) => ({id, text, author, createdAt, editedAt})),
      })),
      activeThreadId: this.activeThreadId,
    }
  }

  toggleComment(text: string) {
    const context = this.getSelection()
    if(!context) return false
    const active = this.activeComments(this.comments(), context.range)
    if(active.length) return this.removeComments(active, context)
    if(context.range.collapsed || this.isVoidTarget(this.elementTarget(context.range))) return false
    this.insertComment(context.range, text, context.backwards, true)
    this.renderCommentUI()
    this.editor.postCommentState()
    return true
  }

  addComment(text: string) {
    const context = this.getSelection()
    if(!context || context.range.collapsed || !text.trim() || this.isVoidTarget(this.elementTarget(context.range))) return false
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

  private elementTarget(range: Range) {
    if(range.collapsed) return range.startContainer instanceof Element
      ? range.startContainer : range.startContainer.parentElement
    if(range.startContainer === range.endContainer && range.endOffset === range.startOffset + 1) {
      const child = range.startContainer.childNodes[range.startOffset]
      if(child instanceof Element) return child
    }
    return null
  }

  private isVoidTarget(target: Element | null) {
    return target?.namespaceURI === "http://www.w3.org/1999/xhtml"
      && target.matches("area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr")
  }

  private insertComment(range: Range, text: string, backwards = false, select = false) {
    const id = this.createId()
    const metadata = this.newMetadata()
    const target = this.elementTarget(range)
    if(target) {
      const marker = document.createComment(markerData("node", id, text, metadata))
      target.append(marker)
      if(select) this.selectNodeComment(marker)
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
    const active = this.activeComments(this.comments(), context.range)
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
    const active = context ? this.activeComments(comments, context.range).map(comment => comments.indexOf(comment)) : []

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
    this.activeThreadId = comment.id
    this.scrollCommentIntoView(comment)
    this.renderCommentUI()
    this.editor.postCommentState()
    return true
  }

  private comments() {
    const markers = this.markers()
    if(this.cachedComments) return this.cachedComments
    const comments: DocumentComment[] = []
    const starts = new Map<string, {
      marker: Comment
      text: string
      author: CommentAuthor
      createdAt: number
      editedAt: number
    }>()
    for(const {node, marker} of markers) {
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
    comments.sort((a, b) => a.marker.compareDocumentPosition(b.marker) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1)
    if(this.cachedMarkers === markers) this.cachedComments = comments
    return comments
  }

  private markers() {
    // Selection and scroll repositioning read markers far more often than
    // they change. Records not yet delivered invalidate the cache here.
    const records = this.observer?.takeRecords()
    if(records?.length) {
      this.dropStaleCaches(records)
      this.queueStateRefresh()
    }
    if(this.cachedMarkers) return this.cachedMarkers
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT)
    const markers: {node: Comment, marker: CommentMarker}[] = []
    while(walker.nextNode()) {
      const node = walker.currentNode as Comment
      const marker = parseCommentMarker(node)
      if(marker) markers.push({node, marker})
    }
    if(this.observer) this.cachedMarkers = markers
    return markers
  }

  private dropStaleCaches(records: MutationRecord[]) {
    // Attributes change neither markers nor the content between them, and nor
    // does editing text that stays non-empty. Text that is emptied or filled
    // can merge or split threads, so it drops the caches like any other record.
    if(records.every(record => record.type === "attributes" || record.type === "characterData"
      && record.target.nodeType === Node.TEXT_NODE && record.oldValue && record.target.nodeValue)) return
    this.cachedMarkers = this.cachedComments = this.cachedThreads = null
  }

  private commentRange(comment: DocumentComment) {
    return comment.kind === "span"
      ? this.spanRange(comment.start, comment.end)
      : this.nodeCommentRange(comment.marker)
  }

  private threads(comments = this.comments()) {
    if(this.cachedThreads && comments === this.cachedComments) return this.cachedThreads
    const threads = this.groupThreads(comments)
    if(comments === this.cachedComments) this.cachedThreads = threads
    return threads
  }

  /** Comments share a thread when no content lies between their starts or between their ends. */
  private groupThreads(comments: DocumentComment[]) {
    const threads: CommentThread[] = []
    const byBoundaries = new Map<string, CommentThread>()
    const skipped = new Map<Node, Node | null>()
    const ids = new Map<Node, number>()
    const key = ({container, anchor}: CommentBoundary) => {
      const node = anchor ?? container
      if(!ids.has(node)) ids.set(node, ids.size)
      return `${ids.get(node)}${anchor ? "a" : "s"}`
    }
    for(const comment of comments) {
      const boundaries = this.commentBoundaries(comment, skipped)
      if(!boundaries) continue
      const id = `${key(boundaries.start)}:${key(boundaries.end)}`
      let thread = byBoundaries.get(id)
      if(!thread) {
        thread = {comments: [], ...boundaries}
        byBoundaries.set(id, thread)
        threads.push(thread)
      }
      thread.comments.push(comment)
    }
    return threads
  }

  /** The boundaries of commentRange() as sibling gaps, found without a Range or child indices. */
  private commentBoundaries(comment: DocumentComment, skipped: Map<Node, Node | null>) {
    if(comment.kind === "span") {
      const {start, end} = comment
      if(!start.isConnected || !end.isConnected) return null
      return {
        start: {container: start.parentNode!, anchor: this.contentBefore(start, skipped)},
        end: {container: end.parentNode!, anchor: this.contentBefore(end.previousSibling, skipped)},
      }
    }
    const target = comment.marker.parentNode
    if(!comment.marker.isConnected || !target) return null
    if(target === document.body) return {
      start: {container: target, anchor: null},
      end: {container: target, anchor: this.contentBefore(target.lastChild, skipped)},
    }
    if(!target.parentNode) return null
    return {
      start: {container: target.parentNode, anchor: this.contentBefore(target.previousSibling, skipped)},
      end: {container: target.parentNode, anchor: this.contentBefore(target, skipped)},
    }
  }

  /** The sibling gap a selection point is equivalent to, or null inside text or an authored comment. */
  private pointBoundary(container: Node, offset: number): CommentBoundary | null {
    if(!(container instanceof CharacterData)) {
      return {container, anchor: this.contentBefore(container.childNodes[offset - 1] ?? null)}
    }
    if(!container.parentNode) return null
    if(container instanceof Text ? offset > 0 && offset < container.length : this.isContent(container)) return null
    return {container: container.parentNode, anchor: this.contentBefore(offset ? container : container.previousSibling)}
  }

  /** The last sibling at or before `node` that is content; `skipped` remembers the siblings passed over. */
  private contentBefore(node: Node | null, skipped = new Map<Node, Node | null>()) {
    const run: Node[] = []
    while(node && !skipped.has(node) && !this.isContent(node)) {
      run.push(node)
      node = node.previousSibling
    }
    const content = node && skipped.has(node) ? skipped.get(node)! : node
    for(const sibling of run) skipped.set(sibling, content)
    return content
  }

  /** Comment markers and empty text are not content between two boundaries; any other node is. */
  private isContent(node: Node) {
    if(node instanceof Text) return node.length > 0
    if(node instanceof Comment) return !parseCommentMarker(node)
    return node instanceof Element
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
    // Registered ranges are live and stay on their markers for as long as
    // the parsed comments are current.
    if(this.highlighting && this.highlighted?.registry === registry && this.highlighted.comments === comments) return
    this.highlighted = null
    registry.delete(commentHighlightName)
    if(!this.highlighting) return
    const Highlight = this.highlightConstructor()
    if(!Highlight) return
    const ranges = comments.filter(comment => comment.kind === "span")
      .map(comment => this.commentRange(comment)).filter((range): range is Range => range !== null)
    if(!ranges.length) return
    registry.set(commentHighlightName, new Highlight(...ranges))
    if(comments === this.cachedComments) this.highlighted = {registry, comments}
  }

  private syncElementBubbles(comments: DocumentComment[]) {
    const elements = new Map<Element, NodeComment[]>()
    if(this.highlighting) {
      for(const comment of comments) {
        if(comment.kind === "node" && comment.marker.parentElement && comment.marker.isConnected) {
          const target = comment.marker.parentElement
          const group = elements.get(target) ?? []
          group.push(comment)
          elements.set(target, group)
        }
      }
    }
    if(!elements.size && !this.bubbles.size) return
    for(const [element, {button}] of this.bubbles) {
      if(elements.has(element)) continue
      this.anchorPositioner?.release(button)
      button.remove()
      this.bubbles.delete(element)
    }
    if(elements.size && !this.bubbleContainer) {
      this.bubbleContainer = document.createElement("div")
      this.bubbleContainer.setAttribute("part", "comment-bubbles")
      this.editor.addAppendix(this.bubbleContainer)
    }
    for(const [element, group] of elements) {
      let bubble = this.bubbles.get(element)
      if(!bubble) {
        const button = document.createElement("button")
        button.type = "button"
        button.setAttribute("part", "comment-bubble")
        button.innerHTML = messageCircle
        button.querySelector("svg")!.setAttribute("width", "14")
        button.querySelector("svg")!.setAttribute("height", "14")
        bubble = {button, id: group[0].id}
        const record = bubble
        button.addEventListener("pointerdown", event => event.preventDefault())
        button.addEventListener("click", () => {
          if(this.selectComment(record.id, element)) this.editor.postHostMessage({type: commentReviewRequestEvent})
        })
        this.bubbleContainer!.append(button)
        this.bubbles.set(element, bubble)
      }
      bubble.id = group[0].id
      bubble.button.title = group.map(comment => comment.text).join("\n")
      bubble.button.setAttribute("aria-label", `Show ${group.length === 1 ? "comment" : `${group.length} comments`}`)
      bubble.button.setAttribute("aria-pressed", String(group.some(comment => comment.id === this.activeThreadId)))
      setPart(bubble.button, "comment-bubble-active", group.some(comment => comment.id === this.activeThreadId))
      this.anchorPositioner?.bind(bubble.button, element, this.bubbleAnchorCSS(element))
    }
    this.anchorPositioner?.refresh()
  }

  private bubbleAnchorCSS(element: Element) {
    const documentLayout = documentLayoutMode() === "document"
    let left = false
    if(documentLayout) {
      for(let ancestor: Element | null = element; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        const side = getComputedStyle(ancestor).float
        if(side && side !== "none") { left = side === "left"; break }
      }
    }
    const gap = documentLayout
      ? "max(0px, calc((var(--ww-page-gutter, 1rem) - 16px) / 2))"
      : "4px"
    return left
      ? `position-visibility:anchors-visible;right:calc(anchor(left) + ${gap});top:anchor(top);`
      : `position-visibility:anchors-visible;left:anchor(right);top:anchor(top);translate:${gap} 0;`
  }

  private renderCommentUI() {
    if(!this.isEnabled) return
    const comments = this.comments()
    if(!comments.some(comment => comment.id === this.activeThreadId)) this.activeThreadId = null
    this.syncElementBubbles(comments)
    this.syncHighlights(comments)
    const registry = this.highlightRegistry()
    registry?.delete("webwriter-active-comment")
    const active = comments.find(comment => comment.id === this.activeThreadId)
    const range = this.highlighting && active?.kind === "span" && this.commentRange(active)
    const Highlight = this.highlightConstructor()
    if(range && Highlight) registry?.set("webwriter-active-comment", new Highlight(range))
  }

  selectComment(id: string, target?: Element) {
    const thread = this.threads().find(candidate => candidate.comments.some(comment => comment.id === id
      && (!target || comment.kind === "node" && comment.marker.parentElement === target)))
    if(!thread) return false
    const comment = thread.comments.find(comment => comment.id === id)!
    const range = this.commentRange(comment)
    if(!range) return false
    this.restoreRange(range, false)
    this.activeThreadId = thread.comments[0].id
    this.scrollCommentIntoView(comment)
    this.renderCommentUI()
    this.editor.postCommentState()
    return true
  }

  private addReply(primaryId: string, text: string) {
    const thread = this.threads().find(candidate => candidate.comments.some(comment => comment.id === primaryId))
    const target = thread && this.commentRange(thread.comments[0])
    if(!thread || !target || target.collapsed || !text.trim()) return false
    const id = this.createId()
    const metadata = this.newMetadata()
    const primary = thread.comments[0]
    if(primary.kind === "node") {
      primary.marker.parentElement?.append(document.createComment(markerData("node", id, text, metadata)))
    }
    else {
      const innermost = [...thread.comments].reverse().find(comment => comment.kind === "span") as SpanComment | undefined
      const range = innermost ? this.spanRange(innermost.start, innermost.end) : target
      if(!range || range.collapsed) return false
      const startContainer = range.startContainer
      const startOffset = range.startOffset
      const endContainer = range.endContainer
      const endOffset = range.endOffset
      this.insertBoundary(document.createComment(markerData("end", id)), endContainer, endOffset)
      this.insertBoundary(document.createComment(markerData("start", id, text, metadata)), startContainer, startOffset)
    }
    this.editor.postCommentState()
    this.renderCommentUI()
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
    }
    this.renderCommentUI()
    this.editor.postCommentState()
    return true
  }

  /** Comments at the caret, or the thread holding exactly the selected content. */
  private activeComments(comments: DocumentComment[], range: Range) {
    const {startContainer, startOffset} = range
    if(range.collapsed) return comments.filter(comment => this.containsCaret(comment, startContainer, startOffset))
    const start = this.pointBoundary(startContainer, startOffset)
    const end = this.pointBoundary(range.endContainer, range.endOffset)
    if(!start || !end) return []
    return this.threads(comments).find(thread =>
      thread.start.container === start.container && thread.start.anchor === start.anchor
      && thread.end.container === end.container && thread.end.anchor === end.anchor)?.comments ?? []
  }

  /** Whether the caret lies in commentRange() or directly after a node comment's marker. */
  private containsCaret(comment: DocumentComment, container: Node, offset: number) {
    if(comment.kind === "span") {
      const {start, end} = comment
      return start.isConnected && end.isConnected && container !== start
        && !this.pointPrecedes(container, offset, start) && this.pointPrecedes(container, offset, end)
    }
    const {marker} = comment
    const target: Node | null = marker.parentNode
    if(!target) return false
    if(container.childNodes[offset - 1] === marker) return true
    if(!marker.isConnected) return false
    if(target.contains(container)) return true
    return target !== document.body && (container.childNodes[offset] === target || container.childNodes[offset - 1] === target)
  }

  /** Whether a boundary point lies at or before the start of `node`, compared in tree order without a Range. */
  private pointPrecedes(container: Node, offset: number, node: Node) {
    const next = container.childNodes[offset]
    if(next === node) return true
    // Without a node at the point, the point ends its container or lies inside character data.
    const position = (next ?? container).compareDocumentPosition(node)
    return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      && (Boolean(next) || !(position & Node.DOCUMENT_POSITION_CONTAINED_BY))
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
    const range = document.createRange()
    try {
      if(marker.parentNode === document.body) range.selectNodeContents(document.body)
      else range.selectNode(marker.parentNode)
      return range
    }
    catch {
      return null
    }
  }

  private compareMarkerToPoint(marker: Comment, point: Range) {
    const markerPoint = document.createRange()
    markerPoint.setStartBefore(marker)
    markerPoint.collapse(true)
    return markerPoint.compareBoundaryPoints(Range.START_TO_START, point)
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
      if(element.getAttribute("contenteditable") === "false" || isAtomicEditingElement(element, this.editor.schema)) return true
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
      ? comment.marker.parentElement
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
        // Selection-path state stays last after DOM mutations because comment
        // nodes participate in authored child-node paths.
        this.editor.queueSelectionState({comment: true, path: true})
      }
    })
  }
}
