import {EditorFeature, type DocumentListenerMap} from "."
import {createProofreader, type Proofreader, type ProofreadingIssue} from "../proofreading"
import {adoptStylesheet, createStylesheet, isAtomicEditingElement} from "../utility"
import {getDocumentRoot} from "../document-template"
import type {Schema} from "../schema"

type TextPart = {node: Text, start: number, value: string}
type TextRun = {text: string, language: string, parts: TextPart[]}
type Diagnostic = ProofreadingIssue & {id: string, run: TextRun}
type ReviewKind = "spelling" | "grammar" | "all"

const highlightNames = {spelling: "webwriter-spelling", grammar: "webwriter-grammar"} as const
const panelStyles = createStylesheet(`
  .◆proofreading-panel {
    position: fixed; right: 1rem; bottom: 1rem; z-index: 2147483646;
    width: min(24rem, calc(100vw - 2rem)); max-height: min(34rem, calc(100vh - 2rem));
    overflow: auto; box-sizing: border-box; padding: 1rem; border: 1px solid #cbd5e1;
    border-radius: .5rem; background: white; color: #172033; box-shadow: 0 .5rem 2rem #0003;
    font: 14px/1.4 system-ui, sans-serif; pointer-events: auto; user-select: text;
  }
  .◆proofreading-panel header {display: flex; align-items: center; justify-content: space-between; gap: 1rem}
  .◆proofreading-panel h2 {font: inherit; font-weight: 600; margin: 0}
  .◆proofreading-panel button {font: inherit; cursor: pointer; margin: .2rem; padding: .25rem .5rem}
  .◆proofreading-panel li {margin: .75rem 0; border-top: 1px solid #e2e8f0; padding-top: .5rem}
  .◆proofreading-panel ul {list-style: none; padding: 0; margin: 0}
  .◆proofreading-panel p {margin: .5rem 0}
`)

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

/** Local proofreading uses ranges for paint and the shadow appendix for UI. */
export class ProofreadingFeature extends EditorFeature {
  private observer: MutationObserver | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private generation = 0
  private sequence = 0
  private checking = false
  private composing = false
  private requested = false
  private enabled = false
  private loading = false
  private ready = false
  private lastStatus = ""
  private kind: ReviewKind = "all"
  private error: string | null = null
  private diagnostics: Diagnostic[] = []
  private ignored = new Set<string>()
  private reader: Promise<Proofreader> | null = null
  private readerAbort: AbortController | null = null
  private operation: Promise<void> | null = null
  private panel: HTMLElement | null = null

  actions = {
    checkProofreading: ({kind = "all"}: {type: "checkProofreading", kind?: ReviewKind}) => this.open(kind),
    getProofreadingState: ({}: {type: "getProofreadingState"}) => this.state(),
    setProofreadingEnabled: ({enabled}: {type: "setProofreadingEnabled", enabled: boolean}) => this.setChecking(enabled),
    applyProofreadingSuggestion: ({id, index}: {type: "applyProofreadingSuggestion", id: string, index: number}) => this.applySuggestion(id, index),
    ignoreProofreadingIssue: ({id}: {type: "ignoreProofreadingIssue", id: string}) => this.ignore(id),
  } as const

  activeListeners: DocumentListenerMap = {
    compositionstart: () => { this.composing = true; this.invalidate() },
    compositionend: () => { this.composing = false; this.invalidate() },
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    this.observer = new MutationObserver(records => {
      if(this.hasProseChanges(records) && this.enabled) this.invalidate()
    })
    this.observer.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true,
      attributeFilter: ["lang", "hidden", "inert", "contenteditable", "is", "style", "class"]})
    this.observer.observe(document.documentElement, {attributes: true, attributeFilter: ["lang"]})
    this.observer.observe(document.head, {subtree: true, childList: true, characterData: true, attributes: true})
    this.enabled = true
    this.error = null
    // Let the editor finish starting before loading the local checker.
    this.timer = setTimeout(() => { void this.checkNow() }, 0)
    this.postStatus()
  }

  disable() {
    if(!this.isEnabled) return
    this.enabled = false
    this.loading = false
    this.ready = false
    this.error = null
    this.generation++
    this.requested = false
    clearTimeout(this.timer)
    this.observer?.disconnect()
    this.observer = null
    this.clearDiagnostics()
    this.close()
    this.ignored.clear()
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
    return {
      enabled: this.enabled, loading: this.loading, ready: this.ready, checking: this.checking, error: this.error,
      issues: this.diagnostics.map(({id, start, end, kind, message, suggestions, run}) => ({
        id, start, end, kind, message, text: run.text.slice(start, end), suggestions,
      })),
    }
  }

  open(kind: ReviewKind = "all") {
    if(!this.isEnabled || !["spelling", "grammar", "all"].includes(kind)) return
    this.kind = kind
    this.enabled = true
    this.error = null
    if(!this.panel) {
      this.panel = document.createElement("section")
      this.panel.className = "◆proofreading-panel"
      this.panel.setAttribute("aria-label", "Spelling and grammar")
      adoptStylesheet(this.editor.appendix, panelStyles)
      this.editor.addAppendix(this.panel)
    }
    this.invalidate(false)
    void this.checkNow()
    this.render()
    // Starting a worker can take longer than a normal bridge command. Results
    // update the appendix asynchronously; the command itself opens it promptly.
    return this.state()
  }

  close() {
    this.panel?.remove()
    this.panel = null
    const appendix = document.body.shadowRoot
    if(appendix) appendix.adoptedStyleSheets = appendix.adoptedStyleSheets.filter(sheet => sheet !== panelStyles)
  }

  setChecking(enabled: boolean) {
    if(typeof enabled !== "boolean" || !this.isEnabled) return
    this.enabled = enabled
    this.error = null
    this.invalidate(enabled)
    if(!enabled) {
      const reader = this.reader
      this.reader = null
      this.readerAbort?.abort()
      this.readerAbort = null
      this.loading = false
      this.ready = false
      void reader?.then(value => value.dispose()).catch(() => {})
    }
    this.postStatus()
    this.render()
    return this.state()
  }

  private postStatus() {
    const status = {enabled: this.enabled, loading: this.loading, ready: this.ready, error: this.error}
    const key = JSON.stringify(status)
    if(key === this.lastStatus) return
    this.lastStatus = key
    this.editor.postProofreadingState(status)
  }

  private flushMutations() {
    if(this.enabled && this.hasProseChanges(this.observer?.takeRecords() ?? [])) this.invalidate()
  }

  private hasProseChanges(records: MutationRecord[]) {
    const authoredClasses = (value: string | null) => (value ?? "").split(/\s+/).filter(name => name && !name.startsWith("◆")).sort().join(" ")
    return records.some(record => {
      if(record.type !== "attributes" || !(record.target instanceof Element)) return true
      if(record.attributeName === "class") return authoredClasses(record.oldValue) !== authoredClasses(record.target.getAttribute("class"))
      if(record.attributeName === "contenteditable" && record.target.classList.contains("◆widget-editable")) return false
      return true
    })
  }

  private invalidate(schedule = true) {
    this.generation++
    clearTimeout(this.timer)
    this.clearDiagnostics()
    if(schedule && this.enabled && !this.composing && !this.error) {
      this.timer = setTimeout(() => { void this.checkNow() }, 500)
    }
    this.render()
  }

  private clearDiagnostics() {
    this.diagnostics = []
    for(const name of Object.values(highlightNames)) globalThis.CSS?.highlights?.delete(name)
  }

  async checkNow() {
    clearTimeout(this.timer)
    if(!this.enabled || !this.isEnabled || this.composing) return
    this.flushMutations()
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
    this.render()
    try {
      if(!this.reader) {
        this.loading = true
        this.ready = false
        this.readerAbort = new AbortController()
        this.reader = createProofreader(this.readerAbort.signal)
        this.postStatus()
      }
      pending = this.reader
      const reader = await pending
      if(pending !== this.reader || !this.enabled || !this.isEnabled) return
      this.loading = false
      this.ready = true
      this.postStatus()
      while(this.requested && this.enabled && this.isEnabled && !this.composing) {
        this.requested = false
        generation = this.generation
        const runs = proofreadingRuns(getDocumentRoot(), this.editor.schema)
        const diagnostics: Diagnostic[] = []
        if(runs.length) {
          for(const run of runs) {
            if(generation !== this.generation || !this.enabled || !this.isEnabled) break
            for(const issue of await reader.check(run.text, run.language)) {
              if(runRange(run, issue.start, issue.end) && !this.ignored.has(this.ignoreKey(run, issue))) {
                diagnostics.push({...issue, run, id: String(++this.sequence)})
              }
            }
          }
        }
        this.flushMutations()
        if(generation !== this.generation || !this.enabled || !this.isEnabled) continue
        const current = proofreadingRuns(getDocumentRoot(), this.editor.schema)
        this.diagnostics = diagnostics.filter(diagnostic => current.some(run => sameRun(run, diagnostic.run)))
        this.paint()
      }
    }
    catch(error) {
      if(pending === this.reader && this.enabled && this.isEnabled) {
        this.requested = false
        clearTimeout(this.timer)
        this.error = error instanceof Error ? error.message : String(error)
        this.clearDiagnostics()
        const reader = this.reader
        this.reader = null
        this.readerAbort?.abort()
        this.readerAbort = null
        this.loading = false
        this.ready = false
        void reader?.then(value => value.dispose()).catch(() => {})
        this.postStatus()
      }
    }
    finally {
      this.checking = false
      if(this.isEnabled) this.render()
    }
  }

  private paint() {
    if(!globalThis.CSS?.highlights || typeof globalThis.Highlight !== "function") return
    for(const kind of ["spelling", "grammar"] as const) {
      const ranges = this.diagnostics.filter(diagnostic => diagnostic.kind === kind)
        .map(diagnostic => runRange(diagnostic.run, diagnostic.start, diagnostic.end)).filter((range): range is Range => range !== null)
      const highlight = new Highlight(...ranges)
      highlight.type = kind === "spelling" ? "spelling-error" : "grammar-error"
      CSS.highlights.set(highlightNames[kind], highlight)
    }
  }

  private resolve(id: string) {
    this.flushMutations()
    const diagnostic = this.diagnostics.find(candidate => candidate.id === id)
    if(!diagnostic || !proofreadingRuns(getDocumentRoot(), this.editor.schema).some(run => sameRun(run, diagnostic.run))) return null
    return diagnostic
  }

  applySuggestion(id: string, index: number) {
    if(!this.enabled || !this.isEnabled || this.composing || this.editor.isEditingLocked || !Number.isInteger(index) || index < 0) return false
    const diagnostic = this.resolve(id)
    const suggestion = diagnostic?.suggestions[index]
    if(!diagnostic || !suggestion) return false
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

  private ignoreKey(run: TextRun, issue: ProofreadingIssue) {
    return JSON.stringify([run.language, run.text, issue.start, issue.end, issue.kind, issue.message])
  }

  ignore(id: string) {
    const diagnostic = this.resolve(id)
    if(!diagnostic) return false
    this.ignored.add(this.ignoreKey(diagnostic.run, diagnostic))
    this.diagnostics = this.diagnostics.filter(candidate => candidate.id !== id)
    this.paint()
    this.render()
    return true
  }

  private select(diagnostic: Diagnostic) {
    const current = this.resolve(diagnostic.id)
    const range = current && runRange(current.run, current.start, current.end)
    if(!range) return
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    this.editor.doc.updateLocalSelection()
    range.startContainer.parentElement?.scrollIntoView({block: "nearest"})
  }

  private render() {
    if(!this.panel) return
    const active = this.panel.getRootNode() instanceof ShadowRoot ? this.editor.appendix.activeElement : null
    // Retain keyboard focus when a background check refreshes the issue list.
    const focusKey = active?.getAttribute("data-proofreading-control")
    const fragment = document.createDocumentFragment()
    const button = (label: string, action: () => void, key: string) => {
      const element = document.createElement("button")
      element.type = "button"
      element.textContent = label
      element.setAttribute("data-proofreading-control", key)
      element.addEventListener("click", action)
      return element
    }
    const header = document.createElement("header")
    const title = document.createElement("h2")
    title.textContent = "Spelling and grammar"
    header.append(title, button("Close", () => this.close(), "close"))
    fragment.append(header)
    const label = document.createElement("label"), checkbox = document.createElement("input")
    checkbox.type = "checkbox"
    checkbox.checked = this.enabled
    checkbox.setAttribute("data-proofreading-control", "enabled")
    checkbox.addEventListener("change", () => this.setChecking(checkbox.checked))
    label.append(checkbox, " Check as I type")
    fragment.append(label)
    const status = document.createElement("p")
    status.setAttribute("role", "status")
    const runs = proofreadingRuns(getDocumentRoot(), this.editor.schema)
    const issues = this.diagnostics.filter(diagnostic => this.kind === "all" || diagnostic.kind === this.kind)
    status.textContent = !this.enabled ? "Checking is off." : this.error ? this.error : this.loading ? "Loading spelling and grammar checker…" : this.checking ? "Checking…"
      : !runs.length ? "Harper checks English text. Set the document or passage language to English to check it."
      : `${issues.length} ${issues.length === 1 ? "suggestion" : "suggestions"}. English text is checked locally.`
    fragment.append(status)
    if(this.error) fragment.append(button("Retry", () => { void this.checkNow() }, "retry"))
    if(this.kind !== "all") fragment.append(button("Show spelling and grammar", () => { this.kind = "all"; this.render() }, "all"))
    const list = document.createElement("ul")
    for(const diagnostic of issues.slice(0, 50)) {
      const item = document.createElement("li")
      item.append(button(diagnostic.run.text.slice(diagnostic.start, diagnostic.end), () => this.select(diagnostic), `${diagnostic.id}:select`))
      const message = document.createElement("p")
      message.textContent = diagnostic.message
      item.append(message)
      diagnostic.suggestions.slice(0, 5).forEach((suggestion, index) => {
        item.append(button(suggestion.kind === "remove" ? "Remove" : suggestion.kind === "insertAfter" ? `Add “${suggestion.text}”` : suggestion.text,
          () => this.applySuggestion(diagnostic.id, index), `${diagnostic.id}:${index}`))
      })
      item.append(button("Ignore", () => this.ignore(diagnostic.id), `${diagnostic.id}:ignore`))
      list.append(item)
    }
    fragment.append(list)
    if(issues.length > 50) {
      const remainder = document.createElement("p")
      remainder.textContent = "Showing the first 50 suggestions. Resolve these to review the rest."
      fragment.append(remainder)
    }
    this.panel.replaceChildren(fragment)
    if(focusKey) Array.from(this.panel.querySelectorAll<HTMLElement>("[data-proofreading-control]"))
      .find(element => element.getAttribute("data-proofreading-control") === focusKey)?.focus({preventScroll: true})
  }
}
