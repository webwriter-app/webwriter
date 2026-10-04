import {MATH_NAMESPACE, mathRoot, mathRowNames} from "../math"
import {continuesMathCompletion, exactMathCompletion, mathCompletions, type MathCompletion} from "../math-input"

type Pending = {text: string, range: Range, command: boolean}
type InputHost = {
  root: () => Element | null
  command: () => {text: string, range: Range} | null
  apply: (range: Range, command: string) => boolean
  addAppendix: (element: HTMLElement) => void
}
const letters = /^[\p{L}]+$/u
const token = (node: Node | null): node is Element => node instanceof Element
  && node.namespaceURI === MATH_NAMESPACE && node.localName === "mi" && node.childNodes.length === 1
  && node.firstChild instanceof Text && letters.test(node.textContent ?? "")
  // Styled/authored identifiers and functions are already committed words.
  && Array.from(node.attributes).every(attribute => attribute.name === "class" && attribute.value.split(/\s+/).every(name => !name || name.startsWith("◆")))

/** Autocomplete reads the live MathML and caret each time; it owns only UI. */
export class MathCompletionInput {
  private spelling = new WeakMap<Node, string | null>()
  private menu: HTMLDivElement | null = null
  private list: HTMLDivElement | null = null
  private entries: MathCompletion[] = []
  private index = 0
  private query = ""
  private dismissed = false
  private suppressed = false
  private lastPoint: {node: Node, offset: number} | null = null

  constructor(private host: InputHost) {}

  private isSpelling(node: Node | null): node is Element {
    return token(node) && this.spelling.get(node) === node.textContent
  }

  private pending(): Pending | null {
    const root = this.host.root()
    const selection = document.getSelection()
    if(!root || !selection?.isCollapsed || !selection.focusNode) return null
    const command = this.host.command()
    if(command) {
      if(!command.range.startContainer.isConnected || !root.contains(command.range.startContainer)
        || command.range.comparePoint(selection.focusNode, selection.focusOffset) !== 0) return null
      return {...command, command: true}
    }
    let current: Node | null = selection.focusNode
    if(current instanceof Text) {
      if(selection.focusOffset !== current.length) return null
      current = current.parentElement
    }
    else if(current instanceof Element && mathRowNames.has(current.localName)) current = current.childNodes[selection.focusOffset - 1] ?? null
    else if(current instanceof Element && selection.focusOffset !== current.childNodes.length) return null
    if(!this.isSpelling(current)) return null
    const parent = current.parentElement
    if(!parent || !mathRowNames.has(parent.localName) || parent.namespaceURI !== MATH_NAMESPACE) return null
    // Never merge across a comment, unknown node, fixed-arity slot, or function.
    const nodes: Element[] = [current]
    while(this.isSpelling(nodes[0].previousSibling)) nodes.unshift(nodes[0].previousSibling as Element)
    const range = document.createRange()
    range.setStartBefore(nodes[0])
    range.setEndAfter(current)
    return {text: nodes.map(node => node.textContent).join(""), range, command: false}
  }

  /** Virtual keys insert finished symbols, rather than spelling a word. */
  suppress() { this.suppressed = true; this.hide() }

  /** Only letters entered here form an unfinished word; authored tokens remain atomic. */
  recordInput(nodes: Node[]) { nodes.forEach(node => this.spelling.set(node, node.textContent)) }

  commit(preserveSingleVariable = false) {
    const pending = this.pending()
    if(!pending || !pending.text) return false
    const exact = pending.command || [...pending.text].length > 1 ? exactMathCompletion(pending.text) : undefined
    if(pending.command && !exact) return false
    // A single-letter MathML identifier is already a complete variable.
    // Navigation must preserve its node and authored attributes.
    if(preserveSingleVariable && !pending.command && [...pending.text].length === 1) return false
    return this.accept(exact ?? {name: pending.text, label: "Variable", preview: pending.text, command: `identifier:${pending.text}`}, pending)
  }

  beforeInput(text: string): boolean {
    this.suppressed = false
    const pending = this.pending()
    if(!pending || pending.command) return false
    const exact = [...pending.text].length > 1 ? exactMathCompletion(pending.text) : undefined
    if(letters.test(text)) {
      if(exact && !continuesMathCompletion(pending.text + text)) this.accept(exact, pending)
      this.dismissed = false
      return false
    }
    if(text === "(" && !exact) {
      return this.accept({name: pending.text, label: "Function", preview: pending.text, command: `function:${pending.text}`}, pending)
    }
    if(exact) {
      this.accept(exact, pending)
      if(text === "(" && exact.command.startsWith("function:")) return true
    }
    // A space confirms a word, rather than becoming a math spacing token.
    if(text === " ") { if(!exact) this.commit(); this.dismiss(); return true }
    return false
  }

  keydown(key: string): boolean {
    if(!this.menu || this.menu.hidden || !this.entries.length) return false
    const pending = this.pending()
    if(!pending || `${pending.command ? "\\" : " "}${pending.text}` !== this.query) {
      this.hide()
      return false
    }
    if(key === "ArrowDown" || key === "ArrowUp") {
      this.index = (this.index + (key === "ArrowDown" ? 1 : this.entries.length - 1)) % this.entries.length
      this.updateSelection()
      return true
    }
    if(key === "Enter" || key === "Tab" || key === " " && this.pending()?.command) {
      this.accept(this.entries[this.index], pending)
      return true
    }
    if(key === "Escape") { this.dismiss(); return true }
    return false
  }

  private accept(entry: MathCompletion, pending: Pending) {
    // Pointer events and module loading can race collaboration/selection changes.
    const live = this.pending()
    if(!live || live.text !== pending.text || live.command !== pending.command
      || live.range.startContainer !== pending.range.startContainer || live.range.startOffset !== pending.range.startOffset
      || live.range.endContainer !== pending.range.endContainer || live.range.endOffset !== pending.range.endOffset) return false
    const result = this.host.apply(live.range, entry.command)
    this.suppress()
    return result
  }

  private dismiss() { this.dismissed = true; this.hide() }
  private hide() { if(this.menu) this.menu.hidden = true; this.entries = [] }

  refresh(rect?: DOMRect) {
    const pending = this.pending()
    if(!pending) this.spelling = new WeakMap()
    const selection = document.getSelection()
    const query = pending ? `${pending.command ? "\\" : " "}${pending.text}` : ""
    if(query !== this.query || this.lastPoint?.node !== selection?.focusNode || this.lastPoint?.offset !== selection?.focusOffset) {
      if(query !== this.query) this.suppressed = false
      this.index = 0
      this.dismissed = false
      this.query = query
      this.lastPoint = selection?.focusNode ? {node: selection.focusNode, offset: selection.focusOffset} : null
    }
    if(!pending || !pending.text || !rect || this.dismissed || this.suppressed) { this.hide(); return }
    this.entries = mathCompletions(pending.text, pending.command)
    if(!this.entries.length) { this.hide(); return }
    this.index = Math.min(this.index, this.entries.length - 1)
    if(!this.menu) {
      this.menu = document.createElement("div")
      this.menu.className = "◆math-completions"
      this.menu.setAttribute("role", "listbox")
      this.menu.setAttribute("aria-label", "Formula completions")
      this.menu.style.cssText = "position:fixed;z-index:2147483647;box-sizing:border-box;width:290px;overflow:hidden;border:1px solid #b9c5d2;border-radius:6px;background:#fff;color:#26313d;box-shadow:0 3px 12px #0002;font:14px system-ui;pointer-events:auto"
      this.list = document.createElement("div")
      this.list.style.cssText = "display:grid;grid-template-columns:minmax(45px,max-content) minmax(0,1fr) max-content;max-height:inherit;overflow:auto;scrollbar-width:thin"
      this.menu.append(this.list)
      this.host.addAppendix(this.menu)
    }
    this.list!.replaceChildren(...this.entries.map((entry, index) => {
      const option = document.createElement("div")
      option.id = `math-completion-${index}`
      option.setAttribute("role", "option")
      option.setAttribute("aria-label", `${entry.label}: ${entry.name}`)
      option.style.cssText = "display:grid;grid-column:1 / -1;grid-template-columns:subgrid;align-items:center;gap:8px;padding:7px 9px;cursor:pointer"
      const preview = document.createElement("span")
      preview.textContent = entry.preview
      preview.style.cssText = "font:18px math,serif;white-space:nowrap;max-width:100px;overflow:hidden;text-overflow:ellipsis"
      preview.setAttribute("aria-hidden", "true")
      const label = document.createElement("span")
      label.textContent = entry.label
      label.style.cssText = "min-width:0;white-space:normal;overflow-wrap:anywhere"
      const name = document.createElement("span")
      name.textContent = entry.name
      name.style.cssText = "color:#64748b;font:12px ui-monospace,monospace;white-space:nowrap;max-width:85px;overflow:hidden;text-overflow:ellipsis"
      option.append(preview, label, name)
      option.addEventListener("pointerdown", event => { event.preventDefault(); event.stopPropagation(); this.accept(entry, pending) })
      this.menu!.hidden = false
      return option
    }))
    const width = Math.min(290, Math.max(0, innerWidth - 12))
    const height = Math.min(240, Math.max(64, innerHeight - 12))
    const below = innerHeight - rect.bottom - 6
    const above = rect.top - 6
    const useAbove = below < Math.min(height, this.entries.length * 36) && above > below
    const available = Math.max(0, useAbove ? above : below)
    this.menu.style.width = `${width}px`
    this.menu.style.maxHeight = `${Math.min(height, available)}px`
    this.menu.style.left = `${Math.max(6, Math.min(rect.left, innerWidth - width - 6))}px`
    this.menu.style.top = `${Math.max(6, useAbove ? rect.top - Math.min(height, available, this.entries.length * 36) - 6 : rect.bottom + 6)}px`
    this.menu.hidden = available < 32
    this.updateSelection()
  }

  private updateSelection() {
    if(!this.menu || !this.list) return
    for(const [index, option] of Array.from(this.list.children).entries()) {
      option.setAttribute("aria-selected", String(index === this.index))
      ;(option as HTMLElement).style.background = index === this.index ? "#e3efff" : ""
    }
    const active = this.list.children[this.index] as HTMLElement | undefined
    if(active) {
      this.menu.setAttribute("aria-activedescendant", active.id)
      if(active.offsetTop < this.list.scrollTop) this.list.scrollTop = active.offsetTop
      else if(active.offsetTop + active.offsetHeight > this.list.scrollTop + this.list.clientHeight) this.list.scrollTop = active.offsetTop + active.offsetHeight - this.list.clientHeight
    }
  }

  destroy() { this.menu?.remove(); this.menu = null; this.list = null; this.entries = [] }
}
