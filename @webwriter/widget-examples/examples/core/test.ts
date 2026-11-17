// Checks of the shared pieces that the sort examples do not reach: the base
// class, the transaction helper, the Permissions details, and Drag with
// shadow-rendered, keyed items in a row. The other files of this folder add
// the checks of the foundation, the messages and the rest of Permissions.
import { animations, assert, check, drag, equal, events, key, listeners, mount, point, run, settled } from "../../test/harness";
import { html, LitElement } from "lit";
import { ModuleCore } from "@webwriter/widget/base";
import type { DragCommitDetail } from "@webwriter/widget/drag";
import { PermissionsCore } from "@webwriter/widget/permissions";
import { transaction } from "@webwriter/widget/transaction";
import { Drag } from "@webwriter/lit/drag";
import { Permissions } from "@webwriter/lit/permissions";
import { ExampleElement } from "../shared/base";
import "./conversions.checks";
import "./foundation.checks";
import "./messages.checks";
import "./permissions.checks";
import "./print.checks";
import "./signals.checks";

// ── Base ──────────────────────────────────────────────────────────────────

class Counter extends ModuleCore<{ clicks: number }> {
    #state = { clicks: 0 };
    refreshed = 0;
    getSnapshot() {
        return this.#state;
    }
    protected onConnect() {
        this.listen(window, "click", () => {
            this.#state = { clicks: this.#state.clicks + 1 };
            this.notify();
        });
        const timer = setInterval(() => {}, 1000);
        this.cleanup(() => clearInterval(timer));
        this.cleanup(() => (this.#state = { clicks: 0 }));
    }
    protected onRefresh() {
        this.refreshed++;
    }
}

check("base: connect, snapshot, subscribe, refresh and disconnect", async () => {
    const host = await mount("<div></div>");
    host.attachShadow({ mode: "open" });
    const before = listeners(window);
    const core = new Counter(host);
    let notified = 0;
    const unsubscribe = core.subscribe(() => notified++);
    core.refresh();
    equal(core.refreshed, 0, "refresh does nothing while disconnected");
    core.connect();
    core.connect();
    equal(listeners(window), before + 1, "connecting twice registers once");
    assert(core.root === host.shadowRoot && core.connected);
    const first = core.getSnapshot();
    assert(core.getSnapshot() === first, "the snapshot is stable between changes");
    window.dispatchEvent(new Event("click"));
    equal([core.getSnapshot().clicks, notified], [1, 1]);
    assert(core.getSnapshot() !== first, "a change gives a new snapshot");
    core.refresh();
    equal(core.refreshed, 1);
    unsubscribe();
    window.dispatchEvent(new Event("click"));
    equal(notified, 1, "an unsubscribed listener is not called");
    core.disconnect();
    core.disconnect();
    equal([listeners(window), core.getSnapshot().clicks, core.connected], [before, 0, false], "disconnect runs the cleanups");
    core.connect();
    equal(listeners(window), before + 1, "it connects again");
    core.disconnect();
});

check("base: a closed shadow root is reached through the root option", async () => {
    const host = await mount("<div></div>");
    const closed = host.attachShadow({ mode: "closed" });
    assert(new Counter(host, { root: () => closed }).root === closed);
    let message = "";
    try {
        new Counter(host).root;
    } catch (error) {
        message = String(error);
    }
    assert(/no shadow root/.test(message), "without it the error says what is missing");
});

// ── Transaction ───────────────────────────────────────────────────────────

check("transaction: wraps a synchronous change and returns its value", async () => {
    const host = await mount("<div></div>");
    const log = events("ww-transactionstart", "ww-transactionend");
    equal(transaction(host, () => (host.title = "x")), "x");
    equal(log.stop(), ["ww-transactionstart", "ww-transactionend"]);
});

check("transaction: ends when a returned promise settles, also on rejection", async () => {
    const host = await mount("<div></div>");
    const log = events("ww-transactionstart", "ww-transactionend");
    const pending = transaction(host, async () => {
        await Promise.resolve();
        return 7;
    });
    equal(log.log, ["ww-transactionstart"], "still open while the promise is pending");
    equal(await pending, 7);
    const error = await transaction(host, async () => {
        throw new Error("no");
    }).catch((reason) => reason.message);
    equal([error, ...log.stop()], ["no", "ww-transactionstart", "ww-transactionend", "ww-transactionstart", "ww-transactionend"]);
});

check("transaction: ends when the change throws", async () => {
    const host = await mount("<div></div>");
    const log = events("ww-transactionstart", "ww-transactionend");
    let thrown = "";
    try {
        transaction(host, () => {
            throw new Error("no");
        });
    } catch (error) {
        thrown = (error as Error).message;
    }
    equal([thrown, ...log.stop()], ["no", "ww-transactionstart", "ww-transactionend"]);
});

check("transaction: nested calls for one host send one pair, other hosts their own", async () => {
    const host = await mount("<div><p></p></div>");
    const log = events("ww-transactionstart", "ww-transactionend");
    await transaction(host, async () => {
        transaction(host, () => {});
        await transaction(host, async () => {});
        equal(log.log, ["ww-transactionstart"], "inner transactions add nothing");
    });
    equal(log.log, ["ww-transactionstart", "ww-transactionend"]);
    transaction(host, () => transaction(host.firstElementChild!, () => {}));
    equal(log.stop().length, 6, "a child host sends its own pair inside the parent's");
});

// ── Permissions ───────────────────────────────────────────────────────────

class Gated extends LitElement {
    static properties = { allowAdding: { type: Boolean, attribute: "allow-adding" }, allowDeleting: { type: Boolean } };
    static permissions = { allowAdding: { label: { _: "add" } }, allowDeleting: { label: { _: "delete" } } };
    // Not named `permissions`: that instance field is the editor's per-instance declaration.
    gate = new Permissions(this);
    renders = 0;
    render() {
        this.renders++;
        return html`
            <button id="add" data-ww-can="allowAdding" style="display: inline-flex">Add</button>
            <button id="delete" data-ww-can="allowDeleting" data-ww-can-mode="disable">Delete</button>
            <button id="rename" data-ww-can="edit">Rename</button>
            <button id="other" data-ww-can="notDeclared">Other</button>
            <span id="text">${this.gate.can("allowAdding") ? "may add" : "may not add"}</span>
        `;
    }
}
customElements.define("ww-gated", Gated);

check("permissions: can() follows the mode and the permission attributes, and re-renders", async () => {
    const el = await mount<Gated>("<ww-gated></ww-gated>");
    const permissions = el.gate;
    const $ = (id: string) => el.shadowRoot!.getElementById(id) as HTMLButtonElement;
    const state = () => [permissions.can("allowAdding"), permissions.can("allowDeleting"), permissions.can("edit"), permissions.editing];
    equal(state(), [false, false, false, false], "read mode, nothing granted");
    equal([$("add").hidden, $("delete").hidden, $("delete").inert, $("rename").hidden, $("other").hidden], [true, false, true, true, true]);
    equal(getComputedStyle($("add")).display, "none", "hidden wins over the element's own display");

    el.setAttribute("allow-adding", ""); // attribute from the Lit property
    el.setAttribute("allowdeleting", ""); // Lit's default: the lowercase name
    await settled(el);
    equal(state(), [true, true, false, false]);
    equal([$("add").hidden, $("delete").inert, $("rename").hidden, $("text").textContent], [false, false, true, "may add"]);
    equal(permissions.snapshot.granted, ["allowAdding", "allowDeleting"]);

    el.removeAttribute("allow-adding");
    el.removeAttribute("allowdeleting");
    el.setAttribute("contenteditable", "");
    await settled(el);
    equal(state(), [true, true, true, true], "edit mode allows everything");
    equal([$("add").hidden, $("delete").inert, $("rename").hidden, $("other").hidden], [false, false, false, false]);
    assert(permissions.can("notDeclared"), "also a name that is not declared");

    const renders = el.renders;
    el.setAttribute("title", "unrelated");
    await settled(el);
    equal(el.renders, renders, "other attributes cause no render");
});

check("permissions: the core alone uses lowercase names, an instance declaration and a custom mode", async () => {
    const host = await mount("<div allowhints><template shadowrootmode=open><i data-ww-can=allowHints></i></template></div>");
    if (!host.shadowRoot) host.attachShadow({ mode: "open" }).innerHTML = "<i data-ww-can=allowHints></i>";
    const mark = host.shadowRoot!.querySelector("i")!;
    let editing = false;
    const core = new PermissionsCore(host, { editing: () => editing });
    core.connect();
    assert(!core.can("allowHints") && mark.hidden, "a permission that is not declared is not granted by its attribute");
    (host as HTMLElement & { permissions?: object }).permissions = { allowHints: {} };
    core.refresh();
    assert(core.can("allowHints") && !mark.hidden, "declared on the instance");
    host.removeAttribute("allowhints");
    editing = true;
    let notified = 0;
    core.subscribe(() => notified++);
    core.refresh(); // a custom mode is picked up on refresh
    assert(core.can("allowHints") && core.getSnapshot().editing && notified === 1);
    core.disconnect();
});

// ── Drag: shadow-rendered, keyed items in a row ───────────────────────────

class Chips extends LitElement {
    static properties = { order: { state: true } };
    declare order: string[];
    drag = new Drag(this, { duration: 60 });
    constructor() {
        super();
        this.order = ["a", "b", "c", "d"];
    }
    #commit(event: CustomEvent<DragCommitDetail>) {
        const { key, index } = event.detail;
        const rest = this.order.filter((id) => id !== key);
        rest.splice(index!, 0, key!);
        this.order = rest;
    }
    render() {
        return html`
            <style>
                .row { display: flex; gap: 8px; width: 400px; }
                .chip { width: 60px; padding: 6px; border: 1px solid gray; position: relative; }
            </style>
            <div class="row" data-ww-drop="chip" data-ww-drop-position="index" data-ww-label="Row" @ww-dragcommit=${this.#commit}>
                ${this.order.map(
                    (id) => html`<div class="chip" data-ww-drag="chip" data-ww-key=${id}><b data-ww-drag-handle>::</b> ${id} <input size="1" /></div>`,
                )}
            </div>
        `;
    }
}
customElements.define("ww-chips", Chips);

check("drag: keyed shadow items reorder in a row through the widget's model", async () => {
    const el = await mount<Chips>("<ww-chips></ww-chips>");
    const chip = (id: string) => el.shadowRoot!.querySelector<HTMLElement>(`[data-ww-key="${id}"]`)!;
    const grip = (id: string) => chip(id).querySelector<HTMLElement>("[data-ww-drag-handle]")!;
    equal([chip("a").tabIndex, getComputedStyle(grip("a")).touchAction, getComputedStyle(chip("a")).touchAction], [0, "none", "auto"], "focusable; touch scrolling is off on the handle only");

    const marker = () => el.shadowRoot!.querySelector<HTMLElement>("[data-ww-drop-marker]");
    await drag(grip("a"), point(chip("c"), 0.8, 0.5), {
        held() {
            const box = marker()!.getBoundingClientRect();
            assert(box.height > box.width, "the marker is a vertical line in a row");
            assert(box.left > chip("c").getBoundingClientRect().right - 1 && box.right < chip("d").getBoundingClientRect().left + 1, "it sits between c and d");
            assert(chip("a").hasAttribute("data-ww-dragging") && chip("a").style.length === 0, "the item is marked and has no inline style");
        },
    });
    equal(el.order, ["b", "c", "a", "d"]);
    assert(!el.shadowRoot!.querySelector("[data-ww-dragging], [data-ww-drop-over], [data-ww-drop-candidate], [data-ww-drop-marker]"), "nothing is left behind");

    await drag(chip("d"), point(chip("b"), 0.2, 0.5));
    equal(el.order, ["b", "c", "a", "d"], "an item with a handle is not dragged by its body");

    chip("d").focus();
    key("Enter");
    key("ArrowLeft");
    key("ArrowLeft");
    key("ArrowLeft");
    key(" ");
    await animations();
    equal(el.order, ["d", "b", "c", "a"], "keyboard: three places to the left");
    assert(el.shadowRoot!.activeElement === chip("d"), "focus follows the item");

    const input = chip("b").querySelector("input")!;
    input.focus();
    key(" ");
    key("ArrowRight");
    key("Enter");
    await animations();
    equal(el.order, ["d", "b", "c", "a"], "keys typed in a control inside an item do not pick it up");
});

check("drag: the item snapshot names the item while it is held", async () => {
    const el = await mount<Chips>("<ww-chips></ww-chips>");
    const grip = el.shadowRoot!.querySelector<HTMLElement>("[data-ww-drag-handle]")!;
    const seen: (string | undefined)[] = [];
    await drag(grip, point(el, 0.9, 0.5), { held: () => void seen.push(el.drag.item?.dataset.wwKey, el.drag.snapshot.via ?? undefined) });
    equal([...seen, el.drag.item], ["a", "pointer", null]);
});

/** Tiles whose click and keys may be their own: `via` names the ways one is picked up. */
class Tiles extends LitElement {
    static properties = { order: { state: true }, via: {} };
    declare order: string[];
    declare via: string;
    drag = new Drag(this, { duration: 60 });
    pressed: string[] = [];
    constructor() {
        super();
        this.order = ["a", "b", "c"];
        this.via = "pointer";
    }
    #commit(event: CustomEvent<DragCommitDetail>) {
        const { key, index } = event.detail;
        const rest = this.order.filter((id) => id !== key);
        rest.splice(index!, 0, key!);
        this.order = rest;
    }
    render() {
        return html`
            <style>
                .row { display: flex; gap: 8px; width: 400px; }
                .tile { width: 60px; padding: 6px; border: 1px solid gray; }
            </style>
            <div class="row" data-ww-drop="tile" data-ww-drop-position="index" @ww-dragcommit=${this.#commit}>
                ${this.order.map(
                    (id) => html`<div class="tile" data-ww-drag="tile" data-ww-drag-via=${this.via} data-ww-key=${id} @click=${() => this.pressed.push(id)}>${id}</div>`,
                )}
            </div>
        `;
    }
}
customElements.define("ww-tiles", Tiles);

check("drag: data-ww-drag-via names the ways an item is picked up, and the others stay the item's own", async () => {
    const el = await mount<Tiles>("<ww-tiles></ww-tiles>");
    const tile = (id: string) => el.shadowRoot!.querySelector<HTMLElement>(`[data-ww-key="${id}"]`)!;
    equal([tile("a").hasAttribute("tabindex"), getComputedStyle(tile("a")).touchAction], [false, "none"], "pointer only: not made focusable, and touch scrolling is off for the drag");
    tile("a").click();
    equal([el.drag.item, el.pressed], [null, ["a"]], "a click is the item's own");
    tile("a").tabIndex = 0;
    tile("a").focus();
    equal([key("Enter"), key(" "), el.drag.item], [true, true, null], "so are its keys, which are not consumed");
    await drag(tile("a"), point(tile("c"), 0.8, 0.5));
    equal(el.order, ["b", "c", "a"], "a pointer drag moves it");

    el.via = "keyboard click";
    await settled(el);
    equal([tile("b").tabIndex, getComputedStyle(tile("b")).touchAction], [0, "auto"], "without the pointer: focusable, and touch scrolling stays on");
    await drag(tile("b"), point(tile("a"), 0.8, 0.5));
    equal([el.order, el.drag.item], [["b", "c", "a"], null], "a pointer drag does nothing");
    tile("b").click();
    equal(el.drag.snapshot.via, "click");
    key("Escape", window);
    tile("b").focus();
    key("Enter");
    equal(el.drag.snapshot.via, "keyboard");
    key("ArrowRight");
    key("Enter");
    await animations();
    equal(el.order, ["c", "b", "a"], "the keyboard moves it");
});

// ── Declarations whose texts come from the widget ─────────────────────────

/** A widget whose drawer texts are functions of the widget, as for texts from its own catalog. */
class Labelled extends ExampleElement {
    static actions = {
        reset: { label: (widget: { word: string }) => widget.word, confirm: (widget: { word: string }) => ({ _: `${widget.word}?` }) },
        plain: { label: { _: "Plain" } },
    };
    static optionGroups = { view: { label: (widget: { word: string }) => `${widget.word} group` } };
    static permissions = { allowReset: { label: (widget: { word: string }) => `${widget.word} allowed` } };
    static options = { size: { type: "select" as const, label: (widget: { word: string }) => widget.word, options: [{ value: "s", label: (widget: { word: string }) => `${widget.word} small` }] } };
    word = "Reset";
    reset() {}
    plain() {}
}
customElements.define("ww-labelled", Labelled);

/** The same with an instance field, which takes precedence as before. */
class LabelledOwn extends Labelled {
    actions = { own: { label: { _: "Own" } } };
}
customElements.define("ww-labelled-own", LabelledOwn);

check("declarations: a text that is a function is answered for the widget, and the editor reads plain maps", async () => {
    const el = await mount<Labelled>("<ww-labelled></ww-labelled>");
    const read = (kind: string) => (el as unknown as Record<string, Record<string, any>>)[kind];
    equal(read("actions"), { reset: { label: "Reset", confirm: { _: "Reset?" } }, plain: { label: { _: "Plain" } } });
    equal([read("optionGroups").view.label, read("permissions").allowReset.label], ["Reset group", "Reset allowed"]);
    equal([read("options").size.label, read("options").size.options[0].label, read("options").size.type], ["Reset", "Reset small", "select"]);
    el.word = "Zurücksetzen";
    equal(read("actions").reset.label, "Zurücksetzen", "asked again on every read");
    assert(typeof Labelled.actions.reset.label === "function", "the static declaration keeps the function");
    const own = await mount<LabelledOwn>("<ww-labelled-own></ww-labelled-own>");
    equal(own.actions, { own: { label: { _: "Own" } } }, "an instance field replaces the answer");
    const plain = await mount<Chips>("<ww-chips></ww-chips>");
    assert(!Object.hasOwn(plain, "actions"), "a widget without such texts gets no instance member");
});

/** Availability that depends on the widget: an action with nothing to act on is hidden. */
class Available extends ExampleElement {
    static actions = {
        clear: { hidden: (widget: { items: number }) => widget.items === 0, disabled: (widget: { items: number }) => widget.items > 5, disabledReason: (widget: { items: number }) => (widget.items > 5 ? { _: "Too many" } : undefined), label: { _: "Clear" } },
        broken: { disabled: () => { throw new Error("no"); } },
        fixed: { hidden: false },
    };
    static options = { size: { type: Number, readOnly: (widget: { items: number }) => widget.items === 3 } };
    static permissions = { allowClear: { disabled: (widget: { items: number }) => widget.items === 0 } };
    items = 0;
    clear() {}
}
customElements.define("ww-available", Available);

check("declarations: hidden, disabled and readOnly may be functions of the widget, asked again on every read", async () => {
    const el = await mount<Available>("<ww-available></ww-available>");
    const read = (kind: string) => (el as unknown as Record<string, Record<string, any>>)[kind];
    equal([read("actions").clear.hidden, read("actions").clear.disabled, read("actions").clear.disabledReason], [true, false, undefined], "nothing to clear: hidden");
    el.items = 3;
    equal([read("actions").clear.hidden, read("options").size.readOnly], [false, true], "follows the state without a new declaration");
    el.items = 6;
    equal([read("actions").clear.disabled, read("actions").clear.disabledReason], [true, { _: "Too many" }]);
    equal([read("actions").broken.disabled, read("actions").fixed.hidden, read("permissions").allowClear.disabled], [true, false, false], "a failing function refuses; a fixed value stays");
    assert(typeof Available.actions.clear.hidden === "function", "the static declaration keeps the function");
});

run();
