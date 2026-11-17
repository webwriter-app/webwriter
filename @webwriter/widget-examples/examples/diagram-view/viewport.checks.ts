import { assert, check, deepActive, equal, events, frame, key, listeners, mount, mutations, point, pointer, settled, transactionSteps, until, wait, warnings } from "../../test/harness";
import { html, LitElement } from "lit";
import { PointerGesture } from "@webwriter/widget/gesture";
import { transactionOpen } from "@webwriter/widget/transaction";
import { ViewportCore, type ViewportOptions } from "@webwriter/widget/viewport";
import { Viewport } from "@webwriter/lit/viewport";
import { $, $$, canvasView, diagram, fitted, layerView, middle, near, wheel } from "./helpers";

// ── Probes ────────────────────────────────────────────────────────────────

/** A plain element on the core alone. The template comes from the page; `ViewportProbe.options` is taken by the next instance. */
class ViewportProbe extends HTMLElement {
    static options: ViewportOptions = {};
    core!: ViewportCore;
    connectedCallback() {
        this.core ??= new ViewportCore(this, ViewportProbe.options);
        ViewportProbe.options = {};
        this.core.connect();
        this.core.refresh();
    }
    disconnectedCallback() {
        this.core.disconnect();
    }
}
customElements.define("ww-viewport-probe", ViewportProbe);

async function probe(template: string, options: ViewportOptions = {}, attributes = "") {
    ViewportProbe.options = options;
    const host = await mount<ViewportProbe>(`<ww-viewport-probe ${attributes}><template shadowrootmode="open">${template}</template></ww-viewport-probe>`);
    const win = host.shadowRoot!.querySelector<HTMLElement>("[data-ww-viewport]");
    if (win && win.getAttribute("data-ww-viewport") !== "external") await until(() => host.core.getSnapshot().width > 0, "the probe's viewport never opened");
    await frame(2);
    return { host, core: host.core, win: win!, view: () => host.core.getSnapshot() };
}

/** A window of 300 × 200 with scrollbars that take 12 px, whatever the platform draws. */
const classic = `<style>
    .win { width: 300px; height: 200px; }
    .win::-webkit-scrollbar { width: 12px; height: 12px; }
    .world { display: block; }
</style>`;

/** A canvas-form window of 400 × 200 on an ordinary element. */
const surface = `<style>.win { width: 400px; height: 200px; }</style><div class="win" data-ww-viewport="canvas"></div>`;

/** A widget whose render replaces the window element, which loses its scroll position. */
class WindowSwapProbe extends LitElement {
    static properties = { second: { type: Boolean } };
    declare second: boolean;
    readonly viewport = new Viewport(this);
    render() {
        const style = html`<style>
            .win { width: 300px; height: 200px; }
            .world { width: 900px; height: 600px; }
        </style>`;
        return this.second
            ? html`<section>${style}<div class="win" id="b" data-ww-viewport><div class="world"></div></div></section>`
            : html`<div>${style}<div class="win" id="a" data-ww-viewport><div class="world"></div></div></div>`;
    }
}
customElements.define("ww-window-swap-probe", WindowSwapProbe);

// ── Viewport, scroll form ─────────────────────────────────────────────────

check("viewport: opens fitted and stays fitted while the widget resizes", async () => {
    const { view, stage } = await diagram();
    equal(view.viewport.scale, fitted(stage));
    assert(stage.scrollWidth <= stage.clientWidth && stage.scrollHeight <= stage.clientHeight, "the fitted world leaves nothing to scroll");
    equal(getComputedStyle(stage).overflowX, "auto", "the window is a scroll container");
    equal([view.viewport.width, view.viewport.height], [stage.clientWidth, stage.clientHeight], "the state holds the size of the window");
    const before = view.viewport.scale;
    view.style.width = "400px";
    await until(() => view.viewport.scale < before, "the view did not follow the new size");
    equal(view.viewport.scale, fitted(stage));
    equal(view.viewport.width, stage.clientWidth, "and the size in the state followed");
});

check("viewport: fit modes and limits of the fitted view", async () => {
    const { view, stage } = await diagram();
    stage.setAttribute("data-ww-viewport-fit", "width");
    view.viewport.fit();
    equal(view.viewport.scale, Math.floor((stage.clientWidth / 1200) * 1000) / 1000, "width: the world is as wide as the room beside the scrollbar");
    assert(stage.scrollHeight > stage.clientHeight && stage.scrollWidth <= stage.clientWidth, "width: only vertical scrolling is left");
    stage.setAttribute("data-ww-viewport-fit", "none");
    view.viewport.fit();
    equal([view.viewport.scale, view.viewport.x, view.viewport.y], [1, 0, 0], "none: 100 % at the origin");
    stage.setAttribute("data-ww-viewport-fit", "content");
    stage.setAttribute("data-ww-viewport-zoom", "0.5 2");
    view.viewport.fit();
    equal(view.viewport.scale, 0.5, "a fitted scale below the minimum stops at the minimum");
    stage.setAttribute("data-ww-viewport-zoom", "0.1 0.2");
    view.viewport.fit();
    equal(view.viewport.scale, 0.2, "and one above the maximum at the maximum");
});

check("viewport: scrollbars are part of the window, and fitting to width settles with them", async () => {
    // Wide enough for a scrollbar: the world is fitted to the room beside it.
    const tall = await probe(`${classic}<div class="win" data-ww-viewport data-ww-viewport-fit="width"><div class="world" style="width: 600px; height: 900px"></div></div>`);
    equal(tall.win.clientWidth, 288, "the vertical scrollbar narrows the view");
    equal(tall.view().scale, 0.48, "288 / 600: fitted beside the scrollbar");
    equal(tall.win.scrollWidth, 288, "so nothing scrolls sideways");
    equal([tall.view().width, tall.view().height], [288, 200], "the state holds the room without the scrollbar");

    // A world that needs the scrollbar at 300 px (0.5 × 410 > 200) and not at 288 px (0.48 × 410 < 200):
    // the scrollbar would come and go. The largest scale without a scrollbar settles it.
    const edge = await probe(`${classic}<div class="win" data-ww-viewport data-ww-viewport-fit="width"><div class="world" style="width: 600px; height: 410px"></div></div>`);
    equal(edge.view().scale, 0.487, "200 / 410, rounded down");
    equal([edge.win.clientWidth, edge.win.clientHeight], [300, 200], "no scrollbar is left");
    assert(edge.win.scrollWidth <= 300 && edge.win.scrollHeight <= 200, "and nothing scrolls");
    edge.core.zoomTo(2);
    equal([edge.win.clientWidth, edge.win.clientHeight], [288, 188], "zoomed in, both scrollbars narrow the view");
    edge.core.fit();
    equal(edge.view().scale, 0.487, "fitting from a view with scrollbars settles on the same scale");
    equal(edge.win.clientWidth, 300);

    // Fitting the whole content never needs a scrollbar.
    const whole = await probe(`${classic}<div class="win" data-ww-viewport><div class="world" style="width: 600px; height: 410px"></div></div>`);
    whole.core.zoomTo(2);
    whole.core.fit();
    equal([whole.view().scale, whole.win.clientWidth, whole.win.clientHeight], [0.487, 300, 200]);
});

check("viewport: the wheel is left to native scrolling, and scrolling is the pan position", async () => {
    const { view, stage, world } = await diagram();
    view.viewport.zoomTo(1);
    await frame(2);
    assert(!wheel(world, point(stage), { deltaY: 80 }), "a plain wheel event is not consumed: the browser scrolls");
    stage.scrollTo(200, 100);
    await until(() => view.viewport.x === -200, "the scroll position did not reach the snapshot");
    equal([view.viewport.x, view.viewport.y], [-200, -100]);
    stage.scrollTo(99999, 99999);
    await until(() => view.viewport.x < -200);
    equal([view.viewport.x, view.viewport.y], [stage.clientWidth - 1200, stage.clientHeight - 800], "panning is limited by the scroll range");
    equal(getComputedStyle(world).transform, "none", "panning is never a transform");
    equal(getComputedStyle(world).zoom, "1", "zoom is the CSS zoom of the first child");
    assert(!world.hasAttribute("style") && !stage.hasAttribute("style"), "set in the module's sheet, not on the template");
    // Diagonal panning is in the sheet and applies where the browser knows the property.
    if (CSS.supports("scroll-axis-lock", "none")) equal(getComputedStyle(stage).getPropertyValue("scroll-axis-lock"), "none");
});

check("viewport: only a change of scale re-renders the widget in the scroll form", async () => {
    const { view, stage } = await diagram();
    view.viewport.zoomTo(1);
    await settled(view);
    let renders = 0;
    const request = view.requestUpdate.bind(view);
    view.requestUpdate = (...parameters: Parameters<typeof request>) => (renders++, request(...parameters));
    stage.scrollTo(200, 100);
    await until(() => view.viewport.x === -200);
    equal(renders, 0, "scrolling requests no update");
    view.viewport.zoomTo(1.5);
    assert(renders > 0, "a new scale does");
});

check("viewport: Ctrl+wheel zooms about the pointer and keeps its first world point", async () => {
    const { view, stage, world } = await diagram();
    view.viewport.zoomTo(1);
    stage.scrollTo(200, 100);
    await frame(2);
    // Whole pixels: a mouse or wheel event carries no fractions.
    const at = { x: Math.round(point(stage, 0.7, 0.3).x), y: Math.round(point(stage, 0.7, 0.3).y) };
    const before = view.viewport.toWorld(at.x, at.y);
    for (const step of [1, 2, 3, 4]) {
        assert(wheel(world, at, { deltaY: -120, ctrlKey: true }), "the zoom gesture is consumed");
        const after = view.viewport.toWorld(at.x, at.y);
        // The browser rounds the scroll position to whole pixels: at most half a pixel on screen.
        assert(near(after.x, before.x, 0.51 / view.viewport.scale) && near(after.y, before.y, 0.51 / view.viewport.scale), `step ${step}: the world point under the pointer moved from ${JSON.stringify(before)} to ${JSON.stringify(after)}`);
    }
    assert(near(view.viewport.scale, Math.exp(4 * 120 * 0.002), 1e-9), "the editor's own wheel step");
    assert(wheel(world, at, { deltaY: -120, metaKey: true }), "⌘ works like Ctrl");
    equal(stage.scrollLeft > 200, true, "zooming in about a point scrolls the window");

    // Many small steps at one point: the error of a rounded scroll position does not add up.
    view.viewport.zoomTo(1);
    stage.scrollTo(300, 200);
    await frame(2);
    const pivot = view.viewport.toWorld(at.x, at.y);
    for (let i = 0; i < 40; i++) wheel(world, at, { deltaY: i % 2 ? 7 : -19, ctrlKey: true });
    const kept = view.viewport.toWorld(at.x, at.y);
    assert(near(kept.x, pivot.x, 0.51 / view.viewport.scale) && near(kept.y, pivot.y, 0.51 / view.viewport.scale), `after 40 steps the point moved from ${JSON.stringify(pivot)} to ${JSON.stringify(kept)}`);

    // At an edge the scroll position cannot go below zero, so there the point under the pointer moves.
    view.viewport.zoomTo(1);
    stage.scrollTo(0, 0);
    await frame(2);
    const corner = view.viewport.toWorld(at.x, at.y);
    wheel(world, at, { deltaY: 300, ctrlKey: true });
    equal([stage.scrollLeft, stage.scrollTop], [0, 0], "zooming out at the origin stays at the origin");
    assert(view.viewport.toWorld(at.x, at.y).x > corner.x, "and the point under the pointer gives way");
});

check("viewport: zoom stops at the declared limits, and the buttons are marked disabled there", async () => {
    const { view, stage, world, button } = await diagram();
    const disabled = (name: string) => button(name).getAttribute("aria-disabled") === "true";
    for (let i = 0; i < 30; i++) wheel(world, point(stage), { deltaY: -200, ctrlKey: true });
    equal(view.viewport.scale, 3);
    equal([view.viewport.min, view.viewport.max], [0.25, 3], "the limits are in the state");
    equal([disabled("in"), disabled("out")], [true, false]);
    equal(button("in").disabled, false, "aria-disabled, not disabled");
    button("in").focus();
    assert(deepActive() === button("in"), "so the button keeps keyboard focus");
    button("in").click();
    equal(view.viewport.scale, 3, "and does nothing");
    for (let i = 0; i < 30; i++) wheel(world, point(stage), { deltaY: 200, ctrlKey: true });
    equal(view.viewport.scale, 0.25);
    equal([disabled("in"), disabled("out")], [false, true]);
    view.viewport.zoomTo(100);
    equal(view.viewport.scale, 3, "the API is limited too");
    stage.removeAttribute("data-ww-viewport-zoom");
    view.viewport.zoomTo(100);
    equal([view.viewport.scale, view.viewport.min], [4, 0.25], "without the attribute the limits are 0.25 and 4");
});

check("viewport: the zoom buttons", async () => {
    const { view, stage, button } = await diagram();
    const controls = $(view, "[data-ww-viewport-controls]");
    equal([...controls.children].map((child) => child.getAttribute("aria-label")), ["Zoom out", "Zoom in", `Zoom ${Math.round(fitted(stage) * 100)}%. Reset to 100%`, "Fit to view"]);
    equal([...controls.children].map((child) => child.localName), ["button", "button", "button", "button"]);
    equal(button("reset").textContent, `${Math.round(fitted(stage) * 100)}%`);
    button("reset").click();
    equal(view.viewport.scale, 1, "the percent button returns to 100 %");
    equal(button("reset").textContent, "100%");
    const centre = middle(stage);
    const before = view.viewport.toWorld(centre.x, centre.y);
    button("in").click();
    assert(near(view.viewport.scale, 1.2, 1e-9), "zoom in is the editor's step of 1.2");
    const after = view.viewport.toWorld(centre.x, centre.y);
    assert(near(after.x, before.x, 1) && near(after.y, before.y, 1), "a button zooms about the centre of the window");
    button("out").click();
    button("out").click();
    assert(near(view.viewport.scale, 1 / 1.2, 1e-9));
    button("fit").click();
    equal(view.viewport.scale, fitted(stage));

    // The buttons belong to the module, not to the template: a render keeps them, and a lost one is replaced.
    const first = button("in");
    view.requestUpdate();
    await settled(view);
    assert(button("in") === first, "a render of the widget keeps the buttons");
    controls.replaceChildren();
    view.requestUpdate();
    await settled(view);
    equal(controls.children.length, 4, "an emptied container is filled again");
});

check("viewport: names come from the messages, in the widget's language, and an override wins", async () => {
    const { view, stage, button } = await diagram(`allow-panning lang="de" style="width: 600px"`);
    const percent = Math.round(fitted(stage) * 100);
    equal(["out", "in", "reset", "fit"].map((name) => button(name).getAttribute("aria-label")), ["Verkleinern", "Vergrößern", `Zoom ${percent}\u00a0%. Auf 100\u00a0% zurücksetzen`, "Ganz anzeigen"]);
    equal(button("reset").textContent, `${percent}\u00a0%`);
    equal(button("fit").title, "Ganz anzeigen", "the name is the tooltip too");
    view.lang = "en";
    await until(() => button("fit").getAttribute("aria-label") === "Fit to view", "the names did not follow the language");
    equal(button("reset").textContent, `${percent}%`);

    const template = `<style>.win { width: 300px; height: 200px; }</style><div class="win" data-ww-viewport><div style="width: 600px; height: 400px"></div></div><div data-ww-viewport-controls></div>`;
    const custom = await probe(template, { messages: { zoomIn: "Closer", viewport: "Map" } }, `lang="de"`);
    equal([...custom.host.shadowRoot!.querySelectorAll("button")].map((each) => each.getAttribute("aria-label")), ["Verkleinern", "Closer", "Zoom 50\u00a0%. Auf 100\u00a0% zurücksetzen", "Ganz anzeigen"]);
    equal(custom.win.getAttribute("aria-label"), "Map", "the override names the window too");

    // Any element can hold the buttons, and more than one can.
    const twice = await probe(`${template}<span data-ww-viewport-controls></span>`);
    const sets = [...twice.host.shadowRoot!.querySelectorAll("[data-ww-viewport-controls]")];
    equal(sets.map((set) => set.querySelectorAll("button").length), [4, 4]);
    sets[1].querySelector<HTMLElement>(`[data-ww-viewport-action="in"]`)!.click();
    equal(sets.map((set) => set.querySelector(`[data-ww-viewport-action="reset"]`)!.textContent), ["60%", "60%"], "both sets show the same view");
});

check("viewport: the window is focusable and has a role and a label", async () => {
    const { stage } = await diagram();
    equal([stage.tabIndex, stage.getAttribute("role"), stage.getAttribute("aria-label")], [0, "group", "Diagram"], "focusable, with a role and the template's label");

    // What the template sets is kept; what is missing is added, and the fallback label follows the language.
    const own = await probe(`<style>.win { width: 300px; height: 200px; }</style><div class="win" data-ww-viewport tabindex="-1" role="application"><div style="width: 600px; height: 400px"></div></div>`);
    equal([own.win.getAttribute("tabindex"), own.win.getAttribute("role"), own.win.getAttribute("aria-label")], ["-1", "application", "Viewport"]);
    own.host.lang = "de";
    await until(() => own.win.getAttribute("aria-label") === "Ansicht", "the fallback label did not follow the language");
    own.win.setAttribute("aria-label", "Mine");
    own.core.refresh();
    equal(own.win.getAttribute("aria-label"), "Mine", "a label the widget sets later is not overwritten");
    own.host.remove();
    equal([own.win.getAttribute("tabindex"), own.win.getAttribute("role"), own.win.getAttribute("aria-label")], ["-1", "application", "Mine"], "on disconnect only the module's own values are removed");

    const labelled = await probe(`<style>.win { width: 300px; height: 200px; }</style><span id="name">Plan</span><div class="win" data-ww-viewport aria-labelledby="name"><div style="width: 600px; height: 400px"></div></div>`);
    equal(labelled.win.hasAttribute("aria-label"), false, "no fallback label beside aria-labelledby");
});

check("viewport: keys work while the window has focus, and only then", async () => {
    const { view, stage } = await diagram();
    stage.focus();
    assert(deepActive() === stage);
    const start = view.viewport.scale;
    assert(!key("+"), "+ is consumed");
    assert(near(view.viewport.scale, start * 1.2, 1e-9));
    assert(!key("-"));
    assert(near(view.viewport.scale, start, 1e-9));
    assert(!key("="), "= is the unshifted +");
    assert(!key("−"), "and the real minus sign works too");
    assert(near(view.viewport.scale, start, 1e-9));
    key("+");
    assert(!key("0"), "0 is consumed");
    equal(view.viewport.scale, fitted(stage), "0 returns to the fitted view");
    assert(key("ArrowRight"), "arrow keys are left to native scrolling");
    assert(key("+", stage, { ctrlKey: true }), "Ctrl + plus stays the browser's zoom");

    $(view, ".toolbar button").focus();
    assert(key("+"), "a key pressed elsewhere in the widget is not consumed");
    equal(view.viewport.scale, fitted(stage));
});

check("viewport: a tap of Space is still page-down, and only a drag makes it the hand", async () => {
    const { view, stage, world } = await diagram();
    const up = (init: KeyboardEventInit = {}) => stage.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true, composed: true, ...init }));
    view.viewport.zoomTo(2);
    stage.scrollTo(300, 0);
    await frame(2);
    stage.focus();
    assert(!key(" "), "Space is held back while the window has focus");
    equal(stage.scrollTop, 0, "nothing scrolls while it is held");
    up();
    const page = Math.round(stage.clientHeight * 0.875);
    await until(() => stage.scrollTop > 0, "the released tap did not scroll");
    assert(near(stage.scrollTop, page, 1), `one page down: ${stage.scrollTop} instead of ${page}`);
    equal(stage.scrollLeft, 300);
    key(" ");
    up({ shiftKey: true });
    await until(() => stage.scrollTop < page, "Shift + Space did not scroll back");
    assert(near(stage.scrollTop, 0, 1), "Shift + Space is page-up");

    // With a drag in between, the same key is the hand and scrolls nothing on release.
    const start = point(stage);
    key(" ");
    pointer(world, "pointerdown", start, { pointerType: "mouse" });
    pointer(world, "pointermove", { x: start.x - 40, y: start.y });
    await frame(2);
    pointer(world, "pointerup", { x: start.x - 40, y: start.y });
    await frame(2);
    const top = stage.scrollTop;
    up();
    await frame(3);
    equal([stage.scrollLeft, stage.scrollTop], [340, top], "the drag panned, and the release did not page");

    // Focus that leaves ends the hold without scrolling.
    key(" ");
    $(view, ".toolbar button").focus();
    stage.focus();
    up();
    await frame(3);
    equal(stage.scrollTop, top);
});

check("viewport: client points convert to world coordinates and back", async () => {
    const { view, stage } = await diagram();
    const node = $$<SVGCircleElement>(view, ".node")[1]; // authored at 600,400
    const at = () => point(node);
    const world = () => view.viewport.toWorld(at().x, at().y);
    assert(near(world().x, 600, 0.5) && near(world().y, 400, 0.5), `fitted: ${JSON.stringify(world())}`);
    view.viewport.zoomTo(2);
    stage.scrollTo(700, 500);
    await frame(2);
    assert(near(world().x, 600, 0.5) && near(world().y, 400, 0.5), `zoomed and scrolled: ${JSON.stringify(world())}`);
    const corner = stage.getBoundingClientRect();
    equal(view.viewport.toWorld(corner.left, corner.top), { x: 350, y: 250 }, "the window's corner shows the scrolled-to point");
    const back = view.viewport.toClient(600, 400);
    assert(near(back.x, at().x, 0.5) && near(back.y, at().y, 0.5), "toClient is the inverse");

    // The widget's own action uses it: a new node lands in the middle of the view.
    const centre = view.viewport.toWorld(middle(stage).x, middle(stage).y);
    view.add();
    await settled(view);
    equal(view.points.at(-1), { x: Math.round(centre.x), y: Math.round(centre.y) });
});

check("undo: Unlock in the toolbar is one undo step, and the step holds the attribute of the permission", async () => {
    const { view } = await diagram(`contenteditable style="width: 600px"`);
    const unlock = $$<HTMLButtonElement>(view, ".toolbar button").find((button) => button.textContent!.trim() === "Unlock")!;
    const steps = transactionSteps(view, () => view.hasAttribute("allow-panning"));
    unlock.click();
    await until(() => view.hasAttribute("allow-panning"), "Unlock did not reach the attribute");
    await settled(view);
    equal(unlock.getAttribute("aria-pressed"), "true");
    unlock.click();
    await until(() => !view.hasAttribute("allow-panning"), "the second press did not take the attribute away");
    await settled(view);
    // Each step starts before Lit wrote the attribute and ends after it: the editor undoes the write as one step.
    equal(steps.stop(), ["start false", "end true", "start true", "end false"]);
});

check("viewport: a gesture reads world coordinates through `convert`, also while the view moves", async () => {
    const { view, stage } = await diagram();
    view.viewport.zoomTo(2);
    stage.scrollTo(100, 100);
    await frame(2);
    const start = point(stage, 0.3, 0.3);
    const down = new PointerEvent("pointerdown", { pointerId: 7, clientX: start.x, clientY: start.y });
    // `toWorld` is bound, so it is passed as it is.
    const gesture = new PointerGesture(stage, down, { convert: view.viewport.toWorld });
    const samples: { x: number; y: number; dx: number; dy: number }[] = [];
    const done = (async () => {
        for await (const sample of gesture) samples.push(sample);
    })();
    equal(gesture.last, { ...view.viewport.toWorld(start.x, start.y), dx: 0, dy: 0, clientX: start.x, clientY: start.y }, "the press is in world coordinates");
    pointer(stage, "pointermove", { x: start.x + 60, y: start.y + 20 });
    await until(() => samples.length === 1);
    assert(near(samples[0].dx, 30) && near(samples[0].dy, 10), `60 px on screen are 30 in the world at 200 %: ${JSON.stringify(samples[0])}`);
    // The view scrolls under a resting pointer: the next sample is 40 world units further.
    stage.scrollBy(80, 0);
    await frame(2);
    pointer(stage, "pointermove", { x: start.x + 60, y: start.y + 21 });
    await until(() => samples.length === 2);
    assert(near(samples[1].dx, 70) && near(samples[1].dy, 10.5), `after scrolling: ${JSON.stringify(samples[1])}`);
    pointer(stage, "pointerup", { x: start.x + 60, y: start.y + 21 });
    await done;
});

check("viewport: an author's drag of a node is the widget's press, in world coordinates, and one undo step", async () => {
    const { view, stage } = await diagram(`allow-panning contenteditable style="width: 600px"`);
    view.viewport.zoomTo(2);
    stage.scrollTo(100, 100);
    await frame(2);
    await until(() => view.hasAttribute("view"), "the author's view was not saved"); // its undo step is not the one counted below
    await settled(view);
    const node = $$<SVGCircleElement>(view, ".node")[0]; // authored at 150,150
    const start = point(node);
    const log = events("ww-transactionstart", "ww-transactionend");
    assert(!pointer(node, "pointerdown", start, { pointerType: "mouse" }), "the widget claims the press with preventDefault()");
    pointer(node, "pointermove", { x: start.x + 80, y: start.y + 40 });
    await until(() => near(Number($$<SVGCircleElement>(view, ".node")[0].getAttribute("cx")), 190), "the node did not follow the pointer");
    equal([stage.scrollLeft, stage.scrollTop], [100, 100], "a claimed press does not pan");
    equal(view.nodes.split(" ")[0], "150,150", "nothing is written while the drag runs");
    pointer(node, "pointerup", { x: start.x + 80, y: start.y + 40 });
    await until(() => view.nodes.startsWith("190,170"), `80 × 40 px on screen are 40 × 20 in the world: ${view.nodes}`);
    await settled(view);
    equal(log.stop(), ["ww-transactionstart", "ww-transactionend"]);

    // Space or the middle button is the module's claim, made on the way down, and the widget respects it.
    stage.focus();
    key(" ");
    const again = point($$<SVGCircleElement>(view, ".node")[0]);
    pointer($$(view, ".node")[0], "pointerdown", again, { pointerType: "mouse" });
    pointer($$(view, ".node")[0], "pointermove", { x: again.x - 30, y: again.y });
    await frame(2);
    pointer($$(view, ".node")[0], "pointerup", { x: again.x - 30, y: again.y });
    await frame(2);
    equal(stage.scrollLeft, 130, "with Space held the drag pans");
    assert(view.nodes.startsWith("190,170"), "and the node stays");
    stage.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true, composed: true }));
});

check("viewport: a reader pans and zooms only if `can` allows it", async () => {
    const { view, stage, world, button } = await diagram(`style="width: 600px"`);
    const start = view.viewport.scale;
    equal(getComputedStyle(stage).overflowX, "hidden", "no native panning for a reader without the permission");
    assert(!wheel(world, point(stage), { deltaY: -120, ctrlKey: true }), "the zoom gesture is not consumed");
    stage.focus();
    assert(key("+"), "keys are not consumed");
    assert(key(" "), "nor is Space");
    button("in").click();
    pointer(world, "pointerdown", point(stage), { pointerType: "mouse" });
    pointer(world, "pointermove", point(stage, 0.3, 0.3));
    await frame(2);
    pointer(world, "pointerup", point(stage, 0.3, 0.3));
    equal([view.viewport.scale, view.viewport.x, view.viewport.y], [start, 0, 0], "nothing changed the view");
    equal(["out", "in", "reset", "fit"].map((name) => button(name).getAttribute("aria-disabled")), ["true", "true", "true", "true"]);
    view.viewport.zoomTo(1);
    equal(view.viewport.scale, 1, "the widget's own calls are not gated");
    view.viewport.fit();

    view.setAttribute("allow-panning", "");
    await settled(view);
    equal(getComputedStyle(stage).overflowX, "auto");
    equal(button("in").hasAttribute("aria-disabled"), false);
    assert(wheel(world, point(stage), { deltaY: -120, ctrlKey: true }), "with the permission the gesture works");
    assert(view.viewport.scale > start);

    view.removeAttribute("allow-panning");
    view.setAttribute("contenteditable", "");
    await settled(view);
    equal(getComputedStyle(stage).overflowX, "auto", "an author may always");
});

check("viewport: a running pan is cancelled when `can` turns false", async () => {
    const { view, stage, world } = await diagram();
    view.viewport.zoomTo(1);
    stage.scrollTo(300, 200);
    await frame(2);
    const before = listeners();
    const start = point(stage);
    pointer(world, "pointerdown", start, { pointerType: "mouse" });
    pointer(world, "pointermove", { x: start.x - 50, y: start.y - 30 });
    await frame(2);
    equal([stage.scrollLeft, stage.scrollTop], [350, 230]);
    // The author withdraws the permission while the reader drags: undo, or a collaborator.
    view.removeAttribute("allow-panning");
    await until(() => stage.scrollLeft === 300, "the pan was not taken back");
    equal(stage.scrollTop, 200, "the view is the one before the drag");
    equal(listeners(), before, "the gesture is over");
    pointer(world, "pointermove", { x: start.x - 90, y: start.y - 30 });
    await frame(2);
    equal(stage.scrollLeft, 300, "and no longer follows the pointer");
    pointer(world, "pointerup", start);
});

check("viewport: a drag on empty background pans, Escape cancels it, a press on content does not pan", async () => {
    const { view, stage, world } = await diagram();
    view.viewport.zoomTo(1);
    stage.scrollTo(300, 200);
    await frame(2);
    const start = point(stage);
    const moved = { x: start.x - 50, y: start.y - 30 };

    pointer(world, "pointerdown", start, { pointerType: "mouse" });
    pointer(world, "pointermove", moved);
    await frame(2);
    equal([stage.scrollLeft, stage.scrollTop], [350, 230], "the content follows the pointer");
    pointer(world, "pointerup", moved);
    await frame(2);
    equal([stage.scrollLeft, stage.scrollTop], [350, 230]);

    pointer(world, "pointerdown", start, { pointerType: "mouse" });
    pointer(world, "pointermove", moved);
    await frame(2);
    equal(stage.scrollLeft, 400);
    key("Escape", window);
    await frame(2);
    equal([stage.scrollLeft, stage.scrollTop], [350, 230], "Escape returns to the view before the drag");

    // A press on the window itself, beside the world, is empty background too.
    pointer(stage, "pointerdown", start, { pointerType: "mouse" });
    pointer(stage, "pointermove", moved);
    await frame(2);
    pointer(stage, "pointerup", moved);
    equal(stage.scrollLeft, 400, "a press on the window element pans");
    stage.scrollTo(350, 230);
    await frame(2);

    const node = $(view, ".node");
    pointer(node, "pointerdown", start, { pointerType: "mouse" });
    pointer(node, "pointermove", moved);
    await frame(2);
    pointer(node, "pointerup", moved);
    equal(stage.scrollLeft, 350, "a press on a node is the widget's");

    // The widget claims a press on the background with preventDefault(), and the module does not pan.
    const claim = (event: Event) => event.preventDefault();
    world.addEventListener("pointerdown", claim);
    pointer(world, "pointerdown", start, { pointerType: "mouse" });
    pointer(world, "pointermove", moved);
    await frame(2);
    pointer(world, "pointerup", moved);
    world.removeEventListener("pointerdown", claim);
    equal(stage.scrollLeft, 350, "a claimed press on the background does not pan");

    assert(!pointer(node, "pointerdown", start, { pointerType: "mouse", button: 1 }), "the module claims the middle button, which also stops autoscroll");
    pointer(node, "pointermove", moved);
    await frame(2);
    pointer(node, "pointerup", moved);
    equal(stage.scrollLeft, 400, "the middle button pans from anywhere");

    pointer(world, "pointerdown", start, { pointerType: "touch" });
    pointer(world, "pointermove", moved, { pointerType: "touch" });
    await frame(2);
    pointer(world, "pointerup", moved, { pointerType: "touch" });
    equal(stage.scrollLeft, 400, "touch is left to native panning");
    // A second finger is the browser's too: no pinch in the scroll form.
    pointer(world, "pointerdown", start, { pointerType: "touch", pointerId: 1 });
    pointer(world, "pointerdown", moved, { pointerType: "touch", pointerId: 2 });
    pointer(world, "pointermove", { x: moved.x - 80, y: moved.y }, { pointerType: "touch", pointerId: 2 });
    await frame(2);
    pointer(world, "pointerup", moved, { pointerType: "touch", pointerId: 2 });
    pointer(world, "pointerup", start, { pointerType: "touch", pointerId: 1 });
    equal(view.viewport.scale, 1, "two fingers do not zoom the scroll form");

    stage.focus();
    assert(!key(" "), "Space is consumed while the window has focus");
    assert(!pointer(node, "pointerdown", start, { pointerType: "mouse" }), "with Space held the module claims the press");
    pointer(node, "pointermove", moved);
    await frame(2);
    pointer(node, "pointerup", moved);
    equal(stage.scrollLeft, 450, "with Space held a drag pans from anywhere");
    stage.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true, composed: true }));
    pointer(node, "pointerdown", start, { pointerType: "mouse" });
    pointer(node, "pointermove", moved);
    await frame(2);
    pointer(node, "pointerup", moved);
    equal(stage.scrollLeft, 450, "and no longer after Space is released");
});

check("viewport: panning can be restricted to one axis", async () => {
    const { view, stage, world } = await diagram();
    stage.setAttribute("data-ww-viewport-pan", "x");
    view.viewport.zoomTo(1);
    await frame(2);
    equal([getComputedStyle(stage).overflowX, getComputedStyle(stage).overflowY], ["auto", "hidden"], "the other axis does not scroll");
    equal(stage.scrollTop, 0);
    const left = stage.scrollLeft;
    wheel(world, point(stage, 0.8, 0.8), { deltaY: -200, ctrlKey: true });
    equal(stage.scrollTop, 0, "zooming does not move the locked axis");
    assert(stage.scrollLeft > left, "and still follows the pointer on the free axis");
    stage.focus();
    key(" ");
    stage.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true, composed: true }));
    await frame(3);
    equal(stage.scrollTop, 0, "nor does a tap of Space");
    stage.setAttribute("data-ww-viewport-pan", "y");
    equal([getComputedStyle(stage).overflowX, getComputedStyle(stage).overflowY], ["hidden", "auto"]);
    stage.removeAttribute("data-ww-viewport-pan");

    const { view: boxes, canvas } = await canvasView();
    boxes.viewport.zoomTo(1);
    canvas.setAttribute("data-ww-viewport-pan", "y");
    const { x, y } = boxes.viewport;
    wheel(canvas, point(canvas), { deltaX: 30, deltaY: 50 });
    equal([boxes.viewport.x, boxes.viewport.y], [x, y - 50], "canvas form: the same restriction on the tracked view");
});

check("viewport: the view is saved to the named attribute as one undo step", async () => {
    const { view, stage, world, button } = await diagram(`allow-panning contenteditable style="width: 600px"`);
    equal(view.hasAttribute("view"), false, "opening writes nothing");
    const log = events("ww-transactionstart", "ww-transactionend");
    const changes = mutations(view);
    for (let i = 0; i < 4; i++) wheel(world, point(stage), { deltaY: -100, ctrlKey: true });
    equal(view.hasAttribute("view"), false, "nothing is written while the view is moving");
    await until(() => view.hasAttribute("view"), "the view was not saved");
    await settled(view);
    equal(log.stop(), ["ww-transactionstart", "ww-transactionend"], "one gesture is one transaction");
    equal(changes.stop().filter((record) => record.target === view).map((record) => record.attributeName), ["view"], "and one write");
    const [x, y, scale] = view.getAttribute("view")!.split(" ").map(Number);
    const centre = view.viewport.toWorld(middle(stage).x, middle(stage).y);
    assert(near(x, centre.x, 1) && near(y, centre.y, 1) && near(scale, view.viewport.scale, 0.001), `saved "${view.getAttribute("view")}": the world point at the centre, and the scale`);

    // From outside: undo or a collaborator changes the attribute.
    view.setAttribute("view", "300 200 2");
    await frame(2);
    equal(view.viewport.scale, 2);
    const shown = view.viewport.toWorld(middle(stage).x, middle(stage).y);
    assert(near(shown.x, 300, 1) && near(shown.y, 200, 1), "the saved point is in the centre of the window");
    await wait(300);
    equal(view.getAttribute("view"), "300 200 2", "applying it writes nothing back");

    // Undo of the first save removes the attribute: the view is fitted again.
    view.removeAttribute("view");
    await until(() => view.viewport.scale === fitted(stage), "removing the attribute from outside did not fit the view");

    wheel(world, point(stage), { deltaY: -100, ctrlKey: true });
    await until(() => view.hasAttribute("view"));
    button("fit").click();
    await until(() => !view.hasAttribute("view"), "returning to the fitted view removes the attribute");
});

check("viewport: a save waits for the view to rest, asks `can` again, and its undo step spans the render", async () => {
    let allowed = true;
    let rendered!: () => void;
    const template = `<style>.win { width: 300px; height: 200px; }</style><div class="win" data-ww-viewport data-ww-viewport-save="view"><div style="width: 900px; height: 600px"></div></div>`;
    const { host, core, win } = await probe(template, { can: () => allowed, rendered: () => new Promise<void>((done) => (rendered = done)) });
    const world = win.firstElementChild!;

    // The answer turns false between the gesture and the write.
    assert(wheel(world, point(win), { deltaY: -100, ctrlKey: true }));
    allowed = false;
    await wait(350);
    equal(host.hasAttribute("view"), false, "`can` is asked again before the view is written");

    allowed = true;
    core.refresh();
    const started = performance.now();
    wheel(world, point(win), { deltaY: -100, ctrlKey: true });
    await wait(100);
    wheel(world, point(win), { deltaY: -100, ctrlKey: true }); // still moving: the wait starts again
    await until(() => host.hasAttribute("view"), "the view was not saved");
    assert(performance.now() - started >= 290, "written 200 ms after the last change, not after the first");
    equal(transactionOpen(host), true, "the transaction is open until the widget rendered");
    rendered();
    await until(() => !transactionOpen(host), "the transaction did not end with the render");

    // A reader's native scrolling is a view change like any other.
    const saved = host.getAttribute("view");
    win.scrollBy(40, 0);
    await until(() => host.getAttribute("view") !== saved, "scrolling was not saved");
    rendered();
});

check("viewport: a saved view opens instead of the fitted one, and `canSave` narrows who saves", async () => {
    const { view, stage, world } = await diagram(`allow-panning view="600 400 1.5" style="width: 600px"`);
    equal(view.viewport.scale, 1.5);
    const centre = view.viewport.toWorld(middle(stage).x, middle(stage).y);
    assert(near(centre.x, 600, 1) && near(centre.y, 400, 1), JSON.stringify(centre));
    view.style.width = "500px";
    await frame(3);
    equal(view.viewport.scale, 1.5, "a saved view does not follow the window size");
    wheel(world, point(stage), { deltaY: -100, ctrlKey: true });
    await wait(400);
    equal(view.getAttribute("view"), "600 400 1.5", "`canSave` refused the reader's change");

    const broken = await diagram(`allow-panning view="left 4" style="width: 600px"`);
    equal(broken.view.viewport.scale, fitted(broken.stage), "an attribute that holds no view opens fitted");
    const limited = await diagram(`allow-panning view="600 400 9" style="width: 600px"`);
    equal(limited.view.viewport.scale, 3, "a saved scale is clamped to the limits");
});

check("viewport: a window that the template replaces shows the same view", async () => {
    const swap = await mount<WindowSwapProbe>(`<ww-window-swap-probe></ww-window-swap-probe>`);
    await until(() => swap.viewport.width > 0);
    const first = $(swap, "#a");
    swap.viewport.zoomTo(1.5);
    first.scrollTo(240, 150);
    await until(() => swap.viewport.x === -240);
    const centre = swap.viewport.toWorld(middle(first).x, middle(first).y);
    swap.second = true;
    await settled(swap);
    const second = $(swap, "#b");
    assert(second && !first.isConnected, "the render replaced the window element");
    await until(() => second.scrollLeft > 0, "the new window opened without the view");
    equal(swap.viewport.scale, 1.5);
    const shown = swap.viewport.toWorld(middle(second).x, middle(second).y);
    assert(near(shown.x, centre.x, 1) && near(shown.y, centre.y, 1), `the same world point is in the centre: ${JSON.stringify(shown)} instead of ${JSON.stringify(centre)}`);
    equal([second.tabIndex, second.getAttribute("role")], [0, "group"], "the new window is prepared like the first");

    // A fitted view stays a fitted view.
    swap.viewport.fit();
    swap.second = false;
    await settled(swap);
    await until(() => $(swap, "#a").isConnected && swap.viewport.width > 0);
    await frame(2);
    equal(swap.viewport.scale, Math.floor((200 / 600) * 1000) / 1000);
});

check("viewport: more than one marked window is reported in development", async () => {
    const log = warnings();
    const two = `<style>.win { width: 300px; height: 200px; }</style>
        <div class="win" id="one" data-ww-viewport><div style="width: 600px; height: 400px"></div></div>
        <div class="win" id="two" data-ww-viewport><div style="width: 600px; height: 400px"></div></div>`;
    const { host, core, win } = await probe(two);
    core.refresh();
    const messages = log.stop();
    equal(messages.length, 1, "once per widget class");
    assert(/2 elements are marked data-ww-viewport/.test(messages[0]) && messages[0].includes("ww-viewport-probe"), messages[0]);
    equal(win.id, "one", "the first one is the viewport");
    equal(host.shadowRoot!.querySelector<HTMLElement>("#two")!.hasAttribute("tabindex"), false, "the other one is left alone");
});

check("viewport: everything is released on disconnect", async () => {
    const before = listeners();
    const { view, stage, world } = await diagram(`allow-panning contenteditable style="width: 600px"`);
    const root = view.shadowRoot!;
    const sheets = root.adoptedStyleSheets.length;
    wheel(world, point(stage), { deltaY: -100, ctrlKey: true }); // a save is now pending
    pointer(world, "pointerdown", point(stage), { pointerType: "mouse" }); // and a gesture is open
    assert(listeners() > before, "an open gesture listens on the window");
    const parent = view.parentElement!;
    view.remove();
    equal(listeners(), before, "no listener is left on window or document");
    equal(root.adoptedStyleSheets.length, sheets - 3, "the sheets of Permissions, Viewport and Help are gone");
    equal(root.querySelectorAll("[data-ww-viewport-action]").length, 0, "the buttons are gone");
    equal([stage.hasAttribute("tabindex"), stage.hasAttribute("role")], [false, false], "attributes the module added are gone");
    equal(stage.getAttribute("aria-label"), "Diagram", "the template's own attribute stays");
    await wait(400);
    equal(view.hasAttribute("view"), false, "a pending save does not write after the disconnect");

    parent.append(view);
    await until(() => root.querySelectorAll("[data-ww-viewport-action]").length === 4, "the module did not come back");
    await until(() => view.viewport.scale === fitted(stage), "the reconnected widget did not open fitted");
});

// ── Viewport, canvas form ─────────────────────────────────────────────────

check("canvas: opens fitted to the bounds the widget names", async () => {
    const { view, canvas } = await canvasView();
    const scale = Math.floor(Math.min(canvas.clientWidth / 800, canvas.clientHeight / 500) * 1000) / 1000;
    equal(view.viewport.scale, scale);
    assert(near(view.viewport.x, (canvas.clientWidth - 800 * scale) / 2, 1e-9) && near(view.viewport.y, (canvas.clientHeight - 500 * scale) / 2, 1e-9), "the drawing is centred");
    equal([canvas.tabIndex, canvas.getAttribute("role"), canvas.getAttribute("aria-label")], [0, "group", "Boxes"]);
    equal(getComputedStyle(canvas).touchAction, "none", "touch input goes to the module");
    equal([view.viewport.width, view.viewport.height], [canvas.clientWidth, canvas.clientHeight], "the state holds the size of the window");
});

check("canvas: the wheel pans, Ctrl+wheel zooms about the pointer, and the widget redraws", async () => {
    const { view, canvas } = await canvasView();
    assert(!wheel(canvas, point(canvas), { deltaY: 50 }), "a fitted view has nowhere to go: the wheel is left to the page, as at the end of a scroll range");
    view.viewport.zoomTo(1);
    await settled(view);
    const { x, y } = view.viewport;
    const draws = view.draws;
    assert(wheel(canvas, point(canvas), { deltaX: 30, deltaY: 50 }), "the module consumes the wheel: there is no native scrolling");
    equal([view.viewport.x, view.viewport.y], [x - 30, y - 50]);
    await settled(view);
    assert(view.draws > draws, "a change of the view requests an update");
    assert(wheel(canvas, point(canvas), { deltaY: 20, shiftKey: true }), "Shift turns the wheel sideways");
    equal([view.viewport.x, view.viewport.y], [x - 50, y - 50]);
    assert(wheel(canvas, point(canvas), { deltaY: 2, deltaMode: 1 }), "lines are 16 px");
    equal(view.viewport.y, y - 82);

    const at = point(canvas, 0.4, 0.6);
    const before = view.viewport.toWorld(at.x, at.y);
    for (const deltaY of [-150, -150, 200]) {
        assert(wheel(canvas, at, { deltaY, ctrlKey: true }));
        const after = view.viewport.toWorld(at.x, at.y);
        assert(near(after.x, before.x, 1e-9) && near(after.y, before.y, 1e-9), "the world point under the pointer stays exactly");
    }
    const back = view.viewport.toClient(before.x, before.y);
    assert(near(back.x, at.x, 1e-9) && near(back.y, at.y, 1e-9), "toClient is the inverse");
    for (let i = 0; i < 30; i++) wheel(canvas, at, { deltaY: -300, ctrlKey: true });
    equal(view.viewport.scale, 4, "the limits apply");
});

check("canvas: every change of the view and every resize re-renders the widget", async () => {
    const { view, canvas } = await canvasView();
    view.viewport.zoomTo(1);
    await settled(view);
    let draws = view.draws;
    view.viewport.panBy(-10, -10);
    await settled(view);
    assert(view.draws > draws, "a pan draws");
    draws = view.draws;
    const width = view.viewport.width;
    view.style.width = "420px";
    await until(() => view.viewport.width < width, "the size in the state did not follow");
    await settled(view);
    equal(view.viewport.width, canvas.clientWidth);
    assert(view.draws > draws, "a resize draws");
});

check("canvas: the content's bounds limit panning as a scroll range does", async () => {
    // 800 × 500 content in a window of 400 × 200.
    const bounds = { x: 100, y: 50, width: 800, height: 500 };
    const { host, core, win, view } = await probe(surface, { bounds: () => bounds });
    equal(view().scale, 0.4, "fitted: 200 / 500");
    equal([view().x, view().y], [(400 - 320) / 2 - 40, -20], "centred, with the bounds' own origin taken off");

    // Larger than the window: the content's edges stop at the window's edges.
    core.zoomTo(1);
    core.panBy(5000, 5000);
    equal([view().x, view().y], [-100, -50], "the top-left corner of the content stops in the corner of the window");
    equal(core.toWorld(point(win, 0, 0).x, point(win, 0, 0).y), { x: 100, y: 50 });
    core.panBy(-5000, -5000);
    equal([view().x, view().y], [400 - 900, 200 - 550], "and so does the bottom-right one");
    assert(!wheel(win, point(win), { deltaY: 40 }), "at the limit the wheel is not consumed, so the page scrolls on");
    assert(wheel(win, point(win), { deltaY: -40 }), "back inside it is");

    // Smaller than the window: the content stays wholly inside it.
    core.zoomTo(0.25);
    core.panBy(-5000, -5000);
    equal([view().x, view().y], [-25, -12.5], "pushed to the left and up, it stops at the window's corner");
    core.panBy(5000, 5000);
    equal([view().x, view().y], [400 - 225, 200 - 137.5], "pushed to the right and down, it stops at the other corner");

    // Zooming about a point holds as far as the limits allow, as in the scroll form.
    core.fit();
    const corner = point(win, 0, 0);
    core.zoomTo(0.8, { x: corner.x, y: corner.y });
    equal([view().x, view().y], [-80, -40], "zooming about a point outside the content brings the content's corner to the window's");

    // A drag stops at the same limits.
    core.panBy(-100, -50);
    equal([view().x, view().y], [-180, -90]);
    const start = point(win);
    pointer(win, "pointerdown", start, { pointerType: "mouse" });
    pointer(win, "pointermove", { x: start.x + 300, y: start.y + 300 });
    await until(() => view().x === -80 && view().y === -40, "a drag did not stop at the limits");
    pointer(win, "pointerup", { x: start.x + 300, y: start.y + 300 });
    await frame(2);

    // The window shrinks: a view that is not fitted is brought back inside the limits.
    core.panBy(-5000, -5000);
    equal(view().x, 400 - 720);
    host.shadowRoot!.querySelector("style")!.textContent = ".win { width: 600px; height: 200px; }";
    await until(() => view().width === 600, "the resize did not reach the state");
    equal(view().x, 600 - 720, "the right edge of the content follows the window's");

    // Without bounds panning is unlimited and fit is 100 % at the origin.
    const free = await probe(surface);
    equal([free.view().scale, free.view().x, free.view().y], [1, 0, 0]);
    free.core.panBy(-5000, 7000);
    equal([free.view().x, free.view().y], [-5000, 7000]);
});

check("canvas: `margin` lets the content be panned past its bounds", async () => {
    const { core, view } = await probe(surface, { bounds: () => ({ x: 0, y: 0, width: 800, height: 500 }), margin: 30 });
    core.zoomTo(1);
    core.panBy(5000, 5000);
    equal([view().x, view().y], [30, 30]);
    core.panBy(-5000, -5000);
    equal([view().x, view().y], [400 - 800 - 30, 200 - 500 - 30]);
});

check("canvas: arrow keys, drag and fit", async () => {
    const { view, canvas } = await canvasView();
    const fittedView = [view.viewport.x, view.viewport.y, view.viewport.scale];
    canvas.focus();
    assert(!key("+"));
    assert(near(view.viewport.scale, fittedView[2] * 1.2, 1e-9));
    view.viewport.zoomTo(1);
    const origin = [view.viewport.x, view.viewport.y];
    assert(!key("ArrowRight"), "arrow keys are the module's here");
    assert(!key("ArrowDown"));
    equal([view.viewport.x, view.viewport.y], [origin[0] - 40, origin[1] - 40]);
    assert(!key("ArrowLeft") && !key("ArrowUp"));
    equal([view.viewport.x, view.viewport.y], origin);
    assert(!key(" "), "Space is the hand; there is no page to scroll here");

    const { x, y } = view.viewport;
    const start = point(canvas);
    pointer(canvas, "pointerdown", start, { pointerType: "touch" });
    pointer(canvas, "pointermove", { x: start.x + 25, y: start.y - 10 }, { pointerType: "touch" });
    await frame(2);
    equal([view.viewport.x, view.viewport.y], [x + 25, y - 10], "a drag pans, also with touch");
    key("Escape", window);
    await frame(2);
    equal([view.viewport.x, view.viewport.y], [x, y], "Escape cancels the drag");

    key("0");
    equal([view.viewport.x, view.viewport.y, view.viewport.scale], fittedView, "0 returns to the fitted view");
});

check("canvas: two fingers pinch about the point between them, and the remaining finger goes on panning", async () => {
    const { view, canvas } = await canvasView();
    const fittedView = [view.viewport.x, view.viewport.y, view.viewport.scale];
    const before = listeners();
    const touch = (id: number) => ({ pointerType: "touch", pointerId: id, isPrimary: id === 1 });
    const [a, b] = [point(canvas, 0.4, 0.5), point(canvas, 0.6, 0.5)];
    const mid = { x: (a.x + b.x) / 2, y: a.y };
    const pinned = view.viewport.toWorld(mid.x, mid.y);

    pointer(canvas, "pointerdown", a, touch(1));
    assert(!pointer(canvas, "pointerdown", b, touch(2)), "the module claims the second finger");
    // Twice as far apart, about the same middle.
    pointer(canvas, "pointermove", { x: a.x - 50, y: a.y }, touch(1));
    pointer(canvas, "pointermove", { x: b.x + 50, y: b.y }, touch(2));
    assert(near(view.viewport.scale, fittedView[2] * 2, 1e-9), `twice the distance is twice the scale: ${view.viewport.scale}`);
    let now = view.viewport.toWorld(mid.x, mid.y);
    assert(near(now.x, pinned.x, 1e-6) && near(now.y, pinned.y, 1e-6), "the world point between the fingers stays");

    // Both fingers move together: the content follows.
    pointer(canvas, "pointermove", { x: a.x - 30, y: a.y + 10 }, touch(1));
    pointer(canvas, "pointermove", { x: b.x + 70, y: b.y + 10 }, touch(2));
    now = view.viewport.toWorld(mid.x + 20, mid.y + 10);
    assert(near(now.x, pinned.x, 1e-6) && near(now.y, pinned.y, 1e-6), "moving both fingers pans");
    assert(near(view.viewport.scale, fittedView[2] * 2, 1e-9));

    // One finger lifts; the other one pans on.
    pointer(canvas, "pointerup", { x: b.x + 70, y: b.y + 10 }, touch(2));
    const { x, y, scale } = view.viewport;
    pointer(canvas, "pointermove", { x: a.x - 50, y: a.y - 10 }, touch(1));
    await until(() => view.viewport.x === x - 20, "the remaining finger did not pan");
    equal([view.viewport.y, view.viewport.scale], [y - 20, scale]);
    pointer(canvas, "pointerup", { x: a.x - 50, y: a.y - 10 }, touch(1));
    await frame(2);
    equal(listeners(), before, "every gesture is over");
    equal([view.viewport.x, view.viewport.y, view.viewport.scale], [x - 20, y - 20, scale], "the release keeps the view");

    // The limits hold, and Escape returns to the view before the first finger.
    view.viewport.fit();
    pointer(canvas, "pointerdown", a, touch(1));
    pointer(canvas, "pointerdown", b, touch(2));
    pointer(canvas, "pointermove", { x: b.x + 5000, y: b.y }, touch(2));
    equal(view.viewport.scale, 4, "a pinch stops at the maximum");
    key("Escape", window);
    equal([view.viewport.x, view.viewport.y, view.viewport.scale], fittedView, "Escape cancels the pinch");
    equal(listeners(), before);
    pointer(canvas, "pointerup", b, touch(2));
    pointer(canvas, "pointerup", a, touch(1));

    // A mouse press during a touch is no pinch.
    pointer(canvas, "pointerdown", a, touch(1));
    pointer(canvas, "pointerdown", b, { pointerType: "mouse", pointerId: 9 });
    pointer(canvas, "pointermove", { x: b.x + 80, y: b.y }, { pointerType: "mouse", pointerId: 9 });
    await frame(2);
    equal(view.viewport.scale, fittedView[2]);
    key("Escape", window);
    await frame(2);
    equal(listeners(), before);
});

check("canvas: a pinch is cancelled when `can` turns false", async () => {
    let allowed = true;
    const { host, core, win, view } = await probe(surface, { bounds: () => ({ x: 0, y: 0, width: 800, height: 500 }), can: () => allowed });
    const start = { ...view() };
    const [a, b] = [point(win, 0.4, 0.5), point(win, 0.6, 0.5)];
    pointer(win, "pointerdown", a, { pointerType: "touch", pointerId: 1 });
    pointer(win, "pointerdown", b, { pointerType: "touch", pointerId: 2 });
    pointer(win, "pointermove", { x: b.x + 80, y: b.y }, { pointerType: "touch", pointerId: 2 });
    assert(view().scale > start.scale);
    allowed = false;
    core.refresh(); // a render is when a widget's own condition changes
    equal(view(), start, "the view is the one before the pinch");
    equal(getComputedStyle(win).touchAction, "auto", "and touch input goes back to the page");
    pointer(win, "pointermove", { x: b.x + 120, y: b.y }, { pointerType: "touch", pointerId: 2 });
    equal(view(), start);
    host.remove();
});

check("canvas: the form works on any element, and a renderer follows the view with a subscription", async () => {
    const { view, win, layer } = await layerView();
    equal(view.viewport.core.form, "canvas", `data-ww-viewport="canvas" on a <div>`);
    equal([win.tabIndex, win.getAttribute("role"), getComputedStyle(win).touchAction, getComputedStyle(win).overflowX], [0, "group", "none", "hidden"], "prepared like a canvas, and not made a scroll container");
    equal(getComputedStyle(layer).zoom, "1", "the module does not scale the first child here");
    const transform = () => new DOMMatrix(getComputedStyle(layer).transform);
    const shows = () => near(transform().a, view.viewport.scale, 1e-6) && near(transform().e, view.viewport.x, 0.01) && near(transform().f, view.viewport.y, 0.01);
    // Two boxes: 500 × 300.
    equal(view.viewport.scale, Math.floor((win.clientHeight / 300) * 1000) / 1000, "fitted to the extent the renderer reports");
    assert(shows(), "the layer shows the view");

    // The subscription delivers every change at once, without waiting for a render.
    let calls = 0;
    const stop = view.viewport.core.subscribe(() => calls++);
    const box = $(view, ".box-1");
    const at = point(win);
    const before = view.viewport.toWorld(at.x, at.y);
    assert(wheel(box, at, { deltaY: -200, ctrlKey: true }), "input on the content reaches the viewport");
    assert(calls === 1 && shows(), "the renderer applied the new view synchronously");
    const after = view.viewport.toWorld(at.x, at.y);
    assert(near(after.x, before.x, 1e-6) && near(after.y, before.y, 1e-6), "and the point under the pointer stayed");
    const world = view.viewport.toWorld(point(box, 0, 0).x, point(box, 0, 0).y);
    assert(near(world.x, 300, 0.01) && near(world.y, 180, 0.01), `toWorld finds the box where it was drawn: ${JSON.stringify(world)}`);

    // Empty background is the window or its first child; a press on content is the widget's.
    const { x } = view.viewport;
    pointer(box, "pointerdown", point(box), { pointerType: "mouse" });
    pointer(box, "pointermove", point(box, 0.5, 2));
    await frame(2);
    pointer(box, "pointerup", point(box, 0.5, 2));
    equal(view.viewport.x, x, "a press on a box does not pan");
    const empty = point(win, 0.95, 0.9);
    pointer(win, "pointerdown", empty, { pointerType: "mouse" });
    pointer(win, "pointermove", { x: empty.x - 12, y: empty.y });
    await until(() => view.viewport.x === x - 12, "a drag on the window did not pan");
    pointer(win, "pointerup", { x: empty.x - 12, y: empty.y });
    assert(shows());

    // The content grows without a render of the widget: a fitted view fits again.
    view.viewport.fit();
    calls = 0;
    view.addBox();
    equal(view.viewport.scale, Math.floor((win.clientHeight / 500) * 1000) / 1000, "contentChanged() fitted the new extent");
    assert(calls > 0 && shows());
    // A view that is not fitted stays, inside the new limits.
    view.viewport.zoomTo(1);
    view.viewport.panBy(-5000, -5000);
    equal([view.viewport.x, view.viewport.y], [win.clientWidth - 800 - 20, win.clientHeight - 500 - 20], "limited to the extent, plus the margin of 20");
    stop();
});

check("canvas: everything is released on disconnect", async () => {
    const before = listeners();
    const { view, canvas } = await canvasView();
    const sheets = view.shadowRoot!.adoptedStyleSheets.length;
    pointer(canvas, "pointerdown", point(canvas, 0.4, 0.5), { pointerType: "touch", pointerId: 1 });
    pointer(canvas, "pointerdown", point(canvas, 0.6, 0.5), { pointerType: "touch", pointerId: 2 }); // a pinch is open
    assert(listeners() > before);
    view.remove();
    equal(listeners(), before);
    equal(view.shadowRoot!.adoptedStyleSheets.length, sheets - 1);
    equal(canvas.hasAttribute("tabindex"), false);
    assert(wheel(canvas, point(canvas), { deltaY: 10, ctrlKey: true }) === false, "a disconnected widget consumes nothing");
});
