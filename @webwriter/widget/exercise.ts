// The part of an exercise widget that is the same in every exercise: taking
// part in the host's Submit step, the `submitted` lock, the check, reset and
// show-solution actions, the feedback mode and the spoken summary. Reading the
// response, grading and rendering stay with the widget.
import {announcer} from "./announce.js"
import {ModuleCore, warnOnce, type CoreOptions} from "./base.js"
import {messageLocale, Messages, type MessageSource, type MessagesOption} from "./messages.js"
import {exerciseMessages, type ExerciseMessages} from "./messages/exercise/index.js"
import {reveal} from "./obfuscate.js"
import type {ActionDeclaration, LocalizedText, OptionDeclaration} from "./options.js"
import {can, isEditing} from "./permissions.js"
import {transaction} from "./transaction.js"

export {exerciseMessages, type ExerciseMessages} from "./messages/exercise/index.js"

// ── Text ──────────────────────────────────────────────────────────────────

type StringKeys<T> = {[K in keyof T]: T[K] extends string ? K : never}[keyof T]

/**
 * A message as the localized text of a declaration: the English default under
 * `_` and one entry per catalog that has arrived. The editor picks the entry
 * for the language of its document, which need not be the language of the
 * widget; `ExerciseCore` loads the catalog of both when it connects.
 */
function textMap<T>(source: MessageSource<T>, key: StringKeys<T>): Record<string, string> {
  const text: Record<string, string> = {_: source.defaults[key] as string}
  for(const [locale, catalog] of Object.entries(source.catalogs)) {
    const translated = catalog[key]
    if(typeof translated === "string") text[locale] = translated
  }
  return text
}

// ── Declarations ──────────────────────────────────────────────────────────

/** How a reader gets feedback: with the Check action, or only once the response is submitted. */
export type FeedbackMode = "check" | "submit"

/**
 * The drawer options every exercise has, for `static options`:
 * `static options = {...exerciseOptions, …}`. `feedback` is stored in the
 * `feedback` attribute (`"submit"`, otherwise Check) and `required` in the
 * `required` attribute; the helper reads both from the host. The labels are
 * read when the editor asks for them, with the catalogs that have arrived.
 */
export const exerciseOptions = {
  feedback: {
    type: "select" as const,
    get label(): LocalizedText {
      return textMap(exerciseMessages, "feedbackOption")
    },
    options: [
      {
        value: "check",
        get label(): LocalizedText {
          return textMap(exerciseMessages, "feedbackOnCheck")
        },
      },
      {
        value: "submit",
        get label(): LocalizedText {
          return textMap(exerciseMessages, "feedbackOnSubmit")
        },
      },
    ],
  },
  required: {
    type: Boolean,
    get label(): LocalizedText {
      return textMap(exerciseMessages, "requiredOption")
    },
  },
} satisfies Record<string, OptionDeclaration>

/** An entry of the `actions` declaration the helper builds. */
export type ExerciseAction = ActionDeclaration & {label: LocalizedText; disabled: boolean}

/** The `actions` declaration the helper builds. `showSolution` is there if the widget named its permission. */
export type ExerciseActions = {check: ExerciseAction; reset: ExerciseAction; showSolution?: ExerciseAction}

/** The names of the actions the helper declares. The widget has a method of the same name for each. */
export type ExerciseActionName = keyof ExerciseActions

// ── Scores ────────────────────────────────────────────────────────────────

/** What the helper needs of a score, for the summary. A widget adds what it renders, such as a mark per item. */
export type ExerciseScore = {readonly correct: number; readonly total: number}

/** The score of one mark per item: `scoreOf(order.map((id, index) => id === solution[index]))`. */
export function scoreOf(marks: readonly boolean[]): ExerciseScore & {readonly marks: readonly boolean[]} {
  return {marks, correct: marks.filter(Boolean).length, total: marks.length}
}

// ── The first order ───────────────────────────────────────────────────────

/** Options of `firstOrder()`. */
export type FirstOrderOptions<T> = {
  /** Shuffle with this seed. The same seed gives the same order. Without it the authored order is kept. */
  seed?: number
  /** An order that must not come out, because the exercise would start solved. */
  solution?: readonly T[]
}

/**
 * The order in which a reader first sees the items of an exercise. With a
 * `seed` (the helper has one per widget instance: `exercise.seed`) the items
 * are shuffled, differently for each reader and the same in every render.
 * If the result equals `solution`, it is rotated by one item, so an ordering
 * exercise never starts solved.
 */
export function firstOrder<T>(items: readonly T[], options: FirstOrderOptions<T> = {}): T[] {
  const order = [...items]
  if(options.seed !== undefined) {
    // mulberry32: a small generator that gives the same sequence for the same seed.
    let state = options.seed >>> 0
    const random = () => {
      state = (state + 0x6d2b79f5) >>> 0
      let mixed = Math.imul(state ^ (state >>> 15), state | 1)
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
    }
    for(let index = order.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1))
      ;[order[index], order[other]] = [order[other], order[index]]
    }
  }
  const {solution} = options
  if(solution && order.length > 1 && order.length === solution.length && order.every((item, index) => item === solution[index])) order.push(order.shift()!)
  return order
}

// ── The aggregated view ───────────────────────────────────────────────────

/** An item of a `selection` or `ordering` view. */
export type AggregateItem = {id: string; label: string}

/** The part of the editor's aggregate context that the declaration reads: a snapshot of the widget, not the element. */
export type ExerciseAggregateContext = {
  readonly widget: {readonly attributes: Readonly<Record<string, string>>; readonly html: string}
}

type AggregateCommon = {
  /** Needed when a widget declares the same shape twice. */
  id?: string
  /** The name of the view. Default: the shape. */
  title?: string
  /**
   * The response in a participant's data: the key of the data block that
   * holds it, or a function of the parsed data. No response is `undefined`,
   * and the participant then counts as missing.
   */
  value: string | ((data: unknown) => unknown)
  /** The attribute that holds the obfuscated solution. Default: `solution`. `false` if the view has no reference. */
  solution?: string | false
  /** Turns the revealed solution into the format of the value. Default: the solution as it is. */
  reference?: (solution: unknown, widget: Element | null) => unknown
}

/** Options of `exerciseAggregate()` for the shapes with items. */
export type ItemsAggregateOptions = AggregateCommon & {
  shape: "selection" | "ordering"
  /** The authored items, read from a copy of the widget that was parsed from its HTML. */
  items: (widget: Element) => readonly AggregateItem[]
}

/** Options of `exerciseAggregate()` for the shapes without items. */
export type ValueAggregateOptions = AggregateCommon & {
  shape: "number" | "text"
  /** `number` only: how many bins the distribution has. */
  bins?: number
}

type AggregateResult = {id?: string; title?: string; value: (data: unknown) => unknown; reference?: unknown}
/** What a declaration made by `exerciseAggregate()` returns for the shapes with items. */
export type ItemsAggregate = AggregateResult & {shape: "selection" | "ordering"; items: readonly AggregateItem[]}
/** What a declaration made by `exerciseAggregate()` returns for the shapes without items. */
export type ValueAggregate = AggregateResult & {shape: "number" | "text"; bins?: number}

/** The widget of an aggregate context as an inert element, to read its children and attributes. Null if the HTML holds none. */
export function parseWidget(html: string): Element | null {
  const template = document.createElement("template")
  template.innerHTML = html
  return template.content.firstElementChild
}

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
export function exerciseAggregate(options: ItemsAggregateOptions): (context: ExerciseAggregateContext) => ItemsAggregate
export function exerciseAggregate(options: ValueAggregateOptions): (context: ExerciseAggregateContext) => ValueAggregate
export function exerciseAggregate(options: ItemsAggregateOptions | ValueAggregateOptions): (context: ExerciseAggregateContext) => ItemsAggregate | ValueAggregate {
  const {value} = options
  const extract = typeof value === "function" ? value : (data: unknown) => (data as Record<string, unknown> | null | undefined)?.[value] ?? undefined
  return ({widget}) => {
    const authored = parseWidget(widget.html)
    const result: AggregateResult = {value: extract}
    if(options.id !== undefined) result.id = options.id
    if(options.title !== undefined) result.title = options.title
    const solution = options.solution === false ? undefined : reveal(widget.attributes[options.solution ?? "solution"])
    const reference = solution === undefined || !options.reference ? solution : options.reference(solution, authored)
    if(reference !== undefined) result.reference = reference
    if(!("items" in options)) return {...result, shape: options.shape, ...(options.bins !== undefined ? {bins: options.bins} : {})}
    const ids = new Set<string>()
    const items = (authored ? options.items(authored) : []).filter(({id, label}) => {
      // The editor refuses a view with a repeated id: the first item of an id counts.
      if(typeof id !== "string" || typeof label !== "string" || ids.has(id)) return false
      ids.add(id)
      return true
    })
    return {...result, shape: options.shape, items}
  }
}

// ── The core ──────────────────────────────────────────────────────────────

/** Options of `ExerciseCore`. */
export type ExerciseOptions<Response, Solution = Response, Score extends ExerciseScore = ExerciseScore> = CoreOptions & {
  /** The reader's response. Undefined until the reader has answered: no response is not an empty response. */
  response: () => Response | undefined
  /**
   * Stores the response; `undefined` clears it. It runs inside the undo step
   * that also withdraws the submission, so it has to write at once, as the
   * data-block helper does inside a transaction.
   */
  respond: (response: Response | undefined) => void
  /** The authored solution. Undefined if there is none yet. */
  solution: () => Solution | undefined
  /** Records the solution that an author enters with the reader's interaction. Without it `answer()` does nothing in edit mode. */
  record?: (solution: Solution) => void
  /** Grades what the reader sees against the solution. `response` is undefined if the reader has not answered. Asked only while feedback is shown. */
  score: (response: Response | undefined, solution: Solution) => Score
  /** The form value of a response. Default: a string as it is, anything else as JSON. */
  serialize?: (response: Response) => string | File | FormData
  /** The host's `ElementInternals`, if the widget attached them itself. Default: `host.attachInternals()`. */
  internals?: ElementInternals
  /** The element the browser points at when it reports a missing response. */
  anchor?: () => HTMLElement | null | undefined
  /** The name of the permission that lets a reader see the solution. Adds the `showSolution` action. */
  showSolution?: string
  /**
   * Resolves when the widget has rendered a change. Lit: `() => host.updateComplete`.
   * Keeps the undo step of a recorded solution open until its attribute is written.
   */
  rendered?: () => Promise<unknown>
  /** False if the widget shows the summary in an `<output>`, which is a live region of its own. Default: the summary is spoken. */
  announce?: boolean
  /** False if the widget declares `actions` itself, from `core.actions`. Default: the helper puts the declaration on the host. */
  actions?: boolean
  /** Texts that replace the helper's own, in every language. A function is asked on every read, so it can answer with the widget's `msg`. */
  messages?: MessagesOption<ExerciseMessages>
}

/** The state of `ExerciseCore`. A new object whenever an answer of the core may have changed. */
export type ExerciseSnapshot = {
  readonly editing: boolean
  readonly submitted: boolean
  /** The reader cannot change the response: it is submitted, or the form disabled the widget. */
  readonly locked: boolean
  readonly mode: FeedbackMode
  readonly required: boolean
  /** The reader asked for feedback with Check and has not changed the response since. */
  readonly checked: boolean
  /** The solution is shown. */
  readonly revealed: boolean
}

type Declared = {actions?: Record<string, unknown>; formAssociated?: boolean}

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
export class ExerciseCore<Response, Solution = Response, Score extends ExerciseScore = ExerciseScore> extends ModuleCore<ExerciseSnapshot> {
  /** The host's `ElementInternals`: its validity and its form. */
  readonly internals: ElementInternals
  /** A random number per widget instance, for `firstOrder()`: stable across renders, different for each reader. */
  readonly seed = crypto.getRandomValues(new Uint32Array(1))[0]
  #options: ExerciseOptions<Response, Solution, Score>
  #messages: Messages<ExerciseMessages>
  #announce: (text: string) => void = () => {}
  #checked = false
  #revealed = false
  #disabled = false
  #state: ExerciseSnapshot = {editing: false, submitted: false, locked: false, mode: "check", required: false, checked: false, revealed: false}
  /** Whether feedback was shown at the last look. Undefined before the first one. */
  #shown: boolean | undefined
  /** The availability the editor was told last. Undefined before the first look. */
  #availability: string | undefined
  /** The response the form holds, as JSON. Undefined before the first look. */
  #formState: string | null | undefined

  constructor(host: HTMLElement, options: ExerciseOptions<Response, Solution, Score>) {
    super(host, options)
    this.#options = options
    this.#messages = new Messages(host, exerciseMessages, options.messages)
    this.internals = options.internals ?? host.attachInternals()
  }

  getSnapshot(): ExerciseSnapshot {
    return this.#state
  }

  // ── Answers, current at every call ───────────────────────────────────

  /** True in edit mode. */
  get editing(): boolean {
    return isEditing(this.host)
  }

  /** The response is submitted: the host set the `submitted` attribute. */
  get submitted(): boolean {
    return this.host.hasAttribute("submitted")
  }

  /** The reader cannot change the response. Pass `() => !exercise.locked` as `can` to the modules that change it. */
  get locked(): boolean {
    return this.#disabled || (this.submitted && !this.editing)
  }

  /** The feedback mode: the `feedback` attribute of the host. */
  get mode(): FeedbackMode {
    return this.host.getAttribute("feedback") === "submit" ? "submit" : "check"
  }

  /** A response is required: the `required` attribute of the host. */
  get required(): boolean {
    return this.host.hasAttribute("required")
  }

  /** The score while feedback is shown, otherwise null. */
  get result(): Score | null {
    const solution = this.#options.solution()
    if(solution === undefined || !this.#shows(solution)) return null
    return this.#options.score(this.#response(), solution)
  }

  /** The summary of `result` as text, such as "3 of 5 correct." Empty while no feedback is shown. */
  get summary(): string {
    const result = this.result
    return result ? this.#messages.current.summary(result.correct, result.total) : ""
  }

  /** The helper's texts in the widget's language, for the widget's own buttons: `text.check`, `text.reset`. */
  get text(): ExerciseMessages {
    return this.#messages.current
  }

  /** The solution is shown: the reader asked for it and may see it. */
  get revealed(): boolean {
    return this.#revealed && this.available("showSolution")
  }

  /** Whether an action can run now. The same answer as `actions[name].disabled`, for the widget's own buttons. */
  available(name: ExerciseActionName): boolean {
    if(name === "showSolution") {
      const permission = this.#options.showSolution
      return permission !== undefined && this.#options.solution() !== undefined && can(this.host, permission)
    }
    if(this.locked) return false
    if(name === "check") return this.mode === "check" && this.#options.solution() !== undefined
    return this.#response() !== undefined || this.#checked || this.#revealed
  }

  /**
   * The `actions` declaration: labels and availability. Labels are localized
   * text from the helper's catalogs, which the editor resolves in the
   * author's language. A label the widget overrides with `messages` is used as it is.
   */
  get actions(): ExerciseActions {
    const action = (name: ExerciseActionName, label: "check" | "reset" | "showSolution" | "hideSolution"): ExerciseAction => ({
      label: this.#label(label),
      disabled: !this.available(name),
    })
    const actions: ExerciseActions = {check: action("check", "check"), reset: action("reset", "reset")}
    if(this.#options.showSolution !== undefined) actions.showSolution = action("showSolution", this.revealed ? "hideSolution" : "showSolution")
    return actions
  }

  // ── What the widget calls ────────────────────────────────────────────

  /**
   * The `check` action: shows feedback for the current response and speaks
   * the summary. Does nothing with `feedback="submit"` or without a solution.
   */
  check(): void {
    if(this.mode !== "check" || this.#options.solution() === undefined) return
    this.#checked = true
    // Check speaks the summary itself, also when the feedback was already there.
    this.#shown = undefined
    this.#update()
    this.#speak()
  }

  /** The `reset` action: clears the response, the feedback and the shown solution. Never the solution itself. */
  reset(): void {
    this.respond(undefined)
  }

  /** The `showSolution` action: shows the solution, or hides it again. Does nothing without the permission. */
  showSolution(show = !this.#revealed): void {
    if(!this.available("showSolution")) return
    this.#revealed = show
    this.#update()
  }

  /**
   * Stores a response the reader gave, as one undo step: the widget's
   * `respond` writes it and a submission is withdrawn. Ends the feedback of
   * Check and hides the solution.
   */
  respond(response: Response | undefined): void {
    const nothing = response === undefined && this.#response() === undefined && !this.submitted
    if(!nothing) {
      transaction(this.host, () => {
        this.#options.respond(response)
        this.host.removeAttribute("submitted")
      })
    }
    this.#checked = this.#revealed = false
    this.#update()
  }

  /**
   * What the reader's interaction produced. In edit mode it is the solution
   * the author records, in read mode the response.
   */
  answer(value: Response & Solution): void {
    if(!this.editing) return this.respond(value)
    const {record, rendered} = this.#options
    if(record) void transaction(this.host, () => (record(value), rendered?.()))
  }

  /** For `formResetCallback()`: a form reset clears the response. */
  formReset(): void {
    this.reset()
  }

  /** For `formDisabledCallback(disabled)`: a disabled fieldset or the `disabled` attribute locks the widget. */
  formDisabled(disabled: boolean): void {
    this.#disabled = disabled
    this.#update()
  }

  /**
   * For `formStateRestoreCallback(state, mode)`: the browser hands back the
   * response the form held before a reload or a navigation. It is stored
   * only if the widget has no response, and a submission is left as it is.
   */
  formStateRestore(state: unknown, mode: string = "restore"): void {
    if(mode !== "restore" || typeof state !== "string" || this.#response() !== undefined) return
    let response: Response
    try {
      response = JSON.parse(state)
    } catch {
      return
    }
    transaction(this.host, () => this.#options.respond(response))
    this.#update()
  }

  protected onConnect() {
    if(this.#options.announce !== false) {
      const live = announcer(this.root)
      this.cleanup(live.release)
      this.#announce = live.announce
    }
    // `submitted`, `feedback`, `required`, the mode and the permissions are attributes of the host.
    const observer = new MutationObserver(() => this.#update())
    observer.observe(this.host, {attributes: true})
    this.cleanup(() => observer.disconnect())
    // The validation message and `text` are in the widget's language.
    this.cleanup(
      this.#messages.follow(() => {
        this.#update()
        this.notify()
        this.#relabel()
      }),
    )
    // The editor reads the labels of the declarations in the language of its document.
    const {documentElement, defaultView} = this.host.ownerDocument
    const locale = messageLocale(exerciseMessages, documentElement.lang || defaultView?.navigator.language || "")
    if(!Object.hasOwn(exerciseMessages.catalogs, locale)) {
      exerciseMessages.load(locale).then(
        catalog => catalog && this.connected && this.#relabel(),
        () => {}, // The labels stay English.
      )
    }
    this.#declare()
    this.cleanup(() => (this.#shown = this.#availability = this.#formState = undefined))
    this.#update()
  }

  /** The response, the solution and the mode may have changed with the render. The render itself already showed them. */
  protected onRefresh() {
    this.#update(false)
  }

  #response(): Response | undefined {
    return this.#options.response() ?? undefined
  }

  #shows(solution: Solution | undefined): boolean {
    return solution !== undefined && !this.editing && (this.mode === "submit" ? this.submitted : this.#checked)
  }

  #look(): ExerciseSnapshot {
    return {
      editing: this.editing,
      submitted: this.submitted,
      locked: this.locked,
      mode: this.mode,
      required: this.required,
      checked: this.#checked,
      revealed: this.revealed,
    }
  }

  /** Brings everything that follows from the widget's state up to date. `notify` is false when the widget has just rendered. */
  #update(notify = true) {
    if(!this.connected) return
    if(this.#revealed && !this.available("showSolution")) this.#revealed = false
    const next = this.#look()
    const changed = (Object.keys(next) as (keyof ExerciseSnapshot)[]).some(key => next[key] !== this.#state[key])
    if(changed) this.#state = next
    this.#form()
    // Feedback that appears by itself is spoken: the submission with feedback="submit", or the end of edit mode.
    const shown = this.#shows(this.#options.solution())
    if(shown && this.#shown === false) this.#speak()
    this.#shown = shown
    const actions = this.actions
    const availability = JSON.stringify([actions.check.disabled, actions.reset.disabled, actions.showSolution?.disabled, next.revealed])
    if(this.#availability !== undefined && availability !== this.#availability) {
      this.host.dispatchEvent(new Event("optionschange", {bubbles: true, composed: true}))
    }
    this.#availability = availability
    if(changed && notify) this.notify()
  }

  /** The form value and the validity. */
  #form() {
    if((this.host.constructor as Declared).formAssociated !== true) {
      return warnOnce(
        this.host.constructor,
        "exercise:form",
        `<${this.host.localName}>: the class has no "static formAssociated = true", so the response takes no part in the host's Submit step.`,
      )
    }
    const response = this.#response()
    const state = response === undefined ? null : JSON.stringify(response)
    if(state !== this.#formState) {
      const value = response === undefined ? null : (this.#options.serialize?.(response) ?? (typeof response === "string" ? response : state))
      this.internals.setFormValue(value, state)
      this.#formState = state
    }
    if(this.required && state === null) {
      this.internals.setValidity({valueMissing: true}, this.#messages.current.required, this.#options.anchor?.() ?? undefined)
    } else this.internals.setValidity({})
  }

  #speak() {
    const summary = this.summary
    if(summary) this.#announce(summary)
  }

  /** Tells the editor that the labels of the declarations changed: a catalog arrived. */
  #relabel() {
    this.host.dispatchEvent(new Event("optionschange", {bubbles: true, composed: true}))
  }

  #label(key: "check" | "reset" | "showSolution" | "hideSolution"): LocalizedText {
    const {messages} = this.#options
    const own = (typeof messages === "function" ? messages() : messages)?.[key]
    return own === undefined ? textMap(exerciseMessages, key) : {_: own}
  }

  /**
   * Puts the `actions` declaration on the host, with the static actions of
   * its class, unless the class has a member of that name or the `actions`
   * option is false. A binding whose library supports a getter on the class
   * turns it off and lets the widget declare it: `get actions() { return this.#exercise.actions }`.
   */
  #declare() {
    const host = this.host as HTMLElement & Declared & Record<string, unknown>
    for(const name of Object.keys(this.actions)) {
      if(typeof host[name] === "function") continue
      warnOnce(host.constructor, `exercise:${name}`, `<${host.localName}>: the action "${name}" is declared, but the widget has no method ${name}().`)
    }
    if(this.#options.actions === false || "actions" in host) return
    Object.defineProperty(host, "actions", {
      configurable: true,
      enumerable: true,
      get: () => ({...(host.constructor as Declared).actions, ...this.actions}),
    })
    this.cleanup(() => delete host.actions)
  }
}
