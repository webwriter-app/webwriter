import { assert, check, deepActive, equal, frame, key, listeners, mount, point, run, settled, until, warnings } from "../../test/harness";
import { ViewportCore } from "@webwriter/widget/viewport";
import type { LibraryView } from "./index";
import "./index";

const near = (a: number, b: number, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

async function library(attributes = `style="width: 500px"`) {
    const view = await mount<LibraryView>(`<ww-library-view ${attributes}></ww-library-view>`);
    await until(() => view.map && view.shadowRoot!.querySelector("[data-ww-viewport-action]"), "the library or the buttons never appeared");
    await settled(view);
    const root = view.shadowRoot!;
    return { view, map: view.map!, win: root.querySelector<HTMLElement>(".map")!, button: (name: string) => root.querySelector<HTMLButtonElement>(`[data-ww-viewport-action="${name}"]`)! };
}

const disabled = (button: Element) => button.getAttribute("aria-disabled") === "true";

check("adapter: the standard buttons drive the library's own viewport", async () => {
    const { view, map, button } = await library();
    const fitted = map.getZoom();
    equal(view.viewport.scale, fitted, "the state reports the library's scale");
    equal([view.viewport.min, view.viewport.max], [0.5, 3], "and its limits");
    equal([view.viewport.x, view.viewport.y], [0, 0], "the position stays the library's");
    equal(button("reset").textContent, `${Math.round(fitted * 100)}%`);

    button("in").click();
    assert(near(map.getZoom(), fitted * 1.2), "zoom in went to the library, with the editor's step");
    equal(button("reset").textContent, `${Math.round(fitted * 1.2 * 100)}%`, "and the percent shows the library's answer");
    button("out").click();
    button("out").click();
    assert(near(map.getZoom(), fitted / 1.2));
    button("reset").click();
    assert(near(map.getZoom(), 1), "the percent button returns to 100 %");
    equal(button("reset").getAttribute("aria-label"), "Zoom 100%. Reset to 100%");
    button("fit").click();
    equal(map.getZoom(), fitted, "fit is the library's own fit");
});

check("adapter: the buttons are marked disabled at the library's limits", async () => {
    const { view, map, button } = await library();
    for (let i = 0; i < 12; i++) button("in").click();
    equal(map.getZoom(), 3, "the library applies its own limit");
    equal([disabled(button("in")), disabled(button("out"))], [true, false]);
    button("in").focus();
    assert(deepActive() === button("in"), "the button keeps keyboard focus");
    for (let i = 0; i < 12; i++) button("out").click();
    equal(map.getZoom(), 0.5);
    equal([disabled(button("in")), disabled(button("out"))], [false, true]);
    equal(view.viewport.scale, 0.5);
});

check("adapter: the library's own input reaches the buttons through the change notification", async () => {
    const { view, map, win, button } = await library();
    const before = map.getZoom();
    let renders = 0;
    const request = view.requestUpdate.bind(view);
    view.requestUpdate = (...parameters: Parameters<typeof request>) => (renders++, request(...parameters));
    // The library zooms on Ctrl + wheel by its own option; the module does not handle the wheel here.
    win.dispatchEvent(new WheelEvent("wheel", { bubbles: true, composed: true, cancelable: true, deltaY: -200, ctrlKey: true, clientX: point(win).x, clientY: point(win).y }));
    assert(near(map.getZoom(), before * Math.exp(0.4)), "the library zoomed");
    equal(view.viewport.scale, map.getZoom(), "the state followed at once");
    equal(button("reset").textContent, `${Math.round(map.getZoom() * 100)}%`);
    assert(renders > 0, "a change of scale re-renders the widget");
    map.setZoom(3);
    assert(disabled(button("in")), "a change made through the library's own API is seen too");
});

check("adapter: the keys + − 0 work while the library's container has focus", async () => {
    const { map, win, view } = await library();
    equal([win.tabIndex, win.getAttribute("role"), win.getAttribute("aria-label")], [0, "group", "Map"], "the container is focusable and has a role and the template's label");
    const fitted = map.getZoom();
    win.focus();
    assert(!key("+"), "+ is consumed");
    assert(near(map.getZoom(), fitted * 1.2));
    assert(!key("-"));
    assert(near(map.getZoom(), fitted));
    key("+");
    assert(!key("0"));
    equal(map.getZoom(), fitted, "0 is the library's fit");
    assert(key("ArrowRight") && key(" "), "arrow keys and Space stay the library's");
    view.shadowRoot!.querySelector<HTMLElement>("[data-ww-viewport-action]")!.focus();
    assert(key("+"), "a key pressed elsewhere is not consumed");
});

check("adapter: `can` gates the buttons and the keys", async () => {
    const { view, map, win, button } = await library(`locked style="width: 500px"`);
    const fitted = map.getZoom();
    equal(["out", "in", "reset", "fit"].map((name) => disabled(button(name))), [true, true, true, true]);
    button("in").click();
    win.focus();
    assert(key("+"), "the key is not consumed");
    equal(map.getZoom(), fitted, "nothing reached the library");
    view.viewport.zoomBy(2);
    assert(near(map.getZoom(), fitted * 2), "the widget's own call does");
    view.viewport.zoomTo(1);
    assert(near(map.getZoom(), 1), "zoomTo is a factor for the library");
    view.viewport.fit();
    equal(map.getZoom(), fitted);
    view.locked = false;
    await settled(view);
    equal(disabled(button("in")), false);
    button("in").click();
    assert(near(map.getZoom(), fitted * 1.2));
});

check("adapter: the module leaves the library's container and its input alone", async () => {
    const { view, map, win } = await library();
    const layer = win.firstElementChild as HTMLElement;
    equal(view.viewport.core.form, "external");
    equal([getComputedStyle(win).overflowX, getComputedStyle(win).touchAction, getComputedStyle(layer).zoom], ["hidden", "auto", "1"], "no scroll container, no touch rule, no CSS zoom on the library's element");
    const transform = layer.style.transform;
    const zoom = map.getZoom();
    // A plain wheel pans in the library; a drag on its background is the library's too.
    win.dispatchEvent(new WheelEvent("wheel", { bubbles: true, composed: true, cancelable: true, deltaX: 20, deltaY: 30 }));
    assert(layer.style.transform !== transform && map.getZoom() === zoom, "the library panned by itself");
    const before = listeners();
    win.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, cancelable: true, pointerId: 3, button: 0 }));
    equal(listeners(), before, "the module starts no gesture on the library's container");
    equal(view.viewport.toWorld(10, 20), { x: 10, y: 20 }, "coordinates are the library's to convert");
    view.viewport.panBy(50, 50);
    equal([view.viewport.x, view.viewport.y], [0, 0]);
});

check("adapter: the subscription ends with the widget, and a new library instance is followed", async () => {
    const { view, map } = await library();
    equal(map.handlerCount, 1, "one subscription");
    const parent = view.parentElement!;
    view.remove();
    equal(map.handlerCount, 0, "none after the disconnect");
    equal(view.shadowRoot!.querySelectorAll("[data-ww-viewport-action]").length, 0, "the buttons are gone");

    parent.append(view);
    await until(() => view.map && view.map !== map && view.map.handlerCount === 1, "the new instance was not adopted");
    await settled(view);
    const next = view.map!;
    const zoom = next.getZoom();
    view.shadowRoot!.querySelector<HTMLButtonElement>(`[data-ww-viewport-action="in"]`)!.click();
    assert(near(next.getZoom(), zoom * 1.2), "the buttons drive the new instance");
    map.setZoom(2.5);
    await frame();
    equal(view.viewport.scale, next.getZoom(), "and the old one is no longer heard");
    equal(view.shadowRoot!.querySelectorAll("[data-ww-viewport-action]").length, 4, "one set of buttons");
});

check("adapter: an external window without the option is reported in development", async () => {
    const log = warnings();
    const host = await mount(`<ww-library-bare><template shadowrootmode="open"><div data-ww-viewport="external"></div><div data-ww-viewport-controls></div></template></ww-library-bare>`);
    const core = new ViewportCore(host);
    core.connect();
    core.refresh();
    const messages = log.stop();
    assert(messages.some((message) => message.includes(`data-ww-viewport="external" needs the adapter option`)), messages.join("\n"));
    equal([...host.shadowRoot!.querySelectorAll("button")].map(disabled), [true, true, true, true], "without a library the buttons do nothing");
    core.disconnect();
});

run();
