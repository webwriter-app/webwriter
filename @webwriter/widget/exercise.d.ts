import { ModuleCore, type CoreOptions } from "./base.js";
import { type MessagesOption } from "./messages.js";
import { type ExerciseMessages } from "./messages/exercise/index.js";
import type { ActionDeclaration, LocalizedText } from "./options.js";
export { exerciseMessages, type ExerciseMessages } from "./messages/exercise/index.js";
/** How a reader gets feedback: with the Check action, or only once the response is submitted. */
export type FeedbackMode = "check" | "submit";
/**
 * The drawer options every exercise has, for `static options`:
 * `static options = {...exerciseOptions, …}`. `feedback` is stored in the
 * `feedback` attribute (`"submit"`, otherwise Check) and `required` in the
 * `required` attribute; the helper reads both from the host. The labels are
 * read when the editor asks for them, with the catalogs that have arrived.
 */
export declare const exerciseOptions: {
    feedback: {
        type: "select";
        readonly label: LocalizedText;
        options: {
            value: string;
            readonly label: LocalizedText;
        }[];
    };
    required: {
        type: BooleanConstructor;
        readonly label: LocalizedText;
    };
};
/** An entry of the `actions` declaration the helper builds. */
export type ExerciseAction = ActionDeclaration & {
    label: LocalizedText;
    disabled: boolean;
};
/** The `actions` declaration the helper builds. `showSolution` is there if the widget named its permission. */
export type ExerciseActions = {
    check: ExerciseAction;
    reset: ExerciseAction;
    showSolution?: ExerciseAction;
};
/** The names of the actions the helper declares. The widget has a method of the same name for each. */
export type ExerciseActionName = keyof ExerciseActions;
/** What the helper needs of a score, for the summary. A widget adds what it renders, such as a mark per item. */
export type ExerciseScore = {
    readonly correct: number;
    readonly total: number;
};
/** The score of one mark per item: `scoreOf(order.map((id, index) => id === solution[index]))`. */
export declare function scoreOf(marks: readonly boolean[]): ExerciseScore & {
    readonly marks: readonly boolean[];
};
/** Options of `firstOrder()`. */
export type FirstOrderOptions<T> = {
    /** Shuffle with this seed. The same seed gives the same order. Without it the authored order is kept. */
    seed?: number;
    /** An order that must not come out, because the exercise would start solved. */
    solution?: readonly T[];
};
/**
 * The order in which a reader first sees the items of an exercise. With a
 * `seed` (the helper has one per widget instance: `exercise.seed`) the items
 * are shuffled, differently for each reader and the same in every render.
 * If the result equals `solution`, it is rotated by one item, so an ordering
 * exercise never starts solved.
 */
export declare function firstOrder<T>(items: readonly T[], options?: FirstOrderOptions<T>): T[];
/** An item of a `selection` or `ordering` view. */
export type AggregateItem = {
    id: string;
    label: string;
};
/** The part of the editor's aggregate context that the declaration reads: a snapshot of the widget, not the element. */
export type ExerciseAggregateContext = {
    readonly widget: {
        readonly attributes: Readonly<Record<string, string>>;
        readonly html: string;
    };
};
type AggregateCommon = {
    /** Needed when a widget declares the same shape twice. */
    id?: string;
    /** The name of the view. Default: the shape. */
    title?: string;
    /**
     * The response in a participant's data: the key of the data block that
     * holds it, or a function of the parsed data. No response is `undefined`,
     * and the participant then counts as missing.
     */
    value: string | ((data: unknown) => unknown);
    /** The attribute that holds the obfuscated solution. Default: `solution`. `false` if the view has no reference. */
    solution?: string | false;
    /** Turns the revealed solution into the format of the value. Default: the solution as it is. */
    reference?: (solution: unknown, widget: Element | null) => unknown;
};
/** Options of `exerciseAggregate()` for the shapes with items. */
export type ItemsAggregateOptions = AggregateCommon & {
    shape: "selection" | "ordering";
    /** The authored items, read from a copy of the widget that was parsed from its HTML. */
    items: (widget: Element) => readonly AggregateItem[];
};
/** Options of `exerciseAggregate()` for the shapes without items. */
export type ValueAggregateOptions = AggregateCommon & {
    shape: "number" | "text";
    /** `number` only: how many bins the distribution has. */
    bins?: number;
};
type AggregateResult = {
    id?: string;
    title?: string;
    value: (data: unknown) => unknown;
    reference?: unknown;
};
/** What a declaration made by `exerciseAggregate()` returns for the shapes with items. */
export type ItemsAggregate = AggregateResult & {
    shape: "selection" | "ordering";
    items: readonly AggregateItem[];
};
/** What a declaration made by `exerciseAggregate()` returns for the shapes without items. */
export type ValueAggregate = AggregateResult & {
    shape: "number" | "text";
    bins?: number;
};
/** The widget of an aggregate context as an inert element, to read its children and attributes. Null if the HTML holds none. */
export declare function parseWidget(html: string): Element | null;
/**
 * Builds the `static aggregate` declaration of an exercise from the pieces
 * the widget already has: how to read its items, where the response is in the
 * data block, and the attribute with the obfuscated solution.
 *
 *     static aggregate = exerciseAggregate({shape: "ordering", items: entriesOf, value: "order"})
 *
 * The result is a function of the editor's context, as the editor expects,
 * because the items and the solution depend on the widget instance. It
 * follows the editor's rules: item ids are unique strings, a missing response
 * is `undefined`, and the reference is only there when a solution is.
 */
export declare function exerciseAggregate(options: ItemsAggregateOptions): (context: ExerciseAggregateContext) => ItemsAggregate;
export declare function exerciseAggregate(options: ValueAggregateOptions): (context: ExerciseAggregateContext) => ValueAggregate;
/** Options of `ExerciseCore`. */
export type ExerciseOptions<Response, Solution = Response, Score extends ExerciseScore = ExerciseScore> = CoreOptions & {
    /** The reader's response. Undefined until the reader has answered: no response is not an empty response. */
    response: () => Response | undefined;
    /**
     * Stores the response; `undefined` clears it. It runs inside the undo step
     * that also withdraws the submission, so it has to write at once, as the
     * data-block helper does inside a transaction.
     */
    respond: (response: Response | undefined) => void;
    /** The authored solution. Undefined if there is none yet. */
    solution: () => Solution | undefined;
    /** Records the solution that an author enters with the reader's interaction. Without it `answer()` does nothing in edit mode. */
    record?: (solution: Solution) => void;
    /** Grades what the reader sees against the solution. `response` is undefined if the reader has not answered. Asked only while feedback is shown. */
    score: (response: Response | undefined, solution: Solution) => Score;
    /** The form value of a response. Default: a string as it is, anything else as JSON. */
    serialize?: (response: Response) => string | File | FormData;
    /** The host's `ElementInternals`, if the widget attached them itself. Default: `host.attachInternals()`. */
    internals?: ElementInternals;
    /** The element the browser points at when it reports a missing response. */
    anchor?: () => HTMLElement | null | undefined;
    /** The name of the permission that lets a reader see the solution. Adds the `showSolution` action. */
    showSolution?: string;
    /**
     * Resolves when the widget has rendered a change. Lit: `() => host.updateComplete`.
     * Keeps the undo step of a recorded solution open until its attribute is written.
     */
    rendered?: () => Promise<unknown>;
    /** False if the widget shows the summary in an `<output>`, which is a live region of its own. Default: the summary is spoken. */
    announce?: boolean;
    /** False if the widget declares `actions` itself, from `core.actions`. Default: the helper puts the declaration on the host. */
    actions?: boolean;
    /** Texts that replace the helper's own, in every language. A function is asked on every read, so it can answer with the widget's `msg`. */
    messages?: MessagesOption<ExerciseMessages>;
};
/** The state of `ExerciseCore`. A new object whenever an answer of the core may have changed. */
export type ExerciseSnapshot = {
    readonly editing: boolean;
    readonly submitted: boolean;
    /** The reader cannot change the response: it is submitted, or the form disabled the widget. */
    readonly locked: boolean;
    readonly mode: FeedbackMode;
    readonly required: boolean;
    /** The reader asked for feedback with Check and has not changed the response since. */
    readonly checked: boolean;
    /** The solution is shown. */
    readonly revealed: boolean;
};
/**
 * The shared part of an exercise widget.
 *
 * - **Form.** The form value is the response and is `null` until the reader
 *   has answered. With the `required` attribute a missing response is a
 *   `valueMissing` error. The class needs `static formAssociated = true` and
 *   forwards the platform's callbacks: `formResetCallback()` to `formReset()`,
 *   `formDisabledCallback(disabled)` to `formDisabled(disabled)` and
 *   `formStateRestoreCallback(state, mode)` to `formStateRestore(state, mode)`.
 * - **Submitted.** While the `submitted` attribute is present in read mode,
 *   `locked` is true and the actions are unavailable. A response the widget
 *   stores with `respond()` or `answer()` removes the attribute in the same
 *   undo step. A response that arrives from outside leaves it.
 * - **Actions.** `check`, `reset` and, if `showSolution` names a permission,
 *   `showSolution`. The declaration with their availability is `actions`; it
 *   is put on the host and followed by `optionschange` when it changes. The
 *   widget has a method of the same name for each, which calls the core.
 * - **Feedback.** `result` is the score while feedback is shown, otherwise
 *   null: after Check, or, with `feedback="submit"` on the host, once the
 *   response is submitted. A new response ends the feedback of Check. Nothing
 *   is shown in edit mode. The summary is spoken when feedback appears.
 * - **Author and reader.** `answer(value)` records the solution in edit mode
 *   and stores the response in read mode. `check()` and `reset()` never touch
 *   the solution.
 */
export declare class ExerciseCore<Response, Solution = Response, Score extends ExerciseScore = ExerciseScore> extends ModuleCore<ExerciseSnapshot> {
    #private;
    /** The host's `ElementInternals`: its validity and its form. */
    readonly internals: ElementInternals;
    /** A random number per widget instance, for `firstOrder()`: stable across renders, different for each reader. */
    readonly seed: number;
    constructor(host: HTMLElement, options: ExerciseOptions<Response, Solution, Score>);
    getSnapshot(): ExerciseSnapshot;
    /** True in edit mode. */
    get editing(): boolean;
    /** The response is submitted: the host set the `submitted` attribute. */
    get submitted(): boolean;
    /** The reader cannot change the response. Pass `() => !exercise.locked` as `can` to the modules that change it. */
    get locked(): boolean;
    /** The feedback mode: the `feedback` attribute of the host. */
    get mode(): FeedbackMode;
    /** A response is required: the `required` attribute of the host. */
    get required(): boolean;
    /** The score while feedback is shown, otherwise null. */
    get result(): Score | null;
    /** The summary of `result` as text, such as "3 of 5 correct." Empty while no feedback is shown. */
    get summary(): string;
    /** The helper's texts in the widget's language, for the widget's own buttons: `text.check`, `text.reset`. */
    get text(): ExerciseMessages;
    /** The solution is shown: the reader asked for it and may see it. */
    get revealed(): boolean;
    /** Whether an action can run now. The same answer as `actions[name].disabled`, for the widget's own buttons. */
    available(name: ExerciseActionName): boolean;
    /**
     * The `actions` declaration: labels and availability. Labels are localized
     * text from the helper's catalogs, which the editor resolves in the
     * author's language. A label the widget overrides with `messages` is used as it is.
     */
    get actions(): ExerciseActions;
    /**
     * The `check` action: shows feedback for the current response and speaks
     * the summary. Does nothing with `feedback="submit"` or without a solution.
     */
    check(): void;
    /** The `reset` action: clears the response, the feedback and the shown solution. Never the solution itself. */
    reset(): void;
    /** The `showSolution` action: shows the solution, or hides it again. Does nothing without the permission. */
    showSolution(show?: boolean): void;
    /**
     * Stores a response the reader gave, as one undo step: the widget's
     * `respond` writes it and a submission is withdrawn. Ends the feedback of
     * Check and hides the solution.
     */
    respond(response: Response | undefined): void;
    /**
     * What the reader's interaction produced. In edit mode it is the solution
     * the author records, in read mode the response.
     */
    answer(value: Response & Solution): void;
    /** For `formResetCallback()`: a form reset clears the response. */
    formReset(): void;
    /** For `formDisabledCallback(disabled)`: a disabled fieldset or the `disabled` attribute locks the widget. */
    formDisabled(disabled: boolean): void;
    /**
     * For `formStateRestoreCallback(state, mode)`: the browser hands back the
     * response the form held before a reload or a navigation. It is stored
     * only if the widget has no response, and a submission is left as it is.
     */
    formStateRestore(state: unknown, mode?: string): void;
    protected onConnect(): void;
    /** The response, the solution and the mode may have changed with the render. The render itself already showed them. */
    protected onRefresh(): void;
}
