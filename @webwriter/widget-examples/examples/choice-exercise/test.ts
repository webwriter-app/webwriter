// Checks of the Exercise helper on a choice question, of its core on a plain
// element, and of how the helper's own catalogs and a widget's localizer agree.
import { html } from "lit";
import { assert, check, equal, events, listeners, mount, mutations, run, settled, typeInto, until, warnings } from "../../test/harness";
import { ExerciseCore, exerciseMessages, firstOrder, type ExerciseActions } from "@webwriter/widget/exercise";
import type { Catalog } from "@webwriter/widget/localize";
import { obfuscate, reveal } from "@webwriter/widget/obfuscate";
import { Exercise } from "@webwriter/lit/exercise";
import { localizer } from "@webwriter/lit/localize";
import { editor, MISSING, type Editor } from "../order-exercise/host";
import { ExampleElement } from "../shared/base";
import { ChoiceExercise } from "./index";

/** Registers a check that runs the editor's own code, or says that it was skipped without the editor sources. */
const editorCheck = (name: string, run: (editor: Editor) => unknown) => check(editor ? name : `${name}: ${MISSING}`, () => editor && run(editor));

/** Which planet is closest to the sun? Mercury (a). With `multiple`: which are closer than the earth? Mercury and Venus. */
const markup = (attributes = "", data = "{}", solution: string[] | null = ["a"]) =>
    `<ww-choice-exercise ${attributes} ${solution ? `solution="${obfuscate(solution)}"` : ""}>
        <data value="a">Mercury</data><data value="b">Venus</data><data value="c">Mars</data>
        <script type="application/json" slot="data">${data}</script>
    </ww-choice-exercise>`;
const inputs = (widget: Element) => [...widget.shadowRoot!.querySelectorAll("input")];
const input = (widget: Element, id: string) => widget.shadowRoot!.querySelector<HTMLInputElement>(`input[value="${id}"]`)!;
const ticked = (widget: Element) => inputs(widget).filter((each) => each.checked).map((each) => each.value);
const marks = (widget: Element) => [...widget.shadowRoot!.querySelectorAll("li")].map((item) => item.className || "none");
const text = (widget: Element, id: string) => widget.shadowRoot!.querySelector(`#${id}`)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const button = (widget: Element, id: string) => widget.shadowRoot!.querySelector<HTMLButtonElement>(`#${id}`)!;
const live = (widget: Element) => widget.shadowRoot!.querySelector("[data-ww-live]")?.textContent?.trim() ?? "";
const block = (widget: Element) => widget.querySelector<HTMLScriptElement>(":scope > script")!;
const stored = (widget: Element) => JSON.parse(block(widget).textContent!);
/** A real click: the browser ticks the control and sends `input` and `change`. */
const click = async (widget: Element, id: string) => {
    input(widget, id).click();
    await settled(widget);
};

// This check is the first of the page: it needs a catalog that nothing has asked for yet.
check("language: the helper's catalog is a file that is loaded for the language: English until it has arrived, and the editor is told when it has", async () => {
    assert(exerciseMessages.locales.includes("de") && !Object.hasOwn(exerciseMessages.catalogs, "de"), "the German catalog is shipped and was not loaded yet");
    // The helper also loads the catalog of the document's language, for the editor's drawer, and that is the browser's if the document names none.
    const root = document.documentElement;
    root.lang = "en";
    try {
        const page = await mount(`<div lang="en">${markup()}</div>`);
        const widget = page.firstElementChild as ChoiceExercise;
        await settled(widget);
        equal([button(widget, "check").textContent!.trim(), widget.actions.check.label], ["Check", { _: "Check" }]);

        const log = events("optionschange");
        page.lang = "de";
        equal([widget.actions.check.label, Object.hasOwn(exerciseMessages.catalogs, "de")], [{ _: "Check" }, false], "the language changed and the catalog is not there: the text is still English");
        await until(() => button(widget, "check").textContent!.trim() === "Prüfen", "the helper's text was not rendered again when its catalog arrived");
        equal(widget.actions.check.label, { _: "Check", de: "Prüfen" }, "the label of the action has the German text as well");
        equal(log.stop(), ["optionschange", "optionschange"], "the editor is told with the change of language, and again when the catalog has arrived");
    } finally {
        root.removeAttribute("lang");
    }
});

check("choice: a click becomes the response, in the data block and in the form value, as one undo step", async () => {
    const form = await mount<HTMLFormElement>(`<form>${markup(`name="planet"`)}</form>`);
    const widget = form.firstElementChild as ChoiceExercise;
    equal([inputs(widget).map((each) => each.type), ticked(widget)], [["radio", "radio", "radio"], []]);
    equal([widget.response, new FormData(form).has("planet")], [undefined, false], "no response until the reader answers: the form value is null");

    let atEnd = "";
    widget.addEventListener("ww-transactionend", () => (atEnd = block(widget).textContent!), { once: true });
    const log = events("ww-transactionstart", "ww-transactionend");
    const changes = mutations(widget);
    await click(widget, "b");
    equal([widget.response, stored(widget), new FormData(form).get("planet")], [["b"], { choice: ["b"] }, `["b"]`]);
    equal(log.stop(), ["ww-transactionstart", "ww-transactionend"], "one undo step");
    equal(JSON.parse(atEnd), { choice: ["b"] }, "with the write inside it");
    equal(changes.stop().filter((record) => record.target !== block(widget)).length, 0, "nothing but the data block was written to the document");

    await click(widget, "c");
    equal([ticked(widget), stored(widget).choice], [["c"], ["c"]], "one answer replaces the other");
});

check("choice: with `multiple` several answers are ticked, and nothing ticked is no response", async () => {
    const form = await mount<HTMLFormElement>(`<form>${markup(`name="planets" multiple required`, "{}", ["a", "b"])}</form>`);
    const widget = form.firstElementChild as ChoiceExercise;
    equal(inputs(widget).map((each) => each.type), ["checkbox", "checkbox", "checkbox"]);
    assert(widget.matches(":invalid") && !form.checkValidity(), "required and unanswered: invalid");
    await click(widget, "c");
    await click(widget, "a");
    equal([widget.response, new FormData(form).get("planets")], [["a", "c"], `["a","c"]`], "the response is in the authored order, whatever was ticked first");
    assert(widget.matches(":valid") && form.checkValidity(), "answered: valid");
    await click(widget, "a");
    await click(widget, "c");
    equal([widget.response, stored(widget), new FormData(form).has("planets")], [undefined, {}, false], "everything unticked: no response again");
    assert(widget.matches(":invalid"), "so a required question is unanswered again");
});

check("choice: the form resets and disables the widget through the platform", async () => {
    const form = await mount<HTMLFormElement>(`<form><fieldset>${markup(`name="planet" required`)}</fieldset></form>`);
    const fieldset = form.firstElementChild as HTMLFieldSetElement;
    const widget = fieldset.firstElementChild as ChoiceExercise;
    await click(widget, "b");
    form.reset();
    await settled(widget);
    equal([ticked(widget), stored(widget), widget.matches(":invalid")], [[], {}, true], "a form reset clears the response");

    fieldset.disabled = true;
    await settled(widget);
    assert(inputs(widget).every((each) => each.disabled) && button(widget, "check").disabled, "a disabled fieldset locks the interface");
    input(widget, "b").click();
    await settled(widget);
    equal([ticked(widget), stored(widget)], [[], {}], "a click does nothing");
    fieldset.disabled = false;
    await settled(widget);
    await click(widget, "b");
    equal(widget.response, ["b"]);

    // What the browser hands back after a reload.
    widget.reset();
    widget.formStateRestoreCallback(`["c"]`, "restore");
    await settled(widget);
    equal([ticked(widget), stored(widget)], [["c"], { choice: ["c"] }], "a restored form state is the response again");
});

check("choice: submitted locks the interface; a change by the widget withdraws it in the same undo step; a snapshot from outside leaves it", async () => {
    const widget = await mount<ChoiceExercise>(markup(`submitted`, `{"choice":["b"]}`));
    equal(ticked(widget), ["b"], "the stored response is shown");
    assert(inputs(widget).every((each) => each.disabled) && button(widget, "check").disabled && button(widget, "reset").disabled, "inputs and buttons are disabled");
    equal([widget.actions.check.disabled, widget.actions.reset.disabled], [true, true], "and the actions unavailable");
    const changes = mutations(widget);
    input(widget, "c").click();
    await settled(widget);
    equal([changes.stop().length, ticked(widget)], [0, ["b"]], "a click changes nothing");

    block(widget).textContent = `{"choice":["c"]}`; // a restore, a replay, an undo
    await settled(widget);
    equal(ticked(widget), ["c"], "a snapshot from outside is shown");
    assert(widget.hasAttribute("submitted") && inputs(widget).every((each) => each.disabled), "and the submission stays");

    let atEnd: [string | null, string] | undefined;
    widget.addEventListener("ww-transactionend", () => (atEnd = [widget.getAttribute("submitted"), block(widget).textContent!]), { once: true });
    const log = events("ww-transactionstart", "ww-transactionend");
    widget.reset(); // any change the widget makes to the response
    equal(atEnd, [null, "{}"], "the attribute and the data block changed inside one transaction");
    equal(log.stop(), ["ww-transactionstart", "ww-transactionend"]);
    await settled(widget);
    assert(!inputs(widget).some((each) => each.disabled), "unlocked");
    await click(widget, "a");
    equal(stored(widget).choice, ["a"]);
});

check("choice: Check marks each choice and speaks the summary from the helper's German catalog; a new response ends the feedback", async () => {
    const widget = await mount<ChoiceExercise>(markup(`lang="de"`));
    equal([button(widget, "check").textContent!.trim(), button(widget, "reset").textContent!.trim()], ["Prüfen", "Zurücksetzen"], "the helper's own text names the buttons");
    equal([marks(widget), text(widget, "summary"), live(widget)], [["none", "none", "none"], "", ""], "no feedback before Check");
    assert(button(widget, "reset").disabled, "nothing to reset yet");

    await click(widget, "b");
    button(widget, "check").click();
    await settled(widget);
    equal(marks(widget), ["wrong", "wrong", "correct"], "Mercury was missed, Venus is wrong, Mars is rightly left out");
    equal([text(widget, "summary"), live(widget)], ["0 von 1 richtig.", "0 von 1 richtig."], "one answer is right or wrong as a whole; shown and spoken");

    await click(widget, "a");
    equal([marks(widget), text(widget, "summary")], [["none", "none", "none"], ""], "the feedback belonged to the old response");
    button(widget, "check").click();
    await settled(widget);
    equal([marks(widget), live(widget)], [["correct", "correct", "correct"], "Alles richtig."]);
    button(widget, "check").click();
    // The same text again is no change for a live region, so the announcer varies it.
    const spoken = widget.shadowRoot!.querySelector("[data-ww-live]")!.textContent!;
    assert(spoken !== "Alles richtig." && spoken.trim() === "Alles richtig.", "Check again is spoken again");

    button(widget, "reset").click();
    await settled(widget);
    equal([ticked(widget), stored(widget), text(widget, "summary")], [[], {}, ""]);

    const several = await mount<ChoiceExercise>(markup(`multiple lang="en"`, `{"choice":["a","c"]}`, ["a", "b"]));
    several.check();
    await settled(several);
    equal([marks(several), text(several, "summary"), live(several)], [["correct", "wrong", "wrong"], "1 of 3 correct.", "1 of 3 correct."], "several answers are counted choice by choice");
});

check("choice: with feedback=\"submit\" there is no Check, and the feedback is shown and spoken with the submission", async () => {
    const widget = await mount<ChoiceExercise>(markup(`feedback="submit" lang="en"`));
    assert(button(widget, "check").hidden && widget.actions.check.disabled, "no Check button and no Check action");
    await click(widget, "a");
    widget.check();
    await settled(widget);
    equal([marks(widget), live(widget)], [["none", "none", "none"], ""], "nothing before the submission");
    widget.setAttribute("submitted", ""); // the reader chrome
    await settled(widget);
    equal([marks(widget), text(widget, "summary"), live(widget)], [["correct", "correct", "correct"], "Everything is correct.", "Everything is correct."]);

    const restored = await mount<ChoiceExercise>(markup(`feedback="submit" submitted lang="en"`, `{"choice":["b"]}`));
    equal([text(restored, "summary"), live(restored)], ["0 of 1 correct.", ""], "feedback that is there on load is shown, not spoken");
});

check("choice: in edit mode the same click records the solution, obfuscated, in an undo step that lasts until it is written", async () => {
    const widget = await mount<ChoiceExercise>(markup(`contenteditable multiple lang="en"`, "{}", null));
    equal([widget.solution, text(widget, "instruction")], [undefined, "Tick the correct answers."]);
    assert(!button(widget, "check"), "an author gets no Check button");
    const log = events("ww-transactionstart", "ww-transactionend");
    let atEnd: string | null = null;
    widget.addEventListener("ww-transactionend", () => (atEnd = widget.getAttribute("solution")), { once: true });
    input(widget, "b").click();
    equal([log.log, widget.hasAttribute("solution")], [["ww-transactionstart"], false], "the step is open and the attribute not written yet");
    await settled(widget);
    equal([log.stop(), reveal(atEnd)], [["ww-transactionstart", "ww-transactionend"], ["b"]], "it ended after the render that wrote the attribute");
    await click(widget, "a");
    equal([widget.solution, ticked(widget)], [["a", "b"], ["a", "b"]], "the author sees the solution ticked");
    assert(!widget.getAttribute("solution")!.includes("a") || !widget.getAttribute("solution")!.includes('"'), "not readable in the source");
    equal(block(widget).textContent, "{}", "the data block, which belongs to the reader, is untouched");

    widget.removeAttribute("contenteditable");
    await settled(widget);
    equal(ticked(widget), [], "a reader starts with nothing ticked");
});

check("choice: showing the solution needs the permission, and the action is a toggle", async () => {
    const widget = await mount<ChoiceExercise>(markup(`lang="en"`));
    assert(button(widget, "reveal").hidden && widget.actions.showSolution!.disabled, "hidden and unavailable without the permission");
    widget.showSolution();
    await settled(widget);
    equal(marks(widget), ["none", "none", "none"], "calling the action without the permission shows nothing");
    widget.setAttribute("allow-solution", "");
    await settled(widget);
    button(widget, "reveal").click();
    await settled(widget);
    equal([marks(widget), button(widget, "reveal").textContent!.trim()], [["solution", "none", "none"], "Hide solution"]);
    button(widget, "reveal").click();
    await settled(widget);
    equal([marks(widget), button(widget, "reveal").textContent!.trim()], [["none", "none", "none"], "Show solution"]);
});

check("choice: a shuffle is the same in every render, differs between readers, and the author sees the written order", async () => {
    const many = Array.from({ length: 8 }, (_, index) => `<data value="${index}">Choice ${index}</data>`).join("");
    const page = await mount(`<div>${[1, 2, 3, 4].map(() => `<ww-choice-exercise shuffle>${many}</ww-choice-exercise>`).join("")}</div>`);
    const widgets = [...page.children] as ChoiceExercise[];
    const order = (widget: Element) => inputs(widget).map((each) => each.value).join("");
    const first = widgets.map(order);
    assert(first.every((each) => [...each].sort().join("") === "01234567"), "every choice once");
    assert(new Set(first).size > 1, `four readers do not all get the same order: ${first}`);
    for (const widget of widgets) {
        input(widget, "3").click();
        widget.requestUpdate();
        await settled(widget);
    }
    equal(widgets.map(order), first, "the same order after a response and further renders");
    equal(widgets[0].response, ["3"]);
    widgets[0].setAttribute("contenteditable", "");
    await settled(widgets[0]);
    equal(order(widgets[0]), "01234567", "the author sees the choices as written");
    equal(firstOrder(["x", "y", "z"], { seed: 7 }), firstOrder(["x", "y", "z"], { seed: 7 }));
});

editorCheck("choice: the aggregate declaration (shape selection) resolves in the editor's own code", async ({ aggregateContext, resolveAggregate }) => {
    const widget = await mount<ChoiceExercise>(markup(`id="planet" multiple`, "{}", ["a", "b"]));
    const snapshot = (value: unknown, status = "ready") => ({ data: { status, format: "json", mode: "individual", text: JSON.stringify(value) } });
    const context = aggregateContext(
        { id: widget.id, attributes: Object.fromEntries(Array.from(widget.attributes, ({ name, value }) => [name, value])), html: widget.outerHTML },
        [
            { id: "p1", name: "Ada", snapshot: snapshot({ choice: ["a", "b"] }) },
            { id: "p2", name: "Ben", snapshot: snapshot({ choice: ["c"] }) },
            { id: "p3", name: "Cem", snapshot: snapshot({}) }, // opened it, ticked nothing
            { id: "p4", name: "Dua", snapshot: snapshot({}, "pending") },
        ],
    );
    const resolved = resolveAggregate(widget, context)!;
    equal(resolved.config.shape, "selection");
    equal(resolved.config.items, [
        { id: "a", label: "Mercury" },
        { id: "b", label: "Venus" },
        { id: "c", label: "Mars" },
    ]);
    equal([resolved.values, resolved.context.missing, resolved.context.reference], [[["a", "b"], ["c"]], 2, ["a", "b"]]);
});

check("choice: a removed widget leaves no listener behind", async () => {
    const before = listeners();
    const widget = await mount<ChoiceExercise>(markup(`lang="de" allow-solution`));
    await click(widget, "b");
    button(widget, "check").click();
    await settled(widget);
    assert(widget.shadowRoot!.querySelector("[data-ww-live]"), "the live region is there while the widget is connected");
    const internal = listeners(widget, widget.shadowRoot!);
    const parent = widget.parentElement!;
    widget.remove();
    equal(listeners(), before, "nothing left on window or document");
    assert(!widget.shadowRoot!.querySelector("[data-ww-live]"), "the live region is gone");
    assert(!Object.hasOwn(widget, "actions"), "the actions are the getter of the class: the helper never put anything on the instance");
    parent.append(widget);
    await settled(widget);
    equal([ticked(widget), listeners(widget, widget.shadowRoot!)], [["b"], internal], "it works again after a reconnect, with the same listeners");
});

// ── The helper's catalogs and the widget's localizer ──────────────────────

check("language: the helper's text and the widget's own text are in the same language, also after a change, and the first paint is already right", async () => {
    // Watch the shadow root from before the first render.
    const page = await mount(`<div lang="de"></div>`);
    page.innerHTML = markup();
    const widget = page.firstElementChild as ChoiceExercise;
    const seen = new Set<string>();
    const look = () => {
        const instruction = text(widget, "instruction");
        if (instruction) seen.add(`${instruction} / ${button(widget, "check").textContent!.trim()}`);
    };
    const observer = new MutationObserver(look);
    observer.observe(widget.shadowRoot!, { childList: true, characterData: true, subtree: true });
    await until(() => text(widget, "instruction"), "the first paint");
    look();
    equal([...seen], ["Kreuze eine Antwort an. / Prüfen"], "the widget waited for its catalog, and the helper's had arrived before: German from the first paint, in both texts");

    const log = events("optionschange");
    page.lang = "en";
    await until(() => text(widget, "instruction") === "Tick one answer.", "the widget's own text follows");
    equal(button(widget, "check").textContent!.trim(), "Check", "and so does the helper's");
    widget.lang = "de-AT";
    await until(() => text(widget, "instruction") === "Kreuze eine Antwort an.");
    equal([button(widget, "check").textContent!.trim(), widget.localize.getLocale()], ["Prüfen", "de"], "a regional tag finds the same catalog on both sides");
    observer.disconnect();

    // Drawer labels are localized text maps with one entry per catalog that has arrived: the editor picks the author's language.
    equal(widget.actions.check.label, { _: "Check", de: "Prüfen" });
    equal(widget.actions.showSolution!.label, { _: "Show solution", de: "Lösung anzeigen" });
    equal((ChoiceExercise.options.feedback.options[1].label as Record<string, string>).de, "Nach dem Abgeben");
    // The helper still tells the editor with every change of the widget's language: a catalog may have arrived with it,
    // and a widget may pass labels in its own language. The German catalog was there, so it is once per change.
    equal(log.stop(), ["optionschange", "optionschange"], "a language change sends one optionschange");
});

type Deferred = { promise: Promise<Catalog>; resolve(catalog: Catalog): void };
/** A widget with a gated catalog and the Exercise helper, to compare the two sides while the catalog loads. */
function probe(targetLocales: string[], sourceLocale = "en") {
    let resolve!: Deferred["resolve"];
    const gate: Deferred = { promise: new Promise((done) => (resolve = done)), resolve: (catalog) => resolve(catalog) };
    class LanguageProbe extends ExampleElement {
        static formAssociated = true;
        localize = localizer(this, { sourceLocale, targetLocales, load: () => gate.promise });
        msg = this.localize.msg;
        exercise = new Exercise<string>(this, { response: () => undefined, respond: () => {}, solution: () => undefined, score: () => ({ correct: 0, total: 0 }) });
        check() {}
        reset() {}
        render() {
            return html`<b>${this.msg("Check")}</b><i>${this.exercise.text.check}</i>`;
        }
    }
    const tag = `ww-language-probe-${++probes}`;
    customElements.define(tag, LanguageProbe);
    const shown = (widget: Element) => [widget.shadowRoot!.querySelector("b")!.textContent, widget.shadowRoot!.querySelector("i")!.textContent];
    return { tag, gate, shown };
}
let probes = 0;
const CHECK = "s42cbd8dca939a9c7"; // the generated id of the message "Check"

check("finding: while the widget's catalog loads, the helper's text is already in the new language", async () => {
    const { tag, gate, shown } = probe(["de"]);
    const widget = await mount(`<${tag}></${tag}>`);
    equal(shown(widget), ["Check", "Check"]);
    widget.lang = "de";
    await until(() => shown(widget)[1] === "Prüfen", "the helper loads its own catalog and does not wait for the widget's");
    equal(shown(widget), ["Check", "Prüfen"], "the widget still shows the language it had: one widget, two languages, until the catalog is in");
    gate.resolve({ templates: { [CHECK]: "Prüfen" } });
    await until(() => shown(widget)[0] === "Prüfen", "then they agree");
});

check("finding: the two sides fall back differently when one of them lacks the language", async () => {
    // The widget is translated into Klingon, the helper is not: its text stays English.
    assert(!exerciseMessages.locales.includes("tlh"), "the helper ships no Klingon catalog");
    const klingon = probe(["tlh"]);
    const first = await mount(`<${klingon.tag} lang="tlh"></${klingon.tag}>`);
    klingon.gate.resolve({ templates: { [CHECK]: "yInuD" } });
    await until(() => klingon.shown(first)[0] === "yInuD");
    equal(klingon.shown(first), ["yInuD", "Check"]);
    // A widget written in German shows its source text for a language nobody has; the helper falls back to English.
    const german = probe([], "de");
    const second = await mount(`<${german.tag} lang="tlh"></${german.tag}>`);
    equal(german.shown(second), ["Check", "Check"], "the helper: English");
    equal((second as unknown as { localize: { getLocale(): string } }).localize.getLocale(), "de", "the widget: its source locale, German");
});

check("language: inside another shadow tree the widget and the helper's text both follow the page's language", async () => {
    const page = await mount(`<section lang="de"><div><template shadowrootmode="open">${markup()}</template></div></section>`);
    const widget = page.firstElementChild!.shadowRoot!.firstElementChild as ChoiceExercise;
    await settled(widget);
    equal(widget.lang, "de", "`lang` is inherited through the shadow root, as in HTML");
    await until(() => widget.localize.getLocale() === "de", "the widget's localizer is asked for German");
    await until(() => button(widget, "check").textContent!.trim() === "Prüfen", "and the helper's text is German");
});

// ── The core without a framework ──────────────────────────────────────────

/** The declaration the helper puts on the instance. Declared as an accessor, so that a subclass may also define the getter itself. */
interface PlainAnswer {
    get actions(): ExerciseActions | undefined;
}
/** A free-text answer on the core alone. */
class PlainAnswer extends HTMLElement {
    static formAssociated = true;
    static options: Partial<ConstructorParameters<typeof ExerciseCore<string>>[1]> = {};
    value: string | undefined;
    readonly exercise = new ExerciseCore<string>(this, {
        response: () => this.value,
        respond: (value) => (this.value = value || undefined),
        solution: () => reveal(this.getAttribute("solution")) as string | undefined,
        score: (value, solution) => ({ correct: value === solution ? 1 : 0, total: 1 }),
        anchor: () => this.shadowRoot!.querySelector("input"),
        ...(this.constructor as typeof PlainAnswer).options,
    });
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `<input><output></output>`;
        this.shadowRoot!.addEventListener("change", (event) => {
            this.exercise.respond((event.target as HTMLInputElement).value);
            this.render();
        });
    }
    connectedCallback() {
        this.exercise.connect();
        this.render();
    }
    disconnectedCallback() {
        this.exercise.disconnect();
    }
    check() {
        this.exercise.check();
        this.render();
    }
    reset() {
        this.exercise.reset();
        this.render();
    }
    formResetCallback() {
        this.reset();
    }
    render() {
        const field = this.shadowRoot!.querySelector("input")!;
        field.value = this.value ?? "";
        field.disabled = this.exercise.locked;
        this.shadowRoot!.querySelector("output")!.textContent = this.exercise.summary;
        this.exercise.refresh();
    }
}
customElements.define("ww-plain-answer", PlainAnswer);

check("core: a plain element takes part in the form with the same helper", async () => {
    const form = await mount<HTMLFormElement>(`<form><ww-plain-answer name="capital" required lang="de" solution="${obfuscate("Paris")}"></ww-plain-answer></form>`);
    const widget = form.firstElementChild as PlainAnswer;
    const field = widget.shadowRoot!.querySelector("input")!;
    equal([new FormData(form).has("capital"), widget.exercise.internals.validity.valueMissing], [false, true]);
    equal(widget.exercise.internals.validationMessage, "Bitte beantworte diese Aufgabe.", "the validation message is in the widget's language");
    widget.lang = "en";
    await until(() => widget.exercise.internals.validationMessage === "Please answer this question.", "and follows it");

    typeInto(field, "Lyon", "input", "change");
    equal(new FormData(form).get("capital"), "Lyon", "a text response is the form value as it is, not as JSON");
    assert(widget.exercise.internals.validity.valid && form.checkValidity());
    equal(Object.keys(widget.actions!), ["check", "reset"], "no showSolution without a permission for it");
    widget.check();
    equal([widget.shadowRoot!.querySelector("output")!.textContent, live(widget)], ["0 of 1 correct.", "0 of 1 correct."]);

    widget.setAttribute("submitted", "");
    await until(() => widget.exercise.getSnapshot().locked, "the core follows the attribute by itself");
    widget.render();
    assert(field.disabled && widget.actions!.check.disabled, "locked");
    widget.reset();
    assert(!widget.hasAttribute("submitted") && !field.disabled, "a change by the widget withdraws the submission");
    form.reset();
    equal([widget.value, new FormData(form).has("capital")], [undefined, false]);

    widget.remove();
    assert(!Reflect.has(widget, "actions") && !widget.shadowRoot!.querySelector("[data-ww-live]"), "disconnected: the declaration and the live region are gone");
    widget.setAttribute("submitted", "");
    await settled(widget);
    assert(!widget.exercise.getSnapshot().submitted, "and the core no longer follows the widget's attributes");
});

check("core: development warnings for a class that cannot take part in Submit or lacks an action's method, and the ways to opt out", async () => {
    class NoForm extends PlainAnswer {
        static formAssociated = false;
    }
    class NoReset extends PlainAnswer {}
    Object.defineProperty(NoReset.prototype, "reset", { value: undefined });
    class OwnActions extends PlainAnswer {
        static options = { actions: false, serialize: (value: string) => value.toUpperCase(), announce: false };
    }
    class Getter extends PlainAnswer {
        // A plain element is free to declare the getter itself. The helper then leaves it alone.
        get actions() {
            return { ...this.exercise.actions, hint: { label: { _: "Hint" }, disabled: false } };
        }
    }
    customElements.define("ww-plain-noform", NoForm);
    customElements.define("ww-plain-noreset", NoReset);
    customElements.define("ww-plain-own", OwnActions);
    customElements.define("ww-plain-getter", Getter);

    const log = warnings();
    await mount(`<ww-plain-noform></ww-plain-noform>`);
    await mount(`<ww-plain-noreset></ww-plain-noreset>`);
    const messages = log.stop();
    assert(messages.some((message) => message.includes("<ww-plain-noform>") && message.includes("formAssociated")), `not form-associated: ${messages}`);
    assert(messages.some((message) => message.includes("<ww-plain-noreset>") && message.includes("reset()")), `no reset(): ${messages}`);

    const form = await mount<HTMLFormElement>(`<form><ww-plain-own name="own"></ww-plain-own><ww-plain-getter></ww-plain-getter></form>`);
    const [own, getter] = form.children as unknown as PlainAnswer[];
    assert(!Reflect.has(own, "actions"), "actions: false leaves the host alone");
    assert(!own.shadowRoot!.querySelector("[data-ww-live]"), "announce: false creates no live region");
    typeInto(own.shadowRoot!.querySelector("input")!, "rome", "change");
    equal(new FormData(form).get("own"), "ROME", "serialize decides the form value");
    equal(Object.keys(getter.actions!), ["check", "reset", "hint"], "a getter of the class is not replaced");
});

run();
