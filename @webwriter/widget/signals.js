import { Signal } from "signal-polyfill";
export * from "./shapes.js";
const signal = (value, options) => new Signal.State(value, options);
const computed = (compute, options) => new Signal.Computed(compute, options);
function watchSignal(source, callback, lifetime) {
  if (lifetime?.aborted) return;
  const read = new Signal.Computed(() => source.get());
  let queued = false;
  const watcher = new Signal.subtle.Watcher(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(update);
  });
  const update = () => {
    queued = false;
    if (lifetime?.aborted) return;
    watcher.watch();
    callback(read.get());
  };
  watcher.watch(read);
  lifetime?.addEventListener("abort", () => watcher.unwatch(read), { once: true });
  callback(read.get());
}
export {
  Signal,
  computed,
  signal,
  watchSignal
};
