import {EditorFeature, type DocumentListenerMap} from "."
import {createProofreader, normalizeProofreadingDictionary, type Proofreader, type ProofreadingIssue} from "../proofreading"
import {createAccessibilityReviewer, type AccessibilityFinding, type AccessibilityReviewer} from "../accessibility"
import {isAuthoredMutation, isEditorOwnedAttribute} from "../editor-artifacts"
import {$, authoredClassValue, createStylesheet, adoptStylesheet, fixedClientX, isAtomicEditingElement, isAppendixInteraction, isFormControlInteraction, isWidgetShadowInteraction} from "../utility"
import {render} from "lit"
import {proofreadingCardStyles, proofreadingKindLabels, renderProofreadingCard} from "../components/proofreading-card"
import {getDocumentRoot} from "../document-template"
import type {Schema} from "../schema"
import {proofreadingDictionaryAddEvent, type ProofreadingState} from "../editor-bridge"
import type {RelativePosition} from "yjs"
import accessibleIcon from "@tabler/icons/outline/accessible.svg?raw"

type TextPart = {node: Text, start: number, value: string}
type TextRun = {text: string, language: string, parts: TextPart[]}
type ProseDiagnostic = ProofreadingIssue & {id: string, run: TextRun, range: Range}
type AccessibilityDiagnostic = AccessibilityFinding & {id: string, kind: "accessibility", start: number, end: number,
  suggestions: [], range: Range, generation: number}
type Diagnostic = ProseDiagnostic | AccessibilityDiagnostic
type IgnoredIssue = {start: RelativePosition, end: RelativePosition, range: Range, language: string, text: string, kind: ProofreadingIssue["kind"], message: string}
const highlightNames = {spelling: "webwriter-spelling", grammar: "webwriter-grammar", style: "webwriter-style"} as const

function accessibilityContext(element: Element) {
  return JSON.stringify([Array.from(element.attributes).filter(attribute => attribute.name !== "class"
    && !isEditorOwnedAttribute(element, attribute.name)).map(attribute => [attribute.name, attribute.value]).sort(),
  authoredClassValue(element.getAttribute("class"), true), element.textContent])
}

function diagnosticText(issue: Diagnostic) {
  return issue.kind === "accessibility" ? issue.text : issue.run.text.slice(issue.start, issue.end)
}

/** A disposable projection of eligible prose, never an editor document model.
 * Formatting stays transparent; unrelated flows, languages and atomic hosts
 * form checking boundaries. No normalization or DOM writes occur here. */
export function proofreadingRuns(root: Element, schema: Schema): TextRun[] {
  const runs: TextRun[] = []
  let run: TextRun | null = null
  const flush = () => {
    if(run?.text.trim()) runs.push(run)
    run = null
  }
  const visit = (node: Node, language: string) => {
    if(node instanceof Text) {
      if(!/^en(?:-|$)/i.test(language) || !node.data) return
      if(run?.language !== language) flush()
      run ??= {text: "", language, parts: []}
      run.parts.push({node, start: run.text.length, value: node.data})
      run.text += node.data
      return
    }
    if(!(node instanceof Element)) return
    const ownLanguage = node.getAttribute("lang")
    const nextLanguage = ownLanguage === null ? language : ownLanguage.trim()
    const style = node.ownerDocument.defaultView?.getComputedStyle(node)
    const atomic = Boolean(isAtomicEditingElement(node, schema))
    if(node !== root && (atomic || node.namespaceURI !== "http://www.w3.org/1999/xhtml"
      || node.matches("script, style, template, noscript, code, pre, kbd, samp, math, [hidden], [inert], [contenteditable='false']")
      || style?.display === "none" || style?.visibility === "hidden" || style?.visibility === "collapse")) {
      flush()
      return
    }
    const boundary = node.localName === "br" || nextLanguage !== language
      || Boolean(style?.display && !["inline", "contents", "inline-block", "inline-flex", "inline-grid"].includes(style.display))
    if(boundary) flush()
    if(node.localName !== "br") node.childNodes.forEach(child => visit(child, nextLanguage))
    if(boundary) flush()
  }
  const language = root.closest("[lang]")?.getAttribute("lang") ?? "en-US"
  visit(root, language.trim())
  flush()
  return runs
}

function sameRun(first: TextRun, second: TextRun) {
  return first.text === second.text && first.language === second.language
    && first.parts.length === second.parts.length
    && first.parts.every((part, index) => part.node === second.parts[index].node && part.value === second.parts[index].value)
}

type RunIndex = Map<Text, TextRun[]>

function indexRuns(runs: TextRun[]): RunIndex {
  const index: RunIndex = new Map()
  for(const run of runs) {
    const first = run.parts[0]?.node
    if(first) {
      const grouped = index.get(first) ?? []
      grouped.push(run)
      index.set(first, grouped)
    }
  }
  return index
}

function findSameRun(index: RunIndex, run: TextRun) {
  const first = run.parts[0]?.node
  return first ? index.get(first)?.find(candidate => sameRun(candidate, run)) : undefined
}

function issueSignature(issue: ProofreadingIssue) {
  return JSON.stringify([issue.start, issue.end, issue.kind, issue.message])
}

function indexDiagnostics(diagnostics: Diagnostic[]) {
  const index = new Map<Text, Map<string, ProseDiagnostic[]>>()
  for(const diagnostic of diagnostics) {
    if(diagnostic.kind === "accessibility") continue
    const first = diagnostic.run.parts[0]?.node
    if(!first) continue
    const byIssue = index.get(first) ?? new Map<string, ProseDiagnostic[]>()
    const signature = issueSignature(diagnostic)
    const grouped = byIssue.get(signature) ?? []
    grouped.push(diagnostic)
    byIssue.set(signature, grouped)
    index.set(first, byIssue)
  }
  return index
}

function runRange(run: TextRun, start: number, end: number) {
  if(!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > run.text.length) return null
  const first = run.parts.find(part => start < part.start + part.value.length)
  const last = run.parts.find(part => end <= part.start + part.value.length && end > part.start)
  if(!first?.node.isConnected || !last?.node.isConnected) return null
  const range = first.node.ownerDocument.createRange()
  range.setStart(first.node, start - first.start)
  range.setEnd(last.node, end - last.start)
  return range.toString() === run.text.slice(start, end) ? range : null
}

function sameRange(first: Range, second: Range) {
  return first.startContainer === second.startContainer && first.startOffset === second.startOffset
    && first.endContainer === second.endContainer && first.endOffset === second.endOffset
}

/** Local document checks share diagnostics, highlighting and review controls. */
export class ProofreadingFeature extends EditorFeature {
  private observer: MutationObserver | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private generation = 0
  private sequence = 0
  private checking = false
  private composing = false
  private requested = false
  private enabled = false
  private manualChecking = false
  private checkingAllowed = true
  private documentCheckingEnabled = true
  private loading = false
  private ready = false
  private lastStatus = ""
  private error: string | null = null
  private diagnostics: Diagnostic[] = []
  private checkedRuns = new WeakMap<Text, {run: TextRun, issues: ProofreadingIssue[]}>()
  private ignored: IgnoredIssue[] = []
  private dictionary: string[] = []
  private reader: Promise<Proofreader> | null = null
  private readerAbort: AbortController | null = null
  private reviewer: Promise<AccessibilityReviewer> | null = null
  private ignoredAccessibility: {element: Element, rule: string, context: string}[] = []
  private accessibilityPills = new Map<string, HTMLButtonElement>()
  private accessibilityOutline: HTMLElement | null = null
  private accessibilityFrame: number | null = null
  private operation: Promise<void> | null = null
  private hoveredIssueId: string | null = null
  private popup: HTMLElement | null = null
  private popupStylesheet: CSSStyleSheet | null = null
  private popupIssueId: string | null = null
  private popupSuggestions = ""
  private readonly handleBlur = () => { this.closePopup(); this.setHoveredIssue(null) }

  actions = {
    checkProofreading: ({}: {type: "checkProofreading", kind?: "spelling" | "grammar" | "all"}) => this.checkManually(),
    retryProofreading: ({}: {type: "retryProofreading"}) => this.retry(),
    selectProofreadingIssue: ({id}: {type: "selectProofreadingIssue", id: string}) => this.selectIssue(id),
    getProofreadingState: ({}: {type: "getProofreadingState"}) => this.state(),
    setProofreadingEnabled: ({enabled}: {type: "setProofreadingEnabled", enabled: boolean}) => this.setChecking(enabled),
    setDocumentProofreadingEnabled: ({enabled}: {type: "setDocumentProofreadingEnabled", enabled: boolean}) => this.setDocumentChecking(enabled),
    applyProofreadingSuggestion: ({id, index}: {type: "applyProofreadingSuggestion", id: string, index: number}) => this.applySuggestion(id, index),
    ignoreProofreadingIssue: ({id}: {type: "ignoreProofreadingIssue", id: string}) => this.ignore(id),
    addProofreadingWord: ({id}: {type: "addProofreadingWord", id: string}) => this.addWord(id),
    setProofreadingDictionary: ({words}: {type: "setProofreadingDictionary", words: string[]}) => this.setDictionary(words),
  } as const

  activeListeners: DocumentListenerMap = {
    compositionstart: () => { this.composing = true; this.closePopup(); this.setHoveredIssue(null); this.invalidate() },
    compositionend: () => { this.composing = false; this.invalidate() },
  }

  captureListeners: DocumentListenerMap = {
    contextmenu: event => this.contextMenu(event),
    pointermove: event => this.setHoveredIssue(event.buttons ? null : this.isPopupEvent(event)
      ? this.popupIssueId : this.issueAtPoint(event)?.id ?? null),
    pointerout: event => {
      const pill = this.accessibilityPill(event)
      if(!event.relatedTarget || pill && !(event.relatedTarget instanceof Node
        && pill.contains(event.relatedTarget))) this.setHoveredIssue(this.popupIssueId)
    },
    pointerdown: event => {
      if(event.button === 0 && !this.isPopupEvent(event) && !this.accessibilityPill(event)) this.closePopup()
    },
    click: event => {
      const pill = this.accessibilityPill(event)
      if(!pill) return
      event.preventDefault()
      event.stopPropagation()
      if(!this.enabled || this.composing || this.editor.isEditingLocked) return
      const issue = this.resolve(pill.value)
      if(!issue) return
      this.closePopup()
      this.setHoveredIssue(issue.id)
      const anchor = pill.getBoundingClientRect()
      this.openPopup(issue, anchor.left, anchor.top, anchor)
    },
    focusin: event => {
      const pill = this.accessibilityPill(event)
      if(pill) this.setHoveredIssue(this.resolve(pill.value)?.id ?? null)
    },
    focusout: event => {
      if(this.accessibilityPill(event)) this.setHoveredIssue(this.popupIssueId)
    },
    keydown: event => {
      if(!this.popup) return
      if(event.key === "Escape") {
        event.preventDefault()
        event.stopImmediatePropagation()
        this.closePopup(true)
      }
      else if(this.isPopupEvent(event) && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        const buttons = Array.from(this.popup.querySelectorAll<HTMLElement>("button, a[href]"))
        const index = buttons.indexOf(this.editor.appendix.activeElement as HTMLElement)
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length
        buttons[next]?.focus()
      }
      else if(!this.isPopupEvent(event)) this.closePopup()
    },
    scroll: event => { if(!this.isPopupEvent(event)) { this.closePopup(); this.setHoveredIssue(null) } },
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    window.addEventListener("blur", this.handleBlur)
    this.observer = new MutationObserver(records => this.handleMutations(records))
    // Accessibility also depends on alt, labels, roles, relationships and
    // arbitrary attributes changed by native editing, widgets or collaboration.
    this.observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true,
      attributes: true, attributeOldValue: true, characterDataOldValue: true})
    this.enabled = this.checkingAllowed && this.documentCheckingEnabled
    this.error = null
    // Let the editor finish starting before loading the local checker.
    if(this.enabled) this.timer = setTimeout(() => { void this.checkNow() }, 0)
    this.postStatus()
  }

  disable() {
    if(!this.isEnabled) return
    this.enabled = false
    this.manualChecking = false
    this.loading = false
    this.ready = false
    this.error = null
    this.generation++
    this.requested = false
    clearTimeout(this.timer)
    this.observer?.disconnect()
    this.observer = null
    window.removeEventListener("blur", this.handleBlur)
    this.clearDiagnostics()
    this.checkedRuns = new WeakMap()
    this.ignored = []
    this.ignoredAccessibility = []
    this.disposeReviewer()
    const reader = this.reader
    this.reader = null
    this.readerAbort?.abort()
    this.readerAbort = null
    void reader?.then(value => value.dispose()).catch(() => {})
    this.postStatus()
    super.disable()
  }

  state() {
    this.flushMutations()
    return this.snapshot()
  }

  private snapshot(): ProofreadingState {
    return {
      enabled: this.enabled, documentEnabled: this.documentCheckingEnabled,
      loading: this.loading, ready: this.ready, checking: this.checking, error: this.error,
      hoveredIssueId: this.hoveredIssueId,
      issues: this.diagnostics.map(issue => ({
        id: issue.id, start: issue.start, end: issue.end, kind: issue.kind, message: issue.message,
        text: diagnosticText(issue), suggestions: issue.suggestions.map(suggestion => ({...suggestion})),
        ...(issue.kind === "accessibility" ? {helpUrl: issue.helpUrl} : {}),
      })),
    }
  }

  retry() {
    if(!this.isEnabled || !this.checkingAllowed || (!this.documentCheckingEnabled && !this.manualChecking)) return this.state()
    this.error = null
    this.invalidate(false)
    void this.checkNow()
    // Worker loading must not delay a normal bridge command.
    return this.state()
  }

  private checkManually() {
    this.flushMutations()
    if(!this.isEnabled || !this.checkingAllowed || this.composing || this.editor.isEditingLocked) return this.state()
    this.manualChecking = true
    this.enabled = true
    this.error = null
    this.invalidate(false)
    void this.checkNow()
    return this.state()
  }

  setChecking(enabled: boolean) {
    if(typeof enabled !== "boolean" || !this.isEnabled) return
    this.checkingAllowed = enabled
    this.manualChecking = false
    this.updateChecking(enabled && this.documentCheckingEnabled)
    return this.state()
  }

  setDocumentChecking(enabled: boolean) {
    if(typeof enabled !== "boolean" || !this.isEnabled || this.editor.isEditingLocked) return false
    this.documentCheckingEnabled = enabled
    this.manualChecking = false
    this.updateChecking(this.checkingAllowed && enabled)
    return this.state()
  }

  private updateChecking(enabled: boolean) {
    if(enabled === this.enabled) return
    this.enabled = enabled
    this.error = null
    this.invalidate(enabled)
    if(!enabled) {
      this.checking = false
      this.clearDiagnostics()
      const reader = this.reader
      this.reader = null
      this.readerAbort?.abort()
      this.readerAbort = null
      this.loading = false
      this.ready = false
      this.disposeReviewer()
      this.ignoredAccessibility = []
      void reader?.then(value => value.dispose()).catch(() => {})
    }
    this.postStatus()
  }

  private postStatus() {
    const status = this.snapshot()
    const key = JSON.stringify(status)
    if(key === this.lastStatus) return
    this.lastStatus = key
    this.editor.postProofreadingState(status)
  }

  private flushMutations() {
    this.handleMutations(this.observer?.takeRecords() ?? [])
  }

  private handleMutations(records: MutationRecord[]) {
    if(!records.length) return
    // Manual results remain usable until the authored document changes.
    if(this.hasProseChanges(records)) this.manualChecking = false
    const enabled = this.checkingAllowed && (this.documentCheckingEnabled || this.manualChecking)
    if(enabled !== this.enabled) this.updateChecking(enabled)
    else if(this.enabled && this.hasProseChanges(records)) this.invalidate()
    else this.postStatus()
  }

  private hasProseChanges(records: MutationRecord[]) {
    return records.some(isAuthoredMutation)
  }

  private invalidate(schedule = true) {
    this.generation++
    clearTimeout(this.timer)
    const runs = this.diagnostics.length ? proofreadingRuns(getDocumentRoot(), this.editor.schema) : []
    // Keep the cards until the complete replacement check is ready. Stale
    // ranges are no longer painted and commands still resolve against the DOM.
    const currentRuns = indexRuns(runs)
    for(const diagnostic of this.diagnostics) {
      if(diagnostic.kind === "accessibility") continue
      if(!findSameRun(currentRuns, diagnostic.run)) continue
      const range = runRange(diagnostic.run, diagnostic.start, diagnostic.end)!
      // Moving an intact paragraph can collapse its live Range even though
      // the text nodes and checking context remain unchanged.
      if(!sameRange(diagnostic.range, range)) diagnostic.range = range
    }
    this.paint(runs, currentRuns)
    if(schedule && this.enabled && this.documentCheckingEnabled && !this.composing && !this.error) {
      this.timer = setTimeout(() => { void this.checkNow(true) }, 500)
    }
    this.postStatus()
  }

  private clearDiagnostics() {
    this.diagnostics = []
    this.hoveredIssueId = null
    this.closePopup()
    for(const name of Object.values(highlightNames)) globalThis.CSS?.highlights?.delete(name)
    this.clearAccessibilityUI()
  }

  private disposeReviewer() {
    const reviewer = this.reviewer
    this.reviewer = null
    void reviewer?.then(value => value.dispose()).catch(() => {})
  }

  private setHoveredIssue(id: string | null) {
    if(this.hoveredIssueId === id) return
    this.hoveredIssueId = id
    this.postStatus()
  }

  private isPopupEvent(event: Event) {
    return Boolean(this.popup && event.composedPath().includes(this.popup))
  }

  private accessibilityPill(event: Event) {
    return event.composedPath().find((node): node is HTMLButtonElement => node instanceof HTMLButtonElement
      && this.accessibilityPills.get(node.value) === node) ?? null
  }

  private issueAtPoint(event: MouseEvent) {
    if(!this.enabled || !this.isEnabled || this.composing || this.editor.isEditingLocked
      || isWidgetShadowInteraction(event, this.editor.schema)) return null
    const pill = this.accessibilityPill(event)
    if(pill) return this.resolve(pill.value)
    if(isAppendixInteraction(event)) return null
    this.flushMutations()
    const target = event.composedPath()[0]
    if(!(target instanceof Node)) return null
    const formControl = isFormControlInteraction(event)
    return this.diagnostics.filter(diagnostic => (diagnostic.kind === "accessibility"
      ? diagnostic.element.contains(target) : !formControl && diagnostic.run.parts.some(part => target.contains(part.node)))
      && Array.from(diagnostic.kind === "accessibility" ? diagnostic.element.getClientRects() : diagnostic.range.getClientRects()).some(rect => rect.width > 0 && rect.height > 0
        && event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom + 3
        // Page findings belong to the page outline, not every word inside it.
        && (diagnostic.kind !== "accessibility" || ![document.documentElement, document.body].includes(diagnostic.element as HTMLElement)
          || event.clientX <= rect.left + 3 || event.clientX >= rect.right - 3
          || event.clientY <= rect.top + 3 || event.clientY >= rect.bottom - 3))
      && this.isCurrentDiagnostic(diagnostic))
      .sort((first, second) => first.kind !== "accessibility" ? (second.kind !== "accessibility" ? 0 : -1)
        : second.kind !== "accessibility" ? 1 : first.element === second.element ? 0
        : first.element.contains(second.element) ? 1 : second.element.contains(first.element) ? -1 : 0)[0] ?? null
  }

  private contextMenu(event: MouseEvent) {
    if(event.defaultPrevented) return
    if(!this.enabled || !this.isEnabled || this.composing || this.editor.isEditingLocked) { this.closePopup(); return }
    const issue = this.isPopupEvent(event) && this.popupIssueId
      ? this.resolve(this.popupIssueId) : this.issueAtPoint(event)
    if(!issue) { this.closePopup(); return }
    this.closePopup()
    this.openPopup(issue, event.clientX, event.clientY)
    event.preventDefault()
    event.stopPropagation()
  }

  private closePopup(restoreFocus = false) {
    const focused = this.popup && this.popup.contains(this.editor.appendix.activeElement)
    const pill = this.accessibilityPills.get(this.popupIssueId ?? "")
    pill?.setAttribute("aria-expanded", "false")
    pill?.setAttribute("part", "accessibility-issue-pill")
    this.accessibilityOutline?.remove()
    this.accessibilityOutline = null
    this.popup?.remove()
    this.popup = null
    if(this.popupStylesheet) {
      this.editor.appendix.adoptedStyleSheets = this.editor.appendix.adoptedStyleSheets.filter(sheet => sheet !== this.popupStylesheet)
      this.popupStylesheet = null
    }
    this.popupIssueId = null
    this.popupSuggestions = ""
    if(restoreFocus && focused) (pill ?? document.body).focus()
  }

  private openPopup(issue: Diagnostic, x: number, y: number, pillAnchor?: DOMRect) {
    const rects = issue.kind === "accessibility" ? issue.element.getClientRects() : issue.range.getClientRects()
    const anchor = pillAnchor ?? Array.from(rects).find(rect => rect.width > 0 && rect.height > 0
      && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom + 3)
      ?? (issue.kind === "accessibility" ? issue.element.getBoundingClientRect() : issue.range.getBoundingClientRect())
    const popup = document.createElement("aside")
    popup.className = "◆ ◆editor-only ◆proofreading-popup"
    popup.setAttribute("part", "proofreading-popup")
    popup.setAttribute("role", "menu")
    popup.setAttribute("aria-label", `${proofreadingKindLabels[issue.kind]} suggestions`)
    popup.setAttribute("popover", "manual")
    render(renderProofreadingCard({...issue, text: diagnosticText(issue)}, action => {
      if(this.popup !== popup || !popup.isConnected) return
      this.closePopup(true)
      if(action.type === "applyProofreadingSuggestion") this.applySuggestion(action.id, action.index)
      else if(action.type === "addProofreadingWord") this.addWord(action.id)
      else if(action.type === "ignoreProofreadingIssue") this.ignore(action.id)
    }, {popup: true, hovered: true}), popup)
    this.popup = popup
    this.popupIssueId = issue.id
    this.popupSuggestions = JSON.stringify(issue.suggestions)
    if(issue.kind === "accessibility") {
      this.accessibilityPills.get(issue.id)?.setAttribute("aria-expanded", "true")
      this.accessibilityPills.get(issue.id)?.setAttribute("part", "accessibility-issue-pill accessibility-issue-pill-active")
      this.accessibilityOutline = document.createElement("div")
      this.accessibilityOutline.className = "◆ ◆editor-only"
      this.accessibilityOutline.setAttribute("part", "accessibility-issue-outline")
      this.accessibilityOutline.setAttribute("aria-hidden", "true")
      this.editor.addAppendix(this.accessibilityOutline)
      this.positionAccessibilityIssues()
    }
    this.editor.addAppendix(popup)
    this.popupStylesheet = createStylesheet(proofreadingCardStyles.cssText)
    adoptStylesheet(this.editor.appendix, this.popupStylesheet)
    popup.showPopover?.()
    this.positionPopup(anchor)
    popup.querySelector<HTMLElement>("button, a[href]")?.focus()
  }

  private positionPopup(anchor: DOMRect) {
    if(!this.popup) return
    const rect = this.popup.getBoundingClientRect()
    const right = Math.min(innerWidth, document.documentElement.getBoundingClientRect().right || innerWidth) - 6
    this.popup.style.left = `${fixedClientX(Math.max(6, Math.min(anchor.left, right - rect.width)))}px`
    const below = anchor.bottom + 6
    this.popup.style.top = `${below + rect.height <= innerHeight - 6 ? below : Math.max(6, anchor.top - rect.height - 6)}px`
  }

  async checkNow(reuseUnchanged = false) {
    this.flushMutations()
    clearTimeout(this.timer)
    if(!this.enabled || !this.isEnabled || this.composing) return
    if(!reuseUnchanged) this.checkedRuns = new WeakMap()
    this.requested = true
    if(this.operation) return this.operation
    this.operation = this.checkRuns().finally(() => {
      this.operation = null
      if(this.requested && this.enabled && this.isEnabled && !this.composing) void this.checkNow()
    })
    return this.operation
  }

  private async checkRuns() {
    let generation = this.generation
    let pending: Promise<Proofreader> | null = null
    this.checking = true
    this.error = null
    this.postStatus()
    try {
      if(!this.reader) {
        this.loading = true
        this.ready = false
        this.readerAbort = new AbortController()
        this.reader = createProofreader(this.readerAbort.signal)
        this.postStatus()
      }
      this.reviewer ??= createAccessibilityReviewer()
      pending = this.reader
      const [reader, reviewer] = await Promise.all([pending, this.reviewer])
      if(pending !== this.reader || !this.enabled || !this.isEnabled) return
      this.loading = false
      this.ready = true
      this.postStatus()
      while(this.requested && this.enabled && this.isEnabled && !this.composing) {
        this.requested = false
        generation = this.generation
        const runs = proofreadingRuns(getDocumentRoot(), this.editor.schema)
        const checkedRuns = this.checkedRuns
        const diagnostics: Diagnostic[] = []
        const previousDiagnostics = indexDiagnostics(this.diagnostics)
        if(runs.length) {
          const pendingRuns = runs.filter(run => {
            const cached = checkedRuns.get(run.parts[0].node)
            return !cached || !sameRun(run, cached.run)
          })
          const pendingIndexes = new Map(pendingRuns.map((run, index) => [run, index]))
          let checked: ProofreadingIssue[][] | null = null
          if(reader.checkBatch) {
            checked = []
            // Yield between bounded batches so edits can supersede old work
            // without waiting for the rest of a large document to be checked.
            for(let index = 0; index < pendingRuns.length; index += 64) {
              this.flushMutations()
              if(generation !== this.generation || !this.enabled || !this.isEnabled) break
              checked.push(...await reader.checkBatch(pendingRuns.slice(index, index + 64), this.dictionary))
            }
          }
          for(const run of runs) {
            if(generation !== this.generation || !this.enabled || !this.isEnabled) break
            const cached = checkedRuns.get(run.parts[0].node)
            const index = pendingIndexes.get(run)
            const issues = index === undefined ? cached!.issues
              : checked ? checked[index] : await reader.check(run.text, run.language, this.dictionary)
            if(generation !== this.generation || !this.enabled || !this.isEnabled) break
            checkedRuns.set(run.parts[0].node, {run, issues})
            for(const issue of issues) {
              const range = runRange(run, issue.start, issue.end)
              if(range && !this.isDictionaryWord(run, issue) && !this.isIgnored(run, issue, range)) {
                const previous = previousDiagnostics.get(run.parts[0].node)?.get(issueSignature(issue))
                  ?.find(diagnostic => sameRun(run, diagnostic.run))
                diagnostics.push({...issue, run, id: previous?.id ?? String(++this.sequence),
                  range: previous && sameRange(previous.range, range) ? previous.range : range})
              }
            }
          }
        }
        this.flushMutations()
        if(generation !== this.generation || !this.enabled || !this.isEnabled) continue
        const findings = await reviewer.check(getDocumentRoot(), this.editor.schema)
        this.flushMutations()
        if(generation !== this.generation || !this.enabled || !this.isEnabled) continue
        this.ignoredAccessibility = this.ignoredAccessibility.filter(ignored => ignored.element.isConnected
          && accessibilityContext(ignored.element) === ignored.context
          && findings.some(finding => finding.element === ignored.element && finding.rule === ignored.rule))
        for(const finding of findings) {
          if(!finding.element.isConnected || this.ignoredAccessibility.some(ignored => ignored.element === finding.element
            && ignored.rule === finding.rule)) continue
          const previous = this.diagnostics.find((issue): issue is AccessibilityDiagnostic => issue.kind === "accessibility"
            && issue.element === finding.element && issue.rule === finding.rule && issue.message === finding.message)
          const range = document.createRange()
          if(document.body.contains(finding.element) && finding.element !== document.body) range.selectNode(finding.element)
          else range.selectNodeContents(getDocumentRoot())
          diagnostics.push({...finding, kind: "accessibility", id: previous?.id ?? String(++this.sequence),
            start: 0, end: Math.max(1, finding.text.length), suggestions: [], range, generation})
        }
        const current = proofreadingRuns(getDocumentRoot(), this.editor.schema)
        const currentRuns = indexRuns(current)
        this.diagnostics = diagnostics.filter(diagnostic => diagnostic.kind === "accessibility" || findSameRun(currentRuns, diagnostic.run)
          && !this.isIgnored(diagnostic.run, diagnostic, diagnostic.range))
        this.paint(current, currentRuns)
        this.postStatus()
      }
    }
    catch(error) {
      if(pending === this.reader && this.enabled && this.isEnabled) {
        this.requested = false
        clearTimeout(this.timer)
        this.error = error instanceof Error ? error.message : String(error)
        const reader = this.reader
        this.reader = null
        this.readerAbort?.abort()
        this.readerAbort = null
        this.loading = false
        this.ready = false
        this.disposeReviewer()
        void reader?.then(value => value.dispose()).catch(() => {})
        this.postStatus()
      }
    }
    finally {
      this.checking = false
      if(this.isEnabled) this.postStatus()
    }
  }

  private paint(runs = this.diagnostics.length ? proofreadingRuns(getDocumentRoot(), this.editor.schema) : [], currentRuns = indexRuns(runs)) {
    const current = this.diagnostics.filter(issue => issue.kind === "accessibility"
      ? this.isCurrentDiagnostic(issue) : findSameRun(currentRuns, issue.run))
    if(this.hoveredIssueId && !current.some(issue => issue.id === this.hoveredIssueId)) this.hoveredIssueId = null
    if(this.popupIssueId && !current.some(issue => issue.id === this.popupIssueId
      && JSON.stringify(issue.suggestions) === this.popupSuggestions)) this.closePopup()
    this.paintAccessibilityIssues(current.filter((issue): issue is AccessibilityDiagnostic => issue.kind === "accessibility"))
    if(!globalThis.CSS?.highlights || typeof globalThis.Highlight !== "function") return
    for(const kind of ["spelling", "grammar", "style"] as const) {
      const ranges = new Set(current.filter(diagnostic => diagnostic.kind === kind).map(diagnostic => diagnostic.range))
      const name = highlightNames[kind]
      if(!ranges.size) {
        CSS.highlights.delete(name)
        continue
      }
      let highlight = CSS.highlights.get(name)
      if(!highlight) {
        highlight = new Highlight()
        highlight.type = kind === "spelling" ? "spelling-error" : kind === "grammar" ? "grammar-error" : "highlight"
        CSS.highlights.set(name, highlight)
      }
      for(const range of highlight) if(!ranges.has(range as Range)) highlight.delete(range)
      for(const range of ranges) if(!highlight.has(range)) highlight.add(range)
    }
  }

  private clearAccessibilityUI() {
    if(this.accessibilityFrame !== null) cancelAnimationFrame(this.accessibilityFrame)
    this.accessibilityFrame = null
    this.accessibilityPills.forEach(pill => pill.remove())
    this.accessibilityPills.clear()
    this.accessibilityOutline?.remove()
    this.accessibilityOutline = null
  }

  private readonly positionAccessibilityIssues = () => {
    if(this.accessibilityFrame !== null) cancelAnimationFrame(this.accessibilityFrame)
    this.accessibilityFrame = null
    const left = Math.max(4, Math.min(innerWidth, document.documentElement.getBoundingClientRect().right || innerWidth) - 34)
    const issues = this.diagnostics.filter((issue): issue is AccessibilityDiagnostic => issue.kind === "accessibility"
      && this.isCurrentDiagnostic(issue)).map(issue => ({issue, rect: issue.element.getBoundingClientRect()}))
      .sort((first, second) => first.rect.top - second.rect.top)
    let nextTop = 6
    for(const {issue, rect} of issues) {
      const pill = this.accessibilityPills.get(issue.id)
      if(!pill) continue
      const pageIssue = issue.element === document.documentElement || issue.element === document.body || document.head.contains(issue.element)
      const top = Math.max(nextTop, pageIssue ? 6 : rect.top)
      const visible = (pageIssue || rect.bottom >= 0 && rect.top < innerHeight) && top + 24 <= innerHeight - 6
      Object.assign(pill.style, {left: `${fixedClientX(left)}px`, top: `${top}px`, display: visible ? "grid" : "none"})
      pill.disabled = this.editor.isEditingLocked
      if(visible) nextTop = top + 28
      if(issue.id === this.popupIssueId && this.accessibilityOutline) {
        Object.assign(this.accessibilityOutline.style, {left: `${fixedClientX(rect.left)}px`, top: `${rect.top}px`,
          width: `${rect.width}px`, height: `${rect.height}px`})
        this.positionPopup(pill.getBoundingClientRect())
      }
    }
    if(this.accessibilityPills.size) this.accessibilityFrame = requestAnimationFrame(this.positionAccessibilityIssues)
  }

  private paintAccessibilityIssues(issues: AccessibilityDiagnostic[]) {
    const ids = new Set(issues.map(issue => issue.id))
    for(const [id, pill] of this.accessibilityPills) {
      if(ids.has(id)) continue
      pill.remove()
      this.accessibilityPills.delete(id)
    }
    for(const issue of issues) {
      let pill = this.accessibilityPills.get(issue.id)
      if(!pill) {
        pill = document.createElement("button")
        pill.type = "button"
        pill.value = issue.id
        pill.className = "◆ ◆editor-only"
        pill.setAttribute("part", "accessibility-issue-pill")
        pill.setAttribute("aria-haspopup", "menu")
        // Trusted dependency icon; issue content is assigned as text attributes.
        pill.innerHTML = accessibleIcon
        const icon = pill.querySelector("svg")!
        icon.setAttribute("aria-hidden", "true")
        icon.setAttribute("width", "16")
        icon.setAttribute("height", "16")
        this.editor.addAppendix(pill)
        this.accessibilityPills.set(issue.id, pill)
      }
      pill.setAttribute("aria-label", `Accessibility issue: ${issue.message} (${issue.text})`)
      pill.setAttribute("aria-expanded", String(issue.id === this.popupIssueId))
      pill.title = issue.message
    }
    this.positionAccessibilityIssues()
  }

  private isCurrentDiagnostic(issue: Diagnostic) {
    return issue.kind === "accessibility" ? issue.generation === this.generation
      && issue.element.isConnected && issue.element.ownerDocument === document
      : proofreadingRuns(getDocumentRoot(), this.editor.schema).some(run => sameRun(run, issue.run))
  }

  private resolve(id: string) {
    this.flushMutations()
    const diagnostic = this.diagnostics.find(candidate => candidate.id === id)
    if(!diagnostic || !this.isCurrentDiagnostic(diagnostic)) return null
    return diagnostic
  }

  applySuggestion(id: string, index: number) {
    if(!this.enabled || !this.isEnabled || this.composing || this.editor.isEditingLocked || !Number.isInteger(index) || index < 0) return false
    const diagnostic = this.resolve(id)
    const suggestion = diagnostic?.suggestions[index]
    if(!diagnostic || diagnostic.kind === "accessibility" || !suggestion) return false
    const {run, start, end} = diagnostic
    const range = runRange(run, start, end)
    if(!range) return false
    const last = range.endContainer as Text
    const lastOffset = range.endOffset
    const finish = this.editor.doc.beginUndoGroup()
    try {
      if(suggestion.kind === "insertAfter") {
        last.insertData(lastOffset, suggestion.text)
        range.setStart(last, lastOffset + suggestion.text.length)
      }
      else {
        // Edit only character data. Fully enclosed elements and authored
        // comments survive, including empty formatting and custom attributes.
        const replacement = suggestion.kind === "remove" ? "" : suggestion.text
        const original = run.text.slice(start, end)
        let prefix = 0, suffix = 0
        while(prefix < original.length && prefix < replacement.length && original[prefix] === replacement[prefix]) prefix++
        while(suffix < original.length - prefix && suffix < replacement.length - prefix
          && original[original.length - suffix - 1] === replacement[replacement.length - suffix - 1]) suffix++
        const editStart = start + prefix, editEnd = end - suffix
        const inserted = replacement.slice(prefix, replacement.length - suffix)
        const target = run.parts.find(part => editStart < part.start + part.value.length) ?? run.parts.at(-1)!
        const parts = editStart === editEnd ? [] : run.parts.filter(part => part.start < editEnd && part.start + part.value.length > editStart)
        if(editStart === editEnd) target.node.insertData(editStart - target.start, inserted)
        for(const part of [...parts].reverse()) {
          const offset = Math.max(0, editStart - part.start)
          const length = Math.min(part.value.length, editEnd - part.start) - offset
          part.node.replaceData(offset, length, part.node === target.node ? inserted : "")
        }
        range.setStart(target.node, editStart - target.start + inserted.length)
      }
      range.collapse(true)
      const selection = document.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      this.editor.doc.updateLocalSelection()
    }
    finally { finish() }
    this.invalidate()
    return true
  }

  private isIgnored(run: TextRun, issue: ProofreadingIssue, range: Range) {
    return this.ignored.some(ignored => {
      if(ignored.language !== run.language || ignored.kind !== issue.kind || ignored.message !== issue.message
        || ignored.text !== run.text.slice(issue.start, issue.end)) return false
      // Native ranges track separate DOM edits even when one reconciliation
      // replaces the shared text between them. The end keeps the original
      // occurrence anchored when text is inserted at its starting boundary.
      let matches: boolean
      if(ignored.range.endContainer.isConnected && ignored.range.toString().endsWith(ignored.text)) {
        matches = ignored.range.endContainer === range.endContainer && ignored.range.endOffset === range.endOffset
      }
      else {
        const start = this.editor.doc.domPointFromRelativePosition(ignored.start)
        const end = this.editor.doc.domPointFromRelativePosition(ignored.end)
        matches = start?.node === range.startContainer && start.offset === range.startOffset
          && end?.node === range.endContainer && end.offset === range.endOffset
      }
      if(!matches) return false
      // Refresh both anchors after a check so subsequent DOM or remote edits
      // start from the same occurrence in the reconciled document.
      ignored.range = range.cloneRange()
      ignored.start = this.editor.doc.relativePositionFromDOMPoint(range.startContainer, range.startOffset) ?? ignored.start
      ignored.end = this.editor.doc.relativePositionFromDOMPoint(range.endContainer, range.endOffset) ?? ignored.end
      return true
    })
  }

  private isDictionaryWord(run: TextRun, issue: ProofreadingIssue) {
    return issue.kind === "spelling" && this.dictionary.some(word => word.toLowerCase() === run.text.slice(issue.start, issue.end).toLowerCase())
  }

  setDictionary(words: string[]) {
    if(!Array.isArray(words) || !words.every(word => typeof word === "string")) return false
    const dictionary = normalizeProofreadingDictionary(words)
    if(JSON.stringify(dictionary) === JSON.stringify(this.dictionary)) return true
    this.dictionary = dictionary
    this.generation++
    this.diagnostics = this.diagnostics.filter(issue => issue.kind === "accessibility" || !this.isDictionaryWord(issue.run, issue))
    this.paint()
    this.postStatus()
    if(this.enabled && this.isEnabled) void this.checkNow()
    return true
  }

  addWord(id: string) {
    if(!this.enabled || !this.isEnabled || this.composing || this.editor.isEditingLocked) return false
    const issue = this.resolve(id)
    if(!issue || issue.kind !== "spelling") return false
    const [word] = normalizeProofreadingDictionary([issue.run.text.slice(issue.start, issue.end)])
    if(!word) return false
    this.setDictionary([...this.dictionary, word])
    this.editor.postHostMessage({type: proofreadingDictionaryAddEvent, word})
    return true
  }

  ignore(id: string) {
    if(!this.enabled || !this.isEnabled || this.composing || this.editor.isEditingLocked) return false
    const diagnostic = this.resolve(id)
    if(!diagnostic) return false
    if(diagnostic.kind === "accessibility") {
      this.ignoredAccessibility.push({element: diagnostic.element, rule: diagnostic.rule, context: accessibilityContext(diagnostic.element)})
      this.diagnostics = this.diagnostics.filter(candidate => candidate.id !== id)
      this.paint()
      this.postStatus()
      return true
    }
    // Stable shared positions keep this occurrence ignored as surrounding
    // prose changes, without suppressing the same error elsewhere.
    this.editor.doc.syncFromDOM()
    const start = this.editor.doc.relativePositionFromDOMPoint(diagnostic.range.startContainer, diagnostic.range.startOffset)
    const end = this.editor.doc.relativePositionFromDOMPoint(diagnostic.range.endContainer, diagnostic.range.endOffset)
    if(!start || !end) return false
    this.ignored.push({start, end, range: diagnostic.range.cloneRange(), language: diagnostic.run.language,
      text: diagnostic.run.text.slice(diagnostic.start, diagnostic.end), kind: diagnostic.kind, message: diagnostic.message})
    this.diagnostics = this.diagnostics.filter(candidate => candidate.id !== id)
    this.paint()
    this.postStatus()
    return true
  }

  selectIssue(id: string) {
    if(!this.enabled || !this.isEnabled || this.composing || this.editor.isEditingLocked) return false
    const current = this.resolve(id)
    const range = current && (current.kind === "accessibility" ? current.range : runRange(current.run, current.start, current.end))
    if(!range) return false
    const selection = document.getSelection()
    if(!selection) return false
    $.selectRanges([range])
    this.editor.doc.updateLocalSelection()
    const target = current?.kind === "accessibility" ? current.element : range.startContainer.parentElement
    target?.scrollIntoView({block: "nearest"})
    return true
  }
}
