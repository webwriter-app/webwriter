import {useEffect, useLayoutEffect, useRef, useSyncExternalStore} from "react"

/**
 * The promise `rendered()` returns: it settles once React has been quiet for
 * two tasks, counted from the call. A commit of the component starts the count
 * again. React renders an update of a native event in a microtask and any
 * other update in a task of its own, so by then the DOM shows the change, and
 * an effect that follows from it has run. A component that has nothing to
 * render is quiet at once. An update in a transition renders later than that.
 */
function untilQuiet(commits) {
  return new Promise(resolve => {
    let quiet = 0
    let hops = 0
    const again = () => {
      quiet = 0
    }
    commits.add(again)
    const {port1, port2} = new MessageChannel()
    port1.onmessage = () => {
      if(++quiet < 2 && ++hops < 100) return port2.postMessage(null)
      commits.delete(again)
      port1.close()
      resolve()
    }
    // Behind the microtask in which React schedules a pending render.
    queueMicrotask(() => port2.postMessage(null))
  })
}

/** Replaces every function option by one that calls the latest function of that name, so that a closure over state is never stale. */
function stable(options, entry) {
  const out = {}
  for(const [key, value] of Object.entries(options ?? {})) {
    out[key] = typeof value === "function"
      ? (...args) => {
        const latest = entry.latest?.[key]
        return typeof latest === "function" ? latest(...args) : latest
      }
      : value
  }
  return out
}

function open(host, create, options, changed) {
  const commits = new Set()
  const entry = {
    host,
    latest: options,
    seen: undefined,
    core: undefined,
    /** Resolves when the component has rendered a model change. */
    rendered: () => untilQuiet(commits),
    commit: () => commits.forEach(again => again()),
    subscribe: listener => entry.core.subscribe(listener),
    // The snapshot a component renders keeps its identity until `changed` says that a template shows the difference.
    getSnapshot: () => {
      const next = entry.core.getSnapshot()
      if(entry.seen === undefined || !changed || changed(next, entry.seen, entry.core)) entry.seen = next
      return entry.seen
    },
  }
  entry.core = create(stable(options, entry), entry.rendered, () => host.shadowRoot)
  return entry
}

/**
 * Binds any core of `@webwriter/widget` to a React component of a widget.
 *
 * - `create(options, rendered, root)` builds the core. Pass `{...options, root}`
 *   and, where the core takes it, `rendered`: a function that returns a promise
 *   that settles after React committed the render a model change causes.
 * - The core is created once per host, so a re-render never builds another one.
 *   Function options are called through to the latest render's functions.
 * - The core is connected after the commit that mounts the component and
 *   disconnected when it unmounts. `refresh()` follows every commit.
 * - The component renders again when the core's snapshot changes. `changed`
 *   may say that a difference does not show in a template (default: always).
 */
export function useCore(host, create, options, changed) {
  const slot = useRef(null)
  if(slot.current?.host !== host) slot.current = open(host, create, options, changed)
  const entry = slot.current
  useLayoutEffect(() => {
    entry.latest = options
  })
  useLayoutEffect(() => {
    entry.core.connect()
    return () => entry.core.disconnect()
  }, [entry])
  useLayoutEffect(() => {
    entry.commit()
    entry.core.refresh()
  })
  // The effects of this commit are part of the render a pending `rendered()` waits for.
  useEffect(() => entry.commit())
  const snapshot = useSyncExternalStore(entry.subscribe, entry.getSnapshot, entry.getSnapshot)
  return {core: entry.core, snapshot}
}

/**
 * Listens for an event on an element, on a ref's element or on the host's
 * shadow root. For the `ww-*` events of the modules, which a JSX prop cannot
 * bind. The latest `handler` is called; the listener is replaced only when the
 * element or the event changes.
 */
export function useEvent(target, type, handler, capture = false) {
  const latest = useRef(handler)
  const bound = useRef(null)
  useLayoutEffect(() => {
    latest.current = handler
  })
  useEffect(() => {
    const element = target && typeof target === "object" && "current" in target ? target.current : target
    const now = bound.current
    if(now && now.element === element && now.type === type && now.capture === capture) return
    now?.abort.abort()
    bound.current = null
    if(!element) return
    const abort = new AbortController()
    element.addEventListener(type, event => latest.current(event), {capture, signal: abort.signal})
    bound.current = {element, type, capture, abort}
  })
  useEffect(() => () => {
    bound.current?.abort.abort()
    bound.current = null
  }, [])
}

/**
 * Makes methods of the host run the given functions. The editor's drawer, the
 * `Shortcuts` keys and the module helpers call an action as a method of the
 * host (`host.toggle()`); a component's functions are made available as such
 * while it is mounted. The latest function of each name is called.
 */
export function useActions(host, handlers) {
  const latest = useRef(handlers)
  useLayoutEffect(() => {
    latest.current = handlers
  })
  const names = Object.keys(handlers ?? {}).join("\n")
  useLayoutEffect(() => {
    const defined = []
    for(const name of names ? names.split("\n") : []) {
      if(Object.hasOwn(host, name)) continue
      Object.defineProperty(host, name, {configurable: true, writable: true, value: (...args) => latest.current?.[name]?.(...args)})
      defined.push(name)
    }
    return () => {
      for(const name of defined) delete host[name]
    }
  }, [host, names])
}

/**
 * Defines getters on the host while the component is mounted, such as the
 * declarations (`options`, `actions`) the editor reads from the instance.
 * `members` maps a name to its getter, which runs on every read. A member the
 * instance already has is left alone, except the accessor that
 * `createReactWidget()` installs for a static declaration with function texts:
 * the getter replaces it while the component is mounted.
 */
export function useHostMembers(host, members) {
  useLayoutEffect(() => {
    const defined = []
    for(const [name, get] of Object.entries(members)) {
      const own = Object.getOwnPropertyDescriptor(host, name)
      if(own && !own.get?.[Symbol.for("@webwriter/react:declared")]) continue
      Object.defineProperty(host, name, {configurable: true, enumerable: true, get})
      defined.push([name, own])
    }
    return () => {
      for(const [name, own] of defined) {
        if(own) Object.defineProperty(host, name, own)
        else delete host[name]
      }
    }
    // The getters read the core's current state; they are defined once per host.
  }, [host])
}

/** Throws for a host that has no widget runtime, with the way to get one. */
export function requireRuntime(host, what) {
  if(!host?.widgetRuntime) throw new TypeError(`${what} needs the widget runtime: the host is not an element of createReactWidget().`)
}
