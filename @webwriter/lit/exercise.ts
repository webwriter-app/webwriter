import {
  ExerciseCore,
  type ExerciseActionName,
  type ExerciseActions,
  type ExerciseMessages,
  type ExerciseOptions,
  type ExerciseScore,
  type FeedbackMode,
} from "@webwriter/widget/exercise"
import {resolveDeclarations, type ActionDeclaration, type Declared} from "@webwriter/widget"
import {warnOnce} from "@webwriter/widget/base"
import {CoreController, type BindingOptions, type CoreHost} from "./base.js"

export {
  exerciseAggregate,
  exerciseMessages,
  exerciseOptions,
  firstOrder,
  parseWidget,
  scoreOf,
  type AggregateItem,
  type ExerciseAction,
  type ExerciseActionName,
  type ExerciseActions,
  type ExerciseAggregateContext,
  type ExerciseMessages,
  type ExerciseOptions,
  type ExerciseScore,
  type FeedbackMode,
} from "@webwriter/widget/exercise"
export {isObfuscated, obfuscate, obfuscated, reveal} from "@webwriter/widget/obfuscate"

/**
 * The Lit properties behind the attributes the helper reads, for
 * `static properties = {...exerciseProperties, …}`. The helper works without
 * them; they let the drawer show `feedback` and `required`, and they give the
 * widget `this.submitted`.
 */
export const exerciseProperties = {
  feedback: {type: String, reflect: true},
  required: {type: Boolean, reflect: true},
  submitted: {type: Boolean, reflect: true},
}

/**
 * Lit binding of the Exercise helper:
 *
 *     static formAssociated = true
 *     #exercise = new Exercise(this, {
 *         response: () => this.#data.get().order,
 *         respond: (order) => this.#data.set({order}),
 *         solution: () => this.solution,
 *         record: (order) => (this.solution = order),
 *         score: (order, solution) => scoreOf(…),
 *     })
 *     check() { this.#exercise.check() }
 *     reset() { this.#exercise.reset() }
 *     formResetCallback() { this.#exercise.formReset() }
 *
 * Read `locked`, `result`, `summary`, `revealed` and `available()` in
 * `render()`; the host re-renders when they change.
 *
 * The widget declares the actions itself, with the getter `LitElementWw`
 * supports. `actions` of the helper holds the static actions of the class
 * and the helper's own, with their current availability:
 *
 *     get actions() { return this.#exercise.actions }
 */
export class Exercise<Response, Solution = Response, Score extends ExerciseScore = ExerciseScore> extends CoreController<ExerciseCore<Response, Solution, Score>> {
  constructor(host: CoreHost, options: Omit<BindingOptions<ExerciseOptions<Response, Solution, Score>>, "actions">) {
    // The core puts an accessor on the instance only for a host that has no other way to declare its actions.
    super(host, root => new ExerciseCore<Response, Solution, Score>(host, {rendered: () => host.updateComplete, ...options, actions: false, root}))
  }

  override hostConnected() {
    super.hostConnected()
    const declared = (this.host as CoreHost & {actions?: Record<string, unknown>}).actions
    if(!declared?.check) {
      warnOnce(
        this.host.constructor,
        "exercise:actions",
        `<${this.host.localName}>: the widget does not declare the actions of its Exercise helper. Add \`get actions() { return this.#exercise.actions }\` to the class.`,
      )
    }
  }

  /** The host's `ElementInternals`: `validity`, `checkValidity()`, `form`. */
  get internals(): ElementInternals {
    return this.core.internals
  }

  /** A random number per widget instance, for `firstOrder()`. */
  get seed(): number {
    return this.core.seed
  }

  /** True in edit mode. */
  get editing(): boolean {
    return this.core.editing
  }

  /** The reader cannot change the response: it is submitted, or the form disabled the widget. */
  get locked(): boolean {
    return this.core.locked
  }

  /** The feedback mode: the `feedback` attribute of the host. */
  get mode(): FeedbackMode {
    return this.core.mode
  }

  /** The score while feedback is shown, otherwise null. */
  get result(): Score | null {
    return this.core.result
  }

  /** The summary of `result` as text. Empty while no feedback is shown. */
  get summary(): string {
    return this.core.summary
  }

  /** The helper's texts in the widget's language, for the widget's own buttons. */
  get text(): ExerciseMessages {
    return this.core.text
  }

  /** The solution is shown. */
  get revealed(): boolean {
    return this.core.revealed
  }

  /** The `actions` declaration of the widget: the static actions of its class and the helper's own. */
  get actions(): Record<string, ActionDeclaration> & ExerciseActions {
    // A widget that defines `get actions()` itself gets no accessor from `LitElementWw`, so texts that are functions are answered here.
    const shared = (this.host.constructor as {actions?: Record<string, Declared<ActionDeclaration>>}).actions
    return {...resolveDeclarations<ActionDeclaration>(this.host, shared), ...this.core.actions}
  }

  /** Whether an action can run now, for the widget's own buttons. */
  available(name: ExerciseActionName): boolean {
    return this.core.available(name)
  }

  /** The `check` action. */
  check(): void {
    this.core.check()
  }

  /** The `reset` action. */
  reset(): void {
    this.core.reset()
  }

  /** The `showSolution` action: shows the solution, or hides it again. */
  showSolution(show?: boolean): void {
    this.core.showSolution(show)
  }

  /** Stores a response the reader gave and withdraws a submission, as one undo step. */
  respond(response: Response | undefined): void {
    this.core.respond(response)
  }

  /** What the reader's interaction produced: the solution in edit mode, the response in read mode. */
  answer(value: Response & Solution): void {
    this.core.answer(value)
  }

  /** For `formResetCallback()`. */
  formReset(): void {
    this.core.formReset()
  }

  /** For `formDisabledCallback(disabled)`. */
  formDisabled(disabled: boolean): void {
    this.core.formDisabled(disabled)
  }

  /** For `formStateRestoreCallback(state, mode)`. */
  formStateRestore(state: unknown, mode?: string): void {
    this.core.formStateRestore(state, mode)
  }
}
