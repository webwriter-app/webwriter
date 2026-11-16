import {onDestroy, onMount, tick} from "svelte"

/** The shadow root of a Svelte custom element. A closed root is not on `host.shadowRoot`; Svelte keeps it as `$$shadowRoot`. */
export function rootOf(host) {
  return host.shadowRoot ?? host.$$shadowRoot ?? null
}

/** The one view of a snapshot per snapshot, so that a store value keeps its identity until the state changes. */
function memoize(core, view) {
  let snapshot, value
  return () => {
    const current = core.getSnapshot()
    if(current !== snapshot || value === undefined) {
      snapshot = current
      value = view(current, core)
    }
    return value
  }
}

/** One observer per shadow root, shared by every core bound to it: a core's own writes must not make another one refresh. */
const hubs = new WeakMap()

function join(root, core) {
  let hub = hubs.get(root)
  if(!hub) {
    const cores = new Set()
    const refreshAll = () => {
      hub.observer.takeRecords()
      for(const member of [...cores]) member.refresh()
      // What the cores wrote while they refreshed is their own, and no reason to refresh again.
      hub.observer.takeRecords()
    }
    const observer = new MutationObserver(refreshAll)
    observer.observe(root, {subtree: true, childList: true, attributes: true, characterData: true})
    let queued = false
    const queue = () => {
      if(queued) return
      queued = true
      queueMicrotask(() => {
        queued = false
        if(hubs.get(root) === hub) refreshAll()
      })
    }
    hub = {cores, observer, refreshAll, queue, flush: () => hub.observer.takeRecords().length && refreshAll()}
    hubs.set(root, hub)
  }
  hub.cores.add(core)
  return () => {
    hub.cores.delete(core)
    if(hub.cores.size) return
    hub.observer.disconnect()
    hubs.delete(root)
  }
}

/**
 * Binds a core to the Svelte component that is being initialised and returns
 * its state as a store. Call it in the component's script, where `$host()` is
 * allowed:
 *
 *     const drag = coreStore($host(), ({root, rendered}) => new DragCore($host(), {root, rendered}))
 *
 * - The core is created once. It connects while the component is created, so
 *   that the first render already sees its answers, and disconnects when the
 *   component is destroyed.
 * - `refresh()` runs after the component's first render and after every later
 *   change of the shadow root, however Svelte or the widget made it. One
 *   observer serves every core of a widget, and changes the cores make while
 *   they refresh do not start another refresh.
 * - `rendered()` resolves when pending state changes have reached the DOM
 *   (`tick()`), after the cores refreshed, as Lit's `updateComplete` does.
 * - The store's value is `view(snapshot, core)`, the same object until the
 *   core's snapshot changes. `core` and `refresh()` are on the store too.
 */
export function coreStore(host, create, {root = () => rootOf(host), view = snapshot => snapshot, observe = true} = {}) {
  let leave = null
  let hub = null
  const refresh = () => {
    if(hub) hub.refreshAll()
    else core.refresh()
  }
  const rendered = async () => {
    await tick()
    hub?.flush()
  }
  const core = create({root, rendered})
  const read = memoize(core, view)
  core.connect()
  onMount(() => {
    const target = root()
    if(observe && target) leave = join(target, core)
    hub = target && hubs.get(target)
    // Once for all the cores that mount in this flush.
    if(hub) hub.queue()
    else core.refresh()
  })
  onDestroy(() => {
    leave?.()
    leave = hub = null
    core.disconnect()
  })
  return {
    core,
    refresh,
    subscribe(run) {
      let current = read()
      run(current)
      return core.subscribe(() => {
        const next = read()
        if(next === current) return
        current = next
        run(next)
      })
    },
  }
}

/**
 * An action that listens for events on an element, for the `ww-*` events of
 * the modules: `<div use:listen={{"ww-dragcommit": commit}}>`. The handlers
 * may change between renders; a `null` handler listens to nothing.
 */
export function listen(node, handlers) {
  let current = handlers ?? {}
  const stops = new Map()
  const attach = () => {
    for(const type of Object.keys(current)) {
      if(stops.has(type)) continue
      const abort = new AbortController()
      node.addEventListener(type, event => current[type]?.(event), {signal: abort.signal})
      stops.set(type, abort)
    }
  }
  attach()
  return {
    update(next) {
      current = next ?? {}
      attach()
    },
    destroy() {
      for(const abort of stops.values()) abort.abort()
      stops.clear()
    },
  }
}
