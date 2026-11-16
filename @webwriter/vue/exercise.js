import {nextTick, onBeforeUnmount, onMounted, proxyRefs} from "vue"
import {warnOnce} from "@webwriter/widget/base"
import {resolveDeclarations} from "@webwriter/widget"
import {ExerciseCore} from "@webwriter/widget/exercise"
import {useCore} from "./base.js"

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

/**
 * The form callbacks of an exercise widget. The browser reads them from the
 * class: `class WwOrder extends exerciseForm(createVueWidget(Order)) {}`.
 */
export function exerciseForm(Base) {
  return class extends Base {
    static formAssociated = true
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

export function useExercise({host, ...options}) {
  const {core, snapshot} = useCore(
    ({host, root, rendered}) => new ExerciseCore(host, {rendered, ...options, actions: false, root}),
    host,
  )
  const element = core.host
  cores.set(element, core)
  // The editor reads the declaration from the host: the class's static actions and the helper's own.
  const declared = {get: () => ({...resolveDeclarations(element, element.constructor.actions), ...core.actions}), configurable: true}
  Object.defineProperty(element, "actions", declared)
  onMounted(() => nextTick(() => {
    // A component's methods reach the host through defineExpose(), which Vue applies after the first mount.
    if(typeof element.check !== "function" || typeof element.reset !== "function") {
      warnOnce(element.constructor, "exercise:methods", `<${element.localName}>: the host has no check() and reset(). Add defineExpose({check: exercise.check, reset: exercise.reset}) to the component.`)
    }
  }))
  onBeforeUnmount(() => {
    if(cores.get(element) === core) cores.delete(element)
    if(Object.getOwnPropertyDescriptor(element, "actions")?.get === declared.get) delete element.actions
  })
  // The core's answers change with its snapshot: reading it in a render subscribes the component.
  const live = name => (void snapshot.value, core[name])
  return proxyRefs({
    core,
    internals: core.internals,
    seed: core.seed,
    get editing() {
      return live("editing")
    },
    get locked() {
      return live("locked")
    },
    get mode() {
      return live("mode")
    },
    get result() {
      return live("result")
    },
    get summary() {
      return live("summary")
    },
    get text() {
      return live("text")
    },
    get revealed() {
      return live("revealed")
    },
    get actions() {
      return live("actions")
    },
    available: name => (void snapshot.value, core.available(name)),
    check: () => core.check(),
    reset: () => core.reset(),
    showSolution: show => core.showSolution(show),
    respond: response => core.respond(response),
    answer: value => core.answer(value),
  })
}
