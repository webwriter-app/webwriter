import {hasComputedDeclarations, resolveDeclarations} from "@webwriter/widget"

export * from "@webwriter/widget"

/**
 * Lets the static `options`, `actions`, `permissions` and `optionGroups` of a
 * widget have texts that are functions of the widget, for a text from the
 * widget's own catalog, in `customElement.extend`:
 *
 *     extend: Base => withDeclarations(withWidgetRuntime(Base))
 *
 * The editor reads plain maps. A static declaration with such a text is
 * therefore answered on the instance, with the functions asked. A member the
 * class defines itself (`withSettings()` does for `options`, `withExercise()`
 * for `actions`) is left alone, and a later write replaces the accessor.
 */
export function withDeclarations(Base) {
  return class WithDeclarations extends Base {
    constructor(...args) {
      super(...args)
      const declared = this.constructor
      for(const kind of ["options", "actions", "permissions", "optionGroups"]) {
        if(kind in this || !hasComputedDeclarations(declared[kind])) continue
        Object.defineProperty(this, kind, {
          configurable: true,
          get: () => resolveDeclarations(this, declared[kind]),
          set: value => Object.defineProperty(this, kind, {value, writable: true, configurable: true, enumerable: true}),
        })
      }
    }
  }
}

/** Read the widget's DOM-backed snapshot via Svelte's store contract. */
export function widgetStore(host) {
  const {getSnapshot, subscribe} = host.widgetRuntime
  return {
    subscribe(run) {
      let snapshot = getSnapshot()
      run(snapshot)
      return subscribe(() => {
        const next = getSnapshot()
        if(next === snapshot) return
        snapshot = next
        run(next)
      })
    },
  }
}
