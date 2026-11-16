import {onDestroy} from "svelte"
import {resolveDeclarations} from "@webwriter/widget"
import {ExerciseCore} from "@webwriter/widget/exercise"
import {bindCore} from "./bind.js"

export {
  exerciseAggregate,
  exerciseMessages,
  exerciseOptions,
  firstOrder,
  parseWidget,
  scoreOf,
} from "@webwriter/widget/exercise"
export {isObfuscated, obfuscate, obfuscated, reveal} from "@webwriter/widget/obfuscate"

const cores = new WeakMap()
const internals = new WeakMap()

/**
 * The host side of the Exercise helper, added to the class in
 * `customElement.extend`: `extend: Base => class extends withExercise(withWidgetRuntime(Base)) {…}`.
 * It makes the element form-associated, forwards the browser's form callbacks
 * to the bound helper, and has the `check()`, `reset()` and `showSolution()`
 * methods and the instance `actions` (the class's `static actions` and the
 * helper's own, with their availability) that the editor calls and reads.
 * Until a component has bound the helper they do nothing.
 */
export function withExercise(Base) {
  return class WithExercise extends Base {
    static formAssociated = true

    get actions() {
      // A text of a static action may be a function of the widget; the editor gets its answer.
      return {...resolveDeclarations(this, this.constructor.actions), ...cores.get(this)?.actions}
    }

    check() {
      cores.get(this)?.check()
    }

    reset() {
      cores.get(this)?.reset()
    }

    showSolution(show) {
      cores.get(this)?.showSolution(show)
    }

    formResetCallback() {
      cores.get(this)?.formReset()
    }

    formDisabledCallback(disabled) {
      cores.get(this)?.formDisabled(disabled)
    }

    formStateRestoreCallback(state, mode) {
      cores.get(this)?.formStateRestore(state, mode)
    }
  }
}

/**
 * The Exercise helper for the widget:
 *
 *     const exercise = exerciseStore($host(), {
 *       response: () => $data.value.order,
 *       respond: order => data.set({order}),
 *       solution: () => solution,
 *       score: (order, solution) => scoreOf(…),
 *     })
 *
 * `$exercise` has `editing`, `submitted`, `locked`, `mode`, `required`,
 * `checked` and `revealed` and, read when the template evaluates it, `result`,
 * `summary` and `text`, `seed`, `available(name)`. The store also has
 * `check`, `reset`, `showSolution`, `respond` and `answer`; `respond` and
 * `answer` write the response in one undo step. The class needs `withExercise()`.
 */
export function exerciseStore(host, options) {
  if(!host.constructor.formAssociated || typeof host.formResetCallback !== "function") {
    throw new Error(`<${host.localName}>: exerciseStore() needs the element class to be extended with withExercise(Base).`)
  }
  const store = bindCore(host, {internals: internals.get(host), ...options}, options => {
    // `attachInternals()` works once per element, and a component can be created again.
    const core = new ExerciseCore(host, {...options, actions: false})
    internals.set(host, core.internals)
    cores.set(host, core)
    return core
  }, {
    rendered: true,
    methods: ["check", "reset", "showSolution", "respond", "answer", "available"],
    view: (snapshot, core) => ({
      ...snapshot,
      get result() {
        return core.result
      },
      get summary() {
        return core.summary
      },
      get text() {
        return core.text
      },
      get seed() {
        return core.seed
      },
      available: name => core.available(name),
    }),
  })
  onDestroy(() => {
    if(cores.get(host) === store.core) cores.delete(host)
  })
  return store
}
