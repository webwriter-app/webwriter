import {ModuleCore, warnOnce, type CoreOptions} from "./base.js"
import {Messages, type MessagesOption} from "./messages.js"
import {shortcutsMessages, type ShortcutsMessages} from "./messages/shortcuts/index.js"
import type {ActionDeclaration} from "./options.js"
import {can} from "./permissions.js"
import {transaction} from "./transaction.js"

export {shortcutsMessages, type ShortcutsMessages} from "./messages/shortcuts/index.js"

/**
 * The fields of an entry in `static actions` that this module reads:
 * `shortcut` and `can`, which it adds to the editor's action declaration, and
 * the fields of that declaration that decide whether a key may run the action.
 */
export type ShortcutAction = Readonly<Pick<ActionDeclaration, "disabled" | "hidden" | "confirm" | "input">> & {
  /**
   * A key such as `"Delete"`, `"Space"` or `"Mod+D"`, or a list. `Mod` is ⌘ on Apple devices and Ctrl elsewhere.
   * A key that also works while the reader types in a text field is written `{key: "Mod+Enter", inText: true}`.
   */
  readonly shortcut?: ShortcutKey | readonly ShortcutKey[]
  /** The permission that allows the key for a reader. `"edit"` keeps it to authors. */
  readonly can?: string
}

/**
 * One key of an action: the key, or an object that opts the key in to run from text entry.
 * Without `inText` a key typed in a field, a text role or an editable region is the field's.
 */
export type ShortcutKey = string | {readonly key: string; readonly inText?: boolean}

/** Options of `ShortcutsCore`. */
export type ShortcutsOptions = CoreOptions & {
  /** Resolves when the widget has rendered a change. Lit: `() => host.updateComplete`. Keeps the undo step open until then. */
  rendered?: () => Promise<unknown>
  /** Whether `Mod` means ⌘ and keys are shown with Apple's symbols. Default: detected from the platform. */
  apple?: boolean
  /** Other names for the keys that `labelsOf()` shows. */
  messages?: MessagesOption<ShortcutsMessages>
}

/** The state of `ShortcutsCore`. */
export type ShortcutsSnapshot = {
  /** Actions started by a key whose promise has not settled yet. */
  readonly running: readonly string[]
}

type Declared = {actions?: Record<string, ShortcutAction>}

type Entry = {key: string; inText: boolean}

/** The keys of a declaration as `{key, inText}` entries. */
function entriesOf(shortcut: ShortcutAction["shortcut"]): Entry[] {
  if(shortcut === undefined) return []
  return ([shortcut].flat() as ShortcutKey[]).map(entry =>
    typeof entry === "string" ? {key: entry, inText: false} : {key: entry.key, inText: entry.inText === true},
  )
}

/** True on macOS, iOS and iPadOS, where `Mod` is ⌘. */
export function isApple(): boolean {
  const platform = (navigator as Navigator & {userAgentData?: {platform: string}}).userAgentData?.platform ?? navigator.platform
  return /mac|iphone|ipad|ipod/i.test(platform)
}

// ── One shortcut: pure functions ──────────────────────────────────────────

type Combination = {ctrl: boolean; meta: boolean; alt: boolean; shift: boolean; mod: boolean; key: string}

const ALIASES: Readonly<Record<string, string>> = {space: " ", plus: "+"}

/** Reads `"Mod+Shift+D"`. The key is a `KeyboardEvent.key` name; `Space` and `Plus` stand for the characters. */
function parse(shortcut: string): Combination {
  const parts = shortcut.split("+")
  let key = parts.pop()!
  if(key === "" && parts.length) {
    parts.pop() // "Mod++" and "+": the key is the plus sign
    key = "+"
  }
  const mods = new Set(parts.map(part => part.trim().toLowerCase()))
  const name = key.trim() || key // " " is the space bar
  return {
    ctrl: mods.has("ctrl") || mods.has("control"),
    meta: mods.has("meta"),
    alt: mods.has("alt"),
    shift: mods.has("shift"),
    mod: mods.has("mod"),
    key: ALIASES[name.toLowerCase()] ?? name,
  }
}

/** A letter or digit of the Latin keyboard, which has a position of its own (`KeyD`, `Digit1`). */
const isPosition = (key: string) => /^[a-z0-9]$/i.test(key)
/** A letter of another script, as a Cyrillic, Greek or Hebrew layout produces it. */
const isForeignLetter = (key: string) => /^\p{L}$/u.test(key) && !/^\p{Script=Latin}$/u.test(key)

/** How a keydown fits a combination: by the character it produces, by the position of the key, or not at all. */
function match({ctrl, meta, alt, shift, mod, key}: Combination, event: KeyboardEvent, apple: boolean): "key" | "code" | null {
  if(event.ctrlKey !== (ctrl || (mod && !apple))) return null
  if(event.metaKey !== (meta || (mod && apple))) return null
  if(event.altKey !== alt) return null
  // Shift is part of producing a symbol such as "?", so it is only compared for named keys and letters.
  const strict = key.length > 1 || key === " " || /\p{L}/u.test(key) || shift
  if(event.key.toLowerCase() === key.toLowerCase()) return strict && event.shiftKey !== shift ? null : "key"
  // Two cases have no Latin character to compare: a layout of another script, and a combination with Alt, which
  // on a Mac produces a symbol ("∂" for D) or a dead key. The shortcut then means the key at the position the
  // letter or digit has on a Latin keyboard. AltGr produces text and never matches.
  const elsewhere = isForeignLetter(event.key) || (alt && !isPosition(event.key))
  if(!isPosition(key) || !elsewhere || event.shiftKey !== shift || event.getModifierState?.("AltGraph")) return null
  return event.code === (/\d/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`) ? "code" : null
}

/**
 * Whether a keydown is the declared combination. Modifiers must match exactly,
 * and letters ignore case. The character of the key decides
 * (`KeyboardEvent.key`). A shortcut on a letter or a digit also matches the
 * key at its position on a Latin keyboard (`KeyboardEvent.code`) in two
 * cases: the key produces a letter of another script, or the combination has
 * Alt and the key produces no Latin letter or digit, as on a Mac.
 */
export function matchesShortcut(shortcut: string, event: KeyboardEvent, apple = isApple()): boolean {
  return match(parse(shortcut), event, apple) !== null
}

/** Undo, redo and save stay with the editor. */
const RESERVED = ["Mod+Z", "Mod+Shift+Z", "Mod+Y", "Mod+S"].map(parse)

/** Whether a shortcut is one the editor keeps: undo, redo or save, under Ctrl and under ⌘. */
export function isReservedShortcut(shortcut: string): boolean {
  const {ctrl, meta, alt, shift, mod, key} = parse(shortcut)
  if(alt || !(mod || ctrl || meta)) return false
  return RESERVED.some(reserved => reserved.key.toLowerCase() === key.toLowerCase() && reserved.shift === shift)
}

/** True if a key without Ctrl, ⌘ or Alt types something: a character, Space, Enter, Backspace, Delete, Tab or an arrow. Such a key is no good for `inText`. */
function typesText(shortcut: string): boolean {
  const {ctrl, meta, alt, mod, key} = parse(shortcut)
  if(ctrl || meta || alt || mod) return false
  return key.length === 1 || /^(Enter|Backspace|Delete|Tab|Arrow\w+|Home|End|Page\w+)$/i.test(key)
}

const APPLE_SYMBOLS: Readonly<Record<string, string>> = {enter: "↩", escape: "⎋", tab: "⇥", backspace: "⌫", delete: "⌦", home: "↖", end: "↘", pageup: "⇞", pagedown: "⇟"}
const ARROWS: Readonly<Record<string, string>> = {arrowleft: "←", arrowup: "↑", arrowright: "→", arrowdown: "↓"}
const NAMED: Readonly<Record<string, keyof ShortcutsMessages>> = {
  " ": "space",
  enter: "enter",
  escape: "escape",
  tab: "tab",
  backspace: "backspace",
  delete: "delete",
  insert: "insert",
  home: "home",
  end: "end",
  pageup: "pageUp",
  pagedown: "pageDown",
}

/** How `formatShortcut()` shows a shortcut. */
export type ShortcutFormat = {
  /** Apple's symbols (`⇧⌘D`) instead of names joined with a plus (`Ctrl+Shift+D`). Default: detected from the platform. */
  apple?: boolean
  /** The names of the keys. Default: English. */
  names?: ShortcutsMessages
}

/**
 * A shortcut as a person reads it on this platform: `"Mod+Shift+D"` is `⇧⌘D`
 * on Apple devices and `Ctrl+Shift+D` elsewhere. Arrows are shown as arrows.
 */
export function formatShortcut(shortcut: string, format: ShortcutFormat = {}): string {
  const apple = format.apple ?? isApple()
  const names = format.names ?? shortcutsMessages.defaults
  const {ctrl, meta, alt, shift, mod, key} = parse(shortcut)
  const lower = key.toLowerCase()
  const named = NAMED[lower]
  const shown = ARROWS[lower] ?? (apple ? APPLE_SYMBOLS[lower] : undefined) ?? (named ? names[named] : key.length === 1 ? key.toUpperCase() : key)
  if(apple) return `${ctrl ? "⌃" : ""}${alt ? "⌥" : ""}${shift ? "⇧" : ""}${meta || mod ? "⌘" : ""}${shown}`
  const mods = [ctrl || mod ? names.control : "", meta ? names.meta : "", alt ? names.alt : "", shift ? names.shift : ""]
  return [...mods.filter(Boolean), shown].join("+")
}

/** A shortcut in the form of `aria-keyshortcuts`: `"Mod+D"` is `Meta+D` on Apple devices and `Control+D` elsewhere. */
export function ariaShortcut(shortcut: string, apple = isApple()): string {
  const {ctrl, meta, alt, shift, mod, key} = parse(shortcut)
  const name = key === " " ? "Space" : key === "+" ? "Plus" : key.length === 1 ? key.toUpperCase() : key
  const mods = [ctrl || (mod && !apple) ? "Control" : "", alt ? "Alt" : "", shift ? "Shift" : "", meta || (mod && apple) ? "Meta" : ""]
  return [...mods.filter(Boolean), name].join("+")
}

// ── Where a key belongs to something else ─────────────────────────────────

const role = (...names: string[]) => names.map(name => `[role="${name}"]`).join(", ")

const TEXT_ROLES = role("textbox", "searchbox", "combobox", "spinbutton")
const NO_TEXT_INPUT = /^(button|checkbox|color|file|image|radio|range|reset|submit)$/
// Controls that act on Space or Enter themselves. The shortcut must not run a second action on top.
const PRESSABLE = `button, summary, a[href], input, audio[controls], video[controls], ${role("button", "link", "checkbox", "switch", "radio", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "treeitem")}`
// Controls that move with the arrow keys, Home, End and the page keys.
const MOVABLE = `input[type="range"], input[type="radio"], audio[controls], video[controls], ${role(
  "slider",
  "scrollbar",
  "radio",
  "radiogroup",
  "tab",
  "tablist",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "listbox",
  "option",
  "tree",
  "treeitem",
  "grid",
  "gridcell",
  "row",
)}`
// What can take the focus by itself. A component of the widget may take it inside, which cannot be seen from outside.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, iframe, audio[controls], video[controls], [tabindex], [contenteditable]:not([contenteditable="false"])'

function usedByControl(target: Element, event: KeyboardEvent, host: Element): boolean {
  if(target === host || event.ctrlKey || event.metaKey || event.altKey) return false
  if(event.key === " " || event.key === "Enter") return target.matches(PRESSABLE)
  return /^(Arrow|Home$|End$|Page)/.test(event.key) && target.matches(MOVABLE)
}

/**
 * True for a component whose shadow root is closed and that holds the focus
 * inside it: it is the focused element of its tree without being focusable
 * itself. What has the focus in there cannot be seen from outside.
 */
function isOpaque(target: Element, host: Element): boolean {
  if(target === host || !target.localName.includes("-") || target.shadowRoot || target.hasAttribute("tabindex")) return false
  return (target.getRootNode() as Document | ShadowRoot).activeElement === target
}

/**
 * Keys for the entries of `static actions` that have a `shortcut`. A key runs
 * the method of the same name on the host, as the editor's drawer does, as one
 * undo step. It is handled only when the keydown comes from inside the widget,
 * or from anywhere while the widget is fullscreen.
 *
 * A method that returns `false` declines the key: it had nothing to do, such
 * as Escape with nothing to cancel. The key then goes to the next action that
 * declares it, and to the page if none takes it. Any other result, also a
 * promise, takes the key.
 *
 * In the shadow template, `data-ww-shortcut="action"` on a button gives it the
 * `aria-keyshortcuts` of that action. `data-ww-shortcuts="off"` on an element
 * leaves every key inside it alone, for an editor with its own keymap, and
 * `data-ww-shortcuts="on"` on a component with a closed shadow root says that
 * it holds no text entry, so that the keys work while the focus is in it.
 *
 * In development the module warns once if keys are declared and nothing in
 * the widget can take the focus. It looks after the first render that has
 * put something other than styles into the shadow root, never before: a
 * widget that renders its focusable stage later is not reported until it has
 * rendered once. A widget that never calls `refresh()` is checked a frame
 * after it connected.
 */
export class ShortcutsCore extends ModuleCore<ShortcutsSnapshot> {
  #options: ShortcutsOptions
  #messages: Messages<ShortcutsMessages>
  #snapshot: ShortcutsSnapshot = {running: []}
  #apple: boolean
  #checked = false

  constructor(host: HTMLElement, options: ShortcutsOptions = {}) {
    super(host, options)
    this.#options = options
    this.#apple = options.apple ?? isApple()
    this.#messages = new Messages(host, shortcutsMessages, options.messages)
  }

  /** The declared actions. An instance declaration replaces the static one, as in the editor. */
  get actions(): Record<string, ShortcutAction> {
    const host = this.host as HTMLElement & Declared
    return host.actions ?? (host.constructor as Declared).actions ?? {}
  }

  /**
   * The keys that run an action, as declared. Empty for an action that
   * cannot run from a key: one that is disabled, asks for confirmation or
   * takes a file. Keys the editor reserves are left out.
   */
  keysOf(action: string): string[] {
    return this.#entries(action).map(entry => entry.key)
  }

  /** The keys of an action with their `inText` flag. */
  #entries(action: string): Entry[] {
    const declared = this.actions[action]
    if(!declared || declared.disabled === true || declared.confirm || declared.input) return []
    return entriesOf(declared.shortcut).filter(entry => !isReservedShortcut(entry.key))
  }

  /** The keys of an action as a person reads them on this platform and in the widget's language, for a tooltip or a menu. */
  labelsOf(action: string): string[] {
    const names = this.#messages.current
    return this.keysOf(action).map(shortcut => formatShortcut(shortcut, {apple: this.#apple, names}))
  }

  /** The keys of an action as the value of `aria-keyshortcuts`. Empty if it has none. */
  ariaKeysOf(action: string): string {
    return this.keysOf(action)
      .map(shortcut => ariaShortcut(shortcut, this.#apple))
      .join(" ")
  }

  getSnapshot(): ShortcutsSnapshot {
    return this.#snapshot
  }

  protected onConnect() {
    const {host} = this
    // On the host and not on the shadow root: a key pressed on the focused host itself never passes the root.
    this.listen<KeyboardEvent>(host, "keydown", event => this.#key(event))
    // While the widget is fullscreen, focus may sit on the page. Only then, keys are read from the document.
    let fullscreen: AbortController | null = null
    const leave = () => {
      fullscreen?.abort()
      fullscreen = null
    }
    const follow = () => {
      const element = host.ownerDocument.fullscreenElement
      leave()
      if(!element || !(element === host || host.contains(element))) return
      fullscreen = new AbortController()
      host.ownerDocument.addEventListener(
        "keydown",
        event => {
          if(!event.composedPath().includes(host)) this.#key(event)
        },
        {signal: fullscreen.signal},
      )
    }
    this.listen(host, "fullscreenchange", follow)
    follow() // A widget that is connected while it is fullscreen, for example after a move.
    this.cleanup(leave)
    this.cleanup(() => {
      this.#setRunning([])
      this.#checked = false
    })
    // `labelsOf()` answers with other key names: a new snapshot, so that the widget renders them.
    this.cleanup(
      this.#messages.follow(() => {
        this.#snapshot = {...this.#snapshot}
        this.notify()
      }),
    )
    this.#lint()
    if(this.#root?.firstElementChild) this.#template()
    // A widget that never calls `refresh()` is checked once it has had a frame. One that renders is checked by its first render.
    const frame = requestAnimationFrame(() => this.#focus())
    this.cleanup(() => cancelAnimationFrame(frame))
  }

  protected onRefresh() {
    this.#template()
    this.#focus()
  }

  /** The shadow root, or null for a widget without one: the keys work there too. */
  get #root(): ShadowRoot | null {
    try {
      return this.root
    } catch {
      return null
    }
  }

  /** A reserved key is never delivered, whatever is declared. Say so once. */
  #lint() {
    for(const [name, action] of Object.entries(this.actions)) {
      for(const {key, inText} of entriesOf(action.shortcut)) {
        if(isReservedShortcut(key)) {
          warnOnce(
            this.host.constructor,
            `shortcut-reserved:${key}`,
            `<${this.host.localName}>: the shortcut "${key}" of the action "${name}" is reserved for undo, redo and save in the editor and is ignored.`,
          )
        } else if(inText && typesText(key)) {
          warnOnce(
            this.host.constructor,
            `shortcut-in-text:${key}`,
            `<${this.host.localName}>: the shortcut "${key}" of the action "${name}" runs in text fields but types text there. Use a combination with Ctrl, ⌘ or Alt (such as "Mod+Enter"), or Escape or a function key.`,
          )
        }
      }
    }
  }

  /** Brings the marked buttons up to date. */
  #template() {
    const root = this.#root
    if(!root) return
    for(const button of root.querySelectorAll<HTMLElement>("[data-ww-shortcut]")) {
      const keys = this.ariaKeysOf(button.dataset.wwShortcut!)
      if(!keys) button.removeAttribute("aria-keyshortcuts")
      else if(button.getAttribute("aria-keyshortcuts") !== keys) button.setAttribute("aria-keyshortcuts", keys)
    }
  }

  /**
   * Checks, once, that the keys can arrive at all. Never before the widget
   * has rendered something other than styles: a widget that renders its
   * focusable stage later is not reported for the render before it.
   */
  #focus() {
    const {host} = this
    const root = this.#root
    if(!root || this.#checked || !this.connected) return
    // Lit may put `<style>` elements into the root; they say nothing about the template.
    const elements = [...root.querySelectorAll("*")].filter(element => !element.matches("style, link, template, script"))
    if(elements.length === 0) return
    this.#checked = true
    if(!Object.keys(this.actions).some(name => this.keysOf(name).length)) return
    const focusable = host.hasAttribute("tabindex") || elements.some(element => element.matches(FOCUSABLE) || element.localName.includes("-"))
    if(focusable) return
    warnOnce(
      host.constructor,
      "shortcut-focus",
      `<${host.localName}>: shortcuts are declared, but nothing in the widget can take the focus, so the keys never arrive. Give an element in the shadow root tabindex="0", for example the stage.`,
    )
  }

  #key(event: KeyboardEvent) {
    // An input method composes text from several keys; none of them is a shortcut.
    if(event.defaultPrevented || event.isComposing || event.key === "Process") return
    const path = event.composedPath()
    const target = path[0]
    const where = target instanceof Element ? this.#elsewhere(target, path, event) : null
    if(where === "other") return
    // In text entry only a key that opted in runs.
    const textOnly = where === "text"
    const host = this.host as HTMLElement & Record<string, unknown>
    // The character decides before the position, so a layout that has the letter wins over one that has it elsewhere.
    for(const by of ["key", "code"] as const) {
      for(const name of Object.keys(this.actions)) {
        if(!this.#entries(name).some(entry => (!textOnly || entry.inText) && match(parse(entry.key), event, this.#apple) === by)) continue
        const action = this.actions[name]
        const method = host[name]
        if(typeof method !== "function" || (action.can && !can(this.host, action.can))) continue
        // Like the editor: no second run of an action whose promise has not settled. The key stays the action's.
        // An action that declines leaves the key to the next action that has it, and then to the page.
        if(!this.#snapshot.running.includes(name) && this.#run(name, method as () => unknown) === false) continue
        event.preventDefault()
        event.stopPropagation()
        return
      }
    }
  }

  /** Runs the action as one undo step. Returns what the method returned: `false` declines the key. */
  #run(name: string, method: () => unknown): unknown {
    const {rendered} = this.#options
    let value: unknown
    const result = transaction(this.host, () => {
      value = method.call(this.host)
      if(value === false || (!(value instanceof Promise) && !rendered)) return value
      // A reflected property reaches the document only when the widget renders.
      return Promise.resolve(value).then(() => rendered?.())
    })
    if(!(value instanceof Promise)) return value
    this.#setRunning([...this.#snapshot.running, name])
    // finally() and not then(): a rejection stays visible as an unhandled rejection.
    void (result as Promise<unknown>).finally(() => {
      if(this.connected) this.#setRunning(this.#snapshot.running.filter(other => other !== name))
    })
    return value
  }

  #setRunning(running: string[]) {
    if(running.length === 0 && this.#snapshot.running.length === 0) return
    this.#snapshot = {running}
    this.notify()
  }

  /**
   * Where the key belongs when it is not the widget's: `"text"` for text entry, where only a key with `inText` runs,
   * `"other"` for a control that uses the key itself or a region with its own keys, null if it is the widget's.
   */
  #elsewhere(target: Element, path: EventTarget[], event: KeyboardEvent): "text" | "other" | null {
    const end = path.indexOf(this.host)
    // From the target up to the widget, through shadow roots and slots. Empty for a key from the page while fullscreen.
    const inside = path.slice(0, Math.max(end, 0)).filter((node): node is Element => node instanceof Element)
    const marked = inside.find(element => element.hasAttribute("data-ww-shortcuts"))?.getAttribute("data-ww-shortcuts")
    if(marked === "off") return "other"
    if(this.#typing(target, inside)) return "text"
    if(marked !== "on" && isOpaque(target, this.host)) return "other"
    return usedByControl(target, event, this.host) ? "other" : null
  }

  /** True while the key belongs to text entry: a field, or authored text that the author is editing. */
  #typing(target: Element, inside: Element[]): boolean {
    const name = target.localName
    if(name === "textarea" || name === "select" || inside.some(element => element.matches(TEXT_ROLES))) return true
    if(name === "input") return !NO_TEXT_INPUT.test((target as HTMLInputElement).type)
    if(!(target instanceof HTMLElement) || !target.isContentEditable) return false
    // An editable region of the widget's own counts. In edit mode the whole widget is editable,
    // which by itself says nothing…
    if(inside.some(element => element instanceof HTMLElement && element.hasAttribute("contenteditable") && element.contentEditable !== "false")) return true
    // …unless the caret is in the widget's authored content.
    const anchor = this.host.ownerDocument.getSelection()?.anchorNode
    return !!anchor && anchor !== this.host && this.host.contains(anchor)
  }
}
