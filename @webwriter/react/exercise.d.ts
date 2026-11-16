import type {ActionDeclaration} from "@webwriter/widget"
import type {ExerciseActionName, ExerciseActions, ExerciseMessages, ExerciseOptions, ExerciseScore, FeedbackMode} from "@webwriter/widget/exercise"
import type {BindingOptions} from "./base.js"

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
 * React binding of the Exercise helper, for a class with
 * `static formAssociated = true`. While mounted, the host has the `check`,
 * `reset` and `showSolution` methods and the `actions` declaration; the form
 * callbacks reach the helper through `createReactWidget()`.
 */
export function useExercise<Response, Solution = Response, Score extends ExerciseScore = ExerciseScore>(
  host: HTMLElement,
  options: Omit<BindingOptions<ExerciseOptions<Response, Solution, Score>>, "actions">,
): {
  readonly internals: ElementInternals
  /** A random number per widget instance, for `firstOrder()`. */
  readonly seed: number
  readonly editing: boolean
  /** The reader cannot change the response: it is submitted, or the form disabled the widget. */
  readonly locked: boolean
  readonly mode: FeedbackMode
  readonly revealed: boolean
  /** The score while feedback is shown, otherwise null. */
  readonly result: Score | null
  readonly summary: string
  readonly text: ExerciseMessages
  readonly actions: Record<string, ActionDeclaration> & ExerciseActions
  available(name: ExerciseActionName): boolean
  check(): void
  reset(): void
  showSolution(show?: boolean): void
  /** Stores a response the reader gave and withdraws a submission, as one undo step. */
  respond(response: Response | undefined): void
  /** The solution in edit mode, the response in read mode. */
  answer(value: Response & Solution): void
}
