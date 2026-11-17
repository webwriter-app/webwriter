import { Signal } from "signal-polyfill";
import type { ReadableSignal } from "./shapes.js";
export * from "./shapes.js";
export { Signal };
/** A writable signal. Keep it private to the widget and publish a `computed` from it. */
export declare const signal: <T>(value: T, options?: Signal.Options<T>) => Signal.State<T>;
/** A read-only signal that follows the signals its function reads. Publish this in `signals`. */
export declare const computed: <T>(compute: () => T, options?: Signal.Options<T>) => Signal.Computed<T>;
/**
 * Call `callback` with the value of a source now and after each change, as a
 * microtask after the change. For a receiver that does not render through Lit.
 * Stops when `lifetime` aborts. A source that is not a signal is read once.
 */
export declare function watchSignal<T>(source: ReadableSignal<T>, callback: (value: T) => void, lifetime?: AbortSignal): void;
