import type {Signal} from "@angular/core"
import type {WidgetHost} from "@webwriter/widget"
import type {CoreOptions, ModuleCore} from "@webwriter/widget/base"

/** The snapshot type of a core. */
export type ModuleSnapshot<Core> = Core extends ModuleCore<infer Snapshot> ? Snapshot : never

/** A signal of a core's snapshot, with the core as `core`. */
export type ModuleRef<Core extends ModuleCore<any>> = Signal<ModuleSnapshot<Core>> & {readonly core: Core}

/** Removes `root` from a core's options: the binding supplies it. */
export type BindingOptions<Options extends CoreOptions> = Omit<Options, "root">

/** A function that resolves after the next render of the application, or when the component is destroyed. */
export function injectRendered(): () => Promise<void>

/** Binds any core to the widget of the component and returns a signal of its snapshot. Call it in an injection context. */
export function injectModule<Core extends ModuleCore<any>, Options extends CoreOptions>(
  Core: new (host: HTMLElement, options: Options) => Core,
  options?: BindingOptions<Options>,
  setup?: (core: Core, host: WidgetHost) => void | (() => void),
): ModuleRef<Core>

/** Puts methods on the host for the lifetime of the component, for the actions of `static actions`. */
export function injectActions(handlers: Record<string, (...args: any[]) => unknown>): void

/** Defines a getter on the host unless it has that member. The accessor that `createAngularWidget` installs for declarations with function texts is replaced meanwhile and put back. Returns the function that removes it. */
export function declareOnHost(host: object, name: string, get: () => unknown): () => void
