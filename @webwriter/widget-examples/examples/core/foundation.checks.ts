// Checks of the shared foundation: adopted styles, transactions that outlive
// their host, converted gesture samples, the render filter of a binding, the
// interaction watch, the development warning, and the harness clocks.
import { assert, check, equal, events, fakeFrames, frame, listeners, mount, point, pointer, settled, typeInto, warnings } from "../../test/harness";
import { html, LitElement } from "lit";
import { ModuleCore, watchAllowed } from "@webwriter/widget/base";
import { PointerGesture, type GestureSample } from "@webwriter/widget/gesture";
import { adoptStyles } from "@webwriter/widget/styles";
import { transaction, transactionOpen, type TransactionEndDetail } from "@webwriter/widget/transaction";
import { CoreController } from "@webwriter/lit/base";

// ── Styles ────────────────────────────────────────────────────────────────

check("styles: adoptStyles returns the remover, and the sheet on it", async () => {
    const host = await mount(`<div><template shadowrootmode="open"><style>b { color: red; }</style><b>x</b></template></div>`);
    const root = host.shadowRoot!;
    const own = new CSSStyleSheet();
    root.adoptedStyleSheets = [own];
    const adopted = adoptStyles(root, "b { display: block; }");
    equal([root.adoptedStyleSheets.length, root.adoptedStyleSheets[0] === adopted.sheet, root.adoptedStyleSheets[1] === own], [2, true, true], "in front of the widget's sheets");
    equal(getComputedStyle(root.querySelector("b")!).display, "block");
    adopted.sheet.replaceSync("b { display: inline-block; }");
    equal(getComputedStyle(root.querySelector("b")!).display, "inline-block", "a module can change its sheet");
    const remove: () => void = adopted; // callers that only keep the remover still work
    remove();
    equal([root.adoptedStyleSheets.length, root.adoptedStyleSheets[0] === own, getComputedStyle(root.querySelector("b")!).display], [1, true, "inline"]);
});

// ── Transaction ───────────────────────────────────────────────────────────

check("transaction: transactionOpen() answers per host, through a pending promise and nesting", async () => {
    const host = await mount("<div><p></p></div>");
    const child = host.firstElementChild!;
    assert(!transactionOpen(host));
    let finish!: () => void;
    const pending = transaction(host, () => {
        assert(transactionOpen(host) && !transactionOpen(child), "open inside the change, for this host only");
        return new Promise<void>((done) => (finish = done));
    });
    transaction(host, () => {});
    assert(transactionOpen(host), "an inner transaction does not close the outer one");
    finish();
    await pending;
    assert(!transactionOpen(host));
    try {
        transaction(host, () => {
            throw new Error("no");
        });
    } catch {
        // expected
    }
    assert(!transactionOpen(host), "closed after a change that throws");
});

check("transaction: a host that leaves the document ends at once, from where it was attached", async () => {
    const box = await mount("<div><section><p></p></section></div>");
    const section = box.querySelector("section")!;
    const host = box.querySelector("p")!;
    const ends: [string, boolean][] = [];
    const abort = new AbortController();
    document.addEventListener(
        "ww-transactionend",
        (event) => void ends.push([(event.target as Element).localName, (event as CustomEvent<TransactionEndDetail | null>).detail?.host === host]),
        { signal: abort.signal },
    );
    const starts = events("ww-transactionstart");
    let own = 0;
    host.addEventListener("ww-transactionend", (event) => event.target === host && own++);

    let finish!: () => void;
    const pending = transaction(host, () => new Promise<void>((done) => (finish = done)));
    section.append(host); // a move within one task keeps the transaction open
    await frame();
    assert(transactionOpen(host) && ends.length === 0, "a moved host stays open");
    host.remove();
    await frame();
    equal(ends, [["section", true]], "the end that reaches the document comes from the former parent and names the host");
    equal(own, 1, "listeners on the host itself still get the host's own end");
    assert(!transactionOpen(host));
    finish();
    await pending;
    equal([ends.length, own], [1, 1], "the promise that settles later sends no second end");

    section.append(host);
    transaction(host, () => host.remove());
    equal(ends, [["section", true], ["section", true]], "also when the change itself removes the host");

    section.append(host);
    transaction(host, () => {});
    equal(ends[2], ["p", false], "a connected host sends its own end, without detail");
    equal(starts.stop().length, 3);
    abort.abort();
});

// ── Pointer gesture ───────────────────────────────────────────────────────

async function gestureOn(surface: HTMLElement, at: { x: number; y: number }, options?: ConstructorParameters<typeof PointerGesture>[2]) {
    const down = new PointerEvent("pointerdown", { pointerId: 7, clientX: at.x, clientY: at.y });
    const gesture = new PointerGesture(surface, down, options);
    const samples: GestureSample[] = [];
    const done = (async () => {
        for await (const sample of gesture) samples.push(sample);
    })();
    return { gesture, samples, done };
}

check("gesture: convert delivers samples in other coordinates and follows a moving view", async () => {
    const surface = await mount(`<div style="width: 200px; height: 100px; margin: 20px"></div>`);
    const origin = point(surface, 0, 0);
    const before = listeners();
    const view = { x: 0, y: 0, scale: 100 };
    const toWorld = (x: number, y: number) => ({ x: (x - origin.x - view.x) / view.scale, y: (y - origin.y - view.y) / view.scale });
    const { gesture, samples, done } = await gestureOn(surface, { x: origin.x + 50, y: origin.y + 50 }, { convert: toWorld });
    equal([gesture.last.x, gesture.last.y, gesture.last.dx, gesture.last.dy], [0.5, 0.5, 0, 0], "the press is converted too");

    pointer(window, "pointermove", { x: origin.x + 52, y: origin.y + 50 });
    await frame(2);
    assert(!gesture.moved, "the threshold counts pixels on the screen: 2 px is a click");
    pointer(window, "pointermove", { x: origin.x + 60, y: origin.y + 50 });
    await frame(2);
    assert(gesture.moved, "10 px starts the gesture, although it is 0.1 in world units");
    const first = samples.at(-1)!;
    equal([first.x, first.y, Math.round(first.dx * 100), first.dy, first.clientX], [0.6, 0.5, 10, 0, origin.x + 60]);

    view.x = -100; // the view scrolled by one world unit under a pointer that rests
    pointer(window, "pointermove", { x: origin.x + 60, y: origin.y + 50 });
    await frame(2);
    const second = samples.at(-1)!;
    equal([second.x, Math.round(second.dx * 100)], [1.6, 110], "the movement is measured in the converted coordinates");

    assert(!gesture.ended.aborted);
    pointer(window, "pointerup", { x: origin.x + 60, y: origin.y + 50 });
    await done;
    assert(gesture.ended.aborted && !gesture.cancelled, "ended aborts on release");
    equal(listeners(), before, "the gesture removed its listeners");
});

check("gesture: without convert, samples are relative to the surface as before, and cancel() aborts ended", async () => {
    const surface = await mount(`<div style="width: 200px; height: 100px; margin: 20px"></div>`);
    const origin = point(surface, 0, 0);
    const { gesture, samples, done } = await gestureOn(surface, { x: origin.x + 10, y: origin.y + 10 });
    pointer(window, "pointermove", { x: origin.x + 40, y: origin.y + 30 });
    await frame(2);
    const sample = samples.at(-1)!;
    equal([sample.x, sample.y, sample.dx, sample.dy], [40, 30, 30, 20]);
    let ended = 0;
    gesture.ended.addEventListener("abort", () => ended++);
    gesture.cancel();
    await done;
    equal([ended, gesture.cancelled], [1, true]);
});

// ── Interaction watch ─────────────────────────────────────────────────────

class Hold extends ModuleCore<null> {
    asked = 0;
    allowed = true;
    getSnapshot() {
        return null;
    }
    /** Starts an interaction and returns its loss signal. */
    start(until?: AbortSignal): AbortSignal {
        return this.whileAllowed(() => (this.asked++, this.allowed && !this.host.hasAttribute("locked")), until);
    }
}

check("watch: whileAllowed aborts when the answer turns false, by an attribute or at a render", async () => {
    const host = await mount("<div></div>");
    const core = new Hold(host);
    core.connect();

    const byAttribute = core.start();
    equal([byAttribute.aborted, core.asked], [false, 1], "asked once at the start");
    host.setAttribute("title", "unrelated");
    await frame();
    equal([byAttribute.aborted, core.asked], [false, 2], "any attribute of the host asks again");
    host.setAttribute("locked", "");
    await frame();
    assert(byAttribute.aborted, "lost when an attribute turns the answer false");
    const asked = core.asked;
    host.removeAttribute("locked");
    await frame();
    core.refresh();
    equal(core.asked, asked, "a lost watch asks no more");

    const byRender = core.start();
    core.allowed = false;
    assert(!byRender.aborted, "a condition that no attribute shows is not seen yet");
    core.refresh();
    assert(byRender.aborted, "refresh() asks again");
    core.allowed = true;

    const over = new AbortController();
    const finished = core.start(over.signal);
    over.abort();
    const afterEnd = core.asked;
    host.setAttribute("locked", "");
    await frame();
    core.refresh();
    equal([finished.aborted, core.asked], [false, afterEnd], "an interaction that is over is not watched and never reported as lost");
    host.removeAttribute("locked");

    const open = core.start();
    core.disconnect();
    host.setAttribute("locked", "");
    await frame();
    assert(!open.aborted, "disconnecting ends the watch without a loss");

    core.connect();
    assert(core.start().aborted, "an interaction that starts while the answer is no is lost at once");
    core.disconnect();
});

check("watch: watchAllowed on an element inside a widget follows the widget's attributes", async () => {
    const widget = await mount(`<div allow-x><template shadowrootmode="open"><span><template shadowrootmode="open"><b></b></template></span></template></div>`);
    const inner = widget.shadowRoot!.querySelector("span")!.shadowRoot!.querySelector("b")!;
    const watch = watchAllowed(inner, () => widget.hasAttribute("allow-x"));
    assert(watch.check() && !watch.signal.aborted);
    widget.removeAttribute("allow-x");
    await frame();
    assert(watch.signal.aborted && !watch.check(), "the widget two shadow roots further out withdrew the permission");
});

// ── Development warning ───────────────────────────────────────────────────

class PublicMember extends HTMLElement {
    permissions?: unknown;
    actions?: unknown;
}
customElements.define("ww-public-member", PublicMember);

check("warning: a core in a public member that the editor reads as a declaration is reported once per class", async () => {
    const log = warnings();
    const hosts = [await mount<PublicMember>("<ww-public-member></ww-public-member>"), await mount<PublicMember>("<ww-public-member></ww-public-member>")];
    for (const host of hosts) {
        host.attachShadow({ mode: "open" });
        const core = new Hold(host);
        host.actions = core;
        core.connect();
        core.disconnect();
    }
    const fine = await mount("<div></div>");
    fine.attachShadow({ mode: "open" });
    new Hold(fine).connect();
    const messages = log.stop();
    equal(messages.length, 1, "once for the class, and not for a core that is held elsewhere");
    assert(/<ww-public-member>.*"actions".*private field/.test(messages[0]), messages[0]);
});

// ── Binding ───────────────────────────────────────────────────────────────

class Clicks extends ModuleCore<{ clicks: number }> {
    #state = { clicks: 0 };
    getSnapshot() {
        return this.#state;
    }
    protected onConnect() {
        this.listen(this.host, "click", () => {
            this.#state = { clicks: this.#state.clicks + 1 };
            this.notify();
        });
    }
}

/** Renders only for every second click. */
class EvenClicks extends CoreController<Clicks> {
    protected override shouldRender() {
        return this.snapshot.clicks % 2 === 0;
    }
}

class Filtered extends LitElement {
    all = new CoreController(this, () => new Clicks(this));
    renders = 0;
    render() {
        this.renders++;
        return html`${this.all.snapshot.clicks}`;
    }
}
class FilteredEven extends LitElement {
    even = new EvenClicks(this, () => new Clicks(this));
    renders = 0;
    render() {
        this.renders++;
        return html`${this.even.snapshot.clicks}`;
    }
}
customElements.define("ww-filtered", Filtered);
customElements.define("ww-filtered-even", FilteredEven);

check("binding: shouldRender() filters which changes of the core render the host", async () => {
    const all = await mount<Filtered>("<ww-filtered></ww-filtered>");
    const even = await mount<FilteredEven>("<ww-filtered-even></ww-filtered-even>");
    const counts: number[][] = [];
    for (let i = 0; i < 4; i++) {
        all.click();
        even.click();
        await settled(all, even);
        counts.push([all.renders, even.renders]);
    }
    equal(counts, [[2, 1], [3, 2], [4, 2], [5, 3]], "the default renders for every change, the filter for every second one");
    equal(even.even.snapshot.clicks, 4, "the core's state is current either way");
    const parent = even.parentElement!;
    even.remove();
    even.click();
    parent.append(even);
    even.click();
    even.click();
    await settled(even);
    equal([even.even.snapshot.clicks, even.renders], [6, 4], "disconnect and reconnect keep one subscription");
});

// ── Harness ───────────────────────────────────────────────────────────────

check("harness: fakeFrames() hands the frame clock to the check, and frame() keeps the real one", async () => {
    const seen: number[] = [];
    const frames = fakeFrames();
    const handle = requestAnimationFrame((now) => seen.push(now));
    requestAnimationFrame((now) => {
        seen.push(now);
        requestAnimationFrame((later) => seen.push(later));
    });
    cancelAnimationFrame(handle);
    await frame(2);
    equal([seen, frames.pending], [[], 1], "nothing runs by itself");
    frames.fire(1000);
    equal([seen, frames.pending], [[1000], 1], "a callback requested during a frame waits for the next one");
    frames.fire(1016);
    equal([seen, frames.pending], [[1000, 1016], 0]);
    frames.restore();
    await new Promise((done) => requestAnimationFrame(done));
});

check("harness: typeInto() sets the value and sends the events a user's entry sends", async () => {
    const host = await mount(`<div><template shadowrootmode="open"><input><input type="checkbox"><select><option>a</option><option>b</option></select></template></div>`);
    const [text, box] = host.shadowRoot!.querySelectorAll("input");
    const select = host.shadowRoot!.querySelector("select")!;
    const outside = events("input", "change");
    const inside: string[] = [];
    for (const type of ["input", "change"]) host.shadowRoot!.addEventListener(type, (event) => inside.push(`${type}:${(event.target as HTMLInputElement).value}`));
    typeInto(text, "ab");
    typeInto(text, "abc", "input", "change");
    typeInto(box, true, "change");
    typeInto(select, "b", "change");
    equal([text.value, box.checked, select.value], ["abc", true, "b"]);
    equal(inside, ["input:ab", "input:abc", "change:abc", "change:on", "change:b"]);
    equal(outside.stop(), ["input", "input"], "like the browser's events: input leaves the shadow root, change does not");
});
