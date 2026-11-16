import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { CoreOptions, ModuleCore } from "@webwriter/widget/base";
/** Any Lit element. `renderRoot` is used so that closed shadow roots work too. */
export type CoreHost = ReactiveControllerHost & HTMLElement & {
    renderRoot: HTMLElement | DocumentFragment;
};
/** Removes `root` from a core's options: the binding supplies it. */
export type BindingOptions<Options extends CoreOptions> = Omit<Options, "root">;
/**
 * Binds any core to a Lit host: connects and disconnects it with the host,
 * refreshes it after every render and re-renders the host when the core's
 * state changes. A module's Lit binding is a subclass that forwards the few
 * methods a template needs, and overrides `shouldRender()` if only some
 * changes of the core show in a template.
 */
export declare class CoreController<Core extends ModuleCore<any>> implements ReactiveController {
    #private;
    readonly host: CoreHost;
    readonly core: Core;
    constructor(host: CoreHost, create: (root: () => ShadowRoot) => Core);
    /** The core's current state. */
    get snapshot(): ReturnType<Core["getSnapshot"]>;
    /**
     * Asked after every state change of the core: whether the host renders
     * again. Default: always. Override it to skip changes that no template
     * shows, such as a scroll position the browser applies itself.
     */
    protected shouldRender(): boolean;
    hostConnected(): void;
    hostDisconnected(): void;
    hostUpdated(): void;
}
