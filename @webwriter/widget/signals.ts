import {Signal} from "signal-polyfill"
import type {ReadableSignal} from "./shapes"

export * from "./shapes"
export {Signal}

/** A writable signal. Keep it private to the widget and publish a `computed` from it. */
export const signal = <T>(value: T, options?: Signal.Options<T>) => new Signal.State<T>(value, options)
/** A read-only signal that follows the signals its function reads. Publish this in `signals`. */
export const computed = <T>(compute: () => T, options?: Signal.Options<T>) => new Signal.Computed<T>(compute, options)

/**
 * Call `callback` with the value of a source now and after each change, as a
 * microtask after the change. For a receiver that does not render through Lit.
 * Stops when `lifetime` aborts. A source that is not a signal is read once.
 */
export function watchSignal<T>(source: ReadableSignal<T>, callback: (value: T) => void, lifetime?: AbortSignal): void {
  if(lifetime?.aborted) return
  const read = new Signal.Computed(() => source.get())
  let queued = false
  const watcher = new Signal.subtle.Watcher(() => {
    if(queued) return
    queued = true
    queueMicrotask(update)
  })
  const update = () => {
    queued = false
    if(lifetime?.aborted) return
    watcher.watch()
    callback(read.get())
  }
  watcher.watch(read)
  lifetime?.addEventListener("abort", () => watcher.unwatch(read), {once: true})
  callback(read.get())
}
