import { css, html, LitElement, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { jsonData } from "@webwriter/lit/data";
import { Drag, type DragCommitDetail } from "@webwriter/lit/drag";
import { Exercise, exerciseAggregate, exerciseOptions, exerciseProperties, firstOrder, obfuscated, scoreOf } from "@webwriter/lit/exercise";
import { localizer, widgetMsg } from "@webwriter/lit/localize";
import { Permissions } from "@webwriter/lit/permissions";
import { ExampleElement } from "../shared/base";
import { sourceLocale, targetLocales } from "./localization/generated/locale-codes";

type Entry = { id: string; text: string };

/** The authored entries: `<data value="id">Text</data>` children, in the order the author wrote them. */
function entriesOf(widget: ParentNode): Entry[] {
    return Array.from(widget.querySelectorAll<HTMLDataElement>(":scope > data")).map((entry) => ({
        id: entry.value,
        text: entry.textContent?.trim() ?? "",
    }));
}

/** The label beside an item after a check. A component of its own, to show how one follows the widget's language. */
export class OrderMark extends LitElement {
    static properties = { correct: { type: Boolean } };
    static styles = css`
        :host { font-size: 0.85em; font-weight: 600; color: #b3261e; }
        :host([correct]) { color: #1b6e3c; }
    `;

    declare correct: boolean;

    msg = widgetMsg(this);

    render() {
        return this.correct ? this.msg("Correct") : this.msg("Wrong");
    }
}

/**
 * An ordering question on the Exercise helper. The author writes the entries
 * as children and drags them into the correct order in edit mode; a reader
 * drags them in read mode. The same interaction records the solution (an
 * obfuscated attribute) or the response (the data block). What is left here is
 * what an ordering question is: its entries, its order, its score, its template.
 */
export class OrderExercise extends ExampleElement {
    static formAssociated = true;
    static scopedElements = { "ww-order-mark": OrderMark };

    static properties = {
        ...exerciseProperties,
        solution: { converter: obfuscated, reflect: true },
        shuffle: { type: Boolean, reflect: true },
        allowSolution: { type: Boolean, attribute: "allow-solution", reflect: true },
    };

    static options = {
        ...exerciseOptions,
        shuffle: { type: Boolean, label: { _: "Shuffle for each reader", de: "Für jede Person mischen" } },
    };

    static permissions = {
        allowSolution: { label: { _: "Learners may reveal the solution", de: "Lernende dürfen die Lösung anzeigen" } },
    };

    static aggregate = exerciseAggregate({
        shape: "ordering",
        items: (widget) => entriesOf(widget).map(({ id, text }) => ({ id, label: text })),
        value: "order",
    });

    static styles = css`
        :host { display: block; }
        ol { display: flex; flex-direction: column; gap: 0.4rem; margin: 0.5rem 0; padding: 0; list-style: none; }
        li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.4rem 0.6rem; border: 1px solid #c8c8c8; border-radius: 6px; background: Canvas; }
        li[data-ww-drag] { cursor: grab; }
        li:focus-visible { outline: 2px solid Highlight; }
        li.correct { border-color: #1b6e3c; }
        li.wrong { border-color: #b3261e; }
        output { display: block; min-height: 1.5em; margin-top: 0.5rem; }
    `;

    /** The correct order of entry ids. Kept obfuscated in the `solution` attribute. */
    declare solution: string[] | undefined;
    /** Shuffle the entries for each reader instead of showing them as the author wrote them. */
    declare shuffle: boolean;
    /** Set by the reader chrome when the response was submitted. */
    declare submitted: boolean;

    // The labels of the actions below are computed with `msg`, so the editor has to read them again after a language change.
    localize = localizer(this, { sourceLocale, targetLocales, load: (locale) => import(`./localization/generated/${locale}.ts`), drawer: true });
    msg = this.localize.msg;

    readonly #permissions = new Permissions(this);
    /** The response: `{order: [...]}`. */
    readonly #data = jsonData<{ order?: string[] }>(this, {
        defaults: {},
        validate: ({ order }) => order === undefined || (Array.isArray(order) && order.every((id) => typeof id === "string")),
    });
    readonly #exercise = new Exercise(this, {
        response: () => this.#data.get().order,
        respond: (order) => this.#data.set({ order }),
        solution: () => this.solution,
        record: (order) => (this.solution = order),
        score: (_, solution) => scoreOf(this.order.map((id, index) => id === solution[index])),
        anchor: () => this.renderRoot.querySelector("ol"),
        showSolution: "allowSolution",
        // The summary below is in an <output>, which is announced by itself.
        announce: false,
        messages: () => ({
            check: this.msg("Check"),
            reset: this.msg("Reset"),
            showSolution: this.msg("Show solution"),
            hideSolution: this.msg("Hide solution"),
            required: this.msg("Put the items in order."),
        }),
    });
    readonly #drag = new Drag(this, { can: () => !this.#exercise.locked });

    get entries(): Entry[] {
        return entriesOf(this);
    }

    /** The reader's response: the ids in the order the reader put them. Undefined before the first move. */
    get response(): string[] | undefined {
        return this.#data.get().order;
    }

    /** The ids as they are shown now: the solution in edit mode, otherwise the response, otherwise the first order. */
    get order(): string[] {
        const { editing } = this.#exercise;
        const authored = this.entries.map((entry) => entry.id);
        const first = editing ? authored : firstOrder(authored, { seed: this.shuffle ? this.#exercise.seed : undefined, solution: this.solution });
        const stored = (editing ? this.solution : this.response) ?? [];
        return [...stored.filter((id) => first.includes(id)), ...first.filter((id) => !stored.includes(id))];
    }

    // The actions: the editor reads the declaration from this getter and calls the method with the name of the action.
    get actions() {
        return this.#exercise.actions;
    }
    check() {
        this.#exercise.check();
    }
    reset() {
        this.#exercise.reset();
    }
    showSolution() {
        this.#exercise.showSolution();
    }

    // The platform calls these on the element, so they cannot live in the helper.
    formResetCallback() {
        this.#exercise.formReset();
    }
    formDisabledCallback(disabled: boolean) {
        this.#exercise.formDisabled(disabled);
    }
    formStateRestoreCallback(state: unknown, mode: string) {
        this.#exercise.formStateRestore(state, mode);
    }

    // The validity interface of a form control, for scripts that treat the widget as one.
    checkValidity() {
        return this.#exercise.internals.checkValidity();
    }
    reportValidity() {
        return this.#exercise.internals.reportValidity();
    }
    get validity() {
        return this.#exercise.internals.validity;
    }
    get validationMessage() {
        return this.#exercise.internals.validationMessage;
    }

    #reordered(event: CustomEvent<DragCommitDetail>) {
        const { key, index } = event.detail;
        if (key === undefined || index === null) return;
        const order = this.order.filter((id) => id !== key);
        order.splice(index, 0, key);
        this.#exercise.answer(order);
    }

    render() {
        const exercise = this.#exercise;
        const { editing, locked, result, revealed } = exercise;
        const labels = new Map(this.entries.map((entry) => [entry.id, entry.text]));
        const marks = result?.marks;
        return html`
            <p>${editing ? this.msg("Drag the items into the correct order.") : this.msg("Put the items in order.")}</p>
            <ol data-ww-drop="entry" data-ww-drop-position="index" @ww-dragcommit=${this.#reordered}>
                ${repeat(
                    this.order,
                    (id) => id,
                    (id, index) => html`
                        <li
                            data-ww-drag=${locked ? nothing : "entry"}
                            data-ww-key=${id}
                            data-ww-label=${labels.get(id) ?? id}
                            class=${marks ? (marks[index] ? "correct" : "wrong") : nothing}
                        >
                            <span>${labels.get(id)}</span>
                            ${marks ? html`<ww-order-mark ?correct=${marks[index]}></ww-order-mark>` : nothing}
                        </li>
                    `,
                )}
            </ol>
            ${editing
                ? nothing
                : html`
                      <button id="check" ?hidden=${exercise.mode === "submit"} ?disabled=${!exercise.available("check")} @click=${this.check}>
                          ${this.msg("Check")}
                      </button>
                      <button id="reset" ?disabled=${!exercise.available("reset")} @click=${this.reset}>${this.msg("Reset")}</button>
                      <button id="reveal" data-ww-can="allowSolution" ?disabled=${!exercise.available("showSolution")} @click=${this.showSolution}>
                          ${revealed ? this.msg("Hide solution") : this.msg("Show solution")}
                      </button>
                  `}
            <output>
                ${result
                    ? result.correct === result.total
                        ? this.msg("All items are in the right place.")
                        : this.msg(html`<b>${result.correct}</b> of ${result.total} items are in the right place.`)
                    : nothing}
            </output>
            ${revealed
                ? html`<p id="solution">${this.msg("Solution:")} ${(this.solution ?? []).map((id) => labels.get(id) ?? id).join(" → ")}</p>`
                : nothing}
        `;
    }
}
customElements.define("ww-order-exercise", OrderExercise);
