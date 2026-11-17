import { assert, check, deepActive, equal, fakeFrames, frame, key, listeners, mount, mutations, point, settled, until } from "../../test/harness";
import { html, LitElement } from "lit";
import { HelpCore, layoutLabels, type Box, type HelpOptions, type LabelItem, type LabelPlacement, type Side } from "@webwriter/widget/help";
import { Help } from "@webwriter/lit/help";
import { $, $$, diagram } from "./helpers";
import type { ToolPanel } from "./tool-panel";

// ── Helpers ───────────────────────────────────────────────────────────────

type Rect = { left: number; top: number; right: number; bottom: number };
const overlap = (a: Rect, b: Rect) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
const within = (a: Rect, b: Rect) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
/** Next to each other: aligned on one axis and at most the module's gap apart on the other. */
function beside(a: Rect, b: Rect) {
    const dx = Math.max(b.left - a.right, a.left - b.right, 0);
    const dy = Math.max(b.top - a.bottom, a.top - b.bottom, 0);
    return (dx === 0 || dy === 0) && dx + dy <= 7.5;
}

const toggle = (view: Element) => $(view, "[data-ww-help-toggle]");
const labels = (view: Element) => $$(view, "[data-ww-help-label]");
/** The marked elements a reader sees: rendered, visible and not cut off by the widget's edge. */
const marked = (view: Element) => $$(view, "[data-ww-help]").filter((element) => element.checkVisibility() && overlap(element.getBoundingClientRect(), view.getBoundingClientRect()));
const labelOf = (view: Element, target: Element) =>
    view.shadowRoot!.getElementById((target.getAttribute("aria-describedby") ?? "").split(" ").find((token) => token.startsWith("ww-help-")) ?? "");

type Segment = { x1: number; y1: number; x2: number; y2: number };
/** A straight piece of a connector as a thin box, for crossing tests. */
const thin = (s: Segment): Rect => ({ left: Math.min(s.x1, s.x2) - 0.75, right: Math.max(s.x1, s.x2) + 0.75, top: Math.min(s.y1, s.y2) - 0.75, bottom: Math.max(s.y1, s.y2) + 0.75 });
const pieces = (points: { x: number; y: number }[]): Segment[] => points.slice(1).map((to, i) => ({ x1: points[i].x, y1: points[i].y, x2: to.x, y2: to.y }));
const rightAngled = (parts: Segment[]) => parts.every((s) => Math.abs(s.x1 - s.x2) < 0.01 || Math.abs(s.y1 - s.y2) < 0.01);

/** The straight pieces of a rendered connector, from the element to the label, in client coordinates. */
function drawn(view: Element, line: SVGPathElement): Segment[] {
    const numbers = line.getAttribute("d")!.match(/-?[0-9.]+/g)!.map(Number);
    const origin = $(view, "[data-ww-help-backdrop]").getBoundingClientRect();
    return pieces(numbers.flatMap((x, i) => (i % 2 ? [] : [{ x: x + origin.left, y: numbers[i + 1] + origin.top }])));
}
const lineOf = (view: Element, target: Element) => {
    const path = $<SVGPathElement>(view, `[data-ww-help-for="${labelOf(view, target)!.id}"]`);
    return path ? drawn(view, path) : [];
};

/** Everything the label form promises, measured on the rendered overlay. Returns how many labels have a connector. */
function checkLabels(view: HTMLElement): number {
    const bounds = view.getBoundingClientRect();
    const targets = marked(view);
    equal(labels(view).map((label) => label.textContent).sort(), targets.map((target) => target.dataset.wwHelp!).sort(), "one label per visible marked element");
    equal($$(view, "[data-ww-help-list], [data-ww-help-marker]").length, 0, "the label form shows no list and no markers");
    const pairs = targets.map((target) => ({ target, label: labelOf(view, target)!, t: target.getBoundingClientRect(), l: labelOf(view, target)!.getBoundingClientRect(), parts: lineOf(view, target) }));
    let connected = 0;
    for (const { target, label, t, l, parts } of pairs) {
        const name = `"${label.textContent}"`;
        equal(label.textContent, target.dataset.wwHelp, "the description of an element is its own label");
        assert(within(l, bounds), `${name} is outside the widget`);
        const region = within(l, t);
        equal(parts.length > 0, !region && !beside(l, t), `${name}: a connector exactly when the label is not next to or inside its element`);
        if (parts.length) {
            connected++;
            const [first, last] = [parts[0], parts.at(-1)!];
            const touches = (r: Rect, x: number, y: number) => x >= r.left - 1.5 && x <= r.right + 1.5 && y >= r.top - 1.5 && y <= r.bottom + 1.5;
            assert(touches(t, first.x1, first.y1) && touches(l, last.x2, last.y2), `${name}: the connector joins the element and its label`);
            assert(rightAngled(parts), `${name}: the connector is straight or right-angled`);
            assert(parts.every((part) => within(thin(part), { left: bounds.left - 1, top: bounds.top - 1, right: bounds.right + 1, bottom: bounds.bottom + 1 })), `${name}: the connector leaves the widget`);
        }
        for (const other of pairs) {
            if (other.label === label) continue;
            const theirs = `"${other.label.textContent}"`;
            assert(!overlap(l, other.l), `${name} covers ${theirs}`);
            // Regions, and elements around or inside this label's own element, may lie under a label.
            const exempt = within(other.l, other.t) || within(t, other.t) || within(other.t, t);
            assert(exempt || !overlap(l, other.t), `${name} covers the element of ${theirs}`);
            for (const part of parts) {
                assert(!overlap(thin(part), other.l), `the connector of ${name} runs through the label ${theirs}`);
                assert(exempt || !overlap(thin(part), other.t), `the connector of ${name} runs through the element of ${theirs}`);
                assert(!other.parts.some((crossed) => overlap(thin(part), thin(crossed))), `the connectors of ${name} and ${theirs} cross`);
            }
        }
    }
    return connected;
}

/** The example with the layouts Help has to find, opened. */
async function panel(layout: ToolPanel["layout"], width: number, height = 300, anchor = true, attributes = "") {
    const view = await mount<ToolPanel>(`<ww-tool-panel layout="${layout}" ${attributes} style="width: ${width}px; height: ${height}px"></ww-tool-panel>`);
    view.help.core.anchor = anchor;
    view.help.toggle(true);
    await settled(view);
    return view;
}

/** A plain element on the core alone. The template comes from the page; `HelpProbe.options` is taken by the next instance. */
class HelpProbe extends HTMLElement {
    static options: HelpOptions = {};
    core!: HelpCore;
    connectedCallback() {
        this.core ??= new HelpCore(this, HelpProbe.options);
        HelpProbe.options = {};
        this.core.connect();
        this.core.refresh();
    }
    disconnectedCallback() {
        this.core.disconnect();
    }
}
customElements.define("ww-help-probe", HelpProbe);

async function probe(template: string, options: HelpOptions = {}, attributes = "") {
    HelpProbe.options = options;
    const host = await mount<HelpProbe>(`<ww-help-probe ${attributes}><template shadowrootmode="open">${template}</template></ww-help-probe>`);
    await frame(2);
    return host;
}

// ── The overlay ───────────────────────────────────────────────────────────

for (const anchor of [true, false]) {
    const mode = anchor ? "anchor positioning" : "measured";

    check(`help (${mode}): the toggle opens labels for the visible controls only`, async () => {
        const { view } = await diagram();
        view.help.core.anchor = anchor;
        equal(toggle(view).getAttribute("aria-pressed"), "false");
        toggle(view).focus();
        toggle(view).click();
        await settled(view);
        equal([view.help.open, view.help.form, toggle(view).getAttribute("aria-pressed")], [true, "labels", "true"]);
        equal(labels(view).map((label) => label.textContent), ["Add a node in the middle of the view", "Remove the newest node", "Help", "Scroll to pan. Ctrl + scroll to zoom", "Zoom and fit"], "none for the author's button, which a reader does not see");
        const connected = checkLabels(view);
        assert(connected >= 2, "the two crowded toolbar labels moved away and got connectors");
        assert(connected < labels(view).length, "labels with room stay next to their element, without a connector");
        const stage = $(view, ".stage");
        assert(within(labelOf(view, stage)!.getBoundingClientRect(), stage.getBoundingClientRect()), "the label of a large element is inside it");
        equal($$(view, `[data-ww-help-for="${labelOf(view, stage)!.id}"]`).length, 0, "without a line");
        assert(deepActive() === toggle(view), "focus is not moved or trapped");
        assert(view.shadowRoot!.lastElementChild === $(view, "[data-ww-help-layer]"), "the overlay is one layer at the end of the shadow root");
        equal(getComputedStyle(view).position, "relative", "the host is the positioning context");

        // In edit mode the author's button is rendered, so it gets a label without any condition in the overlay.
        view.setAttribute("contenteditable", "");
        await settled(view);
        equal(labels(view).length, 6);
        assert(labels(view).some((label) => label.textContent === "Let learners pan and zoom"));
        checkLabels(view);
    });

    check(`help (${mode}): the layout holds at other sizes and follows a resize`, async () => {
        const { view } = await diagram(`allow-panning contenteditable style="width: 600px"`);
        view.help.core.anchor = anchor;
        view.help.toggle();
        await settled(view);
        const helpLabel = () => labelOf(view, toggle(view))!.getBoundingClientRect().left;
        const before = helpLabel();
        for (const width of [520, 440, 380]) {
            view.style.width = `${width}px`;
            await until(() => helpLabel() < before - (600 - width) + 20, `no new layout at ${width}px`);
            await frame(2);
            equal(view.help.form, "labels", `${width}px`);
            checkLabels(view);
        }
        view.style.height = "520px";
        await frame(3);
        checkLabels(view);
    });

    check(`help (${mode}): a column of controls gets its labels beside it, in the same order`, async () => {
        for (const [width, height] of [[300, 300], [220, 300], [260, 230]]) {
            const view = await panel("column", width, height, anchor);
            equal(view.help.form, "labels", `${width} × ${height}`);
            checkLabels(view);
            const tools = $$(view, ".shapes button");
            const boxes = tools.map((tool) => labelOf(view, tool)!.getBoundingClientRect());
            const column = $(view, ".shapes").getBoundingClientRect();
            assert(boxes.every((box) => box.left >= tools[0].getBoundingClientRect().right && box.left < column.right + 60), `${width}px: every label is right beside the column`);
            equal(boxes.map((box) => box.top), boxes.map((box) => box.top).sort((a, b) => a - b), `${width}px: the labels keep the order of the controls`);
            const canvas = $(view, ".canvas");
            assert(within(labelOf(view, canvas)!.getBoundingClientRect(), canvas.getBoundingClientRect()), `${width}px: the canvas is a region, and its label is inside it`);
            view.remove();
        }
    });

    check(`help (${mode}): controls smaller than their labels get connectors that step out sideways`, async () => {
        const swatches = Array.from({ length: 8 }, (_, i) => `<button data-ww-help="Colour ${i + 1}" aria-label="Colour ${i + 1}"></button>`).join("");
        const host = await probe(
            `<style>
                :host { display: block; position: relative; width: 260px; height: 240px; background: white; }
                .palette { position: absolute; left: 6px; top: 34px; display: flex; flex-direction: column; gap: 2px; }
                .palette button { width: 16px; height: 12px; padding: 0; border: 1px solid #555; }
                .toggle { position: absolute; right: 6px; top: 4px; }
            </style>
            <div class="palette">${swatches}</div><button class="toggle" data-ww-help-toggle>?</button>`,
            { anchor },
        );
        host.core.toggle(true);
        equal(host.core.getSnapshot().form, "labels");
        const connected = checkLabels(host);
        assert(connected >= 5, "labels that do not fit beside their control are joined to it");
        const tools = $$(host, ".palette button");
        const tops = tools.map((tool) => labelOf(host, tool)!.getBoundingClientRect().top);
        equal(tops, [...tops].sort((a, b) => a - b), "the stack keeps the order of the controls");
        const stepped = tools.map((tool) => lineOf(host, tool)).filter((parts) => parts.length === 3);
        assert(stepped.length >= 4, "connectors that go around the corner");
        for (const parts of stepped) {
            assert(Math.abs(parts[0].y1 - parts[0].y2) < 0.01 && parts[0].x2 > parts[0].x1, "leave the control sideways");
            assert(Math.abs(parts[2].y1 - parts[2].y2) < 0.01, "and reach the label sideways");
        }
        equal(new Set(stepped.map((parts) => Math.round(parts[1].x1))).size >= Math.ceil(stepped.length / 2), true, "each in a lane of its own on its way up or down");
    });

    check(`help (${mode}): a toolbar as wide as the widget fans its labels out to both sides`, async () => {
        for (const width of [460, 400, 330, 320]) {
            const view = await panel("row", width, 300, anchor);
            equal(view.help.form, "labels", `${width}px`);
            const connected = checkLabels(view);
            assert(connected >= 8, `${width}px: every label of the toolbar is joined to its button`);
            const tools = $$(view, ".bar button");
            const boxes = tools.map((tool) => labelOf(view, tool)!.getBoundingClientRect());
            assert(boxes.every((box) => box.top > tools[0].getBoundingClientRect().bottom), `${width}px: the labels are under the row`);
            equal(new Set(boxes.map((box) => Math.round(box.top))).size >= 4, true, `${width}px: on lines of their own`);
            if (width === 460 || width === 330) {
                // The outer buttons take the nearest lines; their labels reach outwards from where the connector comes down.
                const drop = (tool: Element) => lineOf(view, tool).at(-1)!.x2;
                const [first, last] = [0, tools.length - 1];
                assert(boxes[first].right - drop(tools[first]) < drop(tools[first]) - boxes[first].left, `${width}px: the first label reaches left`);
                assert(drop(tools[last]) - boxes[last].left < boxes[last].right - drop(tools[last]), `${width}px: the last label reaches right`);
                assert(boxes[first].top < boxes[first + 2].top && boxes[last].top < boxes[last - 2].top, `${width}px: the middle of the row has the longest connectors`);
                assert(tools.some((tool) => lineOf(view, tool).length === 3), `${width}px: connectors that have to make way run sideways under the row`);
            }
            view.remove();
        }
    });

    check(`help (${mode}): two groups in one row share the room without crossing`, async () => {
        for (const width of [420, 300, 240, 200]) {
            const view = await panel("groups", width, 300, anchor);
            equal(view.help.form, "labels", `${width}px`);
            const connected = checkLabels(view);
            assert(connected >= 4, `${width}px: both groups got staircases`);
            view.remove();
        }
    });

    check(`help (${mode}): a toolbar above a column of tools leaves the column its room`, async () => {
        for (const [width, height] of [[460, 300], [520, 340], [640, 400]]) {
            const view = await panel("both", width, height, anchor);
            equal(view.help.form, "labels", `${width} × ${height}`);
            checkLabels(view);
            const column = $$(view, ".shapes button").map((tool) => labelOf(view, tool)!.getBoundingClientRect());
            const reach = Math.max(...column.map((box) => box.right));
            const bar = $$(view, ".bar button").map((tool) => labelOf(view, tool)!.getBoundingClientRect());
            assert(bar.every((box) => box.left >= reach || box.top > Math.max(...column.map((each) => each.bottom))), `${width}px: the toolbar's labels keep out of the column's`);
            view.remove();
        }
    });

    check(`help (${mode}): labels follow a control that moves without a resize or a render`, async () => {
        const view = await panel("groups", 420, 300, anchor);
        const first = $(view, ".bar button");
        const left = () => labelOf(view, first)!.getBoundingClientRect().left;
        const [before, label] = [left(), labelOf(view, first)];
        const changes = mutations(view);
        // The widget's own style moves the toolbar: no attribute, no render and no new size.
        const moved = new CSSStyleSheet();
        moved.replaceSync(".bar { padding-left: 70px; }");
        view.shadowRoot!.adoptedStyleSheets = [...view.shadowRoot!.adoptedStyleSheets, moved];
        await until(() => left() > before + 40, "the label stayed behind");
        assert(labelOf(view, first) !== label, "the overlay was laid out again");
        equal(changes.stop().length, 0, "nothing was written to the host for it");
        checkLabels(view);
        view.shadowRoot!.adoptedStyleSheets = view.shadowRoot!.adoptedStyleSheets.filter((sheet) => sheet !== moved);
        await until(() => Math.abs(left() - before) < 1, "the label did not come back");
        checkLabels(view);
    });
}

check("help: the look at the elements runs once per frame, only while the overlay is open, and lays out only after a move", async () => {
    const view = await mount<ToolPanel>(`<ww-tool-panel layout="groups" style="width: 420px"></ww-tool-panel>`);
    const frames = fakeFrames();
    await frame(2);
    equal(frames.pending, 0, "closed: nothing is scheduled");
    view.help.toggle(true);
    equal(frames.pending, 1, "open: one callback per frame");
    const before = labels(view);
    frames.fire();
    frames.fire();
    equal(frames.pending, 1);
    assert(labels(view).every((label, i) => label === before[i]), "a frame in which nothing moved builds nothing");
    $(view, ".bar button").remove();
    frames.fire();
    assert(labels(view).length < before.length && labels(view)[0] !== before[0], "a frame after a change lays out again");
    view.help.close();
    equal(frames.pending, 0, "closed again: the callback is cancelled");
    view.help.toggle(true);
    view.remove();
    equal(frames.pending, 0, "and so it is on disconnect");
});

check("help: a label next to its control is tethered with anchor positioning, a label that moved away is not", async () => {
    const template = `<style>
            :host { display: block; position: relative; width: 320px; height: 200px; background: white; }
            button { position: absolute; left: 60px; top: 60px; width: 60px; height: 24px; }
        </style>
        <button data-ww-help="A control">A</button>`;
    for (const anchor of [true, false]) {
        const host = await probe(template, { anchor });
        // No frame runs from here on, so nothing is laid out again.
        const frames = fakeFrames();
        host.core.toggle(true);
        const button = $(host, "button");
        const label = labelOf(host, button)!;
        equal(label.hasAttribute("data-ww-help-anchored"), anchor, anchor ? "tethered" : "placed from measured rectangles");
        assert(beside(label.getBoundingClientRect(), button.getBoundingClientRect()), "the label is next to its control");
        const before = label.getBoundingClientRect().left;
        const moved = new CSSStyleSheet();
        moved.replaceSync("button { left: 150px; }");
        host.shadowRoot!.adoptedStyleSheets = [...host.shadowRoot!.adoptedStyleSheets, moved];
        // The browser moves a tethered label with its control at once; a measured one waits for the next layout.
        equal(Math.round(label.getBoundingClientRect().left - before), anchor ? 90 : 0, anchor ? "the tethered label followed without a layout" : "the measured label waits");
        frames.fire();
        const after = labelOf(host, button)!;
        assert(beside(after.getBoundingClientRect(), button.getBoundingClientRect()), "after the next frame both are next to the control");
        frames.restore();
        host.remove();
    }
    // In the staircase of the diagram view the labels are away from their controls: those are placed, not tethered.
    const { view } = await diagram();
    view.help.core.anchor = true;
    view.help.toggle(true);
    const first = labelOf(view, $(view, ".toolbar button"))!;
    assert(!first.hasAttribute("data-ww-help-anchored") && first.style.left !== "", "a label with a connector has a measured position");
    assert(labelOf(view, toggle(view))!.hasAttribute("data-ww-help-anchored"), "a label with room stays tethered");
});

check("help: Escape, the backdrop and the toggle close the overlay and return focus to the toggle", async () => {
    const { view, stage } = await diagram();
    const open = async () => {
        view.help.toggle(true);
        await settled(view);
        assert(view.help.open && $(view, "[data-ww-help-layer]"), "open");
    };
    const closed = (how: string) => {
        equal([view.help.open, toggle(view).getAttribute("aria-pressed")], [false, "false"], how);
        equal($$(view, "[data-ww-help-layer], [data-ww-help-label]").length, 0, `${how}: the layer is gone`);
        equal($$(view, "[aria-describedby]").length, 0, `${how}: the descriptions are gone`);
        assert(deepActive() === toggle(view), `${how}: focus returns to the toggle`);
    };

    assert(key("Escape", stage), "Escape is not consumed while the overlay is closed");
    await open();
    stage.focus();
    assert(!key("Escape"), "Escape is consumed while the overlay is open");
    closed("Escape");

    await open();
    stage.focus();
    const backdrop = $(view, "[data-ww-help-backdrop]");
    const style = getComputedStyle(backdrop);
    equal([style.position, style.backgroundColor], ["absolute", "rgba(0, 0, 0, 0.1)"], "a light backdrop");
    for (const control of [...marked(view), $(view, "[data-ww-viewport-action]")]) {
        const hit = view.shadowRoot!.elementFromPoint(point(control).x, point(control).y);
        assert(hit?.closest("[data-ww-help-layer]"), `the pointer reaches <${control.localName}> through the open overlay`);
    }
    backdrop.click();
    closed("backdrop");

    await open();
    stage.focus();
    labels(view)[0].click();
    closed("a click on a label");

    await open();
    stage.focus();
    toggle(view).click();
    closed("toggle");

    await open();
    view.help.close();
    equal(view.help.open, false, "close() for menus");
});

check("help: Escape closes from anywhere on the page, and is left alone while the overlay is closed", async () => {
    const { view } = await diagram();
    const outside = await mount<HTMLInputElement>(`<input aria-label="Elsewhere">`);
    let heard = 0;
    const hear = () => heard++;
    document.addEventListener("keydown", hear);
    try {
        const closed = listeners();
        outside.focus();
        assert(key("Escape"), "closed: Escape is not consumed");
        equal(heard, 1, "closed: the rest of the page hears it");

        view.help.toggle(true);
        await settled(view);
        equal(listeners(), closed + 1, "open: one key listener on the window");
        outside.focus();
        assert(!key("Escape"), "open: Escape is consumed, although the focus is outside the widget");
        equal(view.help.open, false);
        equal(heard, 1, "and does nothing else on the page");
        assert(deepActive() === outside, "focus stays with what the reader was doing");
        equal(listeners(), closed, "the listener is gone with the overlay");
        assert(key("Escape") && heard === 2, "closed again: Escape belongs to the page");

        // With the focus nowhere, it returns to the toggle.
        view.help.toggle(true);
        await settled(view);
        outside.blur();
        assert(!key("Escape", document.body));
        assert(!view.help.open && deepActive() === toggle(view), "focus returns to the toggle");
        assert(key("x", document.body), "other keys are never consumed");

        // The toggle and close() end the listener as Escape does.
        view.help.toggle(true);
        view.help.close();
        equal(listeners(), closed);
    } finally {
        document.removeEventListener("keydown", hear);
    }
});

check("help: a narrow widget gets numbered markers and one numbered list instead", async () => {
    const { view } = await diagram(`allow-panning style="width: 150px"`);
    toggle(view).click();
    await settled(view);
    equal(view.help.form, "list");
    const targets = marked(view);
    equal(labels(view).length, 0, "no free labels: the two forms are never mixed");
    equal($$(view, "[data-ww-help-lines]").length, 0);
    const items = $$(view, "[data-ww-help-list] > li");
    equal(items.map((item) => item.textContent), targets.map((target) => target.dataset.wwHelp!));
    equal($$(view, "[data-ww-help-marker]").map((marker) => marker.textContent), targets.map((_, i) => String(i + 1)));
    targets.forEach((target, i) => {
        assert(labelOf(view, target) === items[i], "the list item is the description of its element");
        const marker = $$(view, "[data-ww-help-marker]")[i].getBoundingClientRect();
        assert(overlap(marker, target.getBoundingClientRect()), `marker ${i + 1} sits on its element`);
        assert(within(marker, view.getBoundingClientRect()), `marker ${i + 1} is inside the widget`);
    });
    const list = $(view, "[data-ww-help-list]");
    assert(within(list.getBoundingClientRect(), view.getBoundingClientRect()), "the list is inside the widget");
    equal([getComputedStyle(list).overflowY, list.tabIndex, list.getAttribute("aria-label")], ["auto", 0, "Help"], "scrollable, reachable and named");

    // A resize switches the whole overlay, both ways.
    view.style.width = "600px";
    await until(() => view.help.form === "labels", "no label form after widening");
    equal($$(view, "[data-ww-help-list], [data-ww-help-marker]").length, 0);
    checkLabels(view);
    view.style.width = "150px";
    await until(() => view.help.form === "list", "no list form after narrowing");
    $(view, "[data-ww-help-list]").click();
    equal(view.help.open, true, "a click in the list does not close the overlay");
});

check("help: the list keeps clear of the toggle and of the markers beside it, and scrolls", async () => {
    const cases: [ToolPanel["layout"], number, number][] = [["both", 200, 300], ["both", 360, 300], ["row", 240, 300], ["column", 160, 260], ["groups", 170, 200]];
    let scrolled = 0;
    for (const [layout, width, height] of cases) {
        const view = await panel(layout, width, height);
        const name = `${layout} ${width} × ${height}`;
        equal(view.help.form, "list", name);
        const list = $(view, "[data-ww-help-list]");
        const box = list.getBoundingClientRect();
        assert(within(box, view.getBoundingClientRect()), `${name}: the list is inside the widget`);
        assert(!overlap(box, toggle(view).getBoundingClientRect()), `${name}: the list does not cover the toggle`);
        assert(box.height <= view.clientHeight * 0.6 + 0.5, `${name}: the list takes at most 60 % of the height`);
        const markers = $$(view, "[data-ww-help-marker]");
        equal(markers.length, marked(view).length, name);
        for (const marker of markers) {
            const covered = overlap(marker.getBoundingClientRect(), box);
            // Beside the list every marker is free. In a widget too small for that, the marker is drawn over the list.
            assert(!covered || (box.height <= 57 && !!(list.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING)), `${name}: marker ${marker.textContent} is hidden by the list`);
        }
        const entries = $$(view, "[data-ww-help-list] > li");
        assert(entries.every((entry) => entry.getBoundingClientRect().width <= box.width), `${name}: no entry is wider than the list`);
        if (list.scrollHeight > list.clientHeight + 1) {
            scrolled++;
            // What does not fit is reached by scrolling, with the keyboard too: the list takes the focus.
            list.focus();
            assert(deepActive() === list, `${name}: the list can be focused`);
            list.scrollTop = list.scrollHeight;
            assert(within(entries.at(-1)!.getBoundingClientRect(), { left: box.left - 1, top: box.top, right: box.right + 1, bottom: box.bottom }), `${name}: the last entry scrolls into view`);
        }
        view.remove();
    }
    assert(scrolled >= 3, "most of these lists are longer than their room");
});

check("help: the list sits at the top when the toggle is at the bottom", async () => {
    const buttons = ["Bold", "Italic", "Underline", "Strike through", "Clear the formatting"].map((text) => `<button data-ww-help="${text}">${text[0]}</button>`).join("");
    const host = await probe(`<style>
            :host { display: block; position: relative; width: 150px; height: 220px; background: white; }
            .bar { position: absolute; inset: auto 4px 4px 4px; display: flex; gap: 2px; }
            button { width: 22px; height: 22px; padding: 0; }
        </style>
        <div class="bar">${buttons}<button data-ww-help-toggle data-ww-help="Help">?</button></div>`);
    host.core.toggle(true);
    equal(host.core.getSnapshot().form, "list");
    const list = $(host, "[data-ww-help-list]");
    const box = list.getBoundingClientRect();
    assert(box.top - host.getBoundingClientRect().top < 10, "the list is at the top");
    assert(!overlap(box, toggle(host).getBoundingClientRect()), "and leaves the toggle free");
    assert($$(host, "[data-ww-help-marker]").every((marker) => !overlap(marker.getBoundingClientRect(), box)), "and the markers");
});

check("help: a render while the overlay is open updates the labels", async () => {
    const { view } = await diagram();
    view.help.toggle();
    await settled(view);
    equal(labels(view).length, 5);
    view.nodes = "";
    await settled(view);
    equal(labels(view).some((label) => label.textContent === "Remove the newest node"), false, "a control the template leaves out loses its label");
    equal(labels(view).length, 4);
    checkLabels(view);
    const add = $(view, ".toolbar button");
    add.setAttribute("data-ww-help-side", "right");
    add.setAttribute("aria-describedby", "own");
    view.requestUpdate();
    await settled(view);
    const [l, t] = [labelOf(view, add)!, add.getBoundingClientRect()];
    equal(add.getAttribute("aria-describedby"), `own ${l.id}`, "an existing description is kept");
    assert(l.getBoundingClientRect().left >= t.right && beside(l.getBoundingClientRect(), t), "the preferred side is used when there is room");
    add.setAttribute("data-ww-help", "Add one");
    view.requestUpdate();
    await settled(view);
    equal(labelOf(view, add)!.textContent, "Add one", "a new text is shown after the render");
    view.help.close();
    equal(add.getAttribute("aria-describedby"), "own");
});

check("help: the preferred side is used where there is room, and another one where there is none", async () => {
    const template = (side: Side) => `<style>
            :host { display: block; position: relative; width: 320px; height: 200px; background: white; }
            .a { position: absolute; left: 130px; top: 90px; width: 40px; height: 24px; }
            .b { position: absolute; left: 6px; top: 6px; width: 40px; height: 24px; }
        </style>
        <button class="a" data-ww-help="In the middle" data-ww-help-side="${side}">A</button>
        <button class="b" data-ww-help="In the corner" data-ww-help-side="${side}">B</button>`;
    for (const anchor of [true, false]) {
        for (const side of ["top", "right", "bottom", "left"] as Side[]) {
            const host = await probe(template(side), { anchor });
            host.core.toggle(true);
            checkLabels(host);
            const [a, b] = [$(host, ".a"), $(host, ".b")];
            const [la, lb] = [labelOf(host, a)!.getBoundingClientRect(), labelOf(host, b)!.getBoundingClientRect()];
            const [ta, tb] = [a.getBoundingClientRect(), b.getBoundingClientRect()];
            const on = { top: la.bottom <= ta.top, right: la.left >= ta.right, bottom: la.top >= ta.bottom, left: la.right <= ta.left };
            assert(on[side] && beside(la, ta), `${side}, ${anchor ? "anchored" : "measured"}: the label in the middle is on its preferred side`);
            // In the corner there is no room on the left or at the top.
            const cornered = { top: lb.bottom <= tb.top, left: lb.right <= tb.left };
            if (side === "top" || side === "left") assert(!cornered[side] && beside(lb, tb), `${side}: the label in the corner took another side`);
            host.remove();
        }
    }
});

check("help: rank decides who is placed first", async () => {
    const { view } = await diagram();
    $(view, "[data-ww-viewport-controls]").setAttribute("data-ww-help-order", "1");
    toggle(view).setAttribute("data-ww-help-order", "2");
    view.help.toggle();
    await settled(view);
    equal(labels(view).slice(0, 2).map((label) => label.textContent), ["Zoom and fit", "Help"], "ranked elements first, the rest in template order");
    equal(labels(view)[2].textContent, "Add a node in the middle of the view");
    view.help.close();

    // Two controls want the same place. The one that is placed first gets it.
    const template = (first: string, second: string) => `<style>
            :host { display: block; position: relative; width: 300px; height: 120px; background: white; }
            button { position: absolute; top: 6px; width: 30px; height: 24px; }
        </style>
        <button style="left: 6px" data-ww-help="The first control" ${first}>1</button>
        <button style="left: 40px" data-ww-help="The second control" ${second}>2</button>`;
    for (const [first, second, winner] of [["", "", 0], [`data-ww-help-order="2"`, `data-ww-help-order="1"`, 1], ["", `data-ww-help-order="5"`, 1], [`data-ww-help-order="x"`, "", 0]] as const) {
        const host = await probe(template(first, second), { anchor: false });
        host.core.toggle(true);
        const buttons = $$(host, "button");
        const tops = buttons.map((button) => labelOf(host, button)!.getBoundingClientRect().top);
        equal(labels(host)[0].textContent, buttons[winner].dataset.wwHelp, `"${first}" / "${second}": the order of the labels`);
        assert(tops[0] !== tops[1], "the two labels are on lines of their own");
        host.remove();
    }
});

check("help: a label does not cover the focused control", async () => {
    const template = `<style>
            :host { display: block; position: relative; width: 300px; height: 160px; background: white; }
            button { position: absolute; left: 100px; width: 80px; height: 24px; }
        </style>
        <button class="marked" style="top: 40px" data-ww-help="A marked control">Marked</button>
        <button class="plain" style="top: 70px">Plain</button>`;
    for (const anchor of [true, false]) {
        const host = await probe(template, { anchor });
        const [markedControl, plain] = [$(host, ".marked"), $(host, ".plain")];
        host.core.toggle(true);
        const box = () => labelOf(host, markedControl)!.getBoundingClientRect();
        assert(overlap(box(), plain.getBoundingClientRect()), "an unmarked control may lie under a label");
        plain.focus();
        assert(!overlap(box(), plain.getBoundingClientRect()), "but not while it has the focus: the label moved aside");
        assert(deepActive() === plain, "and the focus is not trapped or moved");
        checkLabels(host);
        host.remove();
    }
});

/** A widget whose render swaps the whole template, which makes Lit remove everything after its own content. */
class SwapProbe extends LitElement {
    static properties = { second: { type: Boolean } };
    declare second: boolean;
    readonly help = new Help(this);
    render() {
        const style = html`<style>:host { display: block; width: 320px; height: 160px; }</style>`;
        return this.second
            ? html`<section>${style}<button data-ww-help="Second">B</button> <button data-ww-help-toggle>?</button></section>`
            : html`<div>${style}<button data-ww-help="First">A</button> <button data-ww-help-toggle>?</button></div>`;
    }
}
customElements.define("ww-help-swap-probe", SwapProbe);

check("help: the overlay survives a render that replaces the whole template", async () => {
    const swap = await mount<SwapProbe>(`<ww-help-swap-probe></ww-help-swap-probe>`);
    swap.help.toggle();
    await settled(swap);
    equal(labels(swap).map((label) => label.textContent), ["First"]);
    swap.second = true;
    await settled(swap);
    equal(labels(swap).map((label) => label.textContent), ["Second"], "the labels follow the new template");
    equal($$(swap, "[data-ww-help-layer]").length, 1);
    assert(swap.shadowRoot!.lastElementChild === $(swap, "[data-ww-help-layer]"), "the layer is the last child again");
    equal($(swap, "[data-ww-help-toggle]").getAttribute("aria-pressed"), "true", "the new toggle shows the state");
    // A library that clears what the module added does no harm either.
    $(swap, "[data-ww-help-layer]").remove();
    swap.requestUpdate();
    await settled(swap);
    equal(labels(swap).map((label) => label.textContent), ["Second"], "a layer that was removed is built again after the render");
});

// ── Look and assistive technology ─────────────────────────────────────────

/** A CSS colour as red, green, blue (0–255) and alpha. */
function rgba(color: string): [number, number, number, number] {
    const [r, g, b, a = 1] = color.match(/[0-9.]+/g)!.map(Number);
    return [r, g, b, a];
}
const over = (top: [number, number, number, number], under: [number, number, number]): [number, number, number] => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])) as [number, number, number];
function luminance([r, g, b]: number[]): number {
    const [x, y, z] = [r, g, b].map((value) => (value / 255 <= 0.03928 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4));
    return 0.2126 * x + 0.7152 * y + 0.0722 * z;
}
const contrast = (a: number[], b: number[]) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

check("help: connectors and labels read over a light and over a dark widget", async () => {
    for (const dark of [false, true]) {
        const view = await panel("row", 460, 300, true, dark ? "dark" : "");
        const name = dark ? "dark" : "light";
        const lines = $$<SVGPathElement>(view, "[data-ww-help-lines] > [data-ww-help-for]");
        const outlines = $$<SVGPathElement>(view, "[data-ww-help-lines] > [data-ww-help-outline]");
        assert(lines.length >= 8, "connectors are drawn");
        equal(outlines.map((path) => path.getAttribute("d")).sort(), lines.map((path) => path.getAttribute("d")).sort(), `${name}: every connector has an outline along the same path`);
        assert(outlines.every((outline) => lines.every((line) => outline.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING)), `${name}: the outlines lie under the lines`);
        const [line, outline] = [getComputedStyle(lines[0]), getComputedStyle(outlines[0])];
        equal([line.stroke, line.strokeWidth, line.fill], ["rgb(255, 255, 255)", "2px", "none"], `${name}: white lines, as in automaton`);
        assert(parseFloat(outline.strokeWidth) > parseFloat(line.strokeWidth), `${name}: the outline shows on both sides of the line`);

        // What is behind the overlay: the widget's background under the backdrop.
        const canvas = over(rgba(getComputedStyle($(view, "[data-ww-help-backdrop]")).backgroundColor), rgba(getComputedStyle($(view, ".canvas")).backgroundColor).slice(0, 3) as [number, number, number]);
        const edge = over(rgba(outline.stroke), canvas);
        const white = [255, 255, 255];
        // A line is found if it stands out from the background, or its outline does and the line stands out from the outline.
        const found = Math.max(contrast(white, canvas), Math.min(contrast(edge, canvas), contrast(white, edge)));
        assert(found >= 3, `${name}: the connector has a contrast of ${found.toFixed(2)} to what is behind it`);
        assert(contrast(white, edge) >= 3, `${name}: the line stands out from its outline (${contrast(white, edge).toFixed(2)})`);

        const label = getComputedStyle(labels(view)[0]);
        const paper = rgba(label.backgroundColor).slice(0, 3);
        assert(contrast(rgba(label.color).slice(0, 3), paper) >= 4.5, `${name}: the text of a label is readable on its tag`);
        assert(label.boxShadow !== "none" && label.borderTopStyle === "solid", `${name}: a tag has an edge of its own, whatever is behind it`);
        equal(label.backgroundColor, "rgb(250, 250, 250)", `${name}: small neutral tags, as in automaton`);
        view.remove();
    }
});

check("help: a control is described by its label, and a custom element through its shadow tree", async () => {
    const view = await panel("groups", 420);
    const native = $(view, ".bar button");
    equal(native.getAttribute("aria-describedby"), labelOf(view, native)!.id, "a native control: aria-describedby");
    equal(labelOf(view, native)!.getAttribute("role"), "tooltip");

    // The button that is focused and read sits inside the custom element.
    const run = $(view, "ww-panel-button");
    const inner = run.shadowRoot!.querySelector("button")!;
    const described = () => [...(inner.ariaDescribedByElements ?? [])];
    equal(run.getAttribute("aria-describedby"), labelOf(view, run)!.id, "the host carries the description as before");
    assert(described().length === 1 && described()[0] === labelOf(view, run), "the control inside is described by the same label, across the shadow boundary");
    equal(described()[0].textContent, "Run the word");
    view.requestUpdate();
    await settled(view);
    assert(described()[0] === labelOf(view, run) && described()[0].isConnected, "a new layout keeps the description on the current label");

    view.help.close();
    equal([described().length, inner.hasAttribute("aria-describedby"), run.hasAttribute("aria-describedby")], [0, false, false], "closing removes both descriptions");

    // A description the component set itself is kept, while the overlay is open and after.
    const own = inner.parentNode!.appendChild(document.createElement("span"));
    own.textContent = "Runs the automaton";
    inner.ariaDescribedByElements = [own];
    view.help.toggle(true);
    await settled(view);
    equal(described().map((element) => element.textContent), ["Runs the automaton", "Run the word"]);

    // The list form describes with its entries.
    view.style.width = "170px";
    view.style.height = "200px";
    await until(() => view.help.form === "list", "no list form");
    assert(described()[1]?.localName === "li" && described()[1].textContent === "Run the word", "in the list form the entry is the description");
    assert(labelOf(view, native)!.localName === "li");
    view.help.close();
    equal(described().map((element) => element.textContent), ["Runs the automaton"], "the component's own description is back alone");
});

check("help: the list is named from the messages, in the widget's language", async () => {
    const view = await panel("both", 200, 300, true, `lang="de"`);
    const name = () => $(view, "[data-ww-help-list]").getAttribute("aria-label");
    equal(name(), "Hilfe");
    view.lang = "en";
    await until(() => name() === "Help", "the name did not follow the language");
    view.remove();

    const host = await probe(`<style>:host { display: block; width: 60px; height: 120px; }</style><button data-ww-help="A long explanation of the only control">A</button>`, { messages: { list: "Legend" } }, `lang="de"`);
    host.core.toggle(true);
    equal($(host, "[data-ww-help-list]").getAttribute("aria-label"), "Legend", "an override wins in every language");
});

check("help: everything is released on disconnect", async () => {
    const before = listeners();
    const { view } = await diagram();
    const root = view.shadowRoot!;
    view.help.toggle();
    await settled(view);
    assert(root.querySelector("[data-ww-help-label]"));
    assert(listeners() > before, "an open overlay listens for Escape");
    const changes = mutations(view);
    const parent = view.parentElement!;
    view.remove();
    equal(changes.stop().length, 0, "the overlay never wrote to the host or its authored children");
    equal(listeners(), before);
    equal(root.querySelectorAll("[data-ww-help-layer], [aria-describedby]").length, 0, "layer and descriptions are gone");
    equal(root.querySelector("[data-ww-help-toggle]")!.getAttribute("aria-pressed"), "false");
    parent.append(view);
    await settled(view);
    equal(view.help.open, false, "a reconnected widget starts closed");
    view.help.toggle();
    await settled(view);
    checkLabels(view);
});

// ── The layout function on its own ────────────────────────────────────────

const SIDES: Side[] = ["bottom", "top", "right", "left"];
const control = (left: number, top: number, width: number, height: number, label = 110): LabelItem => ({ target: { left, top, right: left + width, bottom: top + height }, width: label, height: 21, sides: SIDES, region: false });
const lineParts = (placed: LabelPlacement) => (placed.line ? pieces(placed.line.map(([x, y]) => ({ x, y }))) : []);

/** What every layout promises, on the plain geometry. */
function validate(bounds: Box, items: LabelItem[], placed: LabelPlacement[] | null): asserts placed is LabelPlacement[] {
    assert(placed, "the labels fit, so the layout must not give up");
    equal(placed.length, items.length);
    placed.forEach((label, i) => {
        const [item, parts] = [items[i], lineParts(label)];
        assert(within(label.box, bounds), `label ${i} is outside the bounds`);
        assert(Math.abs(label.box.right - label.box.left - item.width) < 0.01 && Math.abs(label.box.bottom - label.box.top - item.height) < 0.01, `label ${i} changed its size`);
        equal(parts.length > 0, !(item.region && within(label.box, item.target)) && !beside(label.box, item.target), `label ${i}: a connector exactly when it is not next to or inside its element`);
        assert(rightAngled(parts), `connector ${i} is straight or right-angled`);
        if (parts.length) {
            const touches = (r: Rect, x: number, y: number) => x >= r.left - 0.5 && x <= r.right + 0.5 && y >= r.top - 0.5 && y <= r.bottom + 0.5;
            assert(touches(item.target, parts[0].x1, parts[0].y1) && touches(label.box, parts.at(-1)!.x2, parts.at(-1)!.y2), `connector ${i} joins its element and its label`);
        }
        placed.forEach((other, j) => {
            if (i === j) return;
            const exempt = items[j].region || within(item.target, items[j].target) || within(items[j].target, item.target);
            assert(!overlap(label.box, other.box), `labels ${i} and ${j} overlap`);
            assert(exempt || !overlap(label.box, items[j].target), `label ${i} covers element ${j}`);
            for (const part of parts) {
                assert(!overlap(thin(part), other.box), `connector ${i} runs through label ${j}`);
                assert(exempt || !overlap(thin(part), items[j].target), `connector ${i} runs through element ${j}`);
                assert(!lineParts(other).some((crossed) => overlap(thin(part), thin(crossed))), `connectors ${i} and ${j} cross`);
            }
        });
    });
}

check("layout: a crowded row becomes a staircase whose connectors cross no label", () => {
    const bounds = { left: 4, top: 4, right: 596, bottom: 296 };
    const row = (left: number): LabelItem => ({ target: { left, top: 8, right: left + 40, bottom: 36 }, width: 110, height: 20, sides: SIDES, region: false });
    const items = [row(8), row(52), row(96), row(140)];
    const placed = layoutLabels(bounds, items)!;
    assert(placed, "there is room");
    equal(placed.every((label) => label.line?.length === 2 && label.line[0][0] === label.line[1][0]), true, "every connector is one straight vertical line");
    const tops = placed.map((label) => label.box.top);
    equal(new Set(tops).size, 4, "one row per label");
    equal([...tops].sort((a, b) => a - b), [...tops].reverse(), "the element nearest to the free side gets the first row");
    placed.forEach((label, i) => {
        const x = label.line![0][0];
        placed.forEach((other, j) => assert(i === j || !(x > other.box.left && x < other.box.right && other.box.top < label.box.top), `connector ${i} crosses label ${j}`));
    });

    // The same row at the right edge reaches to the left instead.
    const mirrored = layoutLabels(bounds, [row(420), row(464), row(508), row(552)])!;
    assert(mirrored.every((label, i) => label.box.right <= items[i].target.right + 420 + 10), "labels reach towards the room");
    equal(layoutLabels({ left: 4, top: 4, right: 100, bottom: 296 }, items), null, "no place for a label: the caller falls back to the list");
    equal(layoutLabels({ left: 4, top: 4, right: 596, bottom: 70 }, items), null, "no room for the staircase either");
});

check("layout: a row as wide as the bounds fans out to both sides", () => {
    for (const width of [340, 420, 520]) {
        const bounds = { left: 4, top: 4, right: width - 4, bottom: 296 };
        const pitch = (width - 12) / 8;
        const items = Array.from({ length: 8 }, (_, i) => control(6 + i * pitch, 6, pitch - 4, 26));
        const placed = layoutLabels(bounds, items);
        validate(bounds, items, placed);
        const drop = (label: LabelPlacement) => label.line!.at(-1)![0];
        const centre = (label: LabelPlacement) => (label.box.left + label.box.right) / 2;
        assert(placed.slice(0, 4).every((label) => drop(label) > centre(label)), `${width}: the labels of the left half reach left from their connectors`);
        assert(placed.slice(4).every((label) => drop(label) < centre(label)), `${width}: those of the right half reach right`);
        const tops = placed.map((label) => label.box.top);
        equal(tops.slice(0, 4), [...tops.slice(0, 4)].sort((a, b) => a - b), `${width}: on the left the outermost label is nearest`);
        equal(tops.slice(4), [...tops.slice(4)].sort((a, b) => b - a), `${width}: and so it is on the right`);
        assert(tops[0] < tops[3] && tops[7] < tops[4], `${width}: the middle has the longest connectors`);
        // Next to the edge a label has no room where its element is: its connector makes way.
        equal([placed[0].line!.length, placed[7].line!.length], [4, 4], `${width}: the outer connectors run sideways first`);
        const lanes = placed.filter((label) => label.line!.length === 4 && drop(label) > label.line![0][0]).map((label) => label.line![1][1]);
        equal(new Set(lanes).size, lanes.length, `${width}: each in a lane of its own`);
    }
});

check("layout: a column of crowded controls gets a stack beside it", () => {
    const bounds = { left: 4, top: 4, right: 296, bottom: 296 };
    for (const side of ["left", "right"] as const) {
        const x = side === "left" ? 6 : 278;
        const items = Array.from({ length: 8 }, (_, i) => control(x, 60 + i * 14, 16, 12, 80));
        const placed = layoutLabels(bounds, items);
        validate(bounds, items, placed);
        assert(placed.every((label, i) => (side === "left" ? label.box.left >= items[i].target.right : label.box.right <= items[i].target.left)), `${side} edge: every label is on the free side of the column`);
        equal(new Set(placed.map((label) => label.box.left)).size, 1, `${side} edge: in one stack`);
        const tops = placed.map((label) => label.box.top);
        equal(tops, [...tops].sort((a, b) => a - b), `${side} edge: in the order of the controls`);
        const stepped = placed.filter((label) => label.line?.length === 4);
        assert(stepped.length >= 5, `${side} edge: most labels are joined around the corner`);
        assert(stepped.every((label) => label.line![0][1] === label.line![1][1] && label.line![2][1] === label.line![3][1]), `${side} edge: their connectors leave and arrive sideways`);
        const up = stepped.filter((label) => label.line![2][1] < label.line![0][1]).map((label) => label.line![1][0]);
        equal(new Set(up).size, up.length, `${side} edge: the ones that go up each have a lane`);
    }

    // Controls that are tall enough need no stack: every label sits beside its control.
    const roomy = Array.from({ length: 5 }, (_, i) => control(6, 40 + i * 30, 24, 26, 80));
    const plain = layoutLabels(bounds, roomy);
    validate(bounds, roomy, plain);
    equal(plain.filter((label) => label.line).length, 0, "no connector is needed");
});

check("layout: separate groups and a column under a row are placed without crossing", () => {
    // Two groups in one row, in bounds too narrow for two staircases side by side.
    for (const width of [420, 300, 230]) {
        const bounds = { left: 4, top: 4, right: width - 4, bottom: 296 };
        const items = [control(6, 6, 44, 26, 150), control(54, 6, 44, 26, 82), control(102, 6, 44, 26, 107), control(width - 98, 6, 44, 26, 139), control(width - 50, 6, 44, 26, 44)];
        validate(bounds, items, layoutLabels(bounds, items));
    }

    // A full row above a column at the left edge, a region and a control in its corner.
    const bounds = { left: 4, top: 4, right: 456, bottom: 296 };
    const widths = [150, 82, 107, 131, 122, 97, 112, 44];
    const row = widths.map((label, i) => control(6 + i * 56.5, 6, 52.5, 26, label));
    const column = [51, 58, 68, 45, 89].map((label, i) => control(6, 45 + i * 20, 24, 18, label));
    const region: LabelItem = { target: { left: 36, top: 39, right: 460, bottom: 300 }, width: 153, height: 21, sides: SIDES, region: true };
    const corner = control(429, 276, 23, 16, 93);
    const items = [...row, ...column, corner, region];
    const placed = layoutLabels(bounds, items);
    validate(bounds, items, placed);
    const stack = placed.slice(8, 13);
    assert(stack.every((label, i) => label.box.left >= column[i].target.right), "the column's labels are beside it");
    assert(placed.slice(0, 8).every((label) => label.box.left >= Math.max(...stack.map((each) => each.box.right)) || label.box.top >= Math.max(...stack.map((each) => each.box.bottom))), "and the row's labels keep out of their way");
    assert(within(placed[14].box, region.target) && !placed[14].line, "the region's label is inside it, without a line");
});
