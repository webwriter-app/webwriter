import { css, html, nothing } from "lit";
import { jsonData } from "@webwriter/lit/data";
import { Exercise, exerciseAggregate, exerciseOptions, exerciseProperties, firstOrder, obfuscated, scoreOf } from "@webwriter/lit/exercise";
import { localizer } from "@webwriter/lit/localize";
import { Permissions } from "@webwriter/lit/permissions";
import { ExampleElement } from "../shared/base";
import { sourceLocale, targetLocales } from "./localization/generated/locale-codes";

type Choice = { id: string; text: string };

/** The authored choices: `<data value="id">Text</data>` children. */
function choicesOf(widget: ParentNode): Choice[] {
    return Array.from(widget.querySelectorAll<HTMLDataElement>(":scope > data")).map((choice) => ({
        id: choice.value,
        text: choice.textContent?.trim() ?? "",
    }));
}

/**
 * A single- or multiple-choice question on the Exercise helper. The author
 * writes the choices as children and ticks the correct ones in edit mode; a
 * reader ticks an answer in read mode. The labels of the actions and the
 * summary come from the helper's own catalogs; only the widget's own
 * sentences go through its localizer.
 */
export class ChoiceExercise extends ExampleElement {
    static formAssociated = true;

    static properties = {
        ...exerciseProperties,
        solution: { converter: obfuscated, reflect: true },
        multiple: { type: Boolean, reflect: true },
        shuffle: { type: Boolean, reflect: true },
        allowSolution: { type: Boolean, attribute: "allow-solution", reflect: true },
    };

    static options = {
        ...exerciseOptions,
        multiple: { type: Boolean, label: { _: "Several answers", de: "Mehrere Antworten" } },
        shuffle: { type: Boolean, label: { _: "Shuffle for each reader", de: "Für jede Person mischen" } },
    };

    static permissions = {
        allowSolution: { label: { _: "Learners may reveal the solution", de: "Lernende dürfen die Lösung anzeigen" } },
    };

    static aggregate = exerciseAggregate({
        shape: "selection",
        items: (widget) => choicesOf(widget).map(({ id, text }) => ({ id, label: text })),
        value: "choice",
    });

    static styles = css`
        :host { display: block; }
        ul { display: flex; flex-direction: column; gap: 0.4rem; margin: 0.5rem 0; padding: 0; list-style: none; }
        label { display: flex; gap: 0.5rem; padding: 0.4rem 0.6rem; border: 1px solid #c8c8c8; border-radius: 6px; }
        li.correct label { border-color: #1b6e3c; }
        li.wrong label { border-color: #b3261e; }
        li.solution label { background: #e7f4ec; }
        #summary { min-height: 1.5em; margin: 0.5rem 0 0; }
    `;

    /** The ids of the correct choices. Kept obfuscated in the `solution` attribute. */
    declare solution: string[] | undefined;
    /** Several choices can be ticked. */
    declare multiple: boolean;
    /** Shuffle the choices for each reader instead of showing them as the author wrote them. */
    declare shuffle: boolean;

    localize = localizer(this, { sourceLocale, targetLocales, load: (locale) => import(`./localization/generated/${locale}.ts`) });
    msg = this.localize.msg;

    readonly #permissions = new Permissions(this);
    /** The response: `{choice: [...]}`, the ticked ids in the authored order. */
    readonly #data = jsonData<{ choice?: string[] }>(this, {
        defaults: {},
        validate: ({ choice }) => choice === undefined || (Array.isArray(choice) && choice.every((id) => typeof id === "string")),
    });
    readonly #exercise = new Exercise(this, {
        response: () => this.#data.get().choice,
        // Nothing ticked is no response, so that a required question stays unanswered.
        respond: (choice) => this.#data.set({ choice: choice?.length ? choice : undefined }),
        solution: () => this.solution,
        record: (choice) => (this.solution = choice),
        score: (choice = [], solution) => {
            const marks = this.choices.map(({ id }) => choice.includes(id) === solution.includes(id));
            // One answer is right or wrong as a whole; several are counted choice by choice.
            return this.multiple ? scoreOf(marks) : { marks, correct: marks.every(Boolean) ? 1 : 0, total: 1 };
        },
        anchor: () => this.renderRoot.querySelector("input"),
        showSolution: "allowSolution",
    });

    get choices(): Choice[] {
        return choicesOf(this);
    }

    /** The reader's response: the ticked ids. Undefined until something is ticked. */
    get response(): string[] | undefined {
        return this.#data.get().choice;
    }

    /** The choices in the order they are shown: as written for the author, by the first-order rule for a reader. */
    get shown(): Choice[] {
        const { editing, seed } = this.#exercise;
        return editing || !this.shuffle ? this.choices : firstOrder(this.choices, { seed });
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

    formResetCallback() {
        this.#exercise.formReset();
    }
    formDisabledCallback(disabled: boolean) {
        this.#exercise.formDisabled(disabled);
    }
    formStateRestoreCallback(state: unknown, mode: string) {
        this.#exercise.formStateRestore(state, mode);
    }

    /** Waits for the catalog before the first paint, so that a German page never shows the English text first. */
    protected async scheduleUpdate() {
        if (!this.hasUpdated) await this.localize.loaded;
        return super.scheduleUpdate();
    }

    /** The ticked ids: the solution for the author, the response for a reader. */
    get #ticked(): string[] {
        return (this.#exercise.editing ? this.solution : this.response) ?? [];
    }

    #tick(id: string, on: boolean) {
        const ticked = this.multiple ? this.#ticked.filter((other) => other !== id) : [];
        if (on) ticked.push(id);
        this.#exercise.answer(this.choices.map((choice) => choice.id).filter((other) => ticked.includes(other)));
    }

    render() {
        const exercise = this.#exercise;
        const { editing, locked, result, revealed, text } = exercise;
        const ticked = this.#ticked;
        const marks = result ? new Map(this.choices.map(({ id }, index) => [id, result.marks[index]])) : null;
        const instruction = editing
            ? this.msg("Tick the correct answers.")
            : this.multiple
              ? this.msg("Tick every answer that applies.")
              : this.msg("Tick one answer.");
        return html`
            <p id="instruction">${instruction}</p>
            <ul>
                ${this.shown.map(
                    ({ id, text: label }) => html`
                        <li class=${marks ? (marks.get(id) ? "correct" : "wrong") : revealed && this.solution?.includes(id) ? "solution" : nothing}>
                            <label>
                                <input
                                    type=${this.multiple ? "checkbox" : "radio"}
                                    name="choice"
                                    value=${id}
                                    .checked=${ticked.includes(id)}
                                    ?disabled=${locked}
                                    @change=${(event: Event) => this.#tick(id, (event.target as HTMLInputElement).checked)}
                                />
                                ${label}
                            </label>
                        </li>
                    `,
                )}
            </ul>
            ${editing
                ? nothing
                : html`
                      <button id="check" ?hidden=${exercise.mode === "submit"} ?disabled=${!exercise.available("check")} @click=${this.check}>${text.check}</button>
                      <button id="reset" ?disabled=${!exercise.available("reset")} @click=${this.reset}>${text.reset}</button>
                      <button id="reveal" data-ww-can="allowSolution" ?disabled=${!exercise.available("showSolution")} @click=${this.showSolution}>
                          ${revealed ? text.hideSolution : text.showSolution}
                      </button>
                  `}
            <p id="summary">${exercise.summary}</p>
        `;
    }
}
customElements.define("ww-choice-exercise", ChoiceExercise);
