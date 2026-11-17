import { assert, check, drag, equal, events, fakeFrames, frame, key, mount, mutations, point, run, until, warnings, type Point } from "../../test/harness";
import { html, LitElement } from "lit";
import { ShortcutsCore } from "@webwriter/widget/shortcuts";
import { ViewportCore, type ViewportFitDetail, type ViewportOptions, type WorldBox } from "@webwriter/widget/viewport";
import { Shortcuts } from "@webwriter/lit/shortcuts";
import { wheel } from "../diagram-view/helpers";
import "./index";
import { BOARD, type WorldView } from "./index";

// ── Probe: a core on a plain element ──────────────────────────────────────

/** A plain element on the core alone. `GapProbe.options` is taken by the next instance. */
class GapProbe extends HTMLElement {
    static options: ViewportOptions = {};
    core!: ViewportCore;
    /** Every `ww-viewportfit` that reached the host. */
    fits: ViewportFitDetail[] = [];
    connectedCallback() {
        if (!this.core) {
            this.core = new ViewportCore(this, GapProbe.options);
            GapProbe.options = {};
            this.addEventListener("ww-viewportfit", (event) => this.fits.push((event as CustomEvent<ViewportFitDetail>).detail));
        }
        this.core.connect();
        this.core.refresh();
    }
    disconnectedCallback() {
        this.core.disconnect();
    }
}
customElements.define("ww-gap-probe", GapProbe);

/** A canvas window of 400 × 200 that follows the width of its host, with the standard buttons. */
const surface = (attributes = "") => `<style>:host { display: block; } .win { width: 100%; height: 200px; }</style><div class="win" data-ww-viewport="canvas" ${attributes}><span data-ww-viewport-controls></span></div>`;

const BIG: WorldBox = { x: 0, y: 0, width: 800, height: 500 };
const SMALL: WorldBox = { x: 0, y: 0, width: 100, height: 50 };

async function probe(template: string, options: ViewportOptions = {}, attributes = `style="width: 400px"`) {
    GapProbe.options = options;
    const host = await mount<GapProbe>(`<ww-gap-probe ${attributes}><template shadowrootmode="open">${template}</template></ww-gap-probe>`);
    await until(() => host.core.getSnapshot().width > 0, "the probe's viewport never opened");
    await frame(2);
    const win = host.shadowRoot!.querySelector<HTMLElement>("[data-ww-viewport]")!;
    const corner = () => {
        const rect = win.getBoundingClientRect();
        return { x: rect.left + win.clientLeft, y: rect.top + win.clientTop };
    };
    return {
        host,
        core: host.core,
        win,
        view: () => host.core.getSnapshot(),
        /** A client point at a place of the window, in CSS pixels from its top-left corner. */
        at: (x: number, y: number): Point => ({ x: corner().x + x, y: corner().y + y }),
        /** The world point in the centre of the window. */
        centre: () => host.core.toWorld(corner().x + win.clientWidth / 2, corner().y + win.clientHeight / 2),
    };
}

const near = (a: number, b: number, tolerance = 0.01) => Math.abs(a - b) <= tolerance;
const nearPoint = (a: Point, b: Point, tolerance = 0.01) => near(a.x, b.x, tolerance) && near(a.y, b.y, tolerance);

/** Makes the reader ask for less motion, until `restore()`. */
function reducedMotion() {
    const real = window.matchMedia;
    window.matchMedia = ((query: string) => ({ ...real.call(window, query), matches: /prefers-reduced-motion/.test(query), media: query })) as typeof window.matchMedia;
    return () => void (window.matchMedia = real);
}

// ── 1. The wheel ──────────────────────────────────────────────────────────

check("wheel: `zoom` zooms about the pointer on the plain wheel, and Ctrl or Cmd still zooms", async () => {
    const view = await probe(surface(), { wheel: "zoom", bounds: () => BIG, margin: 10000 });
    const at = view.at(130, 60);
    const before = view.core.toWorld(at.x, at.y);
    const scale = view.view().scale;
    assert(wheel(view.win, at, { deltaY: -100 }), "the plain wheel is consumed: the page does not scroll");
    assert(view.view().scale > scale, "and it zoomed in");
    assert(nearPoint(view.core.toWorld(at.x, at.y), before), "the world point under the pointer stayed under it");
    const zoomed = view.view().scale;
    assert(wheel(view.win, at, { deltaY: 100, ctrlKey: true }) && view.view().scale < zoomed, "Ctrl with the wheel zooms out");
    assert(wheel(view.win, at, { deltaY: -100, metaKey: true }), "Cmd with the wheel zooms");
    const sideways = view.view();
    assert(wheel(view.win, at, { deltaX: 30, deltaY: 0 }), "a sideways wheel is not a zoom: it pans, as it does without the option");
    equal([view.view().scale, view.view().x - sideways.x], [sideways.scale, -30]);
    const still = mutations(view.win);
    wheel(view.win, at, { deltaY: -50 });
    equal(still.stop().filter((record) => record.target === view.win).length, 0, "nothing is written to the window");
});

check("wheel: `page` leaves the plain wheel to the page, and the default pans", async () => {
    const page = await probe(surface(), { wheel: "page", bounds: () => BIG, margin: 10000 });
    const at = page.at(130, 60);
    const before = page.view();
    assert(!wheel(page.win, at, { deltaY: 80 }), "a plain wheel event is not consumed");
    assert(!wheel(page.win, at, { deltaY: 80, shiftKey: true }), "also with Shift");
    equal([page.view().x, page.view().y, page.view().scale], [before.x, before.y, before.scale], "and the view did not move");
    assert(wheel(page.win, at, { deltaY: -100, ctrlKey: true }) && page.view().scale > before.scale, "Ctrl with the wheel still zooms about the pointer");

    const pan = await probe(surface(), { bounds: () => BIG, margin: 10000 });
    const was = pan.view();
    assert(wheel(pan.win, pan.at(130, 60), { deltaY: 40 }), "the default is unchanged: the plain wheel pans");
    equal([pan.view().x, pan.view().y - was.y, pan.view().scale], [was.x, -40, was.scale]);
});

check("wheel: the attribute of the window wins over the option, and `can` still gates the wheel", async () => {
    const view = await probe(surface(`data-ww-viewport-wheel="page"`), { wheel: "zoom", bounds: () => BIG, margin: 10000 });
    assert(!wheel(view.win, view.at(100, 100), { deltaY: -100 }), `data-ww-viewport-wheel="page" beats the option "zoom"`);
    view.win.setAttribute("data-ww-viewport-wheel", "zoom");
    assert(wheel(view.win, view.at(100, 100), { deltaY: -100 }), "and the attribute is read when the wheel turns, so a template can change it");
    let allowed = false;
    const locked = await probe(surface(`data-ww-viewport-wheel="zoom"`), { can: () => allowed, bounds: () => BIG });
    assert(!wheel(locked.win, locked.at(100, 100), { deltaY: -100 }), "a reader who may not change the view leaves the wheel to the page");
    allowed = true;
    assert(wheel(locked.win, locked.at(100, 100), { deltaY: -100 }));
});

check("wheel: `zoom` works in the scroll form too", async () => {
    const view = await probe(`<style>.win { width: 300px; height: 200px; } .world { width: 600px; height: 410px; }</style><div class="win" data-ww-viewport data-ww-viewport-wheel="zoom"><div class="world"></div></div>`);
    const scale = view.view().scale;
    assert(wheel(view.win, view.at(100, 100), { deltaY: -100 }) && view.view().scale > scale, "the plain wheel zooms the scroll container");
});

// ── 2. The first view ─────────────────────────────────────────────────────

check("start: a world point and a scale are the first view, applied once", async () => {
    let asked = 0;
    const view = await probe(surface(), { bounds: () => BIG, margin: 5000, start: () => (asked++, { centre: { x: 500, y: 300 }, scale: 1 }) });
    equal([view.view().scale, asked], [1, 1]);
    assert(nearPoint(view.centre(), { x: 500, y: 300 }), "the world point is in the centre of the window");
    view.host.style.width = "600px";
    await until(() => view.view().width === 600, "the window did not resize");
    equal(asked, 1, "a resize does not ask again");
    equal(view.view().x, 200 - 500, "and the first layout or a later one does not override the view: the offset is kept");
    view.core.contentChanged();
    equal([view.view().scale, view.view().x, asked], [1, -300, 1]);
    equal(view.host.fits.length, 0, "a view that is not a fit announces no fit");
});

check("start: `x`, `y` and a scale give the view itself, a box is fitted, and `fit` is the fitted view", async () => {
    const exact = await probe(surface(), { bounds: () => BIG, margin: 5000, start: { x: -50, y: -20, scale: 2 } });
    equal([exact.view().x, exact.view().y, exact.view().scale], [-50, -20, 2]);

    let box = { x: 100, y: 100, width: 200, height: 100 };
    const boxed = await probe(surface(), { bounds: () => BIG, margin: 5000, start: { box } });
    equal(boxed.view().scale, 2, "200 × 100 in 400 × 200");
    assert(nearPoint(boxed.centre(), { x: 200, y: 150 }), "centred on the box");
    equal([boxed.host.fits.length, boxed.host.fits[0]?.reason], [1, "open"]);
    box = { ...box, width: 100 };
    const fitted = await probe(surface(), { bounds: () => BIG, start: "fit" });
    equal(fitted.view().scale, 0.4, "the fitted view");
});

check("start: the attribute is `fit` or `x y scale`, wins over the option, and yields to a saved view", async () => {
    const attribute = await probe(surface(`data-ww-viewport-start="400 200 2"`), { bounds: () => BIG, margin: 5000, start: { x: 0, y: 0 } });
    equal(attribute.view().scale, 2);
    assert(nearPoint(attribute.centre(), { x: 400, y: 200 }), "a world point for the centre, as in data-ww-viewport-save");

    const fit = await probe(surface(`data-ww-viewport-start="fit"`), { bounds: () => BIG, margin: 5000, start: { x: 0, y: 0 } });
    equal(fit.view().scale, 0.4);

    const saved = await probe(surface(`data-ww-viewport-save="view" data-ww-viewport-start="400 200 2"`), { bounds: () => BIG, margin: 5000 }, `style="width: 400px" view="100 100 1"`);
    assert(saved.view().scale === 1 && nearPoint(saved.centre(), { x: 100, y: 100 }), "a saved view is the author's: it opens instead of the start view");

    const reported = warnings();
    const bad = await probe(surface(`data-ww-viewport-start="here"`), { bounds: () => BIG });
    equal(bad.view().scale, 0.4, "an attribute that is neither is ignored, and the fit opens");
    assert(reported.stop().some((message) => message.includes(`data-ww-viewport-start="here"`)), "and development says so");
});

// ── 3. Setting the view ───────────────────────────────────────────────────

check("centerOn and setView: a world point in the centre, a view of one's own, both clamped to the limits", async () => {
    const view = await probe(surface(), { bounds: () => BIG, margin: 5000 });
    await view.core.centerOn({ x: 500, y: 300 });
    assert(nearPoint(view.centre(), { x: 500, y: 300 }), "centred");
    equal(view.view().scale, 0.4, "the scale stays when none is given");
    await view.core.centerOn({ x: 100, y: 50 }, 2);
    assert(view.view().scale === 2 && nearPoint(view.centre(), { x: 100, y: 50 }));
    await view.core.centerOn({ x: 100, y: 50 }, 100);
    equal(view.view().scale, 4, "the zoom limit applies");

    await view.core.setView({ x: -100, y: -50, scale: 2 });
    equal([view.view().x, view.view().y, view.view().scale], [-100, -50, 2]);
    const centre = view.centre();
    await view.core.setView({ scale: 1 });
    assert(view.view().scale === 1 && nearPoint(view.centre(), centre), "with only a scale the world point in the centre stays");

    // The view is no longer a fitted one, so a change of the content does not fit again.
    view.core.contentChanged();
    equal(view.view().scale, 1);
    equal(view.host.fits.length, 1, "only the first fit was announced");
});

check("centerOn and setView: animated, and never under prefers-reduced-motion", async () => {
    const view = await probe(surface(), { bounds: () => BIG, margin: 5000 });
    const frames = fakeFrames();
    let done = false;
    const glide = view.core.centerOn({ x: 600, y: 400 }, 2, { animate: true }).then(() => (done = true));
    equal(frames.pending, 1, "an animation waits for the next frame");
    equal(view.view().scale, 0.4, "and nothing moved yet");
    frames.fire(1000);
    equal(view.view().scale, 0.4, "the first frame is the start");
    frames.fire(1175);
    const middle = view.view().scale;
    assert(middle > 0.4 && middle < 2, `half way the scale is between (${middle})`);
    frames.fire(1200);
    assert(view.view().scale > middle, "and it goes on");
    assert(!done, "the promise waits");
    frames.fire(1400);
    await glide;
    assert(done && view.view().scale === 2 && nearPoint(view.centre(), { x: 600, y: 400 }), "the last frame is the exact view");
    equal(frames.pending, 0, "and the animation ended");

    // Something else changing the view ends the animation where it is.
    const second = view.core.setView({ x: 0, y: 0, scale: 1 }, { animate: 500 });
    frames.fire(2000);
    frames.fire(2100);
    view.core.zoomTo(3);
    await second;
    equal(view.view().scale, 3);
    frames.fire(3000);
    equal(view.view().scale, 3, "no frame moves the view after that");

    const restore = reducedMotion();
    try {
        const there = view.core.centerOn({ x: 100, y: 100 }, 1, { animate: true });
        equal(frames.pending, 0, "no animation is started");
        await there;
        assert(view.view().scale === 1 && nearPoint(view.centre(), { x: 100, y: 100 }), "the view jumped");
    } finally {
        restore();
    }
});

check("centerOn: a call before the window has a size is applied when it opens", async () => {
    GapProbe.options = { bounds: () => BIG, margin: 5000 };
    const host = await mount<GapProbe>(`<ww-gap-probe style="width: 400px; display: none"><template shadowrootmode="open">${surface()}</template></ww-gap-probe>`);
    let done = false;
    const call = host.core.centerOn({ x: 700, y: 200 }, 1).then(() => (done = true));
    await frame(3);
    assert(!done && host.core.getSnapshot().width === 0, "nothing to place the view in yet");
    host.style.display = "block";
    await call;
    const win = host.shadowRoot!.querySelector<HTMLElement>("[data-ww-viewport]")!;
    const rect = win.getBoundingClientRect();
    assert(nearPoint(host.core.toWorld(rect.left + 200, rect.top + 100), { x: 700, y: 200 }), "it is the first view, and the fit did not override it");
    equal(host.core.getSnapshot().scale, 1);
});

// ── 4. Fit ────────────────────────────────────────────────────────────────

check("fit: padding keeps room around the content", async () => {
    const option = await probe(surface(), { bounds: () => BIG, fit: { padding: 20 } });
    equal([option.view().scale, option.view().x, option.view().y], [0.32, 72, 20], "360 × 160 of room for 800 × 500");
    const attribute = await probe(surface(`data-ww-viewport-fit-padding="20"`), { bounds: () => BIG, fit: { padding: 40 } });
    equal([attribute.view().scale, attribute.view().x], [0.32, 72], "the attribute wins");
});

check("fit: a largest scale keeps small content from filling the window", async () => {
    const plain = await probe(surface(), { bounds: () => SMALL });
    equal(plain.view().scale, 4, "without it the zoom limit is the only one");
    const option = await probe(surface(), { bounds: () => SMALL, fit: { maxScale: 1 } });
    equal([option.view().scale, option.view().x, option.view().y], [1, 150, 75], "never above 1, and centred");
    const attribute = await probe(surface(`data-ww-viewport-fit-max="0.5"`), { bounds: () => SMALL, fit: { maxScale: 1 } });
    equal(attribute.view().scale, 0.5, "the attribute wins");
    const scroll = await probe(`<style>.win { width: 300px; height: 200px; } .world { width: 600px; height: 410px; }</style><div class="win" data-ww-viewport data-ww-viewport-fit-max="0.3"><div class="world"></div></div>`);
    equal(scroll.view().scale, 0.3, "in the scroll form as well");
});

check("fit: an inset leaves a covered part of the window free", async () => {
    const option = await probe(surface(), { bounds: () => SMALL, fit: { inset: { left: 100 } } });
    equal([option.view().scale, option.view().x, option.view().y], [3, 100, 25], "300 × 200 of room, to the right of the drawer");
    const attribute = await probe(surface(`data-ww-viewport-fit-inset="0 0 0 100"`), { bounds: () => SMALL });
    equal([attribute.view().scale, attribute.view().x], [3, 100], "as CSS margins: top right bottom left");
    const sides = await probe(surface(`data-ww-viewport-fit-inset="20 100"`), { bounds: () => SMALL });
    equal([sides.view().scale, sides.view().x, sides.view().y], [2, 100, 50], "two numbers are vertical and horizontal: 200 × 160 of room");

    // A drawer that opens: the fitted view follows the new inset, and says so.
    const drawer = await probe(surface(`data-ww-viewport-fit-inset="0"`), { bounds: () => SMALL });
    equal(drawer.view().scale, 4);
    drawer.win.setAttribute("data-ww-viewport-fit-inset", "0 0 0 100");
    drawer.core.refresh();
    equal([drawer.view().scale, drawer.host.fits.at(-1)?.reason], [3, "follow"]);
});

check("fit: the widget names what is fitted, and the fit button does the same", async () => {
    let target: WorldBox | null = { x: 100, y: 100, width: 200, height: 100 };
    const view = await probe(surface(), { bounds: () => BIG, margin: 5000, fit: { target: () => target } });
    equal(view.view().scale, 2, "the target and not the bounds: 200 × 100 in 400 × 200");
    assert(nearPoint(view.centre(), { x: 200, y: 150 }), "centred on it");
    view.core.zoomTo(1);
    view.win.querySelector<HTMLElement>(`[data-ww-viewport-action="fit"]`)!.click();
    assert(view.view().scale === 2 && nearPoint(view.centre(), { x: 200, y: 150 }), "the fit button shows the target");
    target = null;
    await view.core.fit();
    equal(view.view().scale, 0.4, "without a target the bounds are fitted");
});

check("fit: the call resolves with the view, and `ww-viewportfit` says that a fit was applied", async () => {
    const view = await probe(surface(), { bounds: () => BIG });
    equal(view.host.fits.map((fit) => fit.reason), ["open"], "the first view is a fit");
    const detail = view.host.fits[0];
    equal([detail.scale, detail.width, detail.height], [0.4, 400, 200], "the detail is the view");
    view.core.zoomTo(1);
    const result = await view.core.fit();
    equal([result.scale, view.host.fits.map((fit) => fit.reason)], [0.4, ["open", "request"]]);

    const log = events("ww-viewportfit");
    view.win.querySelector<HTMLElement>(`[data-ww-viewport-action="fit"]`)!.click();
    equal(log.stop(), ["ww-viewportfit"], "the button too, and the event bubbles up to the document");
});

check("fit: `fitted()` resolves when the view is a fitted one that is up to date", async () => {
    let box = BIG;
    const view = await probe(surface(), { bounds: () => box });
    equal((await view.core.fitted()).scale, 0.4, "at once when it is fitted already");

    // The content changed: the answer comes with the fit that follows.
    box = { x: 0, y: 0, width: 400, height: 200 };
    let settled: number | null = null;
    void view.core.fitted().then((snapshot) => (settled = snapshot.scale));
    await frame(2);
    equal(settled, null, "the view is not up to date until it has fitted again");
    view.core.contentChanged();
    await until(() => settled !== null, "the promise never resolved");
    equal(settled, 1);

    // A view that is not fitted waits for the next fit.
    view.core.zoomTo(2);
    let later = false;
    void view.core.fitted().then(() => (later = true));
    await frame(2);
    assert(!later, "a view that something else changed is not a fitted one");
    await view.core.fit();
    await until(() => later, "it resolves with the next fit");

    // And it is rejected if the viewport goes away first.
    view.core.zoomTo(3);
    const lost = view.core.fitted();
    const lostCheck = lost.then(() => "resolved", (error: DOMException) => error.name);
    view.host.remove();
    equal(await lostCheck, "AbortError");
});

check("fit: animated, and the animation is the only thing that moves the view", async () => {
    const view = await probe(surface(), { bounds: () => BIG });
    view.core.zoomTo(1);
    const frames = fakeFrames();
    const call = view.core.fit({ animate: true });
    equal(frames.pending, 1);
    frames.fire(500);
    frames.fire(600);
    const middle = view.view().scale;
    assert(middle < 1 && middle > 0.4, `on its way (${middle})`);
    frames.fire(900);
    const result = await call;
    equal([result.scale, view.view().scale, view.host.fits.length], [0.4, 0.4, 2], "one more fit was announced, at the end");
});

// ── 5. Following ──────────────────────────────────────────────────────────

check("follow: a fitted view fits again when the content or the window changes, by default", async () => {
    let box = BIG;
    const view = await probe(surface(), { bounds: () => box });
    box = SMALL;
    view.core.contentChanged();
    equal(view.view().scale, 4, "the content changed: a fit followed it");
    view.host.style.width = "200px";
    await until(() => view.view().width === 200);
    equal(view.view().scale, 2, "and the window");
    equal(view.host.fits.map((fit) => fit.reason), ["open", "follow", "follow"]);
});

check("follow: `window` follows only the window, `none` fits once and leaves the view alone", async () => {
    let box = BIG;
    const window = await probe(surface(), { bounds: () => box, fit: { follow: "window" } });
    box = SMALL;
    window.core.contentChanged();
    equal(window.view().scale, 0.4, "the content moved: the view stays");
    window.host.style.width = "200px";
    await until(() => window.view().width === 200);
    equal(window.view().scale, 4 / 2, "the window resized: it fits again, to the content as it is now");

    box = BIG;
    const none = await probe(surface(), { bounds: () => box, fit: { follow: "none" } });
    box = SMALL;
    none.core.contentChanged();
    none.host.style.width = "200px";
    await until(() => none.view().width === 200);
    equal([none.view().scale, none.host.fits.length], [0.4, 1], "fit once, then leave the view alone");
    await none.core.fit();
    equal(none.view().scale, 2, "a fit that is asked for still fits");

    box = BIG;
    const attribute = await probe(surface(`data-ww-viewport-follow="none"`), { bounds: () => box, fit: { follow: "all" } });
    box = SMALL;
    attribute.core.contentChanged();
    equal(attribute.view().scale, 0.4, "the attribute wins");
});

check("follow: `fit({follow: 'none'})` is one fit that leaves the view alone, and a box is fitted once", async () => {
    let box = BIG;
    const view = await probe(surface(), { bounds: () => box });
    box = SMALL;
    await view.core.fit({ follow: "none" });
    equal(view.view().scale, 4);
    box = BIG;
    view.core.contentChanged();
    equal(view.view().scale, 4, "the content changed again: the view was left alone");
    await view.core.fit();
    equal(view.view().scale, 0.4, "an ordinary fit follows again");
    box = SMALL;
    view.core.contentChanged();
    equal(view.view().scale, 4);

    await view.core.fit({ box: { x: 0, y: 0, width: 200, height: 100 } });
    equal(view.view().scale, 2, "a box is fitted instead of the content");
    box = BIG;
    view.core.contentChanged();
    equal(view.view().scale, 2, "and the view stays there");
});

// ── 6. Resizing the window ────────────────────────────────────────────────

check("resize: the screen offset is kept by default, the world centre with `centre`", async () => {
    const offset = await probe(surface(), { bounds: () => BIG, margin: 5000, start: { centre: { x: 500, y: 300 }, scale: 1 } });
    offset.host.style.width = "600px";
    await until(() => offset.view().width === 600);
    equal(offset.view().x, 200 - 500, "the world stays where it is on the screen");

    const centre = await probe(surface(), { bounds: () => BIG, margin: 5000, start: { centre: { x: 500, y: 300 }, scale: 1 }, resize: "centre" });
    centre.host.style.width = "600px";
    await until(() => centre.view().width === 600);
    assert(nearPoint(centre.centre(), { x: 500, y: 300 }), "the world point in the centre stays in the centre");
    centre.host.style.width = "300px";
    await until(() => centre.view().width === 300);
    assert(nearPoint(centre.centre(), { x: 500, y: 300 }), "also when the window shrinks");

    const attribute = await probe(surface(`data-ww-viewport-resize="centre"`), { bounds: () => BIG, margin: 5000, start: { centre: { x: 500, y: 300 }, scale: 1 }, resize: "offset" });
    attribute.host.style.width = "600px";
    await until(() => attribute.view().width === 600);
    assert(nearPoint(attribute.centre(), { x: 500, y: 300 }), "the attribute wins");

    // A fit that does not follow is a view that is left alone too, and it keeps the centre.
    const fitted = await probe(surface(), { bounds: () => BIG, margin: 5000, resize: "centre", fit: { follow: "none" } });
    const world = fitted.centre();
    fitted.host.style.width = "600px";
    await until(() => fitted.view().width === 600);
    assert(nearPoint(fitted.centre(), world), "a fit that was left alone");
});

// ── 7. Panning at the edge ────────────────────────────────────────────────

check("autoPan: a pointer in the band at the edge pans the view, the more the nearer the edge", async () => {
    const view = await probe(surface(), { bounds: () => BIG, start: { centre: { x: 400, y: 250 }, scale: 1 } });
    const x = () => view.view().x;
    const start = x();
    assert(!view.core.autoPan(...(Object.values(view.at(200, 100)) as [number, number])), "the middle of the window does nothing");
    equal(x(), start);
    assert(view.core.autoPan(view.at(2, 100).x, view.at(2, 100).y), "the left edge pans");
    const edge = x() - start;
    assert(edge > 14 && edge <= 16, `nearly the whole step at the edge (${edge})`);
    const before = x();
    view.core.autoPan(view.at(40, 100).x, view.at(40, 100).y);
    const inner = x() - before;
    assert(inner > 0 && inner < edge / 2, `a smaller step deeper in (${inner})`);
    const right = x();
    view.core.autoPan(view.at(398, 100).x, view.at(398, 100).y);
    assert(x() < right, "the right edge pans the other way");
    const top = view.view().y;
    view.core.autoPan(view.at(200, 2).x, view.at(200, 2).y);
    assert(view.view().y > top, "the top edge pans down");
    const outside = view.view().x;
    assert(!view.core.autoPan(view.at(-5, 100).x, view.at(-5, 100).y) && view.view().x === outside, "a pointer outside the window pans nothing");

    // Panning stops where the content ends, and then reports that nothing moved.
    let moved = true;
    for (let step = 0; step < 100 && moved; step++) moved = view.core.autoPan(view.at(2, 100).x, view.at(2, 100).y);
    assert(!moved && view.view().x <= 0, "the left edge of the content is at the left edge of the window and stops there");
    const still = mutations(view.win);
    view.core.autoPan(view.at(398, 100).x, view.at(398, 100).y);
    equal(still.stop().filter((record) => record.target === view.win).length, 0, "nothing is written to the window");
});

check("autoPanWhile: a pointer held still at the edge keeps panning until the gesture ends", async () => {
    const view = await probe(surface(), { bounds: () => BIG, start: { centre: { x: 400, y: 250 }, scale: 1 } });
    const frames = fakeFrames();
    const at = view.at(3, 100);
    const ended = new AbortController();
    view.core.autoPanWhile({ last: { clientX: at.x, clientY: at.y }, ended: ended.signal });
    const x = view.view().x;
    frames.fire(100);
    const first = view.view().x;
    frames.fire(116);
    assert(first > x && view.view().x > first, "one step per frame, without the pointer moving");
    ended.abort();
    frames.fire(132);
    const last = view.view().x;
    frames.fire(148);
    equal([view.view().x, frames.pending], [last, 0], "the loop ends with the gesture");

    // And with the viewport.
    const other = new AbortController();
    view.core.autoPanWhile({ last: { clientX: at.x, clientY: at.y }, ended: other.signal });
    equal(frames.pending, 1);
    view.host.remove();
    equal(frames.pending, 0, "a disconnected viewport stops it");
});

// ── 8. Drag: a point target in world coordinates ─────────────────────────

async function board() {
    const widget = await mount<WorldView>(`<ww-world-view></ww-world-view>`);
    await until(() => widget.viewport.width > 0, "the viewport never opened");
    await frame(2);
    const root = widget.shadowRoot!;
    const chip = root.querySelector<HTMLElement>(".chip")!;
    const win = root.querySelector<HTMLElement>(".board")!;
    const size = () => {
        const rect = chip.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    };
    /** The world point under the top-left corner of an item whose centre is at a client point. */
    const world = (centre: Point) => widget.viewport.toWorld(centre.x - size().width / 2, centre.y - size().height / 2);
    return { widget, chip, win, world };
}

check("drag: a drop on a canvas viewport reports the world point under the pan and zoom of the view", async () => {
    const { widget, chip, win, world } = await board();
    await widget.viewport.centerOn({ x: 700, y: 500 }, 2);
    await widget.updateComplete;
    const at = point(win, 0.6, 0.4);
    let expected: Point | null = null;
    await drag(chip, at, { held: () => void (expected = world(at)) });
    assert(widget.lastDrop && widget.lastDrop.x !== null && widget.lastDrop.y !== null, "the commit reports a point");
    assert(nearPoint({ x: widget.lastDrop!.x!, y: widget.lastDrop!.y! }, expected!, 0.02), `the world point (${JSON.stringify(widget.lastDrop)} for ${JSON.stringify(expected)})`);
    const rect = win.getBoundingClientRect();
    assert(Math.abs(widget.lastDrop!.x! - (at.x - rect.left)) > 20, "which is not a position in the target's own pixels");
    equal(widget.chips.length, 1, "and the widget placed what was dropped");
    equal(widget.lastDrop!.key, "and");

    // At another view the same place is another world point.
    await widget.viewport.centerOn({ x: 300, y: 200 }, 1);
    await widget.updateComplete;
    await drag(chip, at, { held: () => void (expected = world(at)) });
    assert(nearPoint({ x: widget.lastDrop!.x!, y: widget.lastDrop!.y! }, expected!, 0.02), "following the view");
});

check("drag: the grid of a world target is in world units, and a click drop reaches the same place", async () => {
    const { widget, chip, win } = await board();
    widget.grid = 50;
    await widget.updateComplete;
    await widget.viewport.centerOn({ x: 600, y: 400 }, 1.5);
    await widget.updateComplete;
    await drag(chip, point(win, 0.55, 0.45));
    const { x, y } = widget.lastDrop!;
    assert(x !== null && y !== null && x % 50 === 0 && y % 50 === 0, `snapped to the grid (${x}, ${y})`);

    // A click on the chip and a click on the board: no pointer position is lost.
    const rect = win.getBoundingClientRect();
    chip.click();
    win.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, clientX: rect.left + rect.width * 0.55, clientY: rect.top + rect.height * 0.45, detail: 1 }));
    await until(() => widget.chips.length === 2, "the click did not drop");
    assert(widget.lastDrop!.x! % 50 === 0 && widget.lastDrop!.y! % 50 === 0, "also on the grid");
});

check("drag: the keyboard picks the chip up, moves it by grid steps in the world, and drops it", async () => {
    const { widget, chip } = await board();
    widget.grid = 50;
    await widget.updateComplete;
    await widget.viewport.centerOn({ x: 600, y: 400 }, 1);
    await widget.updateComplete;
    chip.focus();
    key(" ", chip);
    key("ArrowRight", chip);
    key("Enter", chip);
    await until(() => widget.chips.length === 1, "the keyboard drop did not commit");
    const first = widget.lastDrop!;
    await frame(4);
    chip.focus();
    key(" ", chip);
    key("ArrowRight", chip);
    key("ArrowRight", chip);
    key("ArrowDown", chip);
    key("Enter", chip);
    await until(() => widget.chips.length === 2, "the second keyboard drop did not commit");
    equal([widget.lastDrop!.x! - first.x!, widget.lastDrop!.y! - first.y!], [50, 50], "a step is one grid cell of the world");
});

check("drag: the view pans while the pointer is held at the edge of the board", async () => {
    const { widget, chip, win, world } = await board();
    await widget.viewport.centerOn({ x: 600, y: 400 }, 1);
    await widget.updateComplete;
    const x = widget.viewport.x;
    const rect = win.getBoundingClientRect();
    const edge = { x: rect.left + 4, y: rect.top + rect.height / 2 };
    let expected: Point | null = null;
    let panned = 0;
    await drag(chip, edge, {
        held: async () => {
            await until(() => widget.viewport.x > x + 40, "the view did not pan");
            panned = widget.viewport.x - x;
            expected = world(edge);
        },
    });
    assert(panned > 40, `the view moved by ${panned} px while the chip was held there`);
    assert(nearPoint({ x: widget.lastDrop!.x!, y: widget.lastDrop!.y! }, expected!, 0.02), "and the drop is in the world of the view as it was then");
});

check("drag: without the viewport option a world target is measured as a point target, and development says so", async () => {
    const reported = warnings();
    class Bare extends LitElement {
        static properties = {};
        render() {
            return html`<div class="chip" data-ww-drag="chip" data-ww-drag-effect="copy" data-ww-key="c" tabindex="0">c</div><div class="board" style="position:relative;height:100px;width:200px" data-ww-drop="chip" data-ww-drop-position="point" data-ww-drop-space="world"></div>`;
        }
    }
    customElements.define("ww-bare-world", Bare);
    const { Drag } = await import("@webwriter/lit/drag");
    class Bare2 extends Bare {
        drag = new Drag(this);
    }
    customElements.define("ww-bare-world-2", Bare2);
    const widget = await mount<Bare2>(`<ww-bare-world-2></ww-bare-world-2>`);
    let detail: { x: number | null } | null = null;
    widget.shadowRoot!.querySelector(".board")!.addEventListener("ww-dragcommit", (event) => (detail = (event as CustomEvent).detail));
    await drag(widget.shadowRoot!.querySelector(".chip")!, point(widget.shadowRoot!.querySelector(".board")!));
    assert(detail !== null && typeof (detail as { x: number }).x === "number", "it still resolves a point");
    assert(reported.stop().some((message) => message.includes("data-ww-drop-space")), "and the message names the attribute");
});

// ── 10. Shortcuts: the check for focus waits for the first render ─────────

/** A plain widget that has only a style in its shadow root when it connects, and gets its stage at the first render. */
function late(tag: string, stage: string) {
    class Late extends HTMLElement {
        static actions = { go: { shortcut: "G" } };
        core = new ShortcutsCore(this);
        constructor() {
            super();
            this.attachShadow({ mode: "open" }).innerHTML = `<style>:host { display: block; }</style>`;
        }
        go() {}
        connectedCallback() {
            this.core.connect();
        }
        disconnectedCallback() {
            this.core.disconnect();
        }
        render() {
            const template = document.createElement("template");
            template.innerHTML = stage;
            this.shadowRoot!.append(template.content);
            this.core.refresh();
        }
    }
    customElements.define(tag, Late);
}

check("shortcuts: nothing is reported before the first render, and not for a stage that is there after it", async () => {
    late("ww-late-stage", `<div class="stage" tabindex="0"></div>`);
    const reported = warnings();
    const widget = await mount<HTMLElement & { render(): void }>(`<ww-late-stage></ww-late-stage>`);
    await frame(3);
    equal(reported.stop(), [], "a widget with only a style in its shadow root has not rendered yet: no warning, not even after frames");
    const later = warnings();
    widget.render();
    await frame(2);
    equal(later.stop(), [], "its focusable stage came with the first render");
});

check("shortcuts: a widget whose first render has nothing to focus is reported after that render, once", async () => {
    late("ww-late-nothing", `<p>Text</p>`);
    const reported = warnings();
    const first = await mount<HTMLElement & { render(): void }>(`<ww-late-nothing></ww-late-nothing>`);
    await frame(3);
    equal(reported.stop(), [], "before the render there is nothing to say");
    const after = warnings();
    first.render();
    first.render();
    const messages = after.stop();
    equal([messages.length, messages[0]?.includes("<ww-late-nothing>: shortcuts are declared, but nothing in the widget can take the focus")], [1, true]);
});

check("shortcuts: a Lit widget with its stage in the first render is not reported at load", async () => {
    class Stage extends LitElement {
        static actions = { go: { shortcut: "G" } };
        readonly #shortcuts = new Shortcuts(this);
        go() {}
        render() {
            return html`<div class="stage" tabindex="0"></div>`;
        }
    }
    customElements.define("ww-lit-stage", Stage);
    const reported = warnings();
    await mount(`<ww-lit-stage></ww-lit-stage>`);
    await mount(`<ww-world-view></ww-world-view>`);
    await frame(2);
    equal(reported.stop(), []);
});

assert(BOARD.width > 0);

run();
