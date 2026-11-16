import {ModuleCore, warnOnce, type CoreOptions} from "./base.js"
import type {WidgetHost} from "./index.js"
import {adoptStyles} from "./styles.js"

/** Options of `PermissionsCore`. */
export type PermissionsOptions = CoreOptions & {
  /**
   * How to tell edit mode. Default: the answer of the widget around the host,
   * for a host inside a widget's shadow tree; otherwise `editable` of the
   * host's widget runtime, or its `isContentEditable`. With this option the
   * host answers alone and does not ask a widget around it.
   */
  editing?: () => boolean
  /** The attribute of a permission, where it differs from the editor's rule (see `attributeOf()`). */
  attribute?: (name: string) => string | undefined
}

/** The state of `PermissionsCore`. A new object whenever an answer may have changed. */
export type PermissionsSnapshot = {
  readonly editing: boolean
  /** Names of the declared permissions the author granted. */
  readonly granted: readonly string[]
}

/** The answers of a widget's Permissions: what a `ww-permissionsrequest` provides. `PermissionsCore` is one. */
export type PermissionsSource = {
  /** True in edit mode, and in read mode when the author granted the permission. */
  can(name: string): boolean
  /** True in edit mode. */
  readonly editing: boolean
  /** Calls `listener` when an answer may have changed. Returns the function that unsubscribes. */
  subscribe(listener: () => void): () => void
}

/**
 * Dispatched on an element to get the Permissions that answer for it:
 * `detail.provide(source)` is called by the element's own Permissions, or by
 * those of the widget whose shadow tree the element is in.
 */
export const PERMISSIONS_REQUEST = "ww-permissionsrequest"
/** The event of `PERMISSIONS_REQUEST`. */
export type PermissionsRequest = CustomEvent<{provide(source: PermissionsSource): void}>

type Declarations = Record<string, unknown>
type Declared = {permissions?: unknown}

function isDeclarationMap(value: unknown): value is Declarations {
  if(!value || typeof value !== "object") return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** The widget an element belongs to: the element itself, or the outermost host whose shadow tree it is in. */
function widgetOf(element: Element): HTMLElement {
  let widget = element
  for(let root = widget.getRootNode(); root instanceof ShadowRoot; root = widget.getRootNode()) widget = root.host
  return widget as HTMLElement
}

/**
 * The connected Permissions that answer for an element: its own, or those of
 * the widget whose shadow tree it is in. Undefined if there are none. Use
 * `subscribe()` on the result to follow changes.
 */
export function requestPermissions(element: Element): PermissionsSource | undefined {
  let source: PermissionsSource | undefined
  const detail: PermissionsRequest["detail"] = {provide: provided => (source = provided)}
  element.dispatchEvent(new CustomEvent(PERMISSIONS_REQUEST, {detail, bubbles: true, composed: true}))
  return source
}

/**
 * `can(name)` for a widget or for any element in its shadow tree, without
 * holding its Permissions: the answer of the widget's Permissions if it has
 * them, otherwise the same rule applied to the widget's declaration and
 * attributes. Modules use it for permissions that are named in a declaration.
 */
export function can(host: Element, name: string): boolean {
  return (requestPermissions(host) ?? new PermissionsCore(widgetOf(host))).can(name)
}

/** Edit mode for a widget or for any element in its shadow tree, where `isContentEditable` is false. */
export function isEditing(host: Element): boolean {
  return (requestPermissions(host) ?? new PermissionsCore(widgetOf(host))).editing
}

/**
 * The widget side of the editor's `static permissions`. `can(name)` is true in
 * edit mode, and in read mode while the permission's attribute is on the host.
 * `can("edit")` is true in edit mode only.
 *
 * Shadow elements marked `data-ww-can="name"` are hidden while the answer is
 * no; with `data-ww-can-mode="disable"` they are made inert instead.
 *
 * On a component inside a widget's shadow tree, the mode and every permission
 * the component does not declare itself are those of the widget.
 */
export class PermissionsCore extends ModuleCore<PermissionsSnapshot> implements PermissionsSource {
  #options: PermissionsOptions
  #snapshot: PermissionsSnapshot = {editing: false, granted: []}
  /** The Permissions of the widget around the host, while connected inside one. */
  #widget: PermissionsSource | undefined
  #observer: MutationObserver | null = null
  #observed = ""

  constructor(host: HTMLElement, options: PermissionsOptions = {}) {
    super(host, options)
    this.#options = options
  }

  /**
   * Declared permission names. An instance declaration replaces the static
   * one, as in the editor. `edit` is reserved and never a permission.
   */
  get names(): string[] {
    const names = Object.keys(this.#declarations)
    if(!names.includes("edit")) return names
    warnOnce(this.host.constructor, "permission:edit", `<${this.host.localName}>: "edit" is reserved for author-only controls and cannot be the name of a permission.`)
    return names.filter(name => name !== "edit")
  }

  /**
   * The attribute that grants a permission, by the editor's rule: `attribute`
   * of its declaration, then the attribute of the Lit property of the same
   * name, then the lowercase name. The `attribute` option comes first.
   */
  attributeOf(name: string): string {
    const mapped = this.#options.attribute?.(name)
    if(mapped) return mapped
    const declaration = this.#declarations[name]
    if(isDeclarationMap(declaration) && typeof declaration.attribute === "string") return declaration.attribute
    // Read by name, as the editor does, so that no framework is imported here.
    const properties: unknown = (this.host.constructor as {elementProperties?: unknown}).elementProperties
    const property: unknown = properties instanceof Map ? properties.get(name) : undefined
    const attribute = isDeclarationMap(property) ? property.attribute : undefined
    return typeof attribute === "string" ? attribute : name.toLowerCase()
  }

  /** True in edit mode. */
  get editing(): boolean {
    if(this.#options.editing) return this.#options.editing()
    if(this.#widget) return this.#widget.editing
    return this.#runtime?.editable ?? this.host.isContentEditable
  }

  /**
   * True in edit mode, and in read mode when the author granted the
   * permission. A name that is not declared is refused in read mode, even if
   * an attribute of that name is present.
   */
  can(name: string): boolean {
    if(this.editing) return true
    if(name === "edit") return false
    if(this.names.includes(name)) return this.host.hasAttribute(this.attributeOf(name))
    return this.#widget?.can(name) ?? false
  }

  getSnapshot(): PermissionsSnapshot {
    return this.#snapshot
  }

  protected onConnect() {
    // Asked before this core answers requests itself, so the answer comes from further out.
    this.#widget = this.#options.editing ? undefined : requestPermissions(this.host)
    if(this.#widget) this.cleanup(this.#widget.subscribe(() => this.#update(true)))
    this.listen<PermissionsRequest>(this.host, PERMISSIONS_REQUEST, event => {
      // The target is the host for a request from the host or from its shadow tree. A slotted child is not answered.
      if(event.target !== this.host) return
      event.stopPropagation()
      event.detail.provide(this)
    })
    // `hidden` loses against any `display` rule of the widget or of a component such as sl-button.
    this.cleanup(adoptStyles(this.root, "[data-ww-can][hidden] { display: none !important; }"))
    // Mode and permissions change from outside: the editor, undo, collaborators.
    // The runtime also reports a mode that an ancestor changed.
    const runtime = this.#runtime
    if(runtime) this.cleanup(runtime.subscribe(() => this.#update()))
    this.#observer = new MutationObserver(() => this.#update())
    this.cleanup(() => {
      this.#observer?.disconnect()
      this.#observer = null
      this.#observed = ""
      this.#widget = undefined
    })
    this.#update()
  }

  /** Also picks up what no attribute of the host shows, such as an editable ancestor or a new instance declaration. */
  protected onRefresh() {
    this.#update()
  }

  /** The widget runtime of the host, if it has one: it knows the mode as the widget defines it. */
  get #runtime() {
    return (this.host as Partial<WidgetHost>).widgetRuntime
  }

  get #declarations(): Declarations {
    const host = this.host as HTMLElement & Declared
    const own = host.permissions
    // A member that holds something else, such as a controller, is not a declaration.
    if(isDeclarationMap(own)) return own
    const shared = (host.constructor as Declared).permissions
    return isDeclarationMap(shared) ? shared : {}
  }

  #update(force = false) {
    const names = this.names
    const attributes = ["contenteditable", ...names.map(name => this.attributeOf(name))]
    if(this.#observer && attributes.join() !== this.#observed) {
      this.#observed = attributes.join()
      this.#observer.observe(this.host, {attributeFilter: attributes})
    }
    const editing = this.editing
    const granted = names.filter(name => this.host.hasAttribute(this.attributeOf(name)))
    const before = this.#snapshot
    const changed = force || editing !== before.editing || granted.join() !== before.granted.join()
    if(changed) this.#snapshot = {editing, granted}
    for(const element of this.root.querySelectorAll<HTMLElement>("[data-ww-can]")) {
      const allowed = this.can(element.dataset.wwCan!)
      if(element.dataset.wwCanMode === "disable") {
        if(element.inert === allowed) element.inert = !allowed
      } else if(!!element.hidden === allowed) element.hidden = !allowed
    }
    if(changed) this.notify()
  }
}
