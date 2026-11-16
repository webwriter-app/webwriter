import { ExerciseCore, type ExerciseActionName, type ExerciseActions, type ExerciseMessages, type ExerciseOptions, type ExerciseScore, type FeedbackMode } from "@webwriter/widget/exercise";
import { type ActionDeclaration } from "@webwriter/widget";
import { CoreController, type BindingOptions, type CoreHost } from "./base.js";
export { exerciseAggregate, exerciseMessages, exerciseOptions, firstOrder, parseWidget, scoreOf, type AggregateItem, type ExerciseAction, type ExerciseActionName, type ExerciseActions, type ExerciseAggregateContext, type ExerciseMessages, type ExerciseOptions, type ExerciseScore, type FeedbackMode, } from "@webwriter/widget/exercise";
export { isObfuscated, obfuscate, obfuscated, reveal } from "@webwriter/widget/obfuscate";
/**
 * The Lit properties behind the attributes the helper reads, for
 * `static properties = {...exerciseProperties, …}`. The helper works without
 * them; they let the drawer show `feedback` and `required`, and they give the
 * widget `this.submitted`.
 */
export declare const exerciseProperties: {
    feedback: {
        type: StringConstructor;
        reflect: boolean;
    };
    required: {
        type: BooleanConstructor;
        reflect: boolean;
    };
    submitted: {
        type: BooleanConstructor;
        reflect: boolean;
    };
};
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
export declare class Exercise<Response, Solution = Response, Score extends ExerciseScore = ExerciseScore> extends CoreController<ExerciseCore<Response, Solution, Score>> {
    constructor(host: CoreHost, options: Omit<BindingOptions<ExerciseOptions<Response, Solution, Score>>, "actions">);
    hostConnected(): void;
    /** The host's `ElementInternals`: `validity`, `checkValidity()`, `form`. */
    get internals(): ElementInternals;
    /** A random number per widget instance, for `firstOrder()`. */
    get seed(): number;
    /** True in edit mode. */
    get editing(): boolean;
    /** The reader cannot change the response: it is submitted, or the form disabled the widget. */
    get locked(): boolean;
    /** The feedback mode: the `feedback` attribute of the host. */
    get mode(): FeedbackMode;
    /** The score while feedback is shown, otherwise null. */
    get result(): Score | null;
    /** The summary of `result` as text. Empty while no feedback is shown. */
    get summary(): string;
    /** The helper's texts in the widget's language, for the widget's own buttons. */
    get text(): ExerciseMessages;
    /** The solution is shown. */
    get revealed(): boolean;
    /** The `actions` declaration of the widget: the static actions of its class and the helper's own. */
    get actions(): Record<string, ActionDeclaration> & ExerciseActions;
    /** Whether an action can run now, for the widget's own buttons. */
    available(name: ExerciseActionName): boolean;
    /** The `check` action. */
    check(): void;
    /** The `reset` action. */
    reset(): void;
    /** The `showSolution` action: shows the solution, or hides it again. */
    showSolution(show?: boolean): void;
    /** Stores a response the reader gave and withdraws a submission, as one undo step. */
    respond(response: Response | undefined): void;
    /** What the reader's interaction produced: the solution in edit mode, the response in read mode. */
    answer(value: Response & Solution): void;
    /** For `formResetCallback()`. */
    formReset(): void;
    /** For `formDisabledCallback(disabled)`. */
    formDisabled(disabled: boolean): void;
    /** For `formStateRestoreCallback(state, mode)`. */
    formStateRestore(state: unknown, mode?: string): void;
}
