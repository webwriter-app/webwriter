import {afterEveryRender, afterNextRender, DestroyRef, inject, Injector, signal} from "@angular/core"
import {injectWidgetHost} from "./index.js"

/**
 * A function that resolves when a model change has reached the DOM: after the
 * next render, or when the component is destroyed first. Pass it as the
 * `rendered` option of a core, so that an undo transaction stays open across
 * the render. Call it from an injection context.
 */
export function injectRendered() {
  const injector = inject(Injector)
  const destroyRef = inject(DestroyRef)
  return () => new Promise(resolve => {
    let forget
    try {
      forget = destroyRef.onDestroy(resolve)
      afterNextRender(() => {
        forget()
        resolve()
      }, {injector})
    }
    catch {
      // The component is already gone: nothing will render.
      resolve()
    }
  })
}

/**
 * Binds a core to the widget the component belongs to and returns a signal of
 * its snapshot, with the core as `.core`. Call it from an injection context,
 * for example a field initializer of the component.
 *
 * - The core is created once, with `{...options, root: () => host.shadowRoot}`.
 * - It connects at once (the signal then holds the snapshot after connecting) and disconnects when the component is destroyed. The
 *   adapter keeps the component through a synchronous move of the host.
 * - `refresh()` runs after every render of the application.
 * - `setup(core, host)` runs before `connect()`. It may return a function that runs on destroy.
 */
export function injectModule(Core, options = {}, setup) {
  const host = injectWidgetHost()
  const destroyRef = inject(DestroyRef)
  const core = new Core(host, {...options, root: () => host.shadowRoot})
  const state = signal(core.getSnapshot())
  const unsubscribe = core.subscribe(() => state.set(core.getSnapshot()))
  const teardown = setup?.(core, host)
  core.connect()
  // Connecting may change the state without telling a subscriber, as `playback` does when it reads `steps`.
  state.set(core.getSnapshot())
  afterEveryRender(() => core.refresh())
  destroyRef.onDestroy(() => {
    unsubscribe()
    core.disconnect()
    teardown?.()
  })
  return Object.assign(state.asReadonly(), {core})
}

/**
 * Puts the handlers on the host as methods for the lifetime of the component,
 * for the actions the widget declares in `static actions`: the editor and
 * Shortcuts call `host[name]()`; a handler that returns `false` declines the key.
 * A method the host class defines itself is left alone.
 */
export function injectActions(handlers) {
  const host = injectWidgetHost()
  const defined = []
  for(const [name, handler] of Object.entries(handlers)) {
    if(typeof host[name] === "function") continue
    Object.defineProperty(host, name, {value: (...args) => handler(...args), configurable: true, writable: true})
    defined.push(name)
  }
  inject(DestroyRef).onDestroy(() => {
    for(const name of defined) delete host[name]
  })
}

/**
 * Defines a getter on the host for the lifetime of the component, unless the host class has a member of that name.
 * The accessor that `createAngularWidget` installs for static declarations with function texts is replaced for
 * that time: the getter is expected to include those declarations. Returns the function that removes it.
 */
export function declareOnHost(host, name, get) {
  const own = Object.getOwnPropertyDescriptor(host, name)
  const replaced = own?.get?.declared ? own : undefined
  if(name in host && !replaced) return () => {}
  Object.defineProperty(host, name, {get, configurable: true, enumerable: true})
  return () => {
    if(replaced) Object.defineProperty(host, name, replaced)
    else delete host[name]
  }
}
