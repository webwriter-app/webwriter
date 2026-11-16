/** How a core finds the widget's shadow root. Needed for closed roots (Lit: `() => host.renderRoot`). */
export type RootSource = () => ShadowRoot | null | undefined;
/** Options every core takes. */
export type CoreOptions = {
    /** Default: `host.shadowRoot`. */
    root?: RootSource;
};
/** Public members that `LitElementWw` and the editor read as declarations of a widget. */
export declare const DECLARATION_NAMES: readonly ["permissions", "options", "actions", "data", "localize"];
/** True for Lit's development build and for a page served from loopback: the test `@webwriter/lit` uses for its own warnings. */
export declare function isDevelopment(): boolean;
/** Logs a warning in development, once per `owner` (usually the widget class) and `key`. */
export declare function warnOnce(owner: object, key: string, message: string): void;
/**
 * Warns in development when a public member of the host that is read as a
 * declaration (`DECLARATION_NAMES`) holds `holder`, a core. Such a member
 * silently replaces the declaration. Every core calls this when it connects.
 * A binding stored in such a member is reported by its own base class, as
 * `LitElementWw` does.
 */
export declare function warnIfDeclarationName(host: HTMLElement, holder: object): void;
/** What `watchAllowed()` returns. */
export type AllowedWatch = {
    /** Aborts when the answer turned false. It never aborts after the watch ended for another reason. */
    readonly signal: AbortSignal;
    /** Asks again now. False once the answer was lost. */
    check(): boolean;
};
/**
 * Watches `can()` for the length of one interaction, so that the interaction
 * can be cancelled when the answer turns false. `can()` is asked again
 * whenever an attribute of `host`, or of a widget whose shadow tree it is in,
 * changes. That is how the edit mode and a permission change, also by undo
 * or by a collaborator. Call `check()` for conditions no attribute shows.
 * The watch ends when `until` aborts.
 */
export declare function watchAllowed(host: Element, can: () => boolean, until?: AbortSignal): AllowedWatch;
/**
 * Base class of every module core. A core is a plain class: it takes the host
 * element, is switched on and off with `connect()` / `disconnect()`, is told
 * with `refresh()` that the template rendered, and exposes its state with
 * `getSnapshot()` / `subscribe()`.
 *
 * Subclasses override `onConnect()` and `onRefresh()` and register everything
 * that must end on disconnect through `listen()`, `cleanup()` or `signal`.
 */
export declare abstract class ModuleCore<Snapshot = unknown> {
    #private;
    readonly host: HTMLElement;
    constructor(host: HTMLElement, options?: CoreOptions);
    /** The widget's shadow root. Read it when needed; do not keep it. */
    get root(): ShadowRoot;
    /** True between `connect()` and `disconnect()`. */
    get connected(): boolean;
    /** Start working. Safe to call twice. */
    connect(): void;
    /** Stop working and release everything registered since `connect()`. Safe to call twice. */
    disconnect(): void;
    /** Call after the template rendered. Does nothing while disconnected. */
    refresh(): void;
    /** The current state. The same object is returned until the state changes. */
    abstract getSnapshot(): Snapshot;
    /** Calls `listener` after every state change. Returns the function that unsubscribes. */
    subscribe(listener: () => void): () => void;
    /** Runs once per `connect()`. Register listeners, observers and module elements here. */
    protected onConnect(): void;
    /** Runs after every render while connected. Read the template here. */
    protected onRefresh(): void;
    /** Aborted on disconnect. Pass it to anything that accepts a signal. */
    protected get signal(): AbortSignal;
    /** `addEventListener` that is removed on disconnect. */
    protected listen<E extends Event = Event>(target: EventTarget, type: string, listener: (event: E) => void, options?: AddEventListenerOptions): void;
    /** Runs `fn` on disconnect: observers, timers, animation frames, elements the module added. */
    protected cleanup(fn: () => void): void;
    /** Tell subscribers that `getSnapshot()` now returns something new. */
    protected notify(): void;
    /**
     * For one interaction that may only run while `can()` is true. The returned
     * signal aborts when the answer turns false: cancel the interaction then.
     * `can()` is asked again when an attribute of the host or of the widget
     * around it changes (see `watchAllowed()`) and on every `refresh()`.
     * Pass `until`, a signal that aborts when the interaction is over; the watch
     * also ends on disconnect.
     */
    protected whileAllowed(can: () => boolean, until?: AbortSignal): AbortSignal;
}
