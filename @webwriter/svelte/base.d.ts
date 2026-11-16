import type {Action} from "svelte/action"
import type {Readable} from "svelte/store"
import type {ModuleCore, RootSource} from "@webwriter/widget/base"

/** What `coreStore()` gives the function that creates the core. */
export type CoreEnv = {
  /** The widget's shadow root. */
  root: RootSource
  /** Resolves when pending state changes have reached the DOM. Pass it to the cores that take `rendered`. */
  rendered: () => Promise<void>
}

/** What `coreStore()` returns: the core's state as a store, the core and a way to refresh it. */
export type CoreStore<Core extends ModuleCore<any>, Value = ReturnType<Core["getSnapshot"]>> = Readable<Value> & {
  readonly core: Core
  /** Tells the core that the template changed. This happens by itself after every change of the shadow root. */
  refresh(): void
}

export type CoreStoreOptions<Core extends ModuleCore<any>, Value> = {
  /** Default: the host's shadow root. */
  root?: RootSource
  /** The store's value for a snapshot. Default: the snapshot itself. */
  view?: (snapshot: ReturnType<Core["getSnapshot"]>, core: Core) => Value
  /** Refresh after every change of the shadow root. Default: true. With false, call `refresh()` when the template changed. */
  observe?: boolean
}

export function rootOf(host: HTMLElement): ShadowRoot | null

/** Binds any core to the component that is being initialised. Call it in the component's script. */
export function coreStore<Core extends ModuleCore<any>, Value = ReturnType<Core["getSnapshot"]>>(
  host: HTMLElement,
  create: (env: CoreEnv) => Core,
  options?: CoreStoreOptions<Core, Value>,
): CoreStore<Core, Value>

/** Handlers for events by name, for `use:listen`. */
export type ListenHandlers = Record<string, ((event: CustomEvent<any>) => void) | null | undefined>

/** Listens for events on the element, for the `ww-*` events of the modules. */
export const listen: Action<HTMLElement, ListenHandlers>
