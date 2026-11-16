import {coreStore} from "./base.js"

/**
 * Binds a core and puts bound copies of some of its methods on the store.
 * `make` receives the module's options with `root` and, for a module that
 * keeps an undo step open until the widget rendered, `rendered`.
 */
export function bindCore(host, options, make, {view, methods = [], rendered = false} = {}) {
  const store = coreStore(host, env => make({...(rendered && {rendered: env.rendered}), ...options, root: env.root}), {root: options.root, view})
  for(const name of methods) store[name] = (...args) => store.core[name](...args)
  return store
}
