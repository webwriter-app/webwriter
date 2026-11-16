import {nextTick, onBeforeUnmount, onMounted, onUpdated, shallowReadonly, shallowRef, useHost} from "vue"

/**
 * Binds any core of `@webwriter/widget` to the widget's Vue component: the
 * core is created once, connected while the component lives, refreshed after
 * every render, and its state is a ref that changes with it.
 */
export function useCore(create, host = useHost()) {
  if(!host?.shadowRoot) throw new TypeError("WebWriter modules need the host of a widget made with createVueWidget()")
  // `nextTick()` resolves once Vue has patched the DOM and run the `onUpdated` hooks.
  const core = create({host, root: () => host.shadowRoot, rendered: () => nextTick()})
  const snapshot = shallowRef(core.getSnapshot())
  const sync = () => { snapshot.value = core.getSnapshot() }
  const unsubscribe = core.subscribe(sync)
  // As a Lit controller does in hostConnected(): the first render already sees the connected core.
  core.connect()
  sync()
  onMounted(() => core.refresh())
  onUpdated(() => core.refresh())
  onBeforeUnmount(() => {
    unsubscribe()
    core.disconnect()
  })
  return {core, snapshot: shallowReadonly(snapshot)}
}
