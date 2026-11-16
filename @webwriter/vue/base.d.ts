import type {ShallowRef} from "vue"
import type {CoreOptions, ModuleCore} from "@webwriter/widget/base"

/** What a binding passes to a core: the host, its shadow root and `rendered`. */
export type CoreContext = {
  host: HTMLElement
  root: () => ShadowRoot
  /** Resolves when Vue has patched the DOM after a model change. */
  rendered: () => Promise<void>
}

/** The options of a core as a composable takes them: without `root`, with an optional `host`. */
export type BindingOptions<Options extends CoreOptions> = Omit<Options, "root"> & {
  /** Default: the host of the current custom element (`useHost()`). Pass it from a child component. */
  host?: HTMLElement
}

/**
 * Binds any core to the component in whose setup it is called: connects it,
 * refreshes it after every render, disconnects it on unmount. `snapshot`
 * is a readonly ref that changes with the core's state.
 */
export function useCore<Core extends ModuleCore<any>>(
  create: (context: CoreContext) => Core,
  host?: HTMLElement,
): {core: Core; snapshot: Readonly<ShallowRef<ReturnType<Core["getSnapshot"]>>>}
