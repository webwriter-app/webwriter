// Checks of the data-block helper without a framework: the core on a plain
// custom element with the shared runtime of @webwriter/widget.
import { assert, check, equal, events, listeners, mount, mutations, run, settled, until, warnings } from "../../test/harness";
import type { DataBlockKind, DataErrorDetail } from "@webwriter/widget/data";
import { transaction } from "@webwriter/widget/transaction";
import { manage } from "../order-exercise/editor";
import { Poll } from "./index";

type PollElement = Poll;

/** One vote kept in the document, for everyone. */
class DocumentPoll extends Poll {
    static block: DataBlockKind = "document";
}
/** Collects votes for a while before it writes. */
class SlowPoll extends Poll {
    static debounce = 400;
}
customElements.define("ww-plain-document-poll", DocumentPoll);
customElements.define("ww-plain-slow-poll", SlowPoll);

const markup = (text: string | null, tag = "ww-plain-poll", slot = ` slot="data"`) =>
    `<${tag}><data value="tea">Tea</data><data value="coffee">Coffee</data>${text === null ? "" : `<script type="application/json"${slot}>${text}</script>`}</${tag}>`;
const block = (widget: Element) => widget.querySelector<HTMLScriptElement>(":scope > script");
const stored = (widget: Element) => JSON.parse(block(widget)!.textContent!);
const choice = (widget: Element, value: string) => widget.shadowRoot!.querySelector<HTMLButtonElement>(`button[value="${value}"]`)!;
const pressed = (widget: Element) => [...widget.shadowRoot!.querySelectorAll("button[aria-pressed=true]")].map((button) => (button as HTMLButtonElement).value);
const notice = (widget: Element) => widget.shadowRoot!.querySelector("p")!;
/** How often the block's text was replaced. */
const writes = (records: MutationRecord[]) => records.filter((record) => record.target.nodeName === "SCRIPT" && record.type === "childList").length;
const errors = (widget: Element) => {
    const list: DataErrorDetail[] = [];
    widget.addEventListener("ww-dataerror", (event) => void list.push((event as CustomEvent<DataErrorDetail>).detail));
    return list;
};

check("plain: a click votes; the block keeps unknown keys; a new widget reads it back", async () => {
    const widget = await mount<PollElement>(markup(`{"vote":"tea","extra":{"kept":true},"note":"a<b"}`));
    equal([pressed(widget), widget.changes.length], [["tea"], 1], "the vote on load is shown and reported once");
    const log = events("ww-transactionstart", "ww-transactionend");
    choice(widget, "coffee").click();
    equal([widget.store.get().vote, pressed(widget)], ["coffee", ["coffee"]], "the value and the interface answer at once");
    await settled(widget);
    equal(stored(widget), { vote: "coffee", extra: { kept: true }, note: "a<b" }, "unknown keys are kept");
    assert(!block(widget)!.textContent!.includes("<"), "the runtime escaped the text, so it differs from what was passed");
    equal([log.stop(), widget.changes.length], [["ww-transactionstart", "ww-transactionend"], 1], "one undo step, and the widget's own write is not reported as a change");
    const copy = await mount<PollElement>(widget.outerHTML);
    equal(pressed(copy), ["coffee"]);
    choice(copy, "coffee").click();
    await settled(copy);
    equal([pressed(copy), stored(copy).vote], [[], null], "a second click on the same choice withdraws the vote");
});

check("plain: a change from outside is shown and reported once, its echo and a reformatting are not", async () => {
    const widget = await mount<PollElement>(markup(`{"vote":null}`));
    widget.changes.length = 0;
    block(widget)!.textContent = `{"vote": "tea", "more": [1]}`;
    await settled(widget);
    equal([pressed(widget), widget.changes.length], [["tea"], 1]);
    block(widget)!.textContent = `{\n  "more": [1],\n  "vote": "tea"\n}`;
    await settled(widget);
    equal(widget.changes.length, 1, "same value, other text: no change");
    choice(widget, "coffee").click();
    await settled(widget);
    equal([widget.changes.length, stored(widget)], [1, { more: [1], vote: "coffee" }], "own write: no change");
});

check("plain: without a block the first vote creates one, scoped for a participant or plain for document content", async () => {
    const page = await mount(`<div>${markup(null)}${markup(null, "ww-plain-document-poll")}</div>`);
    const [participant, shared] = page.children as unknown as PollElement[];
    equal([participant.store.get(), shared.store.get()], [{ vote: null }, { vote: null }], "the defaults");
    assert(!block(participant) && !block(shared), "reading creates nothing");
    choice(participant, "tea").click();
    choice(shared, "tea").click();
    await until(() => !participant.store.getSnapshot().unsaved && !shared.store.getSnapshot().unsaved, "both writes are settled");
    equal([block(participant)!.getAttribute("slot"), block(participant)!.type, stored(participant)], ["data", "application/json", { vote: "tea" }]);
    equal([block(shared)!.hasAttribute("slot"), block(shared)!.type, stored(shared)], [false, "application/json", { vote: "tea" }]);

    // The runtime reports the slot of a block, so a widget that named the other kind is told, once.
    const log = warnings();
    await mount(markup(`{"vote":"tea"}`, "ww-plain-document-poll"));
    await mount(markup(`{"vote":"tea"}`, "ww-plain-poll", ""));
    const messages = log.stop().filter((message) => message.includes("data block"));
    assert(messages.length === 2 && messages[0].includes('slot="data"'), `one warning each: ${messages.join(" | ")}`);
});

check("plain (managed scope): a vote waits while the scope is pending, lands on the delivered snapshot, and a block the helper created is settled by the host", async () => {
    const container = await mount(`<div></div>`);
    const editor = manage(container);
    container.innerHTML = markup(`{"vote":"tea"}`);
    const widget = container.firstElementChild as PollElement;
    await settled(widget);
    assert(!widget.widgetRuntime.getSnapshot().dataReady, "the scope is pending");
    equal(pressed(widget), [], "the authored text is not used before the scope answers");
    choice(widget, "coffee").click();
    await settled(widget);
    equal([block(widget)!.textContent, pressed(widget)], [`{"vote":"tea"}`, ["coffee"]], "no write while pending, but the vote is kept");
    editor.deliver({ vote: "tea", extra: 1 });
    await settled(widget);
    equal([stored(widget), widget.store.getSnapshot().unsaved], [{ vote: "coffee", extra: 1 }, false], "written on top of the delivered snapshot");
    editor.deliver({ vote: "tea", extra: 1 });
    await settled(widget);
    equal(pressed(widget), ["tea"], "a remote change is shown");
    editor.stop();

    const other = await mount(`<div></div>`);
    const second = manage(other);
    other.innerHTML = markup(null);
    const created = other.firstElementChild as PollElement;
    await settled(created);
    choice(created, "tea").click();
    await until(() => second.requests === 1, "the editor is asked for the scope of the block the helper created");
    assert(created.store.getSnapshot().unsaved, "the vote is not settled while that scope is pending");
    second.deliver({ earlier: true }); // the scope already held something
    await until(() => !created.store.getSnapshot().unsaved, "settled");
    equal(stored(created), { earlier: true, vote: "tea" }, "the vote was written again on top of it");
    second.stop();
});

check("plain: a block the widget cannot read is kept until the reader discards it", async () => {
    const container = await mount(`<div></div>`);
    const reported = errors(container);
    const broken = `{"vote":42,"precious":true}`;
    container.innerHTML = markup(broken);
    const widget = container.firstElementChild as PollElement;
    await settled(widget);
    equal([reported.length, reported[0]?.text, widget.store.get()], [1, broken, { vote: null }], "ignored and reported: the defaults");
    assert(!notice(widget).hidden, "the widget says so");
    choice(widget, "tea").click();
    await settled(widget);
    equal([pressed(widget), block(widget)!.textContent], [["tea"], broken], "a vote is shown but not written over what the widget did not understand");
    notice(widget).querySelector("button")!.click();
    equal(stored(widget), { vote: null }, "Discard replaces the block at once");
    await settled(widget);
    assert(notice(widget).hidden, "and the notice goes");
    choice(widget, "coffee").click();
    await settled(widget);
    equal(stored(widget), { vote: "coffee" }, "votes are written again");
});

check("plain: a debounced vote is one write, flushed on leaving edit mode, inside a transaction, and on disconnect", async () => {
    const page = await mount(`<div contenteditable>${markup(`{"vote":null}`, "ww-plain-slow-poll")}</div>`);
    const widget = page.firstElementChild as PollElement;
    const changes = mutations(widget);
    choice(widget, "tea").click();
    choice(widget, "coffee").click();
    choice(widget, "tea").click();
    await settled(widget);
    equal([stored(widget).vote, pressed(widget)], [null, ["tea"]], "nothing written during the burst");
    page.removeAttribute("contenteditable"); // the runtime tells the helper that the mode changed
    await until(() => stored(widget).vote === "tea", "leaving edit mode flushes");
    equal(writes(changes.stop()), 1, "one write for the burst");

    let atEnd = "";
    widget.addEventListener("ww-transactionend", () => (atEnd = block(widget)!.textContent!), { once: true });
    transaction(widget, () => {
        widget.setAttribute("title", "changed together");
        choice(widget, "coffee").click();
    });
    equal(JSON.parse(atEnd).vote, "coffee", "a vote inside the widget's transaction is written before it ends");

    const before = listeners();
    choice(widget, "tea").click();
    const after = mutations(widget);
    widget.remove();
    equal(stored(widget).vote, "tea", "disconnect flushes");
    equal(listeners(), before - 1, "the helper's document listener is gone");
    await until(() => !widget.store.getSnapshot().unsaved);
    equal(writes(after.stop()), 1, "and the timer does not write a second time");
});

run();
