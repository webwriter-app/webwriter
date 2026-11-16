import {useLayoutEffect, useMemo} from "react"
import {ExerciseCore} from "@webwriter/widget/exercise"
import {useCore, useHostMembers} from "./base.js"
import {formCallbacks} from "./form.js"

export {
  exerciseAggregate,
  exerciseMessages,
  exerciseOptions,
  firstOrder,
  parseWidget,
  scoreOf,
} from "@webwriter/widget/exercise"
export {isObfuscated, obfuscate, obfuscated, reveal} from "@webwriter/widget/obfuscate"

const internals = new WeakMap()

/** `ElementInternals` can be attached once per element, and a React tree may be built again for the same host. */
function internalsOf(host) {
  let found = internals.get(host)
  if(!found) internals.set(host, found = host.attachInternals())
  return found
}

/**
 * React binding of the Exercise helper. The class is
 * `class extends createReactWidget(Order) {static formAssociated = true}`.
 *
 *     const exercise = useExercise(host, {response, respond, solution, record, score})
 *
 * The host gets the `check`, `reset` and `showSolution` methods and the
 * `actions` declaration (`static actions` of the class and the helper's own)
 * while the component is mounted. The platform's form callbacks reach the
 * helper through `createReactWidget()`.
 */
export function useExercise(host, options) {
  const {core, snapshot} = useCore(
    host,
    (o, rendered) => new ExerciseCore(host, {rendered, internals: internalsOf(host), ...o, actions: false}),
    options,
  )
  useHostMembers(host, {
    actions: () => ({...host.constructor.actions, ...core.actions}),
  })
  useLayoutEffect(() => {
    for(const name of ["check", "reset", "showSolution"]) {
      if(Object.hasOwn(host, name)) continue
      Object.defineProperty(host, name, {configurable: true, writable: true, value: (...args) => core[name](...args)})
    }
    formCallbacks.set(host, {reset: () => core.formReset(), disabled: (d) => core.formDisabled(d), restore: (s, m) => core.formStateRestore(s, m)})
    return () => {
      for(const name of ["check", "reset", "showSolution"]) delete host[name]
      formCallbacks.delete(host)
    }
  }, [host, core])
  return useMemo(() => ({
    internals: core.internals,
    seed: core.seed,
    editing: snapshot.editing,
    locked: snapshot.locked,
    mode: snapshot.mode,
    revealed: snapshot.revealed,
    result: core.result,
    summary: core.summary,
    text: core.text,
    actions: core.actions,
    available: (name) => core.available(name),
    check: () => core.check(),
    reset: () => core.reset(),
    showSolution: (show) => core.showSolution(show),
    respond: (response) => core.respond(response),
    answer: (value) => core.answer(value),
  }), [core, snapshot])
}
