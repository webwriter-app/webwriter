import type {ActionDeclaration} from "@webwriter/widget"
import type {ExerciseActionName, ExerciseActions, ExerciseCore, ExerciseMessages, ExerciseOptions, ExerciseScore, ExerciseSnapshot} from "@webwriter/widget/exercise"
import type {CoreStore} from "./base.js"

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
  type ExerciseSnapshot,
  type FeedbackMode,
} from "@webwriter/widget/exercise"
export {isObfuscated, obfuscate, obfuscated, reveal} from "@webwriter/widget/obfuscate"

type Constructor<T = object> = new (...args: any[]) => T

/** What `withExercise()` adds to the element: the methods and the declaration the editor uses. */
export type ExerciseHost = {
  /** The class's `static actions` and the helper's own, with their availability. */
  readonly actions: Record<string, ActionDeclaration> & Partial<ExerciseActions>
  check(): void
  reset(): void
  showSolution(show?: boolean): void
}

/** Makes the element form-associated and forwards the form callbacks, `check`, `reset`, `showSolution` and `actions` to the bound helper. */
export function withExercise<Base extends Constructor<HTMLElement>>(Base: Base): Base & Constructor<ExerciseHost> & {formAssociated: true}

/** The value of the store: the snapshot, and what the template reads from the core when it evaluates it. */
export type ExerciseView<Score extends ExerciseScore = ExerciseScore> = ExerciseSnapshot & {
  /** The score while feedback is shown, otherwise null. */
  readonly result: Score | null
  /** The summary of `result` as text. Empty while no feedback is shown. */
  readonly summary: string
  /** The helper's texts in the widget's language. */
  readonly text: ExerciseMessages
  /** A random number per widget instance, for `firstOrder()`. */
  readonly seed: number
  available(name: ExerciseActionName): boolean
}

export type ExerciseStore<Response, Solution = Response, Score extends ExerciseScore = ExerciseScore> =
  CoreStore<ExerciseCore<Response, Solution, Score>, ExerciseView<Score>>
  & Pick<ExerciseCore<Response, Solution, Score>, "check" | "reset" | "showSolution" | "respond" | "answer" | "available">

/** The Exercise helper. The element class needs `withExercise()`. */
export function exerciseStore<Response, Solution = Response, Score extends ExerciseScore = ExerciseScore>(
  host: HTMLElement,
  options: Omit<ExerciseOptions<Response, Solution, Score>, "actions" | "root"> & {root?: ExerciseOptions<Response, Solution, Score>["root"]},
): ExerciseStore<Response, Solution, Score>
