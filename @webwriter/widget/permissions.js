import { ModuleCore, warnOnce } from "./base.js";
import { adoptStyles } from "./styles.js";
const PERMISSIONS_REQUEST = "ww-permissionsrequest";
function isDeclarationMap(value) {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function widgetOf(element) {
  let widget = element;
  for (let root = widget.getRootNode(); root instanceof ShadowRoot; root = widget.getRootNode()) widget = root.host;
  return widget;
}
function requestPermissions(element) {
  let source;
  const detail = { provide: (provided) => source = provided };
  element.dispatchEvent(new CustomEvent(PERMISSIONS_REQUEST, { detail, bubbles: true, composed: true }));
  return source;
}
function can(host, name) {
  return (requestPermissions(host) ?? new PermissionsCore(widgetOf(host))).can(name);
}
function isEditing(host) {
  return (requestPermissions(host) ?? new PermissionsCore(widgetOf(host))).editing;
}
class PermissionsCore extends ModuleCore {
  #options;
  #snapshot = { editing: false, granted: [] };
  /** The Permissions of the widget around the host, while connected inside one. */
  #widget;
  #observer = null;
  #observed = "";
  constructor(host, options = {}) {
    super(host, options);
    this.#options = options;
  }
  /**
   * Declared permission names. An instance declaration replaces the static
   * one, as in the editor. `edit` is reserved and never a permission.
   */
  get names() {
    const names = Object.keys(this.#declarations);
    if (!names.includes("edit")) return names;
    warnOnce(this.host.constructor, "permission:edit", `<${this.host.localName}>: "edit" is reserved for author-only controls and cannot be the name of a permission.`);
    return names.filter((name) => name !== "edit");
  }
  /**
   * The attribute that grants a permission, by the editor's rule: `attribute`
   * of its declaration, then the attribute of the Lit property of the same
   * name, then the lowercase name. The `attribute` option comes first.
   */
  attributeOf(name) {
    const mapped = this.#options.attribute?.(name);
    if (mapped) return mapped;
    const declaration = this.#declarations[name];
    if (isDeclarationMap(declaration) && typeof declaration.attribute === "string") return declaration.attribute;
    const properties = this.host.constructor.elementProperties;
    const property = properties instanceof Map ? properties.get(name) : void 0;
    const attribute = isDeclarationMap(property) ? property.attribute : void 0;
    return typeof attribute === "string" ? attribute : name.toLowerCase();
  }
  /** True in edit mode. */
  get editing() {
    if (this.#options.editing) return this.#options.editing();
    if (this.#widget) return this.#widget.editing;
    return this.#runtime?.editable ?? this.host.isContentEditable;
  }
  /**
   * True in edit mode, and in read mode when the author granted the
   * permission. A name that is not declared is refused in read mode, even if
   * an attribute of that name is present.
   */
  can(name) {
    if (this.editing) return true;
    if (name === "edit") return false;
    if (this.names.includes(name)) return this.host.hasAttribute(this.attributeOf(name));
    return this.#widget?.can(name) ?? false;
  }
  getSnapshot() {
    return this.#snapshot;
  }
  onConnect() {
    this.#widget = this.#options.editing ? void 0 : requestPermissions(this.host);
    if (this.#widget) this.cleanup(this.#widget.subscribe(() => this.#update(true)));
    this.listen(this.host, PERMISSIONS_REQUEST, (event) => {
      if (event.target !== this.host) return;
      event.stopPropagation();
      event.detail.provide(this);
    });
    this.cleanup(adoptStyles(this.root, "[data-ww-can][hidden] { display: none !important; }"));
    const runtime = this.#runtime;
    if (runtime) this.cleanup(runtime.subscribe(() => this.#update()));
    this.#observer = new MutationObserver(() => this.#update());
    this.cleanup(() => {
      this.#observer?.disconnect();
      this.#observer = null;
      this.#observed = "";
      this.#widget = void 0;
    });
    this.#update();
  }
  /** Also picks up what no attribute of the host shows, such as an editable ancestor or a new instance declaration. */
  onRefresh() {
    this.#update();
  }
  /** The widget runtime of the host, if it has one: it knows the mode as the widget defines it. */
  get #runtime() {
    return this.host.widgetRuntime;
  }
  get #declarations() {
    const host = this.host;
    const own = host.permissions;
    if (isDeclarationMap(own)) return own;
    const shared = host.constructor.permissions;
    return isDeclarationMap(shared) ? shared : {};
  }
  #update(force = false) {
    const names = this.names;
    const attributes = ["contenteditable", ...names.map((name) => this.attributeOf(name))];
    if (this.#observer && attributes.join() !== this.#observed) {
      this.#observed = attributes.join();
      this.#observer.observe(this.host, { attributeFilter: attributes });
    }
    const editing = this.editing;
    const granted = names.filter((name) => this.host.hasAttribute(this.attributeOf(name)));
    const before = this.#snapshot;
    const changed = force || editing !== before.editing || granted.join() !== before.granted.join();
    if (changed) this.#snapshot = { editing, granted };
    for (const element of this.root.querySelectorAll("[data-ww-can]")) {
      const allowed = this.can(element.dataset.wwCan);
      if (element.dataset.wwCanMode === "disable") {
        if (element.inert === allowed) element.inert = !allowed;
      } else if (!!element.hidden === allowed) element.hidden = !allowed;
    }
    if (changed) this.notify();
  }
}
export {
  PERMISSIONS_REQUEST,
  PermissionsCore,
  can,
  isEditing,
  requestPermissions
};
