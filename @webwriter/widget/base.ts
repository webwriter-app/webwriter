/** How a core finds the widget's shadow root. Needed for closed roots (Lit: `() => host.renderRoot`). */
export type RootSource = () => ShadowRoot | null | undefined

/** Options every core takes. */
export type CoreOptions = {
  /** Default: `host.shadowRoot`. */
  root?: RootSource
}

// ── Development warnings ──────────────────────────────────────────────────

/** Public members that `LitElementWw` and the editor read as declarations of a widget. */
export const DECLARATION_NAMES = ["permissions", "options", "actions", "data", "localize"] as const

/** True for Lit's development build and for a page served from loopback: the test `@webwriter/lit` uses for its own warnings. */
export function isDevelopment(): boolean {
  return "litIssuedWarnings" in globalThis || ["localhost", "127.0.0.1", "[::1]"].includes(globalThis.location?.hostname ?? "")
}

const warned = new WeakMap<object, Set<string>>()

/** Logs a warning in development, once per `owner` (usually the widget class) and `key`. */
export function warnOnce(owner: object, key: string, message: string): void {
  if(!isDevelopment()) return
  const keys = warned.get(owner) ?? warned.set(owner, new Set()).get(owner)!
  if(keys.has(key)) return
  keys.add(key)
  console.warn(message)
}

/**
 * Warns in development when a public member of the host that is read as a
 * declaration (`DECLARATION_NAMES`) holds `holder`, a core. Such a member
 * silently replaces the declaration. Every core calls this when it connects.
 * A binding stored in such a member is reported by its own base class, as
 * `LitElementWw` does.
 */
export function warnIfDeclarationName(host: HTMLElement, holder: object): void {
  if(!isDevelopment()) return
  for(const name of DECLARATION_NAMES) {
    let value: unknown
    try {
      value = (host as unknown as Record<string, unknown>)[name]
    } catch {
      continue // A getter of the widget failed: nothing to compare.
    }
    if(value !== holder) continue
    warnOnce(
      host.constructor,
      `member:${name}`,
      `<${host.localName}>: the public member "${name}" holds a module controller. The editor reads "${name}" as a declaration, so store the controller in a private field (#${name}).`,
    )
  }
}

// ── Watching an answer during an interaction ──────────────────────────────

/** What `watchAllowed()` returns. */
export type AllowedWatch = {
  /** Aborts when the answer turned false. It never aborts after the watch ended for another reason. */
  readonly signal: AbortSignal
  /** Asks again now. False once the answer was lost. */
  check(): boolean
}

/**
 * Watches `can()` for the length of one interaction, so that the interaction
 * can be cancelled when the answer turns false. `can()` is asked again
 * whenever an attribute of `host`, or of a widget whose shadow tree it is in,
 * changes. That is how the edit mode and a permission change, also by undo
 * or by a collaborator. Call `check()` for conditions no attribute shows.
 * The watch ends when `until` aborts.
 */
export function watchAllowed(host: Element, can: () => boolean, until?: AbortSignal): AllowedWatch {
  const lost = new AbortController()
  const ended = new AbortController()
  const observer = new MutationObserver(() => check())
  const end = () => {
    observer.disconnect()
    ended.abort()
  }
  const check = () => {
    if(ended.signal.aborted) return !lost.signal.aborted
    if(can()) return true
    end()
    lost.abort()
    return false
  }
  if(until?.aborted) end()
  else {
    for(let node: Element | null = host; node; ) {
      observer.observe(node, {attributes: true})
      const root = node.getRootNode()
      node = root instanceof ShadowRoot ? root.host : null
    }
    until?.addEventListener("abort", end, {once: true, signal: ended.signal})
    check()
  }
  return {signal: lost.signal, check}
}

// ── The base class ────────────────────────────────────────────────────────

/**
 * Base class of every module core. A core is a plain class: it takes the host
 * element, is switched on and off with `connect()` / `disconnect()`, is told
 * with `refresh()` that the template rendered, and exposes its state with
 * `getSnapshot()` / `subscribe()`.
 *
 * Subclasses override `onConnect()` and `onRefresh()` and register everything
 * that must end on disconnect through `listen()`, `cleanup()` or `signal`.
 */
export abstract class ModuleCore<Snapshot = unknown> {
  #getRoot: RootSource
  #scope: AbortController | null = null
  #listeners = new Set<() => void>()
  #watches = new Set<AllowedWatch>()

  constructor(
    readonly host: HTMLElement,
    options: CoreOptions = {},
  ) {
    this.#getRoot = options.root ?? (() => host.shadowRoot)
  }

  /** The widget's shadow root. Read it when needed; do not keep it. */
  get root(): ShadowRoot {
    const root = this.#getRoot()
    if(!root) throw new Error(`${this.constructor.name}: <${this.host.localName}> has no shadow root yet`)
    return root
  }

  /** True between `connect()` and `disconnect()`. */
  get connected(): boolean {
    return this.#scope !== null
  }

  /** Start working. Safe to call twice. */
  connect(): void {
    if(this.#scope) return
    this.#scope = new AbortController()
    warnIfDeclarationName(this.host, this)
    this.onConnect()
  }

  /** Stop working and release everything registered since `connect()`. Safe to call twice. */
  disconnect(): void {
    const scope = this.#scope
    if(!scope) return
    this.#scope = null
    scope.abort()
  }

  /** Call after the template rendered. Does nothing while disconnected. */
  refresh(): void {
    if(!this.#scope) return
    // A render is when a widget's own conditions change, so running interactions ask again first.
    for(const watch of [...this.#watches]) watch.check()
    this.onRefresh()
  }

  /** The current state. The same object is returned until the state changes. */
  abstract getSnapshot(): Snapshot

  /** Calls `listener` after every state change. Returns the function that unsubscribes. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** Runs once per `connect()`. Register listeners, observers and module elements here. */
  protected onConnect(): void {}
  /** Runs after every render while connected. Read the template here. */
  protected onRefresh(): void {}

  /** Aborted on disconnect. Pass it to anything that accepts a signal. */
  protected get signal(): AbortSignal {
    if(!this.#scope) throw new Error(`${this.constructor.name} is not connected`)
    return this.#scope.signal
  }

  /** `addEventListener` that is removed on disconnect. */
  protected listen<E extends Event = Event>(target: EventTarget, type: string, listener: (event: E) => void, options: AddEventListenerOptions = {}): void {
    target.addEventListener(type, listener as EventListener, {...options, signal: this.signal})
  }

  /** Runs `fn` on disconnect: observers, timers, animation frames, elements the module added. */
  protected cleanup(fn: () => void): void {
    this.signal.addEventListener("abort", fn, {once: true})
  }

  /** Tell subscribers that `getSnapshot()` now returns something new. */
  protected notify(): void {
    for(const listener of [...this.#listeners]) listener()
  }

  /**
   * For one interaction that may only run while `can()` is true. The returned
   * signal aborts when the answer turns false: cancel the interaction then.
   * `can()` is asked again when an attribute of the host or of the widget
   * around it changes (see `watchAllowed()`) and on every `refresh()`.
   * Pass `until`, a signal that aborts when the interaction is over; the watch
   * also ends on disconnect.
   */
  protected whileAllowed(can: () => boolean, until?: AbortSignal): AbortSignal {
    const over = until ? AbortSignal.any([until, this.signal]) : this.signal
    const watch = watchAllowed(this.host, can, over)
    if(!over.aborted && !watch.signal.aborted) {
      this.#watches.add(watch)
      const forget = () => this.#watches.delete(watch)
      over.addEventListener("abort", forget, {once: true})
      watch.signal.addEventListener("abort", forget, {once: true})
    }
    return watch.signal
  }
}
