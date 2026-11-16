import {
  ExerciseCore
} from "@webwriter/widget/exercise";
import { resolveDeclarations } from "@webwriter/widget";
import { warnOnce } from "@webwriter/widget/base";
import { CoreController } from "./base.js";
import {
  exerciseAggregate,
  exerciseMessages,
  exerciseOptions,
  firstOrder,
  parseWidget,
  scoreOf
} from "@webwriter/widget/exercise";
import { isObfuscated, obfuscate, obfuscated, reveal } from "@webwriter/widget/obfuscate";
const exerciseProperties = {
  feedback: { type: String, reflect: true },
  required: { type: Boolean, reflect: true },
  submitted: { type: Boolean, reflect: true }
};
class Exercise extends CoreController {
  constructor(host, options) {
    super(host, (root) => new ExerciseCore(host, { rendered: () => host.updateComplete, ...options, actions: false, root }));
  }
  hostConnected() {
    super.hostConnected();
    const declared = this.host.actions;
    if (!declared?.check) {
      warnOnce(
        this.host.constructor,
        "exercise:actions",
        `<${this.host.localName}>: the widget does not declare the actions of its Exercise helper. Add \`get actions() { return this.#exercise.actions }\` to the class.`
      );
    }
  }
  /** The host's `ElementInternals`: `validity`, `checkValidity()`, `form`. */
  get internals() {
    return this.core.internals;
  }
  /** A random number per widget instance, for `firstOrder()`. */
  get seed() {
    return this.core.seed;
  }
  /** True in edit mode. */
  get editing() {
    return this.core.editing;
  }
  /** The reader cannot change the response: it is submitted, or the form disabled the widget. */
  get locked() {
    return this.core.locked;
  }
  /** The feedback mode: the `feedback` attribute of the host. */
  get mode() {
    return this.core.mode;
  }
  /** The score while feedback is shown, otherwise null. */
  get result() {
    return this.core.result;
  }
  /** The summary of `result` as text. Empty while no feedback is shown. */
  get summary() {
    return this.core.summary;
  }
  /** The helper's texts in the widget's language, for the widget's own buttons. */
  get text() {
    return this.core.text;
  }
  /** The solution is shown. */
  get revealed() {
    return this.core.revealed;
  }
  /** The `actions` declaration of the widget: the static actions of its class and the helper's own. */
  get actions() {
    const shared = this.host.constructor.actions;
    return { ...resolveDeclarations(this.host, shared), ...this.core.actions };
  }
  /** Whether an action can run now, for the widget's own buttons. */
  available(name) {
    return this.core.available(name);
  }
  /** The `check` action. */
  check() {
    this.core.check();
  }
  /** The `reset` action. */
  reset() {
    this.core.reset();
  }
  /** The `showSolution` action: shows the solution, or hides it again. */
  showSolution(show) {
    this.core.showSolution(show);
  }
  /** Stores a response the reader gave and withdraws a submission, as one undo step. */
  respond(response) {
    this.core.respond(response);
  }
  /** What the reader's interaction produced: the solution in edit mode, the response in read mode. */
  answer(value) {
    this.core.answer(value);
  }
  /** For `formResetCallback()`. */
  formReset() {
    this.core.formReset();
  }
  /** For `formDisabledCallback(disabled)`. */
  formDisabled(disabled) {
    this.core.formDisabled(disabled);
  }
  /** For `formStateRestoreCallback(state, mode)`. */
  formStateRestore(state, mode) {
    this.core.formStateRestore(state, mode);
  }
}
export {
  Exercise,
  exerciseAggregate,
  exerciseMessages,
  exerciseOptions,
  exerciseProperties,
  firstOrder,
  isObfuscated,
  obfuscate,
  obfuscated,
  parseWidget,
  reveal,
  scoreOf
};
