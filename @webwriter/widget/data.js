import { ModuleCore, warnOnce } from "./base.js";
import { isEditing } from "./permissions.js";
import { transaction, transactionOpen } from "./transaction.js";
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function sameJson(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((part, index) => sameJson(part, b[index]));
  }
  const [left, right] = [a, b];
  for (const key in left) if (!sameJson(left[key], right[key])) return false;
  for (const key in right) if (right[key] !== void 0 && left[key] === void 0) return false;
  return true;
}
class JsonDataCore extends ModuleCore {
  #options;
  /** The last valid snapshot of the block. Replaced, never changed in place. */
  #base = {};
  /** Keys changed with `set()` that the block does not hold yet. `undefined` removes a key. */
  #pending = null;
  #state;
  /** The block text that was taken in last, so that a snapshot is parsed once. */
  #seen;
  #invalid = false;
  #force = false;
  #timer;
  #queued = false;
  /** A write could not happen yet. It is tried again with the next snapshot. */
  #waiting = false;
  /** True while the runtime writes. It tells its subscribers during the write, and they must not start another one. */
  #writing = false;
  #editing = false;
  constructor(host, options) {
    super(host, options);
    this.#options = options;
    this.#state = { value: { ...options.defaults }, unsaved: false, invalid: false };
  }
  getSnapshot() {
    return this.#state;
  }
  /** The current value. The same object until the value changes. */
  get() {
    return this.#state.value;
  }
  /** Changes some keys. The value changes at once; the block is written later. */
  set(partial, options = {}) {
    const current = this.#state.value;
    const defaults = this.#options.defaults;
    const changes = Object.entries(partial).filter(([key, part]) => !sameJson(part === void 0 ? defaults[key] : part, current[key]));
    if (options.force) this.#force = true;
    else if (changes.length === 0) return;
    this.#pending = { ...this.#pending, ...Object.fromEntries(changes) };
    this.#publish(changes.map(([key]) => key));
    const debounce = this.#options.save?.debounce;
    if (options.force || transactionOpen(this.host)) this.#write();
    else if (debounce !== void 0) {
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => this.#write(), debounce);
    } else if (!this.#queued) {
      this.#queued = true;
      queueMicrotask(() => {
        this.#queued = false;
        this.#write();
      });
    }
  }
  /** Write a pending change now. */
  flush() {
    this.#write();
  }
  onConnect() {
    this.cleanup(this.#runtime.subscribe(() => this.#observe()));
    this.listen(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") this.#write();
    });
    this.cleanup(() => {
      this.#write();
      clearTimeout(this.#timer);
    });
    this.#editing = this.#isEditing();
    this.#observe();
  }
  /** Also picks up what the runtime did not announce, such as a change of mode through an ancestor. */
  onRefresh() {
    this.#observe();
  }
  get #runtime() {
    const runtime = this.#options.runtime ?? this.host.widgetRuntime;
    if (!runtime) throw new Error(`JsonDataCore: <${this.host.localName}> has no widget runtime`);
    return runtime;
  }
  #isEditing() {
    return this.#options.editing ? this.#options.editing() : isEditing(this.host);
  }
  /** The defaults, the block and the pending changes as one value. */
  #merge() {
    const defaults = this.#options.defaults;
    const value = { ...defaults, ...this.#base };
    for (const [key, part] of Object.entries(this.#pending ?? {})) {
      if (part !== void 0) value[key] = part;
      else if (key in defaults) value[key] = defaults[key];
      else delete value[key];
    }
    return value;
  }
  /**
   * Replaces the state and tells the subscribers, if anything changed. `keys`
   * are the top-level keys whose value may differ from the state before; only
   * they are compared. Returns whether the value changed.
   */
  #publish(keys = []) {
    const before = this.#state;
    let value = before.value;
    if (keys.length > 0) {
      const merged = this.#merge();
      if (keys.some((key) => !sameJson(merged[key], before.value[key]))) value = merged;
    }
    const unsaved = this.#pending !== null;
    if (value === before.value && unsaved === before.unsaved && this.#invalid === before.invalid) return false;
    this.#state = { value, unsaved, invalid: this.#invalid };
    this.notify();
    return value !== before.value;
  }
  #observe() {
    if (!this.connected) return;
    const editing = this.#isEditing();
    const left = this.#editing && !editing;
    this.#editing = editing;
    if (left) this.#write();
    this.#read();
    if (this.#waiting && this.#runtime.getSnapshot().dataReady) this.#write();
  }
  /** Take in the block's current text if the scope is ready and the text is new. */
  #read() {
    if (this.#writing) return;
    const { data, dataReady, dataSlot } = this.#runtime.getSnapshot();
    if (!dataReady || data === this.#seen) return;
    this.#seen = data;
    const defaults = this.#options.defaults;
    let parsed;
    try {
      parsed = data?.trim() ? JSON.parse(data) : {};
      if (!isObject(parsed)) throw new TypeError("The data block does not hold a JSON object");
      if (this.#options.validate?.({ ...defaults, ...parsed }) === false) throw new TypeError("The data block failed validation");
    } catch (error) {
      this.#invalid = true;
      this.#publish();
      return this.#report(error, data);
    }
    if (data !== null && dataSlot !== void 0) this.#checkKind(dataSlot);
    this.#invalid = false;
    const before = this.#base;
    const changed = [.../* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(parsed)])].filter((key) => !sameJson(before[key], parsed[key]));
    this.#base = parsed;
    if (this.#publish(changed)) this.#options.changed?.(this.#state.value);
  }
  /** Warns if the widget declared a kind and the block that is there is of the other one: a mistake in the authored markup or in the option. */
  #checkKind(slot) {
    const kind = this.#options.block;
    if (!kind || slot === "data" === (kind === "participant")) return;
    warnOnce(
      this.host.constructor,
      "data:kind",
      kind === "participant" ? `<${this.host.localName}>: the data block has no slot="data", so what a reader enters is saved in the document for everyone. Add slot="data" to the block, or declare block: "document".` : `<${this.host.localName}>: the data block has slot="data", so the host keeps it per participant and does not save it with the document. Remove the slot, or declare block: "participant".`
    );
  }
  #write() {
    if (this.#writing) return;
    clearTimeout(this.#timer);
    this.#timer = void 0;
    this.#waiting = false;
    if (!this.#pending) return;
    const runtime = this.#runtime;
    if (this.host.isConnected && !runtime.getSnapshot().dataReady) return void (this.#waiting = true);
    this.#read();
    if (this.#invalid && !this.#force) {
      warnOnce(
        this.host.constructor,
        "data:held",
        `<${this.host.localName}>: the data block holds something the widget could not read, so its changes are not written. set(…, {force: true}) replaces the block.`
      );
      return void (this.#waiting = true);
    }
    const pending = this.#pending;
    const base = this.#base;
    const differs = Object.keys(pending).some((key) => pending[key] === void 0 ? base[key] !== void 0 : !sameJson(pending[key], base[key]));
    if (differs || this.#force) {
      const next = { ...base };
      for (const [key, part] of Object.entries(pending)) {
        if (part === void 0) delete next[key];
        else next[key] = part;
      }
      const create = runtime.getSnapshot().data === null && (this.#options.block ?? "participant") === "participant";
      this.#writing = true;
      try {
        transaction(this.host, () => runtime.setData("application/json", JSON.stringify(next), create ? { slot: "data" } : void 0));
      } catch (error) {
        this.#writing = false;
        if (error instanceof DOMException && error.name === "InvalidStateError") return void (this.#waiting = true);
        this.#pending = null;
        this.#force = false;
        this.#publish(Object.keys(pending));
        return this.#report(error, JSON.stringify(next));
      }
      this.#writing = false;
      this.#base = next;
      this.#invalid = this.#force = false;
      const written = runtime.getSnapshot();
      this.#seen = written.data;
      if (this.host.isConnected && !written.dataReady) {
        this.#waiting = true;
        return void this.#publish();
      }
    }
    this.#pending = null;
    this.#publish();
  }
  #report(error, text) {
    const detail = { error: error instanceof Error ? error : new Error(String(error)), text };
    this.host.dispatchEvent(new CustomEvent("ww-dataerror", { detail, bubbles: true, composed: true }));
  }
}
const DATA_URL_LIMIT = 100 * 1024;
function toDataURL(blob) {
  if (blob.size > DATA_URL_LIMIT) {
    warnOnce(
      toDataURL,
      "size",
      `toDataURL(): a file of ${Math.round(blob.size / 1024)} KB is kept in the data block. Above ${DATA_URL_LIMIT / 1024} KB every save becomes slow, because the whole block is written and sent again; keep large files outside the block.`
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
function fromDataURL(text) {
  const match = /^data:([^,]*?)(;base64)?,(.*)$/s.exec(text);
  if (!match) throw new TypeError("Not a data URL");
  const [, type, base64, payload] = match;
  const bytes = base64 ? Uint8Array.from(atob(payload), (char) => char.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(payload));
  return new Blob([bytes], { type });
}
export {
  DATA_URL_LIMIT,
  JsonDataCore,
  fromDataURL,
  sameJson,
  toDataURL
};
