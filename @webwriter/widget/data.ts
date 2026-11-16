import {ModuleCore, warnOnce, type CoreOptions} from "./base.js"
import type {WidgetHost, WidgetRuntime, WidgetSnapshot} from "./index.js"
import {isEditing} from "./permissions.js"
import {transaction, transactionOpen} from "./transaction.js"

/**
 * The part of `WidgetRuntime` the helper works on. `host.widgetRuntime` is
 * passed as it is; another source of the block gives these three members.
 */
export type DataRuntime = Pick<WidgetRuntime, "subscribe" | "setData"> & {
  /** `data` is the text of the block, `dataReady` is false while a managed scope loads, `dataSlot` is the block's `slot`. */
  getSnapshot(): Pick<WidgetSnapshot, "data" | "dataReady"> & Partial<Pick<WidgetSnapshot, "dataSlot">>
}

/**
 * What a block holds, which decides how the helper creates it:
 * - `"participant"`: the data of a reader or a session. The block gets
 *   `slot="data"`, so the host keeps it per participant (or per group, or for
 *   everyone, with `shared`).
 * - `"document"`: content of the document that every reader sees, saved with
 *   the document.
 *
 * A block that is already there is used as it is; its kind is never changed.
 */
export type DataBlockKind = "participant" | "document"

/** Options of `JsonDataCore`. */
export type JsonDataOptions<T extends object> = CoreOptions & {
  /** Used for keys the block does not have. Never written to the block. */
  defaults: T
  /** Checks a snapshot from the block, merged over the defaults, before any of it is used. */
  validate?: (value: T) => boolean
  /** With `debounce` (ms) a burst of `set()` calls becomes one write. */
  save?: {debounce?: number}
  /** A snapshot from outside (load, remote change, undo, redo) changed the value. */
  changed?: (value: T) => void
  /** The kind of block the first write creates. Default: `"participant"`. */
  block?: DataBlockKind
  /** Default: `host.widgetRuntime`. */
  runtime?: DataRuntime
  /** How to tell edit mode. Default: `isEditing(host)`. */
  editing?: () => boolean
}

/** Options of `set()`. */
export type SetDataOptions = {
  /**
   * Write although the block holds a snapshot the helper ignored, replacing
   * it with the last valid value plus the changes. Writes at once.
   */
  force?: boolean
}

/** The state of `JsonDataCore`. */
export type JsonDataSnapshot<T> = {
  readonly value: T
  /** A change made with `set()` is not in the block yet. */
  readonly unsaved: boolean
  /** The block holds a snapshot that was ignored. Writes are held back until a valid one arrives or `set()` is forced. */
  readonly invalid: boolean
}

/** `detail` of the `ww-dataerror` event. */
export type DataErrorDetail = {error: Error; text: string | null}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Whether two JSON values are equal, whatever the order of their keys. A key
 * with the value `undefined` counts as absent, as it is in JSON text. Stops at
 * the first difference and builds nothing.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  if(a === b) return true
  if(typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if(Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((part, index) => sameJson(part, b[index]))
  }
  const [left, right] = [a as Json, b as Json]
  for(const key in left) if(!sameJson(left[key], right[key])) return false
  for(const key in right) if(right[key] !== undefined && left[key] === undefined) return false
  return true
}

/**
 * Typed access to the widget's JSON data block.
 *
 * - `get()` returns the defaults, overlaid with the last valid snapshot of the
 *   block, overlaid with changes that are not written yet. Keys the widget does
 *   not know are kept and written back. Values are JSON values.
 * - `set(partial)` changes the value at once and writes later: once per task,
 *   or after `save.debounce` ms. Inside an open undo transaction of the host it
 *   writes immediately, so that the write belongs to that undo step. A key set
 *   to `undefined` is removed from the block. Only the keys passed are compared
 *   with the current value, so the cost does not grow with the rest of the value.
 * - Invalid snapshots have one rule. A snapshot that is not a JSON object or
 *   fails `validate` is ignored as a whole and reported with a `ww-dataerror`
 *   event (`detail: {error, text}`). The value stays what it was, or the
 *   defaults if there was none. While the block holds such a snapshot, writes
 *   are held back, so that the widget does not replace data it did not
 *   understand: `set()` still changes the value, and it is written once a valid
 *   snapshot arrives or when `set(partial, {force: true})` replaces the block.
 * - A snapshot that arrives while a change waits to be written (during a
 *   debounce or a pending scope) replaces what the helper knows of the block.
 *   Top-level keys the widget changed since keep the widget's value and are
 *   written when the wait ends; every other key takes the snapshot's value.
 *   The wait is not restarted.
 * - `changed` runs only when a snapshot from outside really changes the value,
 *   so the echo of the helper's own write is not reported.
 * - Without a block the defaults apply and the first write creates one, of the
 *   kind named by `block`. A participant block the helper created is only
 *   settled by the host: the change stays unsaved until the scope is ready and
 *   is written again if the delivered snapshot lacks it.
 */
export class JsonDataCore<T extends object> extends ModuleCore<JsonDataSnapshot<T>> {
  #options: JsonDataOptions<T>
  /** The last valid snapshot of the block. Replaced, never changed in place. */
  #base: Json = {}
  /** Keys changed with `set()` that the block does not hold yet. `undefined` removes a key. */
  #pending: Json | null = null
  #state: JsonDataSnapshot<T>
  /** The block text that was taken in last, so that a snapshot is parsed once. */
  #seen: string | null | undefined
  #invalid = false
  #force = false
  #timer: ReturnType<typeof setTimeout> | undefined
  #queued = false
  /** A write could not happen yet. It is tried again with the next snapshot. */
  #waiting = false
  /** True while the runtime writes. It tells its subscribers during the write, and they must not start another one. */
  #writing = false
  #editing = false

  constructor(host: HTMLElement, options: JsonDataOptions<T>) {
    super(host, options)
    this.#options = options
    this.#state = {value: {...options.defaults}, unsaved: false, invalid: false}
  }

  getSnapshot(): JsonDataSnapshot<T> {
    return this.#state
  }

  /** The current value. The same object until the value changes. */
  get(): T {
    return this.#state.value
  }

  /** Changes some keys. The value changes at once; the block is written later. */
  set(partial: Partial<T>, options: SetDataOptions = {}): void {
    const current = this.#state.value as Json
    const defaults = this.#options.defaults as Json
    const changes = Object.entries(partial as Json).filter(([key, part]) => !sameJson(part === undefined ? defaults[key] : part, current[key]))
    if(options.force) this.#force = true
    else if(changes.length === 0) return
    this.#pending = {...this.#pending, ...Object.fromEntries(changes)}
    this.#publish(changes.map(([key]) => key))
    const debounce = this.#options.save?.debounce
    if(options.force || transactionOpen(this.host)) this.#write()
    else if(debounce !== undefined) {
      clearTimeout(this.#timer)
      this.#timer = setTimeout(() => this.#write(), debounce)
    } else if(!this.#queued) {
      this.#queued = true
      queueMicrotask(() => {
        this.#queued = false
        this.#write()
      })
    }
  }

  /** Write a pending change now. */
  flush(): void {
    this.#write()
  }

  protected onConnect() {
    this.cleanup(this.#runtime.subscribe(() => this.#observe()))
    this.listen(document, "visibilitychange", () => {
      if(document.visibilityState === "hidden") this.#write()
    })
    this.cleanup(() => {
      this.#write()
      clearTimeout(this.#timer)
    })
    this.#editing = this.#isEditing()
    this.#observe()
  }

  /** Also picks up what the runtime did not announce, such as a change of mode through an ancestor. */
  protected onRefresh() {
    this.#observe()
  }

  get #runtime(): DataRuntime {
    const runtime = this.#options.runtime ?? (this.host as Partial<WidgetHost>).widgetRuntime
    if(!runtime) throw new Error(`JsonDataCore: <${this.host.localName}> has no widget runtime`)
    return runtime
  }

  #isEditing() {
    return this.#options.editing ? this.#options.editing() : isEditing(this.host)
  }

  /** The defaults, the block and the pending changes as one value. */
  #merge(): T {
    const defaults = this.#options.defaults as Json
    const value: Json = {...defaults, ...this.#base}
    for(const [key, part] of Object.entries(this.#pending ?? {})) {
      if(part !== undefined) value[key] = part
      else if(key in defaults) value[key] = defaults[key]
      else delete value[key]
    }
    return value as T
  }

  /**
   * Replaces the state and tells the subscribers, if anything changed. `keys`
   * are the top-level keys whose value may differ from the state before; only
   * they are compared. Returns whether the value changed.
   */
  #publish(keys: readonly string[] = []): boolean {
    const before = this.#state
    let value = before.value
    if(keys.length > 0) {
      const merged = this.#merge()
      if(keys.some(key => !sameJson((merged as Json)[key], (before.value as Json)[key]))) value = merged
    }
    const unsaved = this.#pending !== null
    if(value === before.value && unsaved === before.unsaved && this.#invalid === before.invalid) return false
    this.#state = {value, unsaved, invalid: this.#invalid}
    this.notify()
    return value !== before.value
  }

  #observe() {
    if(!this.connected) return
    const editing = this.#isEditing()
    const left = this.#editing && !editing
    // Set first: the runtime tells its subscribers during a write, which leads back here.
    this.#editing = editing
    if(left) this.#write()
    this.#read()
    if(this.#waiting && this.#runtime.getSnapshot().dataReady) this.#write()
  }

  /** Take in the block's current text if the scope is ready and the text is new. */
  #read() {
    // The runtime tells its subscribers during a write. That text is the core's own: #write() notes it.
    if(this.#writing) return
    const {data, dataReady, dataSlot} = this.#runtime.getSnapshot()
    if(!dataReady || data === this.#seen) return
    this.#seen = data
    const defaults = this.#options.defaults as Json
    let parsed: unknown
    try {
      parsed = data?.trim() ? JSON.parse(data) : {}
      if(!isObject(parsed)) throw new TypeError("The data block does not hold a JSON object")
      if(this.#options.validate?.({...defaults, ...parsed} as T) === false) throw new TypeError("The data block failed validation")
    } catch(error) {
      this.#invalid = true
      this.#publish()
      return this.#report(error, data)
    }
    if(data !== null && dataSlot !== undefined) this.#checkKind(dataSlot)
    this.#invalid = false
    const before = this.#base
    // Empty for the echo of the helper's own write and for the same value serialised in another way.
    const changed = [...new Set([...Object.keys(before), ...Object.keys(parsed)])].filter(key => !sameJson(before[key], parsed[key]))
    this.#base = parsed
    if(this.#publish(changed)) this.#options.changed?.(this.#state.value)
  }

  /** Warns if the widget declared a kind and the block that is there is of the other one: a mistake in the authored markup or in the option. */
  #checkKind(slot: string | null) {
    const kind = this.#options.block
    if(!kind || (slot === "data") === (kind === "participant")) return
    warnOnce(
      this.host.constructor,
      "data:kind",
      kind === "participant"
        ? `<${this.host.localName}>: the data block has no slot="data", so what a reader enters is saved in the document for everyone. Add slot="data" to the block, or declare block: "document".`
        : `<${this.host.localName}>: the data block has slot="data", so the host keeps it per participant and does not save it with the document. Remove the slot, or declare block: "participant".`,
    )
  }

  #write() {
    if(this.#writing) return
    clearTimeout(this.#timer)
    this.#timer = undefined
    this.#waiting = false
    if(!this.#pending) return
    const runtime = this.#runtime
    // The scope is pending: keep the change and write it when the scope is ready.
    if(this.host.isConnected && !runtime.getSnapshot().dataReady) return void (this.#waiting = true)
    // A snapshot that arrived since the change must not be overwritten.
    this.#read()
    if(this.#invalid && !this.#force) {
      warnOnce(
        this.host.constructor,
        "data:held",
        `<${this.host.localName}>: the data block holds something the widget could not read, so its changes are not written. set(…, {force: true}) replaces the block.`,
      )
      return void (this.#waiting = true)
    }
    const pending = this.#pending
    const base = this.#base
    const differs = Object.keys(pending).some(key => (pending[key] === undefined ? base[key] !== undefined : !sameJson(pending[key], base[key])))
    if(differs || this.#force) {
      const next: Json = {...base}
      for(const [key, part] of Object.entries(pending)) {
        if(part === undefined) delete next[key]
        else next[key] = part
      }
      const create = runtime.getSnapshot().data === null && (this.#options.block ?? "participant") === "participant"
      this.#writing = true
      try {
        transaction(this.host, () => runtime.setData("application/json", JSON.stringify(next), create ? {slot: "data"} : undefined))
      } catch(error) {
        this.#writing = false
        // A disconnected widget cannot write to a managed scope: try again after the reconnect.
        if(error instanceof DOMException && error.name === "InvalidStateError") return void (this.#waiting = true)
        this.#pending = null
        this.#force = false
        this.#publish(Object.keys(pending))
        return this.#report(error, JSON.stringify(next))
      }
      this.#writing = false
      this.#base = next
      this.#invalid = this.#force = false
      const written = runtime.getSnapshot()
      // The runtime may store the text in another form, for example with "<" escaped.
      this.#seen = written.data
      // A participant block that was just created belongs to the host from now on. Until its
      // scope is ready the change stays pending, and it is written again if the scope lacks it.
      if(this.host.isConnected && !written.dataReady) {
        this.#waiting = true
        return void this.#publish()
      }
    }
    this.#pending = null
    this.#publish()
  }

  #report(error: unknown, text: string | null) {
    const detail: DataErrorDetail = {error: error instanceof Error ? error : new Error(String(error)), text}
    this.host.dispatchEvent(new CustomEvent("ww-dataerror", {detail, bubbles: true, composed: true}))
  }
}

/**
 * Size guidance for a file kept in the JSON, in bytes of the file. A data URL
 * is a third larger than the file, the whole block is written again with every
 * save, and with shared data every write goes to every participant. Keep a
 * file below this, and keep larger files outside the block, for example as an
 * attachment of the document that the block refers to by URL.
 */
export const DATA_URL_LIMIT = 100 * 1024

/**
 * A small file as text for the JSON, for example `{image: await toDataURL(file)}`.
 * Warns in development for a file above `DATA_URL_LIMIT`.
 */
export function toDataURL(blob: Blob): Promise<string> {
  if(blob.size > DATA_URL_LIMIT) {
    warnOnce(
      toDataURL,
      "size",
      `toDataURL(): a file of ${Math.round(blob.size / 1024)} KB is kept in the data block. Above ${DATA_URL_LIMIT / 1024} KB every save becomes slow, because the whole block is written and sent again; keep large files outside the block.`,
    )
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** The file of a data URL made with `toDataURL()`. Decoded here, so no `fetch()` and no CSP rule is needed. */
export function fromDataURL(text: string): Blob {
  const match = /^data:([^,]*?)(;base64)?,(.*)$/s.exec(text)
  if(!match) throw new TypeError("Not a data URL")
  const [, type, base64, payload] = match
  const bytes = base64 ? Uint8Array.from(atob(payload), char => char.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(payload))
  return new Blob([bytes], {type})
}
