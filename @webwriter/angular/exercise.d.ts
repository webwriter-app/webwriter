import type {Signal} from "@angular/core"
import type {ActionDeclaration, WidgetHost} from "@webwriter/widget"
import type {
  ExerciseActionName,
  ExerciseActions,
  ExerciseCore,
  ExerciseMessages,
  ExerciseOptions,
  ExerciseScore,
  FeedbackMode,
} from "@webwriter/widget/exercise"
import type {BindingOptions, ModuleRef} from "./base.js"

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

export type ExerciseBinding<Response, Solution = Response, Score extends ExerciseScore = ExerciseScore> = {
  readonly core: ExerciseCore<Response, Solution, Score>
  readonly snapshot: ModuleRef<ExerciseCore<Response, Solution, Score>>
  /** True in edit mode. */
  readonly editing: Signal<boolean>
  /** The reader cannot change the response: it is submitted, or the form disabled the widget. */
  readonly locked: Signal<boolean>
  readonly mode: Signal<FeedbackMode>
  /** The solution is shown. */
  readonly revealed: Signal<boolean>
  /** The reader asked for feedback with Check and has not changed the response since. */
  readonly checked: Signal<boolean>
  readonly submitted: Signal<boolean>
  /** The score while feedback is shown, otherwise null. */
  readonly result: Signal<Score | null>
  /** The summary of `result` as text. Empty while no feedback is shown. */
  readonly summary: Signal<string>
  /** The helper's texts in the widget's language. */
  readonly text: Signal<ExerciseMessages>
  /** A random number per widget instance, for `firstOrder()`. */
  readonly seed: number
  /** The host's `ElementInternals`. */
  readonly internals: ElementInternals
  /** Whether an action can run now. Reactive. */
  available(name: ExerciseActionName): boolean
  check(): void
  reset(): void
  showSolution(show?: boolean): void
  /** Stores a response the reader gave and withdraws a submission, as one undo step. */
  respond(response: Response | undefined): void
  /** The solution in edit mode, the response in read mode. */
  answer(value: Response & Solution): void
  formReset(): void
  formDisabled(disabled: boolean): void
  formStateRestore(state: unknown, mode?: string): void
}

/**
 * Binds the Exercise helper. The host gets the `actions` declaration and the
 * methods `check()`, `reset()` and `showSolution()`, unless the class has them.
 */
export function injectExercise<Response, Solution = Response, Score extends ExerciseScore = ExerciseScore>(
  options: Omit<BindingOptions<ExerciseOptions<Response, Solution, Score>>, "actions">,
): ExerciseBinding<Response, Solution, Score>

/** The binding of a widget, for `formResetCallback()` and the other callbacks of a form-associated class. */
export function exerciseOf(host: WidgetHost): ExerciseBinding<any, any, any> | undefined
