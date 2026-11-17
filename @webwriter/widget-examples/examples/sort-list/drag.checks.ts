// Checks of Drag on small shadow trees written per check, for what the sort
// list itself does not show: rows, slots, capacity, gating, re-rendering,
// transforms, scrolling and the rules for presses, clicks and keys.
import { assert, check, deepActive, drag, equal, events, fakeFrames, frame, key, mount, mutations, point, pointer, until, wait } from "../../test/harness";
import { click, glided, hold, moveTo, type DragFixture } from "../shared/sort-input";

const fixture = (shadow: string, light = "", attributes = "") =>
    `<ww-drag-fixture ${attributes}><template shadowrootmode="open">${shadow}</template>${light}</ww-drag-fixture>`;
const ROW = `<style>.row { display: flex; gap: 10px; } .chip { flex: none; box-sizing: border-box; width: 70px; height: 30px; border: 1px solid gray; }</style>`;
const chips = (keys: string) => [...keys].map((name) => `<div class="chip" data-ww-drag="chip" data-ww-key="${name}">${name}</div>`).join("");
const row = (keys: string, attributes = `data-ww-label="Row"`) => `<div class="row" data-ww-drop="chip" data-ww-drop-position="index" ${attributes}>${chips(keys)}</div>`;
const BINS = `<style>.bin { width: 220px; min-height: 30px; margin: 6px 0; padding: 6px; border: 1px solid gray; } ::slotted(*), .card { display: block; margin: 0 0 4px; padding: 2px; border: 1px solid silver; }</style>`;
const bin = (id: string, slot: string | null, attributes = "") =>
    `<div class="bin" id="${id}" data-ww-drop="card" data-ww-drop-position="index" data-ww-label="${id}" ${attributes}><slot ${slot === null ? "" : `name="${slot}"`} data-ww-drag="card"></slot></div>`;
const CARDS = `<p slot="left">one</p><p slot="left">two</p><p slot="right">three</p><p slot="right">four</p>`;

const root = (host: Element) => host.shadowRoot!;
const item = (host: Element, name: string) => root(host).querySelector<HTMLElement>(`[data-ww-key="${name}"]`)!;
const part = (host: Element, selector: string) => root(host).querySelector<HTMLElement>(selector)!;
const order = (host: Element, selector = ".row") => [...part(host, selector).querySelectorAll<HTMLElement>("[data-ww-key]")].map((each) => each.dataset.wwKey).join("");
const child = (host: Element, text: string) => [...host.children].find((each) => each.textContent!.includes(text)) as HTMLElement;
const light = (host: Element) => [...host.children].map((each) => `${each.textContent!.trim()}:${each.getAttribute("slot") ?? ""}`);
const marker = (host: Element) => root(host).querySelector("[data-ww-drop-marker]")?.getBoundingClientRect();
const live = (host: Element) => root(host).querySelector("[data-ww-live]")?.textContent!.trim();
const candidates = (host: Element) => [...root(host).querySelectorAll("[data-ww-drop-candidate]")].map((target) => target.id);
const running = (host: Element) => root(host).getAnimations().filter((animation) => animation.playState === "running").length;
const near = (a: number, b: number, tolerance = 0.6) => Math.abs(a - b) <= tolerance;
/** Waits for a commit and for what follows it in the same turn: the default action, the announcement, the focus. */
async function committed(host: DragFixture, count: number) {
    await until(() => host.commits.length >= count, `commit ${count} did not arrive`);
    await wait(0);
}

/** Press, pass the threshold and move, on frames the check fires itself. */
async function lift(frames: { fire(): void }, from: HTMLElement, to?: { x: number; y: number }) {
    const start = point(from);
    pointer(from, "pointerdown", start);
    pointer(from, "pointermove", { x: start.x + 6, y: start.y + 6 });
    frames.fire();
    await wait(0); // the pick-up runs in microtasks
    if (!to) return;
    pointer(from, "pointermove", to);
    frames.fire();
    await wait(0);
}

// ── The index ─────────────────────────────────────────────────────────────

check("index: in rows that wrap, the place comes from the row under the pointer and the midpoints in it", async () => {
    const host = await mount<DragFixture>(fixture(`${ROW}<style>.row { flex-wrap: wrap; width: 230px; }</style>${row("abcde")}`));
    equal([item(host, "a").getBoundingClientRect().top < item(host, "d").getBoundingClientRect().top, item(host, "d").getBoundingClientRect().left], [true, item(host, "a").getBoundingClientRect().left], "three chips fit a row: a b c / d e");

    // e behind c, at the end of the first row.
    let to = point(item(host, "c"), 0.9, 0.5);
    const c = item(host, "c").getBoundingClientRect();
    await hold(item(host, "e"), to);
    let box = marker(host)!;
    assert(near(box.left + box.width / 2, c.right) && near(box.top, c.top) && near(box.height, c.height) && near(box.width, 2, 0.1), "behind the last chip of a row the marker stays in that row");
    pointer(item(host, "e"), "pointerup", to);
    await committed(host, 1);
    equal([order(host), host.commits[0].index, host.commits[0].before?.dataset.wwKey], ["abced", 3, "d"]);
    await glided(host);

    // a in front of e, at the start of the second row.
    to = point(item(host, "e"), 0.2, 0.5);
    const e = item(host, "e").getBoundingClientRect();
    await hold(item(host, "a"), to);
    box = marker(host)!;
    assert(near(box.left + box.width / 2, e.left) && near(box.top, e.top), "in front of the first chip of a row the marker is in that row");
    pointer(item(host, "a"), "pointerup", to);
    await committed(host, 2);
    equal([order(host), host.commits[1].index, host.commits[1].before?.dataset.wwKey], ["bcaed", 2, "e"]);
    await glided(host);

    // b behind d: in the gap between the rows the lower row counts.
    const d = item(host, "d").getBoundingClientRect();
    to = { x: d.right + 4, y: d.top - 5 };
    await drag(item(host, "b"), to, { held: () => assert(near(marker(host)!.left + 1, d.right) && near(marker(host)!.top, d.top), "the marker is behind the last chip of the lower row") });
    equal([order(host), host.commits[2].index, host.commits[2].before], ["caedb", 4, null]);
});

check("index: right to left, and with fewer than two items the flow comes from the target's styles", async () => {
    const host = await mount<DragFixture>(
        fixture(
            `${ROW}${row("abc", `dir="rtl" style="width: 300px"`)}
            <div class="row" id="empty" dir="rtl" data-ww-drop="chip" data-ww-drop-position="index" style="width: 300px; height: 40px; margin-top: 10px"></div>
            <div id="stack" data-ww-drop="chip" data-ww-drop-position="index" style="width: 120px; padding: 10px 0; margin-top: 10px">${chips("z")}</div>`,
        ),
    );
    assert(item(host, "a").getBoundingClientRect().left > item(host, "c").getBoundingClientRect().left, "the row runs from the right: c b a");

    // a to the end of the row, which is its left end.
    let to = point(item(host, "c"), 0.1, 0.5);
    await drag(item(host, "a"), to, { held: () => assert(near(marker(host)!.left + 1, item(host, "c").getBoundingClientRect().left), "the marker is at the left edge of the last chip") });
    equal([order(host), host.commits[0].index], ["bca", 2]);
    await glided(host);

    // a between b and c: right of c's midpoint is in front of c.
    to = point(item(host, "c"), 0.9, 0.5);
    const gap = (item(host, "b").getBoundingClientRect().left + item(host, "c").getBoundingClientRect().right) / 2;
    await drag(item(host, "a"), to, { held: () => assert(near(marker(host)!.left + 1, gap), "the marker is in the gap between b and c") });
    equal([order(host), host.commits[1].index, host.commits[1].before?.dataset.wwKey], ["bac", 1, "c"]);
    await glided(host);

    // An empty row: a vertical marker at its start, which is on the right.
    const empty = part(host, "#empty").getBoundingClientRect();
    await drag(item(host, "a"), part(host, "#empty"), {
        cancel: true,
        held() {
            const box = marker(host)!;
            assert(near(box.left + 1, empty.right) && near(box.height, empty.height) && box.width < box.height, "an empty right-to-left row starts at its right edge");
        },
    });
    await glided(host);

    // A block with one item: a horizontal marker below it.
    const z = item(host, "z").getBoundingClientRect();
    await drag(item(host, "a"), { x: z.left + 20, y: z.bottom + 4 }, {
        held() {
            const box = marker(host)!;
            assert(near(box.top + 1, z.bottom) && near(box.width, z.width) && box.height < box.width, "a single item in a block is stacked");
        },
    });
    equal([order(host, "#stack"), host.commits[2].index, host.commits[2].before], ["za", 1, null]);
});

check("settle: a drag that starts while the items still glide reads their layout, and the item stays under the pointer", async () => {
    const host = await mount<DragFixture>(fixture(`${ROW}${row("abcd")}`));
    host.duration = 60000;
    const end = point(item(host, "d"), 0.9, 0.5);
    await hold(item(host, "a"), end);
    pointer(item(host, "a"), "pointerup", end);
    await until(() => running(host) === 4, "every chip glides to its new place");
    equal(order(host), "bcda");

    // b is pressed where it is seen: still at the second place, on its way to the first.
    const left = part(host, ".row").getBoundingClientRect().left;
    const seen = point(item(host, "b"));
    assert(near(seen.x, left + 80 + 35, 6), "b has hardly moved yet");
    // Right of the middle of the place c is laid out at. Its animation still shows c one place further right.
    const to = { x: left + 80 + 63, y: seen.y };
    await hold(item(host, "b"), to);
    equal(running(host), 0, "the earlier drop stopped gliding when the new drag started");
    assert(near(item(host, "c").getBoundingClientRect().left, left + 80), "so c is where it is laid out");
    assert(near(point(item(host, "b")).x, to.x) && near(point(item(host, "b")).y, to.y), "and b did not jump away from the pointer");
    pointer(item(host, "b"), "pointerup", to);
    await committed(host, 2);
    equal(order(host), "cbda", "the place was found from the layout");
});

// ── Slots ─────────────────────────────────────────────────────────────────

check("slots: a move between differently named slots writes the slot attribute and the place, and nothing else", async () => {
    const host = await mount<DragFixture>(fixture(`${BINS}${bin("left", "left")}${bin("right", "right")}${bin("rest", null)}`, CARDS));
    host.lift = { opacity: 0.5 };
    const [one, , three, four] = host.children as unknown as HTMLElement[];
    const changes = mutations(host);
    await drag(one, point(four, 0.5, 0.2), {
        held() {
            equal(changes.stop().length, 0, "nothing is written onto the lifted child");
            equal([one.hasAttribute("data-ww-dragging"), getComputedStyle(one).opacity], [false, "0.5"], "its look is the lift keyframe");
        },
    });
    equal(light(host), ["two:left", "three:right", "one:right", "four:right"], "it sits in the other slot, in front of the item it was dropped on");
    const [detail] = host.commits;
    equal([detail.slot, detail.index, detail.effect, detail.key, detail.kind], ["right", 1, "move", undefined, "card"]);
    assert(detail.item === one && detail.before === four && detail.source === part(host, "#left") && detail.target === part(host, "#right"), "the commit names source and target");
    equal(host.querySelectorAll("p").length, 4, "the same element was moved");

    // Into an empty target only the slot counts: the child keeps its place among its siblings.
    const records = mutations(host);
    await drag(three, part(host, "#rest"));
    equal(light(host), ["two:left", "three:", "one:right", "four:right"], "the default slot is no attribute");
    equal(records.stop().map((record) => `${record.type}:${record.attributeName}`), ["attributes:slot"], "one write");
    equal([host.commits[1].slot, host.commits[1].index], ["", 0]);
});

check("slots: a full index target with swap hands back the item at the place; without swap it is no candidate", async () => {
    const host = await mount<DragFixture>(fixture(`${BINS}${bin("left", "left")}${bin("right", "right", `data-ww-drop-max="2" data-ww-drop-full="swap"`)}`, CARDS));
    const [one, two, three, four] = host.children as unknown as HTMLElement[];
    await drag(one, point(four, 0.5, 0.2), { held: () => equal(candidates(host), ["left", "right"], "the full target stays a candidate") });
    assert(host.commits[0].displaced === four && host.commits[0].before === four && host.commits[0].index === 1, "the item at the place is displaced");
    equal(light(host), ["four:left", "two:left", "three:right", "one:right"], "it takes the place and the slot the moved item had");

    await drag(three, point(one, 0.5, 0.9));
    equal([light(host), host.commits[1].displaced], [["four:left", "two:left", "one:right", "three:right"], null], "a move inside the full target displaces nothing");

    await drag(two, point(three, 0.5, 0.9));
    assert(host.commits[2].displaced === three && host.commits[2].before === null && host.commits[2].index === 2, "at the end the last item is displaced");
    equal(light(host), ["four:left", "three:left", "one:right", "two:right"]);

    part(host, "#right").removeAttribute("data-ww-drop-full");
    await drag(four, point(one, 0.5, 0.2), { held: () => equal(candidates(host), ["left"], "without swap a full target is no candidate") });
    equal([light(host), host.commits.length], [["four:left", "three:left", "one:right", "two:right"], 3], "and a release on it changes nothing");
});

check("copy: the source stays; the module moves nothing and counts the copy towards the capacity", async () => {
    const host = await mount<DragFixture>(
        fixture(
            `${BINS}<div class="bin" id="src" data-ww-drop="card" data-ww-drop-position="index"><slot name="src" data-ww-drag="card" data-ww-drag-effect="copy"></slot></div>${bin("dst", "dst", `data-ww-drop-max="2"`)}`,
            `<p slot="src">one</p><p slot="src">two</p><p slot="dst">x</p>`,
        ),
    );
    // The widget's part: create what the target receives.
    host.addEventListener("ww-dragcommit", (event) => {
        const { item: source, before } = (event as CustomEvent<{ item: HTMLElement; before: HTMLElement | null }>).detail;
        const copy = source.cloneNode(true) as HTMLElement;
        copy.slot = "dst";
        copy.textContent += " (copy)";
        host.insertBefore(copy, before);
    });
    const [one, two, x] = host.children as unknown as HTMLElement[];
    const changes = mutations(one);
    await hold(one, point(x, 0.5, 0.9));
    equal(candidates(host), ["src", "dst"], "its own target is a place for a copy too");
    pointer(one, "pointerup", point(x, 0.5, 0.9));
    await committed(host, 1);
    await frame(2);
    equal([one.getAnimations().length, changes.stop().length], [0, 0], "the source is back at once and untouched");
    const [detail] = host.commits;
    equal([detail.effect, detail.index, detail.before, detail.slot, detail.displaced], ["copy", 1, null, null, null]);
    equal(light(host), ["one:src", "two:src", "x:dst", "one (copy):dst"]);

    await drag(two, point(x, 0.5, 0.2), { held: () => equal(candidates(host), ["src"], "the target is full now") });
    equal(host.commits.length, 1);

    await drag(two, point(one, 0.5, 0.2));
    equal([host.commits[1].effect, host.commits[1].index, host.commits[1].before === one, host.commits[1].target.id], ["copy", 0, true, "src"], "a copy inside its own target");
    await drag(one, { x: 700, y: 600 });
    equal(host.commits.length, 2, "a copy released outside commits nothing");
});

// ── Gating ────────────────────────────────────────────────────────────────

check("gating: can is asked at the press, at pick-up, on every frame, on refresh and before the commit", async () => {
    const host = await mount<DragFixture>(fixture(`${ROW}${row("abcd")}`));
    const frames = fakeFrames();
    const to = point(item(host, "d"), 0.9, 0.5);
    let asked = host.asked;
    const more = (when: string) => {
        assert(host.asked > asked, `can was not asked ${when}`);
        asked = host.asked;
    };
    pointer(item(host, "a"), "pointerdown", point(item(host, "a")));
    more("at the press");
    pointer(item(host, "a"), "pointermove", { x: point(item(host, "a")).x + 6, y: point(item(host, "a")).y + 6 });
    frames.fire();
    await wait(0);
    more("at pick-up");
    equal(item(host, "a").getAnimations().length, 1, "the drag runs");
    for (let i = 0; i < 3; i++) {
        frames.fire();
        equal(host.asked, ++asked, "once per frame");
    }
    host.drag.refresh();
    more("on refresh");
    pointer(item(host, "a"), "pointermove", to);
    frames.fire();
    await wait(0);
    asked = host.asked;
    pointer(item(host, "a"), "pointerup", to);
    await committed(host, 1);
    more("before the commit");
    equal(order(host), "bcda");
    await glided(host);

    // The answer turns false between the last frame and the release: nothing is committed.
    await lift(frames, item(host, "b"), point(item(host, "a"), 0.9, 0.5));
    host.can = () => false;
    pointer(item(host, "b"), "pointerup", point(item(host, "a"), 0.9, 0.5));
    await wait(0);
    equal([order(host), host.commits.length, live(host)], ["bcda", 1, "Cancelled. This is no longer allowed here."]);
    host.can = () => true;
    await glided(host);

    // The answer turns false during the drag: the next frame ends it.
    await lift(frames, item(host, "b"), point(item(host, "a"), 0.9, 0.5));
    assert(item(host, "b").hasAttribute("data-ww-dragging"), "the drag runs");
    host.can = () => false;
    frames.fire();
    assert(!item(host, "b").hasAttribute("data-ww-dragging") && !marker(host), "the drag was cancelled");
    pointer(item(host, "b"), "pointerup", point(item(host, "a"), 0.9, 0.5));
    await wait(0);
    equal([order(host), host.commits.length], ["bcda", 1]);
});

check("gating: touch scrolling is switched off on what starts a drag, and only while can holds", async () => {
    const host = await mount<DragFixture>(
        fixture(
            `<div data-ww-drop="card" data-ww-drop-position="index">
                <div data-ww-drag="card" data-ww-key="plain">plain</div>
                <div data-ww-drag="card" data-ww-key="gripped"><b data-ww-drag-handle>::</b> gripped</div>
                <slot data-ww-drag="card"></slot>
            </div>`,
            `<p>authored</p>`,
        ),
    );
    const touch = () => [item(host, "plain"), item(host, "gripped"), part(host, "[data-ww-drag-handle]"), host.children[0], part(host, "[data-ww-drop]")].map((element) => getComputedStyle(element).touchAction);
    equal(touch(), ["none", "auto", "none", "none", "auto"], "on the item without a handle, on the handle, on the authored child; nowhere else");
    equal(item(host, "plain").tabIndex, 0, "shadow-rendered items are focusable");
    assert(!host.children[0].hasAttribute("tabindex") && !host.children[0].hasAttribute("style"), "nothing is written onto the authored child");
    host.can = () => false;
    host.drag.refresh();
    equal(touch(), ["auto", "auto", "auto", "auto", "auto"], "while can is false a reader scrolls over the items");
    host.can = () => true;
    host.setAttribute("data-mode", "changed");
    await frame();
    equal(touch()[0], "none", "can is asked again when an attribute of the host changes");
});

check("gating: a pick-up by keyboard or click ends, and says why, when can turns false", async () => {
    const host = await mount<DragFixture>(fixture(`${ROW}${row("abcd")}`));
    item(host, "a").focus();
    key(" ");
    key("ArrowRight");
    assert(item(host, "a").hasAttribute("data-ww-dragging") && marker(host), "picked up");
    host.can = () => false;
    host.setAttribute("data-mode", "read");
    await frame();
    equal([item(host, "a").hasAttribute("data-ww-dragging"), !!marker(host), live(host)], [false, false, "Cancelled. This is no longer allowed here."]);
    key("ArrowRight");
    key("Enter");
    click(item(host, "b"));
    await frame();
    equal([order(host), host.picks.length, !!root(host).querySelector("[data-ww-dragging]")], ["abcd", 1, false], "and nothing can be picked up any more");

    host.can = () => true;
    click(item(host, "b"));
    assert(item(host, "b").hasAttribute("data-ww-dragging"), "picked up by click");
    host.can = () => false;
    host.drag.refresh();
    equal([item(host, "b").hasAttribute("data-ww-dragging"), candidates(host).length], [false, 0], "a refresh asks again");
});

// ── Presses, clicks and keys ──────────────────────────────────────────────

class ClosedCard extends HTMLElement {
    /** The handle inside the closed shadow root, which no one outside can see. */
    readonly grip: HTMLElement;
    constructor() {
        super();
        const closed = this.attachShadow({ mode: "closed" });
        closed.innerHTML = `<button data-ww-drag-handle>::</button><slot></slot>`;
        this.grip = closed.querySelector("button")!;
    }
}
customElements.define("ww-closed-card", ClosedCard);

check("press: a text field or editable text keeps its press, and text selection is blocked only while a press can become a drag", async () => {
    const host = await mount<DragFixture>(
        fixture(
            `${BINS}<div class="bin" data-ww-drop="card" data-ww-drop-position="index">
                <slot data-ww-drag="card"></slot>
                <div class="card" data-ww-drag="card" data-ww-key="plain">Plain <input size="4"> <a href="#x">link</a></div>
                <div class="card" data-ww-drag="card" data-ww-key="other">Other</div>
            </div>`,
            `<p tabindex="0">Editable</p>`,
            "contenteditable",
        ),
    );
    // What the browser asks before it starts a text selection, or a drag of its own for an image or a link.
    const selects = () => window.dispatchEvent(new Event("selectstart", { cancelable: true })) && window.dispatchEvent(new Event("dragstart", { cancelable: true }));
    const guarded = () => !window.dispatchEvent(new Event("selectstart", { cancelable: true })) && !window.dispatchEvent(new Event("dragstart", { cancelable: true }));
    const other = item(host, "other");
    const field = part(host, "input");
    const text = host.children[0] as HTMLElement;
    equal([text.isContentEditable, other.isContentEditable], [true, false], "in edit mode the authored child is editable, the widget's own template is not");

    assert(selects(), "no press: text can be selected");
    pointer(other, "pointerdown", point(other));
    assert(guarded(), "a press on an item starts neither a selection nor the browser's own drag");
    pointer(other, "pointerup", point(other));
    assert(selects(), "the guard ends with the press");

    pointer(field, "pointerdown", point(field));
    assert(selects(), "a press in a text field is the field's");
    pointer(field, "pointermove", { x: point(field).x + 30, y: point(field).y + 40 });
    await frame(2);
    equal(item(host, "plain").getAnimations().length, 0, "and moving does not lift the item");
    pointer(field, "pointerup", point(field));

    pointer(text, "pointerdown", point(text));
    assert(selects(), "a press on editable text places the caret");
    pointer(text, "pointermove", { x: point(text).x + 30, y: point(text).y - 40 });
    await frame(2);
    equal(text.getAnimations().length, 0, "an editable item without a handle is not dragged by its text");
    pointer(text, "pointerup", point(text));

    click(text);
    text.focus();
    assert(key(" ") && key("Enter"), "Space and Enter on it are text input: not taken");
    click(field);
    click(part(host, "a"));
    equal(host.picks.length, 0, "no click or key on them picks anything up");

    click(item(host, "plain"), point(item(host, "plain"), 0.05, 0.5));
    equal([host.picks.length, item(host, "plain").hasAttribute("data-ww-dragging")], [1, true], "a click on the item itself does");
    key("Escape", window);
    await drag(item(host, "plain"), point(other, 0.5, 0.9));
    equal(order(host, ".bin"), "otherplain", "the widget's own items drag in edit mode as in read mode");
});

check("press: in the editor's design mode a template item is still picked up, by drag and by click", async () => {
    // WebWriter edits with document.designMode, under which every node of a shadow tree reports isContentEditable.
    const host = await mount<DragFixture>(fixture(`${ROW}${row("abc")}`));
    document.designMode = "on";
    try {
        assert(item(host, "a").isContentEditable, "design mode makes the template item report itself as editable");
        await drag(item(host, "a"), item(host, "c"));
        await committed(host, 1);
        equal(host.commits[0].key, "a", "a drag in design mode commits");
        click(item(host, "b"));
        await wait(0);
        equal(host.drag.getSnapshot().via, "click", "a click in design mode picks the item up");
        key("Escape");
        await wait(0);
    } finally {
        document.designMode = "off";
    }
});

check("handle: found in the child's light DOM, never in a closed shadow root; an editable child is moved by it", async () => {
    const host = await mount<DragFixture>(
        fixture(
            `${BINS}<div class="bin" data-ww-drop="card" data-ww-drop-position="index" data-ww-label="Cards"><slot data-ww-drag="card" data-ww-drag-handle></slot></div>`,
            `<p><button data-ww-drag-handle>::</button> one</p><p><button data-ww-drag-handle>::</button> two</p><ww-closed-card>three</ww-closed-card>`,
            "contenteditable",
        ),
    );
    const [one, two, three] = host.children as unknown as [HTMLElement, HTMLElement, ClosedCard];
    const grip = (card: HTMLElement) => card.querySelector<HTMLElement>("[data-ww-drag-handle]")!;
    await drag(one, point(two, 0.5, 0.9), { held: () => equal(one.getAnimations().length, 0, "the child's text does not start a drag") });
    await drag(grip(one), point(two, 0.5, 0.9), { held: () => equal(one.getAnimations().length, 1, "its handle does") });
    equal(light(host), [":: two:", ":: one:", "three:"]);

    await drag(three.grip, point(two, 0.5, 0.1), { held: () => equal(three.getAnimations().length, 0, "a handle in a closed shadow root is not in the event path") });
    equal(host.commits.length, 1);

    grip(two).focus();
    key(" ");
    equal(live(host), "Picked up :: two. Use the arrow keys to choose a place, Enter to drop, Escape to cancel.", "the keyboard picks an editable child up from its handle");
    key("ArrowDown");
    key("ArrowDown");
    equal(live(host), "Cards, position 3 of 3");
    key("Enter");
    await committed(host, 2);
    equal(light(host), [":: one:", "three:", ":: two:"]);
    assert(deepActive() === grip(two), "the handle kept the focus through the move");
});

check("click: an ordinary click stays ordinary; only a click where a drag would start picks up", async () => {
    const host = await mount<DragFixture>(
        fixture(
            `${ROW}<style>.chip { width: auto; }</style><div class="row" data-ww-drop="chip" data-ww-drop-position="index" data-ww-label="Row">
                <button class="chip" data-ww-drag="chip" data-ww-key="own">own click</button>
                <div class="chip" data-ww-drag="chip" data-ww-key="nested">nested <button>inner</button></div>
                <div class="chip" data-ww-drag="chip" data-ww-key="gripped"><b data-ww-drag-handle>::</b> gripped</div>
                <div class="chip" data-ww-drag="chip" data-ww-key="plain">plain</div>
            </div>`,
        ),
    );
    const picked = () => root(host).querySelector<HTMLElement>("[data-ww-dragging]")?.dataset.wwKey ?? null;
    let clicks = 0;
    item(host, "own").addEventListener("click", (event) => {
        clicks++;
        event.preventDefault();
    });
    click(item(host, "own"));
    equal([clicks, picked()], [1, null], "a click that the widget's handler cancelled is the widget's");
    click(part(host, "[data-ww-key=nested] button"));
    equal(picked(), null, "a click on a button inside an item is the button's");
    click(item(host, "gripped"), point(item(host, "gripped"), 0.9, 0.5));
    equal(picked(), null, "an item with a handle is not picked up by its body");
    click(part(host, "[data-ww-drag-handle]"));
    equal([picked(), host.drag.getSnapshot().via], ["gripped", "click"], "but by its handle");
    click(item(host, "nested"), point(item(host, "nested"), 0.1, 0.5));
    await committed(host, 1);
    equal([order(host), picked(), live(host)], ["owngrippednestedplain", null, "Dropped :: gripped on Row, position 2 of 4."], "a click on another item in a candidate target drops in front of or behind it");
    await glided(host);

    // The click that the browser sends after a drag is not a pick-up.
    const plain = item(host, "plain");
    const to = point(item(host, "own"), 0.1, 0.5);
    await hold(plain, to);
    pointer(plain, "pointerup", to);
    plain.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, cancelable: true, detail: 1 }));
    await committed(host, 2);
    equal([order(host), picked()], ["plainowngrippednested", null]);
    await glided(host);

    // The focus that a press on a focusable target moves does not put the item back; focus that leaves otherwise does.
    plain.focus();
    click(plain);
    equal(picked(), "plain");
    const nested = item(host, "nested");
    pointer(nested, "pointerdown", point(nested, 0.9, 0.5));
    nested.focus();
    equal(picked(), "plain", "still picked up while the press lasts");
    pointer(nested, "pointerup", point(nested, 0.9, 0.5));
    nested.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, cancelable: true, detail: 1, clientX: point(nested, 0.9, 0.5).x, clientY: point(nested, 0.9, 0.5).y }));
    await committed(host, 3);
    equal(order(host), "owngrippednestedplain");
    assert(deepActive() === item(host, "plain"), "focus is back on the dropped item, which had it");
    await glided(host);

    click(item(host, "plain"));
    key("ArrowLeft");
    assert(marker(host), "a pick-up by click goes on with the keyboard while the item has the focus");
    item(host, "own").focus();
    equal([picked(), live(host)], [null, "Cancelled."], "focus that moves elsewhere without a press puts the item back");

    // And a pick-up by keyboard is finished by a click.
    item(host, "plain").focus();
    key("Enter");
    click(item(host, "gripped"), point(item(host, "gripped"), 0.1, 0.5));
    await committed(host, 4);
    equal(order(host), "ownplaingrippednested");
});

check("keyboard: the arrow keys step through the targets that accept the kind and are not full", async () => {
    const host = await mount<DragFixture>(
        fixture(
            `${BINS}
            <div class="bin" id="pool" data-ww-drop="card" data-ww-label="Pool"><div class="card" data-ww-drag="card" data-ww-key="a">a</div><div class="card" data-ww-drag="card" data-ww-key="b">b</div></div>
            <div class="bin" id="one" data-ww-drop="card" data-ww-drop-max="1" data-ww-label="Slot one"><div class="card" data-ww-drag="card" data-ww-key="c">c</div></div>
            <div class="bin" id="two" data-ww-drop="card" data-ww-drop-max="1" data-ww-label="Slot two"></div>
            <div class="bin" id="notes" data-ww-drop="note" data-ww-label="Notes"></div>
            <div class="bin" id="three" data-ww-drop="card note" data-ww-drop-max="1" data-ww-drop-full="swap" data-ww-label="Slot three"><div class="card" data-ww-drag="card" data-ww-key="d">d</div></div>`,
        ),
    );
    await hold(item(host, "a"), point(part(host, "#two")));
    equal(candidates(host), ["two", "three"], "not its own target, not the full one, not the one for another kind");
    assert(part(host, "#two").hasAttribute("data-ww-drop-over"), "the target under the item is marked");
    await moveTo(item(host, "a"), point(part(host, "#one")));
    assert(!root(host).querySelector("[data-ww-drop-over]"), "a full target is not");
    await moveTo(item(host, "a"), point(part(host, "#two")));
    pointer(item(host, "a"), "pointercancel", point(part(host, "#two")));
    await glided(host);
    equal([host.commits.length, candidates(host), item(host, "a").parentElement!.id], [0, [], "pool"], "a pointercancel over a target changes nothing");

    item(host, "a").focus();
    key(" ");
    key("ArrowDown");
    equal(live(host), "Slot two");
    key("ArrowDown");
    equal(live(host), "Slot three");
    assert(part(host, "#three").hasAttribute("data-ww-drop-over") && !marker(host), "the target is marked; a target without positions has no marker");
    key("ArrowDown");
    equal(live(host), "Slot two", "the stepping wraps around");
    key("ArrowUp");
    key("Enter");
    await committed(host, 1);
    const [detail] = host.commits;
    assert(detail.target === part(host, "#three") && detail.displaced === item(host, "d") && detail.source === part(host, "#pool"), "a full target with swap hands its occupant back");
    equal([detail.index, detail.before, detail.x, detail.slot, live(host)], [null, null, null, null, "Dropped a on Slot three."]);
    equal(Object.keys(detail).sort(), ["before", "displaced", "effect", "index", "item", "key", "kind", "slot", "source", "target", "x", "y"], "the whole detail");

    item(host, "c").focus();
    key(" ");
    key("ArrowDown");
    equal(live(host), "Pool", "an item from elsewhere may go to the pool, which has no capacity");
    key("Escape");
    equal([live(host), host.commits.length], ["Cancelled.", 1]);
});

check("focus: it returns to the dropped item at once, while the items still glide", async () => {
    const host = await mount<DragFixture>(fixture(`${ROW}${row("abcd")}`));
    host.duration = 60000;
    item(host, "a").focus();
    key(" ");
    key("ArrowRight");
    key("ArrowRight");
    key("Enter");
    await committed(host, 1);
    await until(() => running(host) > 0, "the settle animation runs");
    equal(order(host), "bcad");
    assert(deepActive() === item(host, "a"), "the item has the focus before the animation ends");
});

check("commit: a cancelled commit leaves an empty transaction and puts the item back", async () => {
    const host = await mount<DragFixture>(fixture(`${ROW}${row("abcd")}`));
    host.addEventListener("ww-dragcommit", (event) => event.preventDefault(), { capture: true });
    const log = events("ww-transactionstart", "ww-dragcommit", "ww-transactionend");
    const changes = mutations(part(host, ".row"));
    await drag(item(host, "a"), point(item(host, "d"), 0.9, 0.5));
    await glided(host);
    equal(log.stop(), ["ww-transactionstart", "ww-dragcommit", "ww-transactionend"], "the start has to come before the event that can be cancelled");
    equal([order(host), changes.stop().filter((record) => record.type === "childList").length, running(host)], ["abcd", 0, 0]);
    assert(!root(host).querySelector("[data-ww-dragging], [data-ww-drop-candidate], [data-ww-drag-overlay]"), "nothing is left");
});

// ── Rendering, transforms, scrolling ──────────────────────────────────────

check("render: when the shadow tree is rendered anew, a keyed item is found again and the interaction goes on", async () => {
    const host = await mount<DragFixture>(fixture(`${ROW}${row("abcd")}`));
    const to = point(item(host, "c"), 0.9, 0.5);
    await hold(item(host, "a"), to);
    const old = item(host, "a");
    host.rerender();
    await frame(2);
    const fresh = item(host, "a");
    assert(fresh !== old && !old.isConnected, "every node is another one");
    equal([fresh.hasAttribute("data-ww-dragging"), fresh.getAnimations().length, old.getAnimations().length, host.drag.getSnapshot().item === fresh], [true, 1, 0, true], "the drag holds the new element");
    assert(near(point(fresh).x, to.x) && near(point(fresh).y, to.y), "which is under the pointer");
    assert(marker(host) && part(host, ".row").hasAttribute("data-ww-drop-candidate"), "marker and marks are back");
    equal(host.picks.length, 2, "the candidates were read again, with ww-dragpick");
    pointer(document.body, "pointerup", to);
    await committed(host, 1);
    assert(host.commits[0].item === fresh && host.commits[0].target === part(host, ".row"), "the commit names the live elements");
    equal(order(host), "bcad");
    await glided(host);

    item(host, "b").focus();
    key(" ");
    key("ArrowRight");
    host.rerender();
    assert(deepActive() === item(host, "b") && item(host, "b").hasAttribute("data-ww-dragging"), "a keyboard pick-up keeps the focus on the new element");
    assert(marker(host), "and the place that was chosen");
    key("ArrowRight");
    equal(live(host), "Row, position 3 of 4", "the live region is back too");
    key("Enter");
    await committed(host, 2);
    equal(order(host), "cabd");
    await glided(host);

    // Without a key there is nothing to find the item by: the drag ends.
    item(host, "d").removeAttribute("data-ww-key");
    const nameless = part(host, ".chip:last-child");
    await hold(nameless, point(item(host, "c"), 0.1, 0.5));
    host.rerender();
    await frame(2);
    assert(!root(host).querySelector("[data-ww-dragging], [data-ww-drop-candidate], [data-ww-drag-overlay]"), "nothing of the drag is left");
    pointer(document.body, "pointerup", point(item(host, "c"), 0.1, 0.5));
    await wait(0);
    equal(host.commits.length, 2);
});

check("transform: marker and lifted item are in place under a zoomed and transformed ancestor", async () => {
    const outer = await mount(`<div style="margin: 20px; zoom: 1.25"><div style="width: 330px; transform: translate(30px, 20px) scale(1.2); transform-origin: 0 0">${fixture(`${ROW}${row("abcd")}`)}</div></div>`);
    const host = outer.querySelector<DragFixture>("ww-drag-fixture")!;
    const to = point(item(host, "c"), 0.9, 0.5);
    await hold(item(host, "a"), to);
    const [c, d] = [item(host, "c").getBoundingClientRect(), item(host, "d").getBoundingClientRect()];
    const box = marker(host)!;
    assert(root(host).querySelector("[data-ww-drag-overlay]")!.matches(":popover-open"), "the overlay is in the top layer, which no ancestor displaces");
    assert(near(box.left + box.width / 2, (c.right + d.left) / 2) && near(box.top, c.top) && near(box.height, c.height), `the marker is in the gap between c and d: ${box.left}, ${box.top}`);
    assert(near(box.width, 2, 0.2), "and two pixels wide on the screen, whatever the zoom");
    assert(near(point(item(host, "a")).x, to.x) && near(point(item(host, "a")).y, to.y), "the lifted item is under the pointer");
    await moveTo(item(host, "a"), { x: to.x + 31, y: to.y + 17 });
    assert(near(point(item(host, "a")).x, to.x + 31) && near(point(item(host, "a")).y, to.y + 17), "and follows it one to one");
    pointer(item(host, "a"), "pointerup", to);
    await committed(host, 1);
    equal(order(host), "bcad");
});

check("scroll: a scrollable target scrolls while the item is held at its edge, as far as it reached before the drag", async () => {
    const lines = Array.from({ length: 12 }, (_, index) => `<div class="line" data-ww-drag="line" data-ww-key="r${index}">r${index}</div>`).join("");
    const host = await mount<DragFixture>(
        fixture(`<style>.list { width: 200px; height: 150px; overflow: auto; } .line { box-sizing: border-box; height: 30px; border: 1px solid silver; }</style><div class="list" data-ww-drop="line" data-ww-drop-position="index">${lines}</div>`),
    );
    const list = part(host, ".list");
    const max = list.scrollHeight - list.clientHeight;
    equal(max, 210);
    const frames = fakeFrames();
    const first = item(host, "r0");
    const box = list.getBoundingClientRect();
    const bottom = { x: point(first).x, y: box.bottom - 5 };
    await lift(frames, first, bottom);
    const before = list.scrollTop;
    frames.fire();
    equal(list.scrollTop, before + 12, "one step per frame while the pointer rests at the edge");
    assert(near(point(first).y, bottom.y), "the item stays under the pointer while its container scrolls beneath it");
    for (let i = 0; i < 30; i++) frames.fire();
    assert(list.scrollHeight - list.clientHeight > max, "the lifted item has extended the list");
    equal(list.scrollTop, max, "but the scrolling ends where the list ended");
    assert(near(point(first).y, bottom.y), "and the item is still under the pointer");

    pointer(first, "pointermove", { x: bottom.x, y: box.top + 5 });
    frames.fire();
    frames.fire();
    frames.fire();
    assert(list.scrollTop < max && list.scrollTop >= max - 36, "at the upper edge it scrolls back");
    pointer(first, "pointermove", { x: bottom.x, y: box.top + 75 });
    frames.fire();
    const rest = list.scrollTop;
    frames.fire();
    equal(list.scrollTop, rest, "away from the edges nothing scrolls");

    for (let i = 0; i < 30; i++) {
        pointer(first, "pointermove", bottom);
        frames.fire();
    }
    pointer(first, "pointerup", bottom);
    await committed(host, 1);
    equal([host.commits[0].index, order(host, ".list").endsWith("r10r11r0")], [11, true], "the release lands at the place that scrolled into view");
});

check("scroll: a row scrolls sideways at its edges, from the right in a right-to-left row", async () => {
    const many = "abcdefghij";
    const scroller = `<style>.row { width: 240px; overflow-x: auto; }</style>`;
    const frames = fakeFrames();
    for (const rtl of [false, true]) {
        const host = await mount<DragFixture>(fixture(`${ROW}${scroller}${row(many, rtl ? `dir="rtl"` : "")}`));
        const list = part(host, ".row");
        const max = list.scrollWidth - list.clientWidth;
        equal([max, list.scrollLeft], [550, 0]);
        const first = item(host, "a");
        const box = list.getBoundingClientRect();
        // The far edge: the right one, or the left one in a right-to-left row.
        const far = { x: rtl ? box.left + 5 : box.right - 5, y: point(first).y };
        await lift(frames, first, far);
        const before = list.scrollLeft;
        frames.fire();
        equal(list.scrollLeft, before + (rtl ? -12 : 12), "one step per frame towards the edge the pointer rests at");
        assert(near(point(first).x, far.x), "the item stays under the pointer");
        for (let i = 0; i < 60; i++) frames.fire();
        equal(list.scrollLeft, rtl ? -max : max, "as far as the row reached before the drag");
        equal(list.scrollTop, 0, "and never across");
        pointer(first, "pointerup", far);
        await committed(host, 1);
        equal([order(host), host.commits[0].index], ["bcdefghija", 9], "the release lands at the end that scrolled into view");
        host.remove();
    }
});

check("scroll: the page scrolls while the item is held at the edge of the window", async () => {
    const host = await mount<DragFixture>(`${fixture(`${ROW}${row("abcd")}`)}<div style="height: 3000px"></div>`);
    const page = document.scrollingElement!;
    const frames = fakeFrames();
    try {
        equal(page.scrollTop, 0);
        const a = item(host, "a");
        const low = { x: point(a).x, y: window.innerHeight - 5 };
        await lift(frames, a, low);
        for (let i = 0; i < 5; i++) frames.fire();
        assert(page.scrollTop >= 60, `the page scrolled: ${page.scrollTop}`);
        assert(near(point(a).x, low.x) && near(point(a).y, low.y), "the item stays under the pointer while the page scrolls beneath it");
        const high = { x: low.x, y: 5 };
        pointer(a, "pointermove", high);
        for (let i = 0; i < 20; i++) frames.fire();
        equal(page.scrollTop, 0, "and back at the upper edge, down to the start");
        assert(near(point(a).y, high.y), "with the item under the pointer");
        key("Escape", window);
        await wait(0);
        equal([a.getAnimations().filter((animation) => animation.playState === "paused").length, host.commits.length], [0, 0]);
    } finally {
        page.scrollTop = 0;
    }
});

check("point: without a grid a point is exact to a hundredth and stays on the surface; a canvas is a target; an axis lock holds", async () => {
    const host = await mount<DragFixture>(
        fixture(
            `<style>
                .board { position: relative; width: 300px; height: 200px; border: 3px solid gray; }
                .pin { position: absolute; width: 30px; height: 20px; background: silver; }
                canvas { display: block; margin-top: 10px; border: 1px solid gray; }
            </style>
            <div class="board" data-ww-drop="pin" data-ww-drop-position="point" data-ww-label="Board">
                <div class="pin" data-ww-drag="pin" data-ww-key="free" style="left:20px;top:30px"></div>
                <div class="pin" data-ww-drag="pin" data-ww-key="lift" data-ww-drag-axis="y" style="left:100px;top:30px"></div>
            </div>
            <canvas width="300" height="100" data-ww-drop="pin" data-ww-drop-position="point" data-ww-label="Canvas"></canvas>`,
        ),
    );
    const board = part(host, ".board");
    const at = (count: number) => [host.commits[count].x, host.commits[count].y, host.commits[count].target.dataset.wwLabel];
    let start = point(item(host, "free"));
    await drag(item(host, "free"), { x: start.x + 33.4, y: start.y + 21.7 });
    equal(at(0), [53.4, 51.7, "Board"], "the point is the pointer's, in the board's own pixels");
    equal([item(host, "free").offsetLeft, host.commits[0].index, host.commits[0].before], [53, null, null]);
    await glided(host);

    const box = board.getBoundingClientRect();
    await drag(item(host, "free"), { x: box.left + 8, y: box.bottom - 6 });
    equal(at(1), [0, 180, "Board"], "an item dropped across the edge is kept on the surface");
    await glided(host);

    start = point(item(host, "lift"));
    await drag(item(host, "lift"), { x: start.x + 40, y: start.y + 25 }, {
        held: () => assert(near(point(item(host, "lift")).x, start.x) && near(point(item(host, "lift")).y, start.y + 25), "locked to y, the item only follows up and down"),
    });
    equal(at(2), [100, 55, "Board"]);
    await glided(host);

    item(host, "lift").focus();
    key(" ");
    key("ArrowRight");
    key("ArrowDown");
    equal(live(host), "Board, 100 from the left, 65 from the top", "without a grid an arrow key moves ten pixels");
    key("ArrowDown", undefined, { shiftKey: true });
    equal(live(host), "Board, 100 from the left, 66 from the top", "and one pixel with Shift");
    assert(near(item(host, "lift").getBoundingClientRect().top - box.top - 3, 66), "the item is lifted to the point");
    key("Enter");
    await committed(host, 4);
    equal(at(3), [100, 66, "Board"]);
    await glided(host);

    const canvas = part(host, "canvas").getBoundingClientRect();
    await drag(item(host, "free"), { x: canvas.left + 1 + 100, y: canvas.top + 1 + 40 }, {
        held: () => equal(candidates(host).length, 2, "both surfaces are candidates"),
    });
    equal(at(4), [85, 30, "Canvas"], "a canvas element resolves a point like any other target");
});

// ── Text ──────────────────────────────────────────────────────────────────

check("messages: the German catalog follows the widget's language; the messages option wins in every language", async () => {
    const outer = await mount(`<div lang="de-AT">${fixture(`${ROW}${row("abcd", `data-ww-label="Reihe"`)}`)}</div>`);
    const host = outer.querySelector<DragFixture>("ww-drag-fixture")!;
    item(host, "a").focus();
    key(" ");
    equal(live(host), "a aufgenommen. Mit den Pfeiltasten einen Platz wählen, mit Enter ablegen, mit Escape abbrechen.");
    key("ArrowRight");
    key("ArrowRight");
    equal(live(host), "Reihe, Platz 3 von 4");
    key("Enter");
    await committed(host, 1);
    equal(live(host), "a abgelegt: Reihe, Platz 3 von 4.");
    await glided(host);
    click(item(host, "b"));
    equal(live(host), "b ausgewählt. Auf das Ziel klicken, oder zum Abbrechen noch einmal auf das Element.");
    key("Escape", window);
    equal(live(host), "Abgebrochen.");
    click(item(host, "b"));
    host.can = () => false;
    host.drag.refresh();
    equal(live(host), "Abgebrochen. Das ist hier nicht mehr erlaubt.");
    host.can = () => true;

    host.messages = { picked: (name) => `>> ${name}` };
    item(host, "b").focus();
    key(" ");
    equal(live(host), ">> b", "an entry of the option replaces the catalog's");
    key("Escape");
    equal(live(host), "Abgebrochen.", "the other entries stay German");

    outer.lang = "fr";
    host.messages = undefined;
    key(" ");
    equal(live(host), "Picked up b. Use the arrow keys to choose a place, Enter to drop, Escape to cancel.", "without a catalog for the language the text is English");
    host.messages = () => ({ cancelled: () => "Laissé." });
    key("Escape");
    equal(live(host), "Laissé.", "a function is asked on every read");
});
