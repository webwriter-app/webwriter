import { announcer } from "./announce.js";
import { ModuleCore, warnOnce } from "./base.js";
import { messageLocale, Messages } from "./messages.js";
import { exerciseMessages } from "./messages/exercise/index.js";
import { reveal } from "./obfuscate.js";
import { can, isEditing } from "./permissions.js";
import { transaction } from "./transaction.js";
import { exerciseMessages as exerciseMessages2 } from "./messages/exercise/index.js";
function textMap(source, key) {
  const text = { _: source.defaults[key] };
  for (const [locale, catalog] of Object.entries(source.catalogs)) {
    const translated = catalog[key];
    if (typeof translated === "string") text[locale] = translated;
  }
  return text;
}
const exerciseOptions = {
  feedback: {
    type: "select",
    get label() {
      return textMap(exerciseMessages, "feedbackOption");
    },
    options: [
      {
        value: "check",
        get label() {
          return textMap(exerciseMessages, "feedbackOnCheck");
        }
      },
      {
        value: "submit",
        get label() {
          return textMap(exerciseMessages, "feedbackOnSubmit");
        }
      }
    ]
  },
  required: {
    type: Boolean,
    get label() {
      return textMap(exerciseMessages, "requiredOption");
    }
  }
};
function scoreOf(marks) {
  return { marks, correct: marks.filter(Boolean).length, total: marks.length };
}
function firstOrder(items, options = {}) {
  const order = [...items];
  if (options.seed !== void 0) {
    let state = options.seed >>> 0;
    const random = () => {
      state = state + 1831565813 >>> 0;
      let mixed = Math.imul(state ^ state >>> 15, state | 1);
      mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
      return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
    };
    for (let index = order.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [order[index], order[other]] = [order[other], order[index]];
    }
  }
  const { solution } = options;
  if (solution && order.length > 1 && order.length === solution.length && order.every((item, index) => item === solution[index])) order.push(order.shift());
  return order;
}
function parseWidget(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.firstElementChild;
}
function exerciseAggregate(options) {
  const { value } = options;
  const extract = typeof value === "function" ? value : (data) => data?.[value] ?? void 0;
  return ({ widget }) => {
    const authored = parseWidget(widget.html);
    const result = { value: extract };
    if (options.id !== void 0) result.id = options.id;
    if (options.title !== void 0) result.title = options.title;
    const solution = options.solution === false ? void 0 : reveal(widget.attributes[options.solution ?? "solution"]);
    const reference = solution === void 0 || !options.reference ? solution : options.reference(solution, authored);
    if (reference !== void 0) result.reference = reference;
    if (!("items" in options)) return { ...result, shape: options.shape, ...options.bins !== void 0 ? { bins: options.bins } : {} };
    const ids = /* @__PURE__ */ new Set();
    const items = (authored ? options.items(authored) : []).filter(({ id, label }) => {
      if (typeof id !== "string" || typeof label !== "string" || ids.has(id)) return false;
      ids.add(id);
      return true;
    });
    return { ...result, shape: options.shape, items };
  };
}
class ExerciseCore extends ModuleCore {
  /** The host's `ElementInternals`: its validity and its form. */
  internals;
  /** A random number per widget instance, for `firstOrder()`: stable across renders, different for each reader. */
  seed = crypto.getRandomValues(new Uint32Array(1))[0];
  #options;
  #messages;
  #announce = () => {
  };
  #checked = false;
  #revealed = false;
  #disabled = false;
  #state = { editing: false, submitted: false, locked: false, mode: "check", required: false, checked: false, revealed: false };
  /** Whether feedback was shown at the last look. Undefined before the first one. */
  #shown;
  /** The availability the editor was told last. Undefined before the first look. */
  #availability;
  /** The response the form holds, as JSON. Undefined before the first look. */
  #formState;
  constructor(host, options) {
    super(host, options);
    this.#options = options;
    this.#messages = new Messages(host, exerciseMessages, options.messages);
    this.internals = options.internals ?? host.attachInternals();
  }
  getSnapshot() {
    return this.#state;
  }
  // ── Answers, current at every call ───────────────────────────────────
  /** True in edit mode. */
  get editing() {
    return isEditing(this.host);
  }
  /** The response is submitted: the host set the `submitted` attribute. */
  get submitted() {
    return this.host.hasAttribute("submitted");
  }
  /** The reader cannot change the response. Pass `() => !exercise.locked` as `can` to the modules that change it. */
  get locked() {
    return this.#disabled || this.submitted && !this.editing;
  }
  /** The feedback mode: the `feedback` attribute of the host. */
  get mode() {
    return this.host.getAttribute("feedback") === "submit" ? "submit" : "check";
  }
  /** A response is required: the `required` attribute of the host. */
  get required() {
    return this.host.hasAttribute("required");
  }
  /** The score while feedback is shown, otherwise null. */
  get result() {
    const solution = this.#options.solution();
    if (solution === void 0 || !this.#shows(solution)) return null;
    return this.#options.score(this.#response(), solution);
  }
  /** The summary of `result` as text, such as "3 of 5 correct." Empty while no feedback is shown. */
  get summary() {
    const result = this.result;
    return result ? this.#messages.current.summary(result.correct, result.total) : "";
  }
  /** The helper's texts in the widget's language, for the widget's own buttons: `text.check`, `text.reset`. */
  get text() {
    return this.#messages.current;
  }
  /** The solution is shown: the reader asked for it and may see it. */
  get revealed() {
    return this.#revealed && this.available("showSolution");
  }
  /** Whether an action can run now. The same answer as `actions[name].disabled`, for the widget's own buttons. */
  available(name) {
    if (name === "showSolution") {
      const permission = this.#options.showSolution;
      return permission !== void 0 && this.#options.solution() !== void 0 && can(this.host, permission);
    }
    if (this.locked) return false;
    if (name === "check") return this.mode === "check" && this.#options.solution() !== void 0;
    return this.#response() !== void 0 || this.#checked || this.#revealed;
  }
  /**
   * The `actions` declaration: labels and availability. Labels are localized
   * text from the helper's catalogs, which the editor resolves in the
   * author's language. A label the widget overrides with `messages` is used as it is.
   */
  get actions() {
    const action = (name, label) => ({
      label: this.#label(label),
      disabled: !this.available(name)
    });
    const actions = { check: action("check", "check"), reset: action("reset", "reset") };
    if (this.#options.showSolution !== void 0) actions.showSolution = action("showSolution", this.revealed ? "hideSolution" : "showSolution");
    return actions;
  }
  // ── What the widget calls ────────────────────────────────────────────
  /**
   * The `check` action: shows feedback for the current response and speaks
   * the summary. Does nothing with `feedback="submit"` or without a solution.
   */
  check() {
    if (this.mode !== "check" || this.#options.solution() === void 0) return;
    this.#checked = true;
    this.#shown = void 0;
    this.#update();
    this.#speak();
  }
  /** The `reset` action: clears the response, the feedback and the shown solution. Never the solution itself. */
  reset() {
    this.respond(void 0);
  }
  /** The `showSolution` action: shows the solution, or hides it again. Does nothing without the permission. */
  showSolution(show = !this.#revealed) {
    if (!this.available("showSolution")) return;
    this.#revealed = show;
    this.#update();
  }
  /**
   * Stores a response the reader gave, as one undo step: the widget's
   * `respond` writes it and a submission is withdrawn. Ends the feedback of
   * Check and hides the solution.
   */
  respond(response) {
    const nothing = response === void 0 && this.#response() === void 0 && !this.submitted;
    if (!nothing) {
      transaction(this.host, () => {
        this.#options.respond(response);
        this.host.removeAttribute("submitted");
      });
    }
    this.#checked = this.#revealed = false;
    this.#update();
  }
  /**
   * What the reader's interaction produced. In edit mode it is the solution
   * the author records, in read mode the response.
   */
  answer(value) {
    if (!this.editing) return this.respond(value);
    const { record, rendered } = this.#options;
    if (record) void transaction(this.host, () => (record(value), rendered?.()));
  }
  /** For `formResetCallback()`: a form reset clears the response. */
  formReset() {
    this.reset();
  }
  /** For `formDisabledCallback(disabled)`: a disabled fieldset or the `disabled` attribute locks the widget. */
  formDisabled(disabled) {
    this.#disabled = disabled;
    this.#update();
  }
  /**
   * For `formStateRestoreCallback(state, mode)`: the browser hands back the
   * response the form held before a reload or a navigation. It is stored
   * only if the widget has no response, and a submission is left as it is.
   */
  formStateRestore(state, mode = "restore") {
    if (mode !== "restore" || typeof state !== "string" || this.#response() !== void 0) return;
    let response;
    try {
      response = JSON.parse(state);
    } catch {
      return;
    }
    transaction(this.host, () => this.#options.respond(response));
    this.#update();
  }
  onConnect() {
    if (this.#options.announce !== false) {
      const live = announcer(this.root);
      this.cleanup(live.release);
      this.#announce = live.announce;
    }
    const observer = new MutationObserver(() => this.#update());
    observer.observe(this.host, { attributes: true });
    this.cleanup(() => observer.disconnect());
    this.cleanup(
      this.#messages.follow(() => {
        this.#update();
        this.notify();
        this.#relabel();
      })
    );
    const { documentElement, defaultView } = this.host.ownerDocument;
    const locale = messageLocale(exerciseMessages, documentElement.lang || defaultView?.navigator.language || "");
    if (!Object.hasOwn(exerciseMessages.catalogs, locale)) {
      exerciseMessages.load(locale).then(
        (catalog) => catalog && this.connected && this.#relabel(),
        () => {
        }
        // The labels stay English.
      );
    }
    this.#declare();
    this.cleanup(() => this.#shown = this.#availability = this.#formState = void 0);
    this.#update();
  }
  /** The response, the solution and the mode may have changed with the render. The render itself already showed them. */
  onRefresh() {
    this.#update(false);
  }
  #response() {
    return this.#options.response() ?? void 0;
  }
  #shows(solution) {
    return solution !== void 0 && !this.editing && (this.mode === "submit" ? this.submitted : this.#checked);
  }
  #look() {
    return {
      editing: this.editing,
      submitted: this.submitted,
      locked: this.locked,
      mode: this.mode,
      required: this.required,
      checked: this.#checked,
      revealed: this.revealed
    };
  }
  /** Brings everything that follows from the widget's state up to date. `notify` is false when the widget has just rendered. */
  #update(notify = true) {
    if (!this.connected) return;
    if (this.#revealed && !this.available("showSolution")) this.#revealed = false;
    const next = this.#look();
    const changed = Object.keys(next).some((key) => next[key] !== this.#state[key]);
    if (changed) this.#state = next;
    this.#form();
    const shown = this.#shows(this.#options.solution());
    if (shown && this.#shown === false) this.#speak();
    this.#shown = shown;
    const actions = this.actions;
    const availability = JSON.stringify([actions.check.disabled, actions.reset.disabled, actions.showSolution?.disabled, next.revealed]);
    if (this.#availability !== void 0 && availability !== this.#availability) {
      this.host.dispatchEvent(new Event("optionschange", { bubbles: true, composed: true }));
    }
    this.#availability = availability;
    if (changed && notify) this.notify();
  }
  /** The form value and the validity. */
  #form() {
    if (this.host.constructor.formAssociated !== true) {
      return warnOnce(
        this.host.constructor,
        "exercise:form",
        `<${this.host.localName}>: the class has no "static formAssociated = true", so the response takes no part in the host's Submit step.`
      );
    }
    const response = this.#response();
    const state = response === void 0 ? null : JSON.stringify(response);
    if (state !== this.#formState) {
      const value = response === void 0 ? null : this.#options.serialize?.(response) ?? (typeof response === "string" ? response : state);
      this.internals.setFormValue(value, state);
      this.#formState = state;
    }
    if (this.required && state === null) {
      this.internals.setValidity({ valueMissing: true }, this.#messages.current.required, this.#options.anchor?.() ?? void 0);
    } else this.internals.setValidity({});
  }
  #speak() {
    const summary = this.summary;
    if (summary) this.#announce(summary);
  }
  /** Tells the editor that the labels of the declarations changed: a catalog arrived. */
  #relabel() {
    this.host.dispatchEvent(new Event("optionschange", { bubbles: true, composed: true }));
  }
  #label(key) {
    const { messages } = this.#options;
    const own = (typeof messages === "function" ? messages() : messages)?.[key];
    return own === void 0 ? textMap(exerciseMessages, key) : { _: own };
  }
  /**
   * Puts the `actions` declaration on the host, with the static actions of
   * its class, unless the class has a member of that name or the `actions`
   * option is false. A binding whose library supports a getter on the class
   * turns it off and lets the widget declare it: `get actions() { return this.#exercise.actions }`.
   */
  #declare() {
    const host = this.host;
    for (const name of Object.keys(this.actions)) {
      if (typeof host[name] === "function") continue;
      warnOnce(host.constructor, `exercise:${name}`, `<${host.localName}>: the action "${name}" is declared, but the widget has no method ${name}().`);
    }
    if (this.#options.actions === false || "actions" in host) return;
    Object.defineProperty(host, "actions", {
      configurable: true,
      enumerable: true,
      get: () => ({ ...host.constructor.actions, ...this.actions })
    });
    this.cleanup(() => delete host.actions);
  }
}
export {
  ExerciseCore,
  exerciseAggregate,
  exerciseMessages2 as exerciseMessages,
  exerciseOptions,
  firstOrder,
  parseWidget,
  scoreOf
};
