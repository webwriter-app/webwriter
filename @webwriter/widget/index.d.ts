import type { LocalizedText } from "./options";
export type * from "./options";
export * from "./shapes";
/**
 * A text of an editor declaration as a widget writes it: fixed, a map by
 * language, or a function that is asked with the widget, for a text from the
 * widget's own catalog. Type the parameter by what is read:
 * `(widget: {msg: MsgFn}) => widget.msg("Reset")`.
 */
export type DeclaredText = LocalizedText | ((widget: never) => LocalizedText | undefined);
/**
 * A yes/no field of an editor declaration as a widget writes it: fixed, or a
 * function that is asked with the widget, for `hidden`, `disabled` and `readOnly`.
 */
export type DeclaredFlag = boolean | ((widget: never) => boolean | undefined);
type DeclaredFlagKey = "hidden" | "disabled" | "readOnly";
type DeclaredTextKey = "label" | "description" | "placeholder" | "confirm" | "disabledReason";
type DeclaredChoice = {
    value?: string;
    label?: DeclaredText;
    description?: DeclaredText;
    children?: DeclaredChoice[];
};
/** An option, action, option group or permission as a widget declares it: every text may be a function of the widget. */
export type Declared<T> = T extends unknown ? {
    [K in keyof T]: K extends DeclaredTextKey ? DeclaredText | Extract<T[K], undefined> : K extends DeclaredFlagKey ? DeclaredFlag | Extract<T[K], undefined> : K extends "options" ? DeclaredChoice[] | Extract<T[K], undefined> : T[K];
} : never;
/** Whether a declaration map has a text or a `hidden`, `disabled` or `readOnly` flag that is a function, which the editor cannot read. */
export declare function hasComputedDeclarations(declarations: unknown): boolean;
/**
 * The declarations as the editor reads them: every text and every `hidden`,
 * `disabled` and `readOnly` flag that is a function is replaced by its answer
 * for the widget. A flag function that throws counts as `disabled` or `readOnly`, never as `hidden`. A map without such a text is returned as it is.
 */
export declare function resolveDeclarations<T>(widget: Element, declarations: Record<string, Declared<T>> | undefined): Record<string, T> | undefined;
/** Resolve a declared asset to its embedded URL in Offline HTML. */
export declare function assetURL(url: string | URL, owner?: Document): string;
/** Whether a script `type` is an inert data block type, such as `application/json`. WebWriter keeps such `<script>` children of a widget as its data containers. */
export declare function isDataBlockType(type: string): boolean;
export type WidgetDataMode = "individual" | "all" | "group" | "local";
export type WidgetDataContext = {
    block: HTMLScriptElement | null;
    mode: WidgetDataMode;
};
export type WidgetSnapshot = Readonly<{
    editable: boolean;
    lang: string;
    standalone: string | null;
    attributes: Readonly<Record<string, string | null>>;
    data: string | null;
    dataType: string | undefined;
    dataBlock: HTMLScriptElement | null;
    dataSlot: string | null;
    dataMode: WidgetDataMode;
    dataReady: boolean;
    dataError: Error | null;
}>;
type WidgetRuntimeCallbacks = {
    attributes?: () => readonly string[];
    language?: () => string;
    editable?: () => boolean;
    update?: (name?: string, previous?: unknown) => void;
    dataChanged?: (value: string | null, context: WidgetDataContext) => void;
    dataPending?: (context: WidgetDataContext) => void;
    dataError?: (error: Error, context: WidgetDataContext) => void;
};
export declare const widgetRuntimeAttributes: readonly string[];
/** The language of an element as HTML defines it: a shadow tree takes the language of its host. */
export declare function widgetLanguage(host: HTMLElement): string;
/** Observes an authored custom element. Snapshots are read-only views of its DOM. */
export declare class WidgetRuntime {
    #private;
    readonly host: HTMLElement;
    private readonly callbacks;
    constructor(host: HTMLElement, callbacks?: WidgetRuntimeCallbacks);
    get lang(): string;
    get editable(): boolean;
    get standalone(): string | null;
    set standalone(value: string | null);
    /** The same snapshot object is returned until an observed value changes. */
    readonly getSnapshot: () => WidgetSnapshot;
    /** Subscribe to host updates and return an unsubscribe function. */
    readonly subscribe: (listener: () => void) => () => void;
    attributeChanged(name: string, oldValue: string | null, value: string | null): void;
    contextChanged(): void;
    get dataBlock(): HTMLScriptElement | null;
    get data(): string | null;
    set data(value: string | null);
    get dataType(): string | undefined;
    /** False while the current participant scope is loading or unavailable. */
    get dataReady(): boolean;
    /** Updates a data block in place, preserving its identity and attributes.
     * A managed block cannot be written until its current scope is ready. */
    setData(type: string, value: string, attrs?: LocalizedText): void;
    connect(): void;
    disconnect(): void;
}
type Lifecycle = {
    connectedCallback?(): void;
    disconnectedCallback?(): void;
    attributeChangedCallback?(name: string, oldValue: string | null, value: string | null): void;
};
type WidgetElementConstructor = (new (...args: any[]) => HTMLElement & Lifecycle) & {
    observedAttributes?: readonly string[];
};
export type WidgetHost = HTMLElement & {
    readonly widgetRuntime: WidgetRuntime;
};
/** Add the runtime to a custom-element class before registering it. */
export declare function withWidgetRuntime<T extends WidgetElementConstructor>(Base: T): T & {
    new (...args: any[]): WidgetHost & Required<Lifecycle>;
    readonly widgetAttributes: readonly string[];
    readonly observedAttributes: string[];
};
