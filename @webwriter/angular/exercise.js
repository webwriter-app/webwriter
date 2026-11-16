import {computed, DestroyRef, inject} from "@angular/core"
import {resolveDeclarations} from "@webwriter/widget"
import {ExerciseCore} from "@webwriter/widget/exercise"
import {declareOnHost, injectModule, injectRendered} from "./base.js"
import {injectWidgetHost} from "./index.js"

export {
  exerciseAggregate,
  exerciseMessages,
  exerciseOptions,
  firstOrder,
  parseWidget,
  scoreOf,
} from "@webwriter/widget/exercise"
export {isObfuscated, obfuscate, obfuscated, reveal} from "@webwriter/widget/obfuscate"

const exercises = new WeakMap()
// `attachInternals()` works once per element, and the component of a host that was disconnected for good is built again.
const internals = new WeakMap()

/**
 * The Exercise binding of a widget, for the callbacks of a form-associated
 * class, which a component cannot add: `formResetCallback() { exerciseOf(this)?.formReset() }`.
 */
export function exerciseOf(host) {
  return exercises.get(host)
}

/**
 * Binds the Exercise helper. The binding declares the widget's `actions` on the
 * host (the class's `static actions` and the helper's own, with their current
 * availability) and gives the host the methods `check()`, `reset()` and
 * `showSolution()` that the editor calls, unless the class defines them.
 * A widget with a form value declares `static formAssociated = true`.
 *
 * The state is read through signals: `locked()`, `result()`, `summary()`,
 * `revealed()`, `checked()`, `mode()`, `editing()`.
 */
export function injectExercise(options) {
  const host = injectWidgetHost()
  const own = options.internals ?? internals.get(host) ?? internals.set(host, host.attachInternals()).get(host)
  const snapshot = injectModule(ExerciseCore, {rendered: injectRendered(), ...options, internals: own, actions: false}, core => {
    const actions = declareOnHost(host, "actions", () => ({...resolveDeclarations(host, host.constructor.actions), ...core.actions}))
    const methods = {check: () => core.check(), reset: () => core.reset(), showSolution: show => core.showSolution(show)}
    const defined = Object.keys(methods).filter(name => typeof host[name] !== "function")
    for(const name of defined) Object.defineProperty(host, name, {value: methods[name], configurable: true, writable: true})
    return () => {
      actions()
      for(const name of defined) delete host[name]
    }
  })
  const {core} = snapshot
  const part = name => computed(() => snapshot()[name])
  const api = {
    core,
    snapshot,
    editing: part("editing"),
    locked: part("locked"),
    mode: part("mode"),
    revealed: part("revealed"),
    checked: part("checked"),
    submitted: part("submitted"),
    result: computed(() => (snapshot(), core.result)),
    summary: computed(() => (snapshot(), core.summary)),
    text: computed(() => (snapshot(), core.text)),
    seed: core.seed,
    internals: core.internals,
    available: name => (snapshot(), core.available(name)),
    check: () => core.check(),
    reset: () => core.reset(),
    showSolution: show => core.showSolution(show),
    respond: response => core.respond(response),
    answer: value => core.answer(value),
    formReset: () => core.formReset(),
    formDisabled: disabled => core.formDisabled(disabled),
    formStateRestore: (state, mode) => core.formStateRestore(state, mode),
  }
  exercises.set(host, api)
  inject(DestroyRef).onDestroy(() => {
    if(exercises.get(host) === api) exercises.delete(host)
  })
  return api
}
