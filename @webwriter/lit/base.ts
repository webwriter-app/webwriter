import type {ReactiveController, ReactiveControllerHost} from "lit"
import type {CoreOptions, ModuleCore} from "@webwriter/widget/base"

/** Any Lit element. `renderRoot` is used so that closed shadow roots work too. */
export type CoreHost = ReactiveControllerHost & HTMLElement & {renderRoot: HTMLElement | DocumentFragment}

/** Removes `root` from a core's options: the binding supplies it. */
export type BindingOptions<Options extends CoreOptions> = Omit<Options, "root">

/**
 * Binds any core to a Lit host: connects and disconnects it with the host,
 * refreshes it after every render and re-renders the host when the core's
 * state changes. A module's Lit binding is a subclass that forwards the few
 * methods a template needs, and overrides `shouldRender()` if only some
 * changes of the core show in a template.
 */
export class CoreController<Core extends ModuleCore<any>> implements ReactiveController {
  readonly core: Core
  #unsubscribe: (() => void) | null = null

  constructor(
    readonly host: CoreHost,
    create: (root: () => ShadowRoot) => Core,
  ) {
    this.core = create(() => host.renderRoot as ShadowRoot)
    host.addController(this)
  }

  /** The core's current state. */
  get snapshot(): ReturnType<Core["getSnapshot"]> {
    return this.core.getSnapshot()
  }

  /**
   * Asked after every state change of the core: whether the host renders
   * again. Default: always. Override it to skip changes that no template
   * shows, such as a scroll position the browser applies itself.
   */
  protected shouldRender(): boolean {
    return true
  }

  hostConnected() {
    this.#unsubscribe ??= this.core.subscribe(() => {
      if(this.shouldRender()) this.host.requestUpdate()
    })
    this.core.connect()
  }

  hostDisconnected() {
    this.#unsubscribe?.()
    this.#unsubscribe = null
    this.core.disconnect()
  }

  hostUpdated() {
    this.core.refresh()
  }
}
