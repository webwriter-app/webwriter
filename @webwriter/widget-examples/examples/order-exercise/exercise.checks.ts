// Checks of the Exercise helper on the ordering question.
import { animations, assert, check, drag, equal, events, key, listeners, mount, mutations, point, settled, warnings } from "../../test/harness";
import { html } from "lit";
import { exerciseAggregate, firstOrder } from "@webwriter/widget/exercise";
import { Exercise, scoreOf } from "@webwriter/lit/exercise";
import { ExampleElement } from "../shared/base";
import { isObfuscated, obfuscate, obfuscated, reveal } from "@webwriter/widget/obfuscate";
import { editor, MISSING, type Editor } from "./host";
import { OrderExercise } from "./index";

/** Registers a check that runs the editor's own code, or says that it was skipped without the editor sources. */
const editorCheck = (name: string, run: (editor: Editor) => unknown) => check(editor ? name : `${name}: ${MISSING}`, () => editor && run(editor));

const SOLUTION = ["a", "b", "c"];
/** Authored order: Boil, Add, Cool. Correct order: Add, Boil, Cool. */
const markup = (attributes = "", data = "{}", solution: string[] | null = SOLUTION) =>
    `<ww-order-exercise ${attributes} ${solution ? `solution="${obfuscate(solution)}"` : ""}>
        <data value="b">Boil the water</data><data value="a">Add the tea</data><data value="c">Cool it down</data>
        <script type="application/json" slot="data">${data}</script>
    </ww-order-exercise>`;
const items = (widget: Element) => [...widget.shadowRoot!.querySelectorAll<HTMLElement>("li")];
const shown = (widget: Element) => items(widget).map((item) => item.dataset.wwKey);
const block = (widget: Element) => widget.querySelector<HTMLScriptElement>(":scope > script")!;
const stored = (widget: Element) => JSON.parse(block(widget).textContent!);
const button = (widget: Element, id: string) => widget.shadowRoot!.querySelector<HTMLButtonElement>(`#${id}`)!;
const output = (widget: Element) => widget.shadowRoot!.querySelector("output")!.textContent!.replace(/\s+/g, " ").trim();
const feedback = (widget: Element) => items(widget).map((item) => item.className || "none");
const below = (element: Element) => point(element, 0.5, 0.9);
const above = (element: Element) => point(element, 0.5, 0.1);

check("exercise: a reader's drag becomes the response, in the data block and in the form value, as one undo step", async () => {
    const form = await mount<HTMLFormElement>(`<form>${markup(`name="steps"`)}</form>`);
    const widget = form.firstElementChild as OrderExercise;
    equal(shown(widget), ["b", "a", "c"], "the authored order before any response");
    equal(new FormData(form).has("steps"), false, "no response, no form value");

    let atEnd = "";
    widget.addEventListener("ww-transactionend", () => (atEnd = block(widget).textContent!), { once: true });
    const log = events("ww-transactionstart", "ww-dragcommit", "ww-transactionend");
    const changes = mutations(widget);
    await drag(items(widget)[0], below(items(widget)[2]), {
        held: () => equal(block(widget).textContent, "{}", "nothing is written before the release"),
    });
    equal(shown(widget), ["a", "c", "b"]);
    equal(widget.response, ["a", "c", "b"]);
    equal(stored(widget), { order: ["a", "c", "b"] });
    equal(new FormData(form).get("steps"), `["a","c","b"]`);
    equal(log.stop(), ["ww-transactionstart", "ww-dragcommit", "ww-transactionend"], "one transaction around the commit");
    equal(JSON.parse(atEnd), { order: ["a", "c", "b"] }, "and the write is inside it");
    equal(changes.stop().filter((record) => record.target !== block(widget)).length, 0, "nothing but the data block was written to the document");

    await drag(items(widget)[2], above(items(widget)[1])); // b in front of c
    equal(stored(widget).order, SOLUTION);
});

check("exercise: the keyboard gives the same response", async () => {
    const widget = await mount<OrderExercise>(markup());
    items(widget)[0].focus();
    key(" ");
    key("ArrowDown");
    key("Enter");
    await animations();
    equal(shown(widget), ["a", "b", "c"]);
    equal(stored(widget).order, ["a", "b", "c"]);
});

check("exercise: a required exercise without a response is invalid, with a localized message", async () => {
    const form = await mount<HTMLFormElement>(`<form lang="en">${markup(`name="steps" required`)}${markup(`name="optional"`)}</form>`);
    const [widget, optional] = form.children as unknown as OrderExercise[];
    assert(widget.matches(":invalid") && !widget.checkValidity() && widget.validity.valueMissing, "required and empty: value missing");
    equal(widget.validationMessage, "Put the items in order.");
    assert(!form.checkValidity(), "the form is invalid with it");
    assert(optional.matches(":valid") && optional.checkValidity(), "not required: valid without a response");

    await drag(items(widget)[0], below(items(widget)[2]));
    assert(widget.matches(":valid") && widget.checkValidity() && form.checkValidity(), "valid once there is a response");

    form.reset();
    await settled(widget);
    assert(widget.matches(":invalid"), "a form reset clears the response");
    equal(stored(widget), {});
    equal(shown(widget), ["b", "a", "c"]);
});

check("exercise: submitted locks the input, and removing it unlocks", async () => {
    const widget = await mount<OrderExercise>(markup(`submitted`, `{"order":["c","b","a"]}`));
    equal(shown(widget), ["c", "b", "a"], "the stored response is shown");
    assert(button(widget, "check").disabled && button(widget, "reset").disabled, "Check and Reset are disabled");
    assert(items(widget).every((item) => !item.hasAttribute("data-ww-drag")), "the items are not draggable");
    assert(widget.actions.check.disabled && widget.actions.reset.disabled, "the drawer actions are unavailable");

    const changes = mutations(widget);
    const log = events("ww-dragcommit", "ww-transactionstart");
    await drag(items(widget)[0], below(items(widget)[2]));
    items(widget)[0].focus();
    key(" ");
    key("ArrowDown");
    key("Enter");
    await animations();
    equal(shown(widget), ["c", "b", "a"]);
    equal(changes.stop().length, 0, "pointer and keyboard changed nothing in the document");
    equal(log.stop(), [], "no commit, no transaction");

    const options = events("optionschange");
    widget.removeAttribute("submitted"); // the reader chrome opens a new attempt
    await settled(widget);
    equal(options.stop(), ["optionschange"], "the editor is told that the actions changed");
    assert(!button(widget, "check").disabled && !widget.actions.reset.disabled, "unlocked");
    await drag(items(widget)[0], below(items(widget)[2]));
    equal(stored(widget).order, ["b", "a", "c"]);
});

check("exercise: a change of the response withdraws the submission, in the same undo step", async () => {
    const widget = await mount<OrderExercise>(markup(`submitted`, `{"order":["c","b","a"]}`));
    let atEnd: [string | null, string] | undefined;
    widget.addEventListener("ww-transactionend", () => (atEnd = [widget.getAttribute("submitted"), block(widget).textContent!]), { once: true });
    const log = events("ww-transactionstart", "ww-transactionend");
    widget.reset(); // unavailable in the interface while submitted; this is what any response change does
    equal(atEnd, [null, "{}"], "attribute and data block changed inside one transaction");
    equal(log.stop(), ["ww-transactionstart", "ww-transactionend"]);
    await settled(widget);
    assert(!widget.submitted && !widget.hasAttribute("submitted"));
    equal(shown(widget), ["b", "a", "c"]);

    // A snapshot from outside (a restore, a replay, an undo) is shown and leaves the submission alone.
    widget.setAttribute("submitted", "");
    block(widget).textContent = `{"order":["a","b","c"]}`;
    await settled(widget);
    equal(shown(widget), ["a", "b", "c"]);
    assert(widget.hasAttribute("submitted"), "still submitted");
});

check("exercise: Check marks each item and announces a summary; a new response ends the feedback; Reset clears", async () => {
    const form = await mount<HTMLFormElement>(`<form lang="en">${markup(`name="steps"`)}</form>`);
    const widget = form.firstElementChild as OrderExercise;
    equal([feedback(widget), output(widget)], [["none", "none", "none"], ""], "no feedback before Check");
    assert(button(widget, "reset").disabled, "nothing to reset yet");

    button(widget, "check").click();
    await settled(widget);
    equal(feedback(widget), ["wrong", "wrong", "correct"]);
    equal(output(widget), "1 of 3 items are in the right place.");

    await drag(items(widget)[0], above(items(widget)[2])); // b behind a: a, b, c
    equal([feedback(widget), output(widget)], [["none", "none", "none"], ""], "the feedback belonged to the old response");
    button(widget, "check").click();
    await settled(widget);
    equal([feedback(widget), output(widget)], [["correct", "correct", "correct"], "All items are in the right place."]);

    button(widget, "reset").click();
    await settled(widget);
    equal(shown(widget), ["b", "a", "c"]);
    equal([stored(widget), widget.response, new FormData(form).has("steps")], [{}, undefined, false]);
    equal(output(widget), "");
});

check("exercise: with feedback=\"submit\" there is no Check, and the feedback appears with the submission", async () => {
    const widget = await mount<OrderExercise>(markup(`feedback="submit" lang="en"`));
    assert(button(widget, "check").hidden && widget.actions.check.disabled, "no Check button and no Check action");
    await drag(items(widget)[0], below(items(widget)[2]));
    widget.check();
    await settled(widget);
    equal([feedback(widget), output(widget)], [["none", "none", "none"], ""], "nothing before the submission");

    widget.setAttribute("submitted", ""); // the reader chrome, or a restored snapshot
    await settled(widget);
    equal(feedback(widget), ["correct", "wrong", "wrong"]);
    equal(output(widget), "1 of 3 items are in the right place.");
});

check("exercise: in edit mode the same drag records the solution, obfuscated, and no response", async () => {
    const widget = await mount<OrderExercise>(markup(`contenteditable`, "{}", null));
    equal(widget.solution, undefined);
    assert(!button(widget, "check") && !button(widget, "reset"), "an author gets no Check and no Reset");
    const log = events("ww-transactionstart", "ww-transactionend");
    let atEnd: string | null = null;
    widget.addEventListener("ww-transactionend", () => (atEnd = widget.getAttribute("solution")), { once: true });
    await drag(items(widget)[1], above(items(widget)[0])); // a in front of b
    equal(widget.solution, ["a", "b", "c"]);
    equal(reveal(atEnd), ["a", "b", "c"], "the attribute was written inside the transaction");
    equal(log.stop(), ["ww-transactionstart", "ww-transactionend"]);
    equal(block(widget).textContent, "{}", "the data block, which belongs to the reader, is untouched");
    equal(shown(widget), ["a", "b", "c"], "the author sees the solution");

    widget.removeAttribute("contenteditable");
    await settled(widget);
    equal(shown(widget), ["b", "a", "c"], "a reader starts from the authored order");
    button(widget, "check").click();
    await settled(widget);
    equal(feedback(widget), ["wrong", "wrong", "correct"], "and is checked against the recorded solution");
});

check("exercise: the solution is not readable in the document source", async () => {
    const widget = await mount<OrderExercise>(markup(`contenteditable`, "{}", null));
    await drag(items(widget)[1], above(items(widget)[0]));
    const source = widget.outerHTML;
    const attribute = widget.getAttribute("solution")!;
    assert(!/"a"\s*,\s*"b"\s*,\s*"c"/.test(source) && !/\ba\b[^<]{0,4}\bb\b[^<]{0,4}\bc\b/.test(attribute), `the order is not in the source: ${attribute}`);
    assert(!attribute.includes("[") && !attribute.includes('"'), "the attribute is not JSON");
    equal(reveal(attribute), ["a", "b", "c"]);
    equal(reveal("not obfuscated"), undefined, "anything else reveals nothing");
    const copy = await mount<OrderExercise>(source.replace(" contenteditable=\"\"", ""));
    equal(copy.solution, ["a", "b", "c"], "a copy of the source has the solution");
    assert(obfuscate(SOLUTION) !== obfuscate(SOLUTION), "the same solution is stored differently each time");
});

editorCheck("exercise: the aggregate declaration resolves in the editor's own code", async ({ aggregateContext, resolveAggregate }) => {
    const widget = await mount<OrderExercise>(markup(`id="steps"`, `{"order":["c","a","b"]}`));
    const snapshot = (text: string, status = "ready") => ({ data: { status, format: "json", mode: "individual", text } });
    const context = aggregateContext(
        { id: widget.id, attributes: Object.fromEntries(Array.from(widget.attributes, ({ name, value }) => [name, value])), html: widget.outerHTML },
        [
            { id: "p1", name: "Ada", snapshot: snapshot(`{"order":["a","b","c"]}`) },
            { id: "p2", name: "Ben", snapshot: snapshot(`{"order":["b","a","c"],"later":true}`) },
            { id: "p3", name: "Cem", snapshot: snapshot(`{}`) }, // opened it, never moved an item
            { id: "p4", name: "Dua", snapshot: snapshot(``, "pending") },
        ],
    );
    const resolved = resolveAggregate(widget, context)!;
    equal(resolved.config.shape, "ordering");
    equal((resolved.config as { items: unknown }).items, [
        { id: "b", label: "Boil the water" },
        { id: "a", label: "Add the tea" },
        { id: "c", label: "Cool it down" },
    ]);
    equal(resolved.values, [["a", "b", "c"], ["b", "a", "c"]], "value() gives each response");
    equal(resolved.context.missing, 2, "no response and no snapshot count as missing");
    equal(resolved.context.reference, SOLUTION, "the reference is the revealed solution");

    const declaration = OrderExercise.aggregate({ widget: { attributes: {}, html: "<ww-order-exercise></ww-order-exercise>" } });
    equal([declaration.items, declaration.reference, declaration.value(null), declaration.value({ order: ["a"] })], [[], undefined, undefined, ["a"]]);
});

check("exercise: showing the solution needs the permission", async () => {
    const widget = await mount<OrderExercise>(markup(`lang="en"`));
    assert(button(widget, "reveal").hidden, "hidden without the permission");
    widget.setAttribute("allow-solution", "");
    await settled(widget);
    assert(!button(widget, "reveal").hidden, "shown with it");
    button(widget, "reveal").click();
    await settled(widget);
    equal(widget.shadowRoot!.querySelector("#solution")!.textContent!.replace(/\s+/g, " ").trim(), "Solution: Add the tea → Boil the water → Cool it down");
    widget.removeAttribute("allow-solution");
    await settled(widget);
    assert(button(widget, "reveal").hidden, "hidden again when the permission is withdrawn");
});

check("exercise: a removed widget leaves no listener behind and writes nothing more", async () => {
    const before = listeners();
    const widget = await mount<OrderExercise>(markup(`lang="de" allow-solution`));
    await drag(items(widget)[0], below(items(widget)[2]));
    button(widget, "check").click();
    await settled(widget);
    const internal = listeners(widget, widget.shadowRoot!);
    assert(internal > 0, "the modules listen on the widget and its shadow root while it is connected");
    const container = widget.parentElement!;
    widget.remove();
    equal(listeners(), before, "nothing left on window or document");
    const changes = mutations(widget);
    widget.setAttribute("lang", "en");
    widget.setAttribute("submitted", "");
    await animations();
    equal(changes.stop().filter((record) => record.attributeName !== "lang" && record.attributeName !== "submitted").length, 0, "a disconnected widget changes nothing");
    container.append(widget);
    await settled(widget);
    equal(shown(widget), ["a", "c", "b"], "and works again after a reconnect");
    equal(listeners(widget, widget.shadowRoot!), internal, "with the same listeners as before, not more");
});

// ── The second round ──────────────────────────────────────────────────────

check("exercise: a disabled fieldset locks the widget through the platform's callback, and enabling unlocks", async () => {
    const form = await mount<HTMLFormElement>(`<form><fieldset>${markup(`name="steps"`, `{"order":["c","b","a"]}`)}</fieldset></form>`);
    const fieldset = form.firstElementChild as HTMLFieldSetElement;
    const widget = fieldset.firstElementChild as OrderExercise;
    fieldset.disabled = true;
    await settled(widget);
    assert(widget.matches(":disabled"), "the platform treats the widget as disabled");
    assert(items(widget).every((item) => !item.hasAttribute("data-ww-drag")) && button(widget, "check").disabled && button(widget, "reset").disabled, "locked");
    assert(widget.actions.check.disabled && widget.actions.reset.disabled, "the actions are unavailable");
    assert(!widget.hasAttribute("submitted"), "disabled is not submitted");
    const changes = mutations(widget);
    await drag(items(widget)[0], below(items(widget)[2]));
    equal(changes.stop().length, 0, "a drag changes nothing");
    equal(new FormData(form).has("steps"), false, "and a disabled control is left out of the form data");

    fieldset.disabled = false;
    await settled(widget);
    await drag(items(widget)[0], below(items(widget)[2]));
    equal(new FormData(form).get("steps"), `["b","a","c"]`, "unlocked again");
});

check("exercise: a form state the browser restores becomes the response, and leaves a submission alone", async () => {
    const form = await mount<HTMLFormElement>(`<form>${markup(`name="steps" submitted`)}</form>`);
    const widget = form.firstElementChild as OrderExercise;
    const log = events("ww-transactionstart", "ww-transactionend");
    // What the platform does after a reload or a navigation back, with the state the helper gave setFormValue().
    widget.formStateRestoreCallback(`["c","a","b"]`, "restore");
    await settled(widget);
    equal([widget.response, shown(widget), stored(widget)], [["c", "a", "b"], ["c", "a", "b"], { order: ["c", "a", "b"] }]);
    equal(new FormData(form).get("steps"), `["c","a","b"]`);
    assert(widget.hasAttribute("submitted"), "a restore from outside does not withdraw the submission");
    equal(log.stop(), ["ww-transactionstart", "ww-transactionend"], "one undo step");

    widget.formStateRestoreCallback(`["a","b","c"]`, "restore");
    widget.formStateRestoreCallback(`["b","c","a"]`, "autocomplete");
    equal(widget.response, ["c", "a", "b"], "an existing response is not replaced, and autofill is not a restore");
    widget.removeAttribute("submitted");
    widget.reset();
    widget.formStateRestoreCallback(`not json`, "restore");
    widget.formStateRestoreCallback(null, "restore");
    equal(widget.response, undefined, "what cannot be read is ignored");
});

check("exercise: the widget declares the helper's actions with a getter of its class, with availability, and the editor is told when it changes", async () => {
    const widget = await mount<OrderExercise>(markup(`lang="en"`));
    assert(typeof Object.getOwnPropertyDescriptor(OrderExercise.prototype, "actions")?.get === "function", "the class has the getter that LitElementWw supports");
    assert(!Object.hasOwn(widget, "actions"), "so the helper puts no accessor on the instance");
    equal(Object.keys(widget.actions), ["check", "reset", "showSolution"]);
    const state = () => [widget.actions.check.disabled, widget.actions.reset.disabled, widget.actions.showSolution!.disabled];
    equal(state(), [false, true, true], "nothing to reset yet, and the solution needs the permission");
    for (const name of Object.keys(widget.actions)) assert(typeof (widget as unknown as Record<string, unknown>)[name] === "function", `the widget has a method ${name}()`);

    const log = events("optionschange");
    await drag(items(widget)[0], below(items(widget)[2]));
    equal([state(), log.log.length], [[false, false, true], 1], "a response makes Reset available");
    widget.setAttribute("allow-solution", "");
    await settled(widget);
    equal([state(), log.log.length], [[false, false, false], 2], "the permission makes the solution available");
    equal(widget.actions.showSolution!.label, { _: "Show solution" });
    widget.showSolution();
    await settled(widget);
    equal([widget.actions.showSolution!.label, log.log.length], [{ _: "Hide solution" }, 3], "the action is a toggle and its label follows");
    widget.setAttribute("feedback", "submit");
    await settled(widget);
    equal([state(), log.log.length], [[true, false, false], 4], "no Check with feedback after submitting");
    widget.requestUpdate();
    await settled(widget);
    equal(log.stop().length, 4, "a render without a change sends nothing");

    const parent = widget.parentElement!;
    widget.remove();
    equal(Object.keys(widget.actions), ["check", "reset", "showSolution"], "the getter also answers for a disconnected widget");
    parent.append(widget);
    await settled(widget);
    equal([Object.keys(widget.actions), Object.hasOwn(widget, "actions")], [["check", "reset", "showSolution"], false], "and nothing was put on the instance by the reconnect");
});

/** An exercise whose class forgot the getter: the editor would only find the static actions. */
class Undeclared extends ExampleElement {
    static formAssociated = true;
    readonly #exercise = new Exercise<string[]>(this, {
        response: () => undefined,
        respond: () => {},
        solution: () => undefined,
        score: () => scoreOf([]),
    });
    check() {
        this.#exercise.check();
    }
    reset() {
        this.#exercise.reset();
    }
    get declared() {
        return this.#exercise.actions;
    }
    render() {
        return html`<p>Nothing to answer.</p>`;
    }
}
customElements.define("ww-undeclared-exercise", Undeclared);

check("exercise: a Lit widget that does not declare the helper's actions is told so once, and nothing is put on its instance", async () => {
    const log = warnings();
    const first = await mount<Undeclared>(`<ww-undeclared-exercise></ww-undeclared-exercise>`);
    const second = await mount<Undeclared>(`<ww-undeclared-exercise></ww-undeclared-exercise>`);
    const declared = await mount<OrderExercise>(markup());
    const messages = log.stop();
    equal(
        messages.filter((message) => message.includes("ww-undeclared-exercise")),
        ["<ww-undeclared-exercise>: the widget does not declare the actions of its Exercise helper. Add `get actions() { return this.#exercise.actions }` to the class."],
        "one warning for the class, with what to write",
    );
    equal(messages.filter((message) => message.includes("ww-order-exercise")), [], "a widget with the getter is not warned");
    equal([Object.hasOwn(first, "actions"), first.actions, Object.hasOwn(second, "actions")], [false, undefined, false], "the binding leaves the declaration to the class");
    equal([Object.keys(first.declared), Object.keys(declared.actions)], [["check", "reset"], ["check", "reset", "showSolution"]], "the helper has it ready for the getter");
});

check("exercise: the static actions of the class stay beside the helper's", async () => {
    class WithHint extends OrderExercise {
        static actions = { hint: { label: { _: "Hint" } } };
        hint() {}
    }
    customElements.define("ww-order-with-hint", WithHint);
    const widget = await mount<WithHint>(markup().replaceAll("ww-order-exercise", "ww-order-with-hint"));
    equal(Object.keys(widget.actions), ["hint", "check", "reset", "showSolution"]);
});

check("exercise: the first order a reader sees is never the solution, and a shuffle is the same in every render", async () => {
    const ids = ["a", "b", "c", "d", "e"];
    equal(firstOrder(ids), ids, "without a seed: as the author arranged it");
    equal(firstOrder(ids, { solution: ids }), ["b", "c", "d", "e", "a"], "unless that is the solution");
    equal(firstOrder(["a"], { solution: ["a"] }), ["a"], "one item has one order");
    const orders = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
        const order = firstOrder(ids, { seed, solution: ids });
        equal(firstOrder(ids, { seed, solution: ids }), order, "the same seed gives the same order");
        equal([...order].sort(), ids, "every item once");
        assert(order.join() !== ids.join(), `seed ${seed} gave the solution`);
        orders.add(order.join());
    }
    assert(orders.size > 50, `different readers get different orders (${orders.size} of 200)`);

    // In the widget: the author's order is the solution here, so the exercise would start solved.
    const solved = `<data value="a">Add the tea</data><data value="b">Boil the water</data><data value="c">Cool it down</data>`;
    const page = await mount(`<form><ww-order-exercise name="plain" solution="${obfuscate(SOLUTION)}">${solved}</ww-order-exercise>
        <ww-order-exercise name="shuffled" shuffle solution="${obfuscate(SOLUTION)}">${solved}</ww-order-exercise></form>`);
    const [plain, shuffled] = page.children as unknown as OrderExercise[];
    equal(shown(plain), ["b", "c", "a"], "rotated by one");
    const first = shown(shuffled);
    assert(first.join() !== SOLUTION.join() && [...first].sort().join() === "a,b,c", `shuffled: ${first}`);
    for (let render = 0; render < 3; render++) {
        shuffled.requestUpdate();
        await settled(shuffled);
        equal(shown(shuffled), first, "the same order in every render");
    }
    equal(new FormData(page as HTMLFormElement).has("shuffled"), false, "the first order is not a response");
    await drag(items(shuffled)[0], below(items(shuffled)[2]));
    assert(shown(shuffled).join() !== first.join() && shuffled.response, "a drag is");
    shuffled.reset();
    await settled(shuffled);
    equal(shown(shuffled), first, "Reset goes back to the order this reader started with");
    shuffled.setAttribute("contenteditable", "");
    await settled(shuffled);
    equal(shown(shuffled), SOLUTION, "the author sees the solution, not a shuffle");
});

check("exercise: check and reset in edit mode act on the author's preview, never on the solution", async () => {
    const widget = await mount<OrderExercise>(markup(`contenteditable lang="en"`, `{"order":["c","b","a"]}`));
    const solution = widget.getAttribute("solution");
    equal(shown(widget), SOLUTION, "the author sees the solution");
    widget.check();
    await settled(widget);
    equal([feedback(widget), output(widget)], [["none", "none", "none"], ""], "no feedback over the solution the author is arranging");
    widget.removeAttribute("contenteditable");
    await settled(widget);
    equal([shown(widget), feedback(widget)], [["c", "b", "a"], ["wrong", "correct", "wrong"]], "the preview shows the check of the preview response");

    widget.setAttribute("contenteditable", "");
    await settled(widget);
    const changes = mutations(widget);
    widget.reset();
    await settled(widget);
    equal(stored(widget), {}, "Reset clears the preview response");
    assert(changes.stop().every((record) => record.target === block(widget) || record.target.parentNode === block(widget)), "and writes nothing but the data block");
    equal([widget.getAttribute("solution"), widget.solution], [solution, SOLUTION], "the solution is untouched");
});

check("exercise: a shown solution goes away with the permission and has to be asked for again", async () => {
    const widget = await mount<OrderExercise>(markup(`allow-solution`));
    widget.showSolution();
    await settled(widget);
    assert(widget.shadowRoot!.querySelector("#solution"), "shown");
    widget.removeAttribute("allow-solution");
    await settled(widget);
    assert(!widget.shadowRoot!.querySelector("#solution"), "gone with the permission");
    widget.setAttribute("allow-solution", "");
    await settled(widget);
    assert(!widget.shadowRoot!.querySelector("#solution"), "and not back by itself");
    widget.showSolution();
    await settled(widget);
    await drag(items(widget)[0], below(items(widget)[2]));
    assert(!widget.shadowRoot!.querySelector("#solution"), "a new response hides it too");
});

check("obfuscation: any JSON value, plain JSON written by hand, and nothing else", async () => {
    for (const value of [["ä", "→", "𝄞"], { a: [1, null, true], b: "x".repeat(100000) }, "text", 0, null, false]) {
        const text = obfuscate(value);
        assert(/^[A-Za-z0-9+/]+=*$/.test(text) && isObfuscated(text), "base64");
        equal(reveal(text), value);
    }
    equal([reveal(`["a","b"]`), isObfuscated(`["a","b"]`)], [["a", "b"], false], "plain JSON is read, so that a solution can be written by hand");
    equal([reveal(""), reveal(null), reveal("AQID"), reveal("####")], [undefined, undefined, undefined, undefined]);
    equal([obfuscated.toAttribute(undefined), obfuscated.toAttribute(null), obfuscated.fromAttribute(null)], [null, null, undefined], "no value, no attribute");
    equal(obfuscated.fromAttribute(obfuscated.toAttribute({ order: [1, 2] })), { order: [1, 2] });

    // A solution written by hand works, and is obfuscated as soon as the author changes it.
    const plain = `<ww-order-exercise contenteditable solution='["a","b","c"]'><data value="b">B</data><data value="a">A</data><data value="c">C</data></ww-order-exercise>`;
    const widget = await mount<OrderExercise>(plain);
    equal([widget.solution, shown(widget)], [SOLUTION, SOLUTION]);
    await drag(items(widget)[0], below(items(widget)[2]));
    equal(widget.solution, ["b", "c", "a"]);
    assert(isObfuscated(widget.getAttribute("solution")), "obfuscated when it is written");
});

let probes = 0;

editorCheck("exercise: the aggregate helper follows the editor's rules for every shape it builds", ({ aggregateContext, resolveAggregate }) => {
    const sample = (id: string, data: unknown) => ({ id, name: id, snapshot: { data: { status: "ready", format: "json", mode: "individual", text: JSON.stringify(data) } } });
    const resolve = (declaration: unknown, attributes: Record<string, string>, html: string, data: unknown[]) => {
        class Probe extends HTMLElement {
            static aggregate = declaration;
        }
        customElements.define(`ww-aggregate-probe-${++probes}`, Probe);
        const context = aggregateContext({ id: "w", attributes, html }, data.map((each, index) => sample(`p${index}`, each)));
        return resolveAggregate(new Probe(), context)!;
    };

    const number = resolve(exerciseAggregate({ shape: "number", value: "guess", bins: 4, title: "Guesses", id: "guess" }), { solution: obfuscate(42) }, "<ww-x></ww-x>", [
        { guess: 40 },
        { guess: 0 },
        {},
        { guess: null },
    ]);
    const { shape, bins, title, id } = number.config as { shape: string; bins?: number; title?: string; id?: string };
    equal([shape, bins, title, id, number.selectedId], ["number", 4, "Guesses", "guess", "guess"], "bins, title and id reach the editor");
    equal([number.values, number.context.missing, number.context.reference], [[40, 0], 2, 42], "0 is a response; no key and null are missing");

    const text = resolve(exerciseAggregate({ shape: "text", value: (data) => (data as { answer?: string }).answer?.trim() || undefined, solution: false }), { solution: obfuscate("x") }, "", [
        { answer: " yes " },
        { answer: "  " },
    ]);
    equal([text.values, text.context.missing, "reference" in text.context], [["yes"], 1, false], "a function extracts; without a solution there is no reference");

    const choice = resolve(
        exerciseAggregate({
            shape: "selection",
            items: (widget) => Array.from(widget.querySelectorAll("data"), (item) => ({ id: item.value, label: item.textContent! })),
            value: "choice",
            solution: "answer",
            reference: (solution) => (solution as string[])[0],
        }),
        { answer: obfuscate(["b"]) },
        `<ww-x answer="…"><data value="a">A</data><data value="b">B</data><data value="a">A again</data><script type="application/json" slot="data">{}</script></ww-x>`,
        [{ choice: "b" }, { choice: ["a", "b"] }],
    );
    equal((choice.config as { items: unknown }).items, [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
    ], "a repeated id would make the editor refuse the view: the first one counts");
    equal([choice.values, choice.context.reference], [["b", ["a", "b"]], "b"], "another attribute, and the solution turned into the format of the value");

    let refused = false;
    try {
        resolve(exerciseAggregate({ shape: "ordering", items: () => [], value: "order" }), {}, "<ww-x></ww-x>", []);
    } catch {
        refused = true;
    }
    assert(refused, "a widget without items has no view: the editor refuses it and falls back to the snapshots");
});
