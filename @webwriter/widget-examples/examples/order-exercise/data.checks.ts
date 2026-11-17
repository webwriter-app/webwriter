// Checks of the data-block helper on LitElementWw, unmanaged and with a simulated
// editor that manages the scope. The same helper on a plain element with the
// shared runtime of @webwriter/widget is checked in examples/data-plain.
import { html } from "lit";
import { assert, check, equal, events, listeners, mount, mutations, settled, until, wait, warnings } from "../../test/harness";
import { DATA_URL_LIMIT, fromDataURL, sameJson, toDataURL, type DataBlockKind, type DataErrorDetail, type SetDataOptions } from "@webwriter/widget/data";
import { transaction } from "@webwriter/widget/transaction";
import { jsonData } from "@webwriter/lit/data";
import { ExampleElement } from "../shared/base";
import { manage } from "./editor";

type Probe = { count: number; tags: string[]; title?: string };
const defaults: Probe = { count: 0, tags: [] };
const validate = (value: Probe) => typeof value.count === "number" && Array.isArray(value.tags);

class DataProbe extends ExampleElement {
    static debounce: number | undefined = undefined;
    /** Undefined: the widget does not say what its block holds. */
    static block: DataBlockKind | undefined = undefined;
    changes: Probe[] = [];
    store = jsonData<Probe>(this, {
        defaults,
        validate,
        block: (this.constructor as typeof DataProbe).block,
        save: { debounce: (this.constructor as typeof DataProbe).debounce },
        changed: (value) => void this.changes.push(value),
    });
    render() {
        return html`<output>${this.store.get().count}</output>`;
    }
}
class SlowProbe extends DataProbe {
    static debounce = 120;
}
/** Says that its block is document content. */
class DocumentProbe extends DataProbe {
    static block: DataBlockKind = "document";
}
/** Says that its block is participant data. */
class ParticipantProbe extends DataProbe {
    static block: DataBlockKind = "participant";
}
/** Replaces the hook the Lit binding wraps, as a class field declared after the helper does. */
class OverridingProbe extends DataProbe {
    seen = 0;
    dataChanged = () => void this.seen++;
}
customElements.define("ww-data-probe", DataProbe);
customElements.define("ww-data-overriding", OverridingProbe);
customElements.define("ww-data-slow", SlowProbe);
customElements.define("ww-data-document", DocumentProbe);
customElements.define("ww-data-participant", ParticipantProbe);

type AnyProbe = HTMLElement & {
    changes: Probe[];
    store: { get(): Probe; set(partial: Partial<Probe>, options?: SetDataOptions): void; flush(): void; readonly unsaved: boolean; readonly invalid: boolean };
};

const markup = (text: string | null, tag = "ww-data-probe", slot = "") =>
    `<${tag}>${text === null ? "" : `<script type="application/json"${slot}>${text}</script>`}</${tag}>`;
const block = (widget: Element) => widget.querySelector<HTMLScriptElement>(":scope > script");
const stored = (widget: Element) => JSON.parse(block(widget)!.textContent!);
/** How often the block's text was replaced. (`setData()` also sets the block's `type` again, which is not counted.) */
const writes = (records: MutationRecord[]) => records.filter((record) => record.target.nodeName === "SCRIPT" && record.type === "childList").length;
const errors = (widget: Element) => {
    const list: DataErrorDetail[] = [];
    widget.addEventListener("ww-dataerror", (event) => void list.push((event as CustomEvent<DataErrorDetail>).detail));
    return list;
};

for (const tag of ["ww-data-probe"]) {
    check(`data (${tag}): set → block text → a new widget reads it back`, async () => {
        const widget = await mount<AnyProbe>(markup(`{"count":2,"extra":{"kept":true}}`, tag));
        equal(widget.store.get(), { count: 2, tags: [], extra: { kept: true } } as Probe, "defaults fill what the block lacks");
        equal(widget.changes.length, 1, "the snapshot on load is reported once");
        widget.store.set({ count: 3, title: "</script><b>" });
        equal(widget.store.get().count, 3, "get() answers at once");
        await settled(widget);
        equal(stored(widget), { count: 3, extra: { kept: true }, title: "</script><b>" }, "unknown keys are kept, defaults are not written");
        assert(!block(widget)!.textContent!.includes("<"), "the runtime escaped the text, so it differs from what was passed");
        equal(widget.changes.length, 1, "the widget's own write is not reported as a change");
        const copy = await mount<AnyProbe>(widget.outerHTML);
        equal(copy.store.get(), { count: 3, tags: [], extra: { kept: true }, title: "</script><b>" } as Probe);
    });

    check(`data (${tag}): a change from outside is reported once, its echo and a reformatting are not`, async () => {
        const widget = await mount<AnyProbe>(markup(`{"count":1}`, tag));
        widget.changes.length = 0;
        block(widget)!.textContent = `{"count": 7, "tags": ["x"]}`;
        await settled(widget);
        equal(widget.changes, [{ count: 7, tags: ["x"] }]);
        block(widget)!.textContent = `{\n  "tags": ["x"],\n  "count": 7\n}`;
        await settled(widget);
        equal(widget.changes.length, 1, "same value, other text: no change");
        widget.store.set({ count: 8 });
        await settled(widget);
        equal(widget.changes.length, 1, "own write: no change");
        equal(stored(widget), { tags: ["x"], count: 8 });
    });
}

check("data: without a block the defaults apply and the first write creates the block", async () => {
    const widget = await mount<AnyProbe>(markup(null));
    equal(widget.store.get(), defaults);
    equal(widget.changes.length, 0, "nothing to report");
    assert(!block(widget), "reading creates nothing");
    widget.store.set({ tags: ["a"] });
    await settled(widget);
    equal(block(widget)?.type, "application/json");
    equal(stored(widget), { tags: ["a"] });
    equal(widget.shadowRoot!.querySelector("output")!.textContent, "0", "the widget rendered from the helper");
});

check("data: invalid JSON and invalid snapshots are ignored and reported, valid ones are taken again", async () => {
    const container = await mount(`<div></div>`);
    const reported = errors(container);
    container.innerHTML = markup(`{"count": oops`);
    const widget = container.firstElementChild as AnyProbe;
    await settled(widget);
    equal(widget.store.get(), defaults, "invalid JSON on load: the defaults");
    equal(reported.length, 1);
    assert(reported[0].error instanceof SyntaxError && reported[0].text === `{"count": oops`, "the event carries the error and the text");

    block(widget)!.textContent = `{"count": 4}`;
    await settled(widget);
    equal(widget.store.get().count, 4);
    for (const bad of [`{"count": "four"}`, `[1, 2]`, `null`, `{"count": 5, "tags": "none"}`]) {
        block(widget)!.textContent = bad;
        await settled(widget);
        equal(widget.store.get(), { count: 4, tags: [] }, `${bad} is ignored as a whole`);
    }
    equal(reported.length, 5, "each one was reported");
    equal(widget.changes, [{ count: 4, tags: [] }], "changed ran only for the valid snapshot");
    equal(widget.shadowRoot!.querySelector("output")!.textContent, "4");
});

check("data: a widget that replaces dataChanged() with a field still gets outside changes, after its next render", async () => {
    const widget = await mount<AnyProbe & { seen: number }>(markup(`{"count":1}`, "ww-data-overriding"));
    equal([widget.store.get().count, widget.changes.length], [1, 1]);
    block(widget)!.textContent = `{"count":2}`;
    await settled(widget);
    equal(widget.seen, 2, "the widget's own field received the snapshots, so the binding's wrapper is gone");
    equal([widget.store.get().count, widget.changes.length], [2, 2]);
    equal(widget.shadowRoot!.querySelector("output")!.textContent, "2");
    // What the helper filters out: outside WebWriter the runtime delivers the widget's own write as a snapshot too.
    widget.store.set({ count: 3 });
    await settled(widget);
    equal([widget.seen, widget.changes.length], [3, 2], "the runtime echoed the write; the helper did not report it");
});

check("data: several set() calls in one task are one write, an unchanged value is none", async () => {
    const widget = await mount<AnyProbe>(markup(`{"count":1}`));
    const changes = mutations(widget);
    const log = events("ww-transactionstart", "ww-transactionend");
    widget.store.set({ count: 2 });
    widget.store.set({ tags: ["a"] });
    widget.store.set({ count: 3 });
    equal(block(widget)!.textContent, `{"count":1}`, "nothing is written during the task");
    await settled(widget);
    equal(stored(widget), { count: 3, tags: ["a"] });
    equal(writes(changes.stop()), 1, "one write");
    equal(log.log, ["ww-transactionstart", "ww-transactionend"], "in one transaction");

    const again = mutations(widget);
    widget.store.set({ count: 3 });
    widget.store.set({ count: 9 });
    widget.store.set({ count: 3 });
    await settled(widget);
    equal(writes(again.stop()), 0, "a value that ends where it was is not written");
    equal(log.stop().length, 2, "and opens no transaction");
});

check("data: with debounce a burst is one write in one transaction, and get() is current meanwhile", async () => {
    const widget = await mount<AnyProbe>(markup(`{"count":0}`, "ww-data-slow"));
    const changes = mutations(widget);
    const log = events("ww-transactionstart", "ww-transactionend");
    for (let count = 1; count <= 5; count++) {
        widget.store.set({ count });
        await wait(5);
    }
    equal(widget.store.get().count, 5);
    equal(widget.shadowRoot!.querySelector("output")!.textContent, "5", "the widget shows the unsaved value");
    equal(stored(widget).count, 0, "nothing written during the burst");
    await wait(250);
    equal(stored(widget).count, 5);
    equal(writes(changes.stop()), 1, "one write");
    equal(log.stop(), ["ww-transactionstart", "ww-transactionend"], "one transaction pair");
    equal(widget.changes.length, 0, "and no change reported for it");
});

check("data: a pending write is flushed by flush(), on disconnect, when the page is hidden and on leaving edit mode", async () => {
    const widget = await mount<AnyProbe>(markup(`{"count":0}`, "ww-data-slow"));
    widget.store.set({ count: 1 });
    widget.store.flush();
    equal(stored(widget).count, 1, "flush() writes at once");

    widget.store.set({ count: 2 });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    try {
        document.dispatchEvent(new Event("visibilitychange"));
    } finally {
        delete (document as { visibilityState?: string }).visibilityState;
    }
    equal(stored(widget).count, 2, "hidden page");

    widget.setAttribute("contenteditable", "");
    await settled(widget);
    widget.store.set({ count: 3 });
    widget.removeAttribute("contenteditable");
    await (widget as AnyProbe & { updateComplete: Promise<unknown> }).updateComplete;
    equal(stored(widget).count, 3, "leaving edit mode");

    const before = listeners();
    const parent = widget.parentElement!;
    widget.store.set({ count: 4 });
    const changes = mutations(widget);
    widget.remove();
    equal(stored(widget).count, 4, "disconnect");
    equal(listeners(), before - 1, "the helper's document listener is gone");
    await wait(250);
    equal(writes(changes.stop()), 1, "the timer does not write a second time");
    parent.append(widget);
    await settled(widget);
    equal(widget.store.get().count, 4, "and the value is there after a reconnect");
});

check("data: set() inside a synchronous transaction is written before the transaction ends", async () => {
    for (const tag of ["ww-data-probe", "ww-data-slow"]) {
        const widget = await mount<AnyProbe>(markup(`{"count":0}`, tag));
        let atEnd = "";
        widget.addEventListener("ww-transactionend", () => (atEnd = block(widget)!.textContent!), { once: true });
        const log = events("ww-transactionstart", "ww-transactionend");
        transaction(widget, () => {
            widget.setAttribute("title", "changed together");
            widget.store.set({ count: 6 });
        });
        equal(JSON.parse(atEnd).count, 6, `${tag}: the write is inside the transaction`);
        await wait(250);
        equal(log.stop(), ["ww-transactionstart", "ww-transactionend"], `${tag}: one pair, nothing written later`);
    }
});

check("data (managed scope): a write waits while the scope is pending and lands on the delivered snapshot", async () => {
    const container = await mount(`<div></div>`);
    const editor = manage(container);
    container.innerHTML = markup(`{"count":1}`, "ww-data-probe", ` slot="data"`);
    const widget = container.firstElementChild as AnyProbe & { dataReady: boolean };
    await settled(widget);
    assert(!widget.dataReady, "the scope is pending");
    equal(widget.store.get(), defaults, "the authored text is not used before the scope answers");
    widget.store.set({ tags: ["mine"] });
    await settled(widget);
    equal(block(widget)!.textContent, `{"count":1}`, "no write while pending");
    equal(widget.store.get().tags, ["mine"], "the change is kept");

    editor.deliver({ count: 50, extra: 1 });
    await settled(widget);
    equal(stored(widget), { count: 50, extra: 1, tags: ["mine"] }, "written on top of the delivered snapshot");
    equal(widget.changes, [{ count: 50, tags: ["mine"], extra: 1 } as Probe], "one change: the delivered snapshot");
    assert(block(widget)!.textContent!.includes("\n"), "the editor serialised the block again and announced it");
    await settled(widget);
    equal(widget.changes.length, 1, "that echo is not a change");

    editor.deliver({ count: 51, extra: 1, tags: ["mine"] });
    await settled(widget);
    equal(widget.changes.length, 2, "a remote change is");
    equal(widget.shadowRoot!.querySelector("output")!.textContent, "51");
    editor.stop();
});

check("data (managed scope): a remote snapshot during a debounce keeps both sides, a disconnect keeps the change", async () => {
    const container = await mount(`<div></div>`);
    const editor = manage(container);
    container.innerHTML = markup(`{}`, "ww-data-slow", ` slot="data"`);
    const widget = container.firstElementChild as AnyProbe;
    editor.deliver({ count: 1, tags: [] });
    await settled(widget);
    widget.changes.length = 0;

    widget.store.set({ count: 2 });
    editor.deliver({ count: 1, tags: ["remote"] });
    equal(widget.store.get(), { count: 2, tags: ["remote"] }, "local key over the remote snapshot");
    equal(widget.changes, [{ count: 2, tags: ["remote"] }]);
    await wait(250);
    equal(stored(widget), { count: 2, tags: ["remote"] });

    // LitElementWw refuses setData() on a managed block once the widget is disconnected.
    widget.store.set({ count: 3 });
    widget.remove();
    equal(stored(widget).count, 2, "the flush on disconnect could not write");
    equal(widget.store.get().count, 3, "but the change is not lost");
    container.append(widget);
    await settled(widget);
    equal(stored(widget).count, 2, "the scope is pending again after the reconnect");
    editor.deliver({ count: 2, tags: ["remote"] });
    await settled(widget);
    equal(stored(widget).count, 3, "written once the scope is ready");
    editor.stop();
});

check("data: toDataURL() and fromDataURL() carry a small file through the JSON", async () => {
    const bytes = new Uint8Array([0, 255, 16, 128, 60, 47]);
    const text = await toDataURL(new Blob([bytes], { type: "image/png" }));
    assert(text.startsWith("data:image/png;base64,"), text);
    const blob = fromDataURL(JSON.parse(JSON.stringify({ file: text })).file);
    equal(blob.type, "image/png");
    equal([...new Uint8Array(await blob.arrayBuffer())], [...bytes]);
    equal(await fromDataURL("data:text/plain,a%20b").text(), "a b", "a data URL without base64");
    let thrown = false;
    try {
        fromDataURL("https://example.org/a.png");
    } catch {
        thrown = true;
    }
    assert(thrown, "anything else is refused");
});

// ── The second round ──────────────────────────────────────────────────────

check("data: the first write creates a participant block (slot=\"data\") by default, and a plain block for document content", async () => {
    const participant = await mount<AnyProbe>(markup(null));
    participant.store.set({ count: 1 });
    await settled(participant);
    equal([block(participant)?.getAttribute("slot"), block(participant)?.type], ["data", "application/json"], "a reader's data is scoped");
    equal([stored(participant), participant.store.unsaved], [{ count: 1 }, false], "and the write is settled once the scope answered");

    const content = await mount<AnyProbe>(markup(null, "ww-data-document"));
    content.store.set({ count: 1 });
    await settled(content);
    assert(block(content) && !block(content)!.hasAttribute("slot"), "document content has no slot");
    equal([stored(content), content.store.unsaved], [{ count: 1 }, false]);

    // A block that is there is used as it is. A widget that said what it holds is told about a mismatch, once.
    const log = warnings();
    const scoped = await mount<AnyProbe>(markup(`{"count":3}`, "ww-data-document", ` slot="data"`));
    const plain = await mount<AnyProbe>(markup(`{"count":4}`, "ww-data-participant"));
    const undeclared = await mount<AnyProbe>(markup(`{"count":5}`));
    equal([scoped.store.get().count, plain.store.get().count, undeclared.store.get().count], [3, 4, 5], "all three read their block");
    plain.store.set({ count: 6 });
    await settled(plain);
    assert(!block(plain)!.hasAttribute("slot"), "an existing block keeps its kind");
    await mount<AnyProbe>(markup(`{"count":4}`, "ww-data-participant"));
    const messages = log.stop().filter((message) => message.includes("data block"));
    equal(messages.length, 2, `one warning per class: ${messages.join(" | ")}`);
    assert(messages.some((message) => message.includes("<ww-data-document>")) && messages.some((message) => message.includes("<ww-data-participant>")), "each names its widget");
});

check("data (managed scope): a block the helper created is settled by the host, and the change is written again if the scope lacks it", async () => {
    for (const adopted of [true, false]) {
        const container = await mount(`<div></div>`);
        const editor = manage(container);
        container.innerHTML = markup(null);
        const widget = container.firstElementChild as AnyProbe;
        await settled(widget);
        widget.store.set({ count: 5 });
        await until(() => editor.requests === 1, "the editor is asked for the scope of the new block");
        equal([block(widget)?.getAttribute("slot"), stored(widget)], ["data", { count: 5 }], "the block was created with the change");
        equal([widget.store.unsaved, widget.store.get().count], [true, 5], "but the change is not settled while the scope is pending");

        // The host either takes the block's text as the start of the scope, or answers with what the scope already holds.
        editor.deliver(adopted ? { count: 5 } : { tags: ["earlier"] });
        await settled(widget);
        equal(stored(widget), adopted ? { count: 5 } : { tags: ["earlier"], count: 5 }, adopted ? "adopted: nothing more to write" : "written again on top of the scope");
        equal([widget.store.unsaved, widget.store.get()], [false, { count: 5, tags: adopted ? [] : ["earlier"] }]);
        equal(widget.changes.length, adopted ? 0 : 1, "only a real difference is reported");
        editor.stop();
    }
});

check("data: after an ignored snapshot a write is held back, until a valid snapshot arrives or the widget forces it", async () => {
    const widget = await mount<AnyProbe>(markup(`{"count":1}`));
    const reported = errors(widget);
    const log = warnings();
    const broken = `{"count":"many","precious":[1,2,3]}`;
    block(widget)!.textContent = broken;
    await settled(widget);
    equal([reported.length, widget.store.invalid, widget.store.get()], [1, true, { count: 1, tags: [] }], "ignored and reported: the value before is kept");

    widget.store.set({ count: 2 });
    await settled(widget);
    equal(widget.shadowRoot!.querySelector("output")!.textContent, "2", "the widget works on with the change");
    equal([block(widget)!.textContent, widget.store.unsaved], [broken, true], "but what it did not understand is not overwritten");
    widget.store.flush();
    equal(block(widget)!.textContent, broken, "flush() does not force it either");
    equal(log.stop().filter((message) => message.includes("could not read")).length, 1, "development is told once");

    block(widget)!.textContent = `{"count":10,"tags":["z"]}`; // someone repaired it, or an undo
    await settled(widget);
    equal([stored(widget), widget.store.invalid, widget.store.unsaved], [{ count: 2, tags: ["z"] }, false, false], "the held change lands on the valid snapshot");

    block(widget)!.textContent = "not json";
    await settled(widget);
    assert(widget.store.invalid && reported.length === 2);
    widget.store.set({ count: 3 }, { force: true });
    equal(stored(widget), { count: 3, tags: ["z"] }, "forced: the last valid value plus the change, at once");
    equal([widget.store.invalid, widget.store.unsaved], [false, false]);

    block(widget)!.textContent = "[]";
    await settled(widget);
    widget.store.set({}, { force: true });
    equal([stored(widget), widget.store.invalid], [{ count: 3, tags: ["z"] }, false], "forcing without a change puts the last valid value back");
    equal(widget.changes.length, 2, "changed ran for the valid snapshots from outside only");
});

check("data (managed scope): during a debounce a remote snapshot wins for its keys, the widget's keys stay, and the wait is not restarted", async () => {
    const container = await mount(`<div></div>`);
    const editor = manage(container);
    container.innerHTML = markup(`{}`, "ww-data-slow", ` slot="data"`);
    const widget = container.firstElementChild as AnyProbe;
    editor.deliver({ count: 1, tags: ["a"], title: "one" });
    await settled(widget);
    widget.changes.length = 0;

    widget.store.set({ count: 2 });
    const timers: unknown[] = [];
    const native = window.setTimeout;
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...rest: unknown[]) => (timers.push(delay), native(handler, delay, ...rest))) as typeof window.setTimeout;
    try {
        editor.deliver({ count: 7, tags: ["remote"], title: "one" }); // the same key and another one
    } finally {
        window.setTimeout = native;
    }
    equal(timers, [], "the snapshot starts no new wait");
    equal(widget.store.get(), { count: 2, tags: ["remote"], title: "one" } as Probe, "the widget's key stays, the other key follows the snapshot");
    equal(widget.changes, [{ count: 2, tags: ["remote"], title: "one" } as Probe], "reported once, because a key the widget did not change is different");
    assert(widget.store.unsaved, "the change still waits");
    equal(stored(widget).count, 7, "the block holds the remote value meanwhile");

    editor.deliver({ count: 8, tags: ["remote"], title: "one" });
    equal(widget.changes.length, 1, "a snapshot that only differs in the widget's own key changes nothing for the widget");
    await until(() => !widget.store.unsaved, "the debounce ends", 3000);
    equal(stored(widget), { count: 2, tags: ["remote"], title: "one" }, "then the widget's key is written over the remote one");
    editor.stop();
});

check("data: set() compares only the keys it is given, whatever the size of the rest", async () => {
    const widget = await mount<AnyProbe>(markup(`{"count":0}`));
    let reads = 0;
    const rows = Array.from({ length: 500 }, (_, index) => ({ index, text: `row ${index}` }));
    // Counts every look at the large value.
    const large = new Proxy(rows, { get: (target, key, receiver) => (reads++, Reflect.get(target, key, receiver)) });
    widget.store.set({ rows: large } as Partial<Probe>);
    await settled(widget);
    equal(stored(widget).rows.length, 500, "the large value is in the block");

    reads = 0;
    widget.store.set({ count: 1 });
    widget.store.set({ count: 2, tags: ["a"] });
    widget.store.set({ count: 2 });
    equal(reads, 0, "three set() calls did not look at the large value at all");
    await settled(widget);
    assert(reads > 0, "it is read once, when the block is written");
    equal([stored(widget).count, stored(widget).rows.length], [2, 500]);

    const changes = mutations(widget);
    widget.store.set({ rows: rows.map((row) => ({ text: row.text, index: row.index })) } as Partial<Probe>);
    await settled(widget);
    equal(writes(changes.stop()), 0, "an equal value with another key order is no change");

    assert(sameJson({ a: [1, { b: null }], c: undefined }, { a: [1, { b: null }] }), "sameJson: undefined counts as absent");
    assert(!sameJson({ a: [1, 2] }, { a: [2, 1] }) && !sameJson({ a: 1 }, { a: 1, b: 2 }) && !sameJson([], {}) && !sameJson(null, {}), "sameJson: differences");
});

/** Counts the calls of JSON.parse while `run` runs. */
async function parsesDuring(run: () => Promise<void>): Promise<number> {
    const native = JSON.parse;
    let parses = 0;
    JSON.parse = ((text: string, reviver?: Parameters<typeof JSON.parse>[1]) => (parses++, native(text, reviver))) as typeof JSON.parse;
    try {
        await run();
    } finally {
        JSON.parse = native;
    }
    return parses;
}

check("data: a snapshot is parsed once, however often the value is read", async () => {
    const widget = await mount<AnyProbe & { requestUpdate(): void }>(markup(`{"count":1}`));
    const parses = await parsesDuring(async () => {
        block(widget)!.textContent = `{"count":2}`;
        await settled(widget);
        for (let read = 0; read < 3; read++) {
            widget.store.get();
            widget.requestUpdate();
            await settled(widget);
        }
    });
    equal([parses, widget.store.get().count], [1, 2], "one parse for the new snapshot, none for reads and renders");
});

check("data: a set() and the echo of its write parse nothing", async () => {
    const widget = await mount<AnyProbe>(markup(`{"count":2}`));
    const parses = await parsesDuring(async () => {
        widget.store.set({ count: 3 });
        await settled(widget);
    });
    equal([parses, widget.store.get().count, stored(widget).count], [0, 3, 3], "the core knows what it wrote");
});

check("data: a key set to undefined is removed from the block and falls back to its default", async () => {
    const widget = await mount<AnyProbe>(markup(`{"count":4,"title":"kept"}`));
    widget.store.set({ count: undefined, title: undefined });
    equal(widget.store.get(), { count: 0, tags: [] }, "the default answers at once");
    await settled(widget);
    equal(stored(widget), {}, "and the keys are gone from the block");
    const changes = mutations(widget);
    widget.store.set({ title: undefined });
    await settled(widget);
    equal(writes(changes.stop()), 0, "removing what is not there writes nothing");
});

check("data: a pending write is flushed when an ancestor leaves edit mode", async () => {
    const page = await mount(`<div contenteditable>${markup(`{"count":0}`, "ww-data-slow")}</div>`);
    const widget = page.firstElementChild as AnyProbe & { updateComplete: Promise<unknown> };
    await settled(widget);
    widget.store.set({ count: 1 });
    equal(stored(widget).count, 0, "debounced");
    page.removeAttribute("contenteditable");
    await until(() => stored(widget).count === 1, "the mode is read from the widget's surroundings, not from its own attribute");
});

check("data: toDataURL() warns in development above the size guidance", async () => {
    const log = warnings();
    await toDataURL(new Blob([new Uint8Array(DATA_URL_LIMIT)]));
    equal(log.stop(), [], "nothing at the limit");
    const again = warnings();
    const text = await toDataURL(new Blob([new Uint8Array(DATA_URL_LIMIT + 1)], { type: "application/octet-stream" }));
    const messages = again.stop();
    equal(messages.length, 1);
    assert(messages[0].includes("toDataURL()") && messages[0].includes("100 KB"), messages[0]);
    equal(fromDataURL(text).size, DATA_URL_LIMIT + 1, "the file is converted all the same");
});
