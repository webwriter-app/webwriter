import type { LocalizedText } from "./options";
/** A table value: named columns and rows of cells. */
export type Table = {
    columns: string[];
    rows: (string | number | null)[][];
};
/** A series value: numbers in order, such as a measurement history. */
export type Series = number[];
/** The standard value shapes of published signals, by name. */
export interface SignalShapes {
    number: number;
    string: string;
    boolean: boolean;
    series: Series;
    table: Table;
}
/** The name of a value shape. A package may use its own name for a value that no standard shape fits. */
export type SignalShape = keyof SignalShapes | (string & {});
/** The value of a signal of this shape. Unknown for a package's own shape. */
export type SignalValue<S extends SignalShape> = S extends keyof SignalShapes ? SignalShapes[S] : unknown;
/** A signal as a receiver reads it. The editor connects any object with `get()`. A source reads current state, so `get()` has no side effect. */
export interface ReadableSignal<T = unknown> {
    get(): T;
}
/** What a widget says about a signal it publishes, in `static signals` under the signal's name. */
export interface SignalDeclaration<S extends SignalShape = SignalShape> {
    /** The shape of the value. Receivers that list `accepts` connect only to signals that declare one of those shapes. */
    shape?: S;
    label?: LocalizedText;
    /** Say here when the value is not stored in the document, for example a history that exists only since the widget loaded. */
    description?: LocalizedText;
}
/** What a widget says about an effect attribute it can receive, in `static effects` under the attribute's name. */
export interface EffectDeclaration {
    label?: LocalizedText;
    description?: LocalizedText;
    /** The shapes this effect can read. The editor lists and connects only sources that declare one of them. Without `accepts`, every signal is accepted. */
    accepts?: readonly SignalShape[];
    /** Called with the receiving widget as `this`. Clear the source when `lifetime` aborts. */
    connect(this: any, source: ReadableSignal<any>, lifetime: AbortSignal): void;
}
export declare const isNumber: (value: unknown) => value is number;
export declare const isString: (value: unknown) => value is string;
export declare const isBoolean: (value: unknown) => value is boolean;
/** An array of finite numbers. */
export declare const isSeries: (value: unknown) => value is Series;
/** An object with a `columns` array of strings and a `rows` array of arrays whose cells are strings, finite numbers or null. Rows may be shorter or longer than the columns. */
export declare const isTable: (value: unknown) => value is Table;
/** Whether a value has a standard shape. A shape that is not a standard one has no guard here, so the answer is false. */
export declare function hasShape<S extends SignalShape>(shape: S, value: unknown): value is SignalValue<S>;
/** Whether an effect with these declared `accepts` reads a signal of this declared shape. The editor applies the same rule. */
export declare function effectAccepts(effect: Pick<EffectDeclaration, "accepts">, shape: SignalShape | undefined): boolean;
