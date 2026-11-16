const DECLARATION_NAMES = ["permissions", "options", "actions", "data", "localize"];
function isDevelopment() {
  return "litIssuedWarnings" in globalThis || ["localhost", "127.0.0.1", "[::1]"].includes(globalThis.location?.hostname ?? "");
}
const warned = /* @__PURE__ */ new WeakMap();
function warnOnce(owner, key, message) {
  if (!isDevelopment()) return;
  const keys = warned.get(owner) ?? warned.set(owner, /* @__PURE__ */ new Set()).get(owner);
  if (keys.has(key)) return;
  keys.add(key);
  console.warn(message);
}
function warnIfDeclarationName(host, holder) {
  if (!isDevelopment()) return;
  for (const name of DECLARATION_NAMES) {
    let value;
    try {
      value = host[name];
    } catch {
      continue;
    }
    if (value !== holder) continue;
    warnOnce(
      host.constructor,
      `member:${name}`,
      `<${host.localName}>: the public member "${name}" holds a module controller. The editor reads "${name}" as a declaration, so store the controller in a private field (#${name}).`
    );
  }
}
function watchAllowed(host, can, until) {
  const lost = new AbortController();
  const ended = new AbortController();
  const observer = new MutationObserver(() => check());
  const end = () => {
    observer.disconnect();
    ended.abort();
  };
  const check = () => {
    if (ended.signal.aborted) return !lost.signal.aborted;
    if (can()) return true;
    end();
    lost.abort();
    return false;
  };
  if (until?.aborted) end();
  else {
    for (let node = host; node; ) {
      observer.observe(node, { attributes: true });
      const root = node.getRootNode();
      node = root instanceof ShadowRoot ? root.host : null;
    }
    until?.addEventListener("abort", end, { once: true, signal: ended.signal });
    check();
  }
  return { signal: lost.signal, check };
}
class ModuleCore {
  constructor(host, options = {}) {
    this.host = host;
    this.#getRoot = options.root ?? (() => host.shadowRoot);
  }
  #getRoot;
  #scope = null;
  #listeners = /* @__PURE__ */ new Set();
  #watches = /* @__PURE__ */ new Set();
  /** The widget's shadow root. Read it when needed; do not keep it. */
  get root() {
    const root = this.#getRoot();
    if (!root) throw new Error(`${this.constructor.name}: <${this.host.localName}> has no shadow root yet`);
    return root;
  }
  /** True between `connect()` and `disconnect()`. */
  get connected() {
    return this.#scope !== null;
  }
  /** Start working. Safe to call twice. */
  connect() {
    if (this.#scope) return;
    this.#scope = new AbortController();
    warnIfDeclarationName(this.host, this);
    this.onConnect();
  }
  /** Stop working and release everything registered since `connect()`. Safe to call twice. */
  disconnect() {
    const scope = this.#scope;
    if (!scope) return;
    this.#scope = null;
    scope.abort();
  }
  /** Call after the template rendered. Does nothing while disconnected. */
  refresh() {
    if (!this.#scope) return;
    for (const watch of [...this.#watches]) watch.check();
    this.onRefresh();
  }
  /** Calls `listener` after every state change. Returns the function that unsubscribes. */
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  /** Runs once per `connect()`. Register listeners, observers and module elements here. */
  onConnect() {
  }
  /** Runs after every render while connected. Read the template here. */
  onRefresh() {
  }
  /** Aborted on disconnect. Pass it to anything that accepts a signal. */
  get signal() {
    if (!this.#scope) throw new Error(`${this.constructor.name} is not connected`);
    return this.#scope.signal;
  }
  /** `addEventListener` that is removed on disconnect. */
  listen(target, type, listener, options = {}) {
    target.addEventListener(type, listener, { ...options, signal: this.signal });
  }
  /** Runs `fn` on disconnect: observers, timers, animation frames, elements the module added. */
  cleanup(fn) {
    this.signal.addEventListener("abort", fn, { once: true });
  }
  /** Tell subscribers that `getSnapshot()` now returns something new. */
  notify() {
    for (const listener of [...this.#listeners]) listener();
  }
  /**
   * For one interaction that may only run while `can()` is true. The returned
   * signal aborts when the answer turns false: cancel the interaction then.
   * `can()` is asked again when an attribute of the host or of the widget
   * around it changes (see `watchAllowed()`) and on every `refresh()`.
   * Pass `until`, a signal that aborts when the interaction is over; the watch
   * also ends on disconnect.
   */
  whileAllowed(can, until) {
    const over = until ? AbortSignal.any([until, this.signal]) : this.signal;
    const watch = watchAllowed(this.host, can, over);
    if (!over.aborted && !watch.signal.aborted) {
      this.#watches.add(watch);
      const forget = () => this.#watches.delete(watch);
      over.addEventListener("abort", forget, { once: true });
      watch.signal.addEventListener("abort", forget, { once: true });
    }
    return watch.signal;
  }
}
export {
  DECLARATION_NAMES,
  ModuleCore,
  isDevelopment,
  warnIfDeclarationName,
  warnOnce,
  watchAllowed
};
