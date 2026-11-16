import type {ActionDeclaration} from "@webwriter/widget"
import type {
  ExerciseActionName,
  ExerciseActions,
  ExerciseCore,
  ExerciseMessages,
  ExerciseOptions,
  ExerciseScore,
  FeedbackMode,
} from "@webwriter/widget/exercise"
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

export type UseExercise<Response, Solution = Response, Score extends ExerciseScore = ExerciseScore> = {
  readonly core: ExerciseCore<Response, Solution, Score>
  readonly internals: ElementInternals
  /** A random number per widget instance, for `firstOrder()`. */
  readonly seed: number
  readonly editing: boolean
  /** The reader cannot change the response. */
  readonly locked: boolean
  readonly mode: FeedbackMode
  /** The score while feedback is shown, otherwise null. */
  readonly result: Score | null
  readonly summary: string
  readonly text: ExerciseMessages
  readonly revealed: boolean
  /** The static actions of the class and the helper's own; also on the host. */
  readonly actions: Record<string, ActionDeclaration> & ExerciseActions
  available(name: ExerciseActionName): boolean
  check(): void
  reset(): void
  showSolution(show?: boolean): void
  respond(response: Response | undefined): void
  answer(value: Response & Solution): void
}

/**
 * The form callbacks of an exercise widget, which the browser reads from the
 * class: `class WwOrder extends exerciseForm(createVueWidget(Order)) {}`.
 */
export function exerciseForm<T extends abstract new (...args: any[]) => HTMLElement>(Base: T): T

/**
 * The Exercise helper. The component hands `check` and `reset` (and
 * `showSolution`) to the host with `defineExpose()`.
 */
export function useExercise<Response, Solution = Response, Score extends ExerciseScore = ExerciseScore>(
  options: Omit<BindingOptions<ExerciseOptions<Response, Solution, Score>>, "actions">,
): UseExercise<Response, Solution, Score>
