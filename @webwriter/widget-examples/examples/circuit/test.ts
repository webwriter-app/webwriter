import { assert, check, deepActive, equal, events, frame, key, listeners, mount, mutations, point, pointer, run, settled, until, warnings, type Point } from "../../test/harness";
import { sceneElements, type ConnectDetail, type MoveDetail, type ResizeDetail, type Scene, type SceneErrorDetail, type SelectDetail } from "@webwriter/widget/scene";
import "../swarm/bench";
import { sharedChecks } from "../swarm/shared.checks";
import "./index";
import type { Circuit } from "./index";

const sceneOf = (widget: Element) => widget.shadowRoot!.querySelector("ww-scene") as Scene;
const item = (widget: Element, id: string) => widget.shadowRoot!.querySelector<HTMLElement>(`[data-ww-key="${id}"]`)!;
/** The SVG element the renderer made for a scene element. */
const drawn = (widget: Element, id: string) => sceneOf(widget).rendering(item(widget, id) as never) as SVGGraphicsElement;
const background = (widget: Element) => sceneOf(widget).shadowRoot!.querySelector<SVGElement>("[part=drawing]")!;
const proxy = (widget: Element, id: string) =>
    [...sceneOf(widget).shadowRoot!.querySelectorAll<SVGPathElement>("[part=proxy]")].find((element) => element.getAttribute("aria-label") === id)!;
const selected = (widget: Circuit) => [...widget.selection].sort();
const gate = (widget: Circuit, id: string) => widget.model.gates.find((other) => other.id === id)!;
const port = (widget: Element, id: string, name: string) => item(widget, id).querySelector<HTMLElement>(`[data-ww-port="${name}"]`)!;
const handle = (widget: Element, id: string, name: string) => item(widget, id).shadowRoot!.querySelector<HTMLElement>(`[data-ww-handle="${name}"]`)!;
/** Start and end of a drawn path, from its path data. */
const ends = (path: Element) => {
    const numbers = path.getAttribute("d")!.match(/-?[\d.]+/g)!.map(Number);
    return { from: { x: numbers[0], y: numbers[1] }, to: { x: numbers.at(-2)!, y: numbers.at(-1)! } };
};
const near = (a: number, b: number, tolerance = 1) => Math.abs(a - b) <= tolerance;

async function circuit(attributes = "contenteditable"): Promise<Circuit> {
    const widget = await mount<Circuit>(`<ww-circuit ${attributes} style="width: 640px"></ww-circuit>`);
    await settled(widget);
    return widget;
}

type Steps = { held?: () => unknown; cancel?: boolean };

/** A pointer drag between two points, on `target`. */
async function sweep(target: Element, from: Point, to: Point, init: PointerEventInit = {}, steps: Steps = {}) {
    pointer(target, "pointerdown", from, init);
    pointer(target, "pointermove", { x: from.x + 6, y: from.y + 6 }, init);
    await frame(2);
    pointer(target, "pointermove", to, init);
    await frame(2);
    await steps.held?.();
    if (steps.cancel) key("Escape", window);
    else pointer(target, "pointerup", to, init);
    await frame(2);
}

const by = (element: Element, dx: number, dy: number): Point => ({ x: point(element).x + dx, y: point(element).y + dy });

async function click(target: Element, init: PointerEventInit = {}, at = point(target)) {
    pointer(target, "pointerdown", at, init);
    pointer(target, "pointerup", at, init);
    await frame(2);
}

// ── Mirroring ─────────────────────────────────────────────────────────────

check("mirror: paths are drawn between the measured ports", async () => {
    const widget = await circuit();
    const scene = sceneOf(widget);
    equal(background(widget).querySelectorAll("path").length, 3, "one drawn path per ww-path");
    equal(getComputedStyle(item(widget, "w1")).display, "none", "the scene element itself renders nothing");
    const origin = scene.getBoundingClientRect();
    const out = point(port(widget, "and", "out"));
    const at = ends(drawn(widget, "w3")).from;
    assert(near(at.x, out.x - origin.left - scene.clientLeft) && near(at.y, out.y - origin.top - scene.clientTop), "w3 starts at the centre of and:out");
    equal(scene.portPosition("and:out"), at, "portPosition gives the same point");
});

check("mirror: elements added, changed and removed by a render reach the drawing", async () => {
    const widget = await circuit();
    const before = drawn(widget, "w3");
    widget.model = { ...widget.model, wires: [...widget.model.wires, { id: "w4", from: "not", to: "out", input: "a" }] };
    await settled(widget);
    equal(background(widget).querySelectorAll("path").length, 4, "added");
    assert(drawn(widget, "w3") === before, "an unchanged element keeps its drawn shape");

    const old = drawn(widget, "w4").getAttribute("d");
    widget.model = { ...widget.model, wires: widget.model.wires.map((wire) => (wire.id === "w4" ? { ...wire, from: "and" } : wire)) };
    await settled(widget);
    assert(drawn(widget, "w4").getAttribute("d") !== old, "a changed attribute redraws the path");
    equal(ends(drawn(widget, "w4")).from, ends(drawn(widget, "w3")).from, "both now start at and:out");

    const gone = drawn(widget, "w4");
    widget.model = { ...widget.model, wires: widget.model.wires.filter((wire) => wire.id !== "w4") };
    await settled(widget);
    assert(!gone.isConnected, "removed");
    equal(background(widget).querySelectorAll("path").length, 3);
});

check("mirror: a path follows a node that the model moved", async () => {
    const widget = await circuit();
    const before = ends(drawn(widget, "w3"));
    widget.model = { ...widget.model, gates: widget.model.gates.map((other) => (other.id === "not" ? { ...other, x: other.x + 50, y: other.y + 70 } : other)) };
    await settled(widget);
    const after = ends(drawn(widget, "w3"));
    equal(after.from, before.from, "the other end stays");
    assert(near(after.to.x, before.to.x + 50) && near(after.to.y, before.to.y + 70), "the end at not:a moved with the node");
    equal(getComputedStyle(item(widget, "not")).translate, "390px 150px", "the node is HTML at its scene position");
});

check("mirror: a path follows a node that resizes without any render", async () => {
    const widget = await circuit();
    const before = ends(drawn(widget, "w3")).from;
    // Not a render: only the node's layout changes, as when its content grows.
    item(widget, "and").style.minWidth = "160px";
    await until(() => ends(drawn(widget, "w3")).from.x > before.x + 50, "the path did not follow the wider node");
    const origin = sceneOf(widget).getBoundingClientRect();
    assert(near(ends(drawn(widget, "w3")).from.x, point(port(widget, "and", "out")).x - origin.left - 1), "it ends at the port's new position");
});

// ── Computed styles ───────────────────────────────────────────────────────

check("style: a class toggle reaches the drawn shape, with the element's own transition", async () => {
    const widget = await circuit();
    equal(drawn(widget, "w2").style.stroke, "rgb(138, 143, 152)", "--wire, resolved");
    equal(drawn(widget, "w2").style.strokeWidth, "2px");
    item(widget, "in2").querySelector("button")!.click(); // in2 goes to 1: w2 gets class="live"
    await widget.updateComplete;
    equal(item(widget, "w2").className, "live");
    equal(drawn(widget, "w2").style.stroke, "rgb(10, 143, 91)", "--live, resolved, right after the render");
    getComputedStyle(drawn(widget, "w2")).stroke;
    equal(drawn(widget, "w2").getAnimations().length, 1, "the CSS transition declared on ww-path runs on the drawn path");
});

check("style: a custom property changed on the widget is read again", async () => {
    const widget = await circuit();
    widget.classList.add("dark"); // :host(.dark) sets other --wire and --live
    await until(() => drawn(widget, "w2").style.stroke === "rgb(91, 98, 112)", "a class on the host did not restyle the scene");
    equal(drawn(widget, "w1").style.stroke, "rgb(74, 222, 128)");
    widget.style.setProperty("--wire", "rgb(1, 2, 3)");
    await until(() => drawn(widget, "w2").style.stroke === "rgb(1, 2, 3)", "a style on the host did not restyle the scene");
});

check("style: a change no observer sees waits for restyle()", async () => {
    const widget = await circuit();
    const rule = document.head.appendChild(document.createElement("style"));
    try {
        rule.textContent = "ww-circuit { --wire: rgb(9, 9, 9); }";
        await frame(3);
        equal(drawn(widget, "w2").style.stroke, "rgb(138, 143, 152)", "a new style rule alone is not noticed");
        widget.requestUpdate();
        await widget.updateComplete;
        equal(drawn(widget, "w2").style.stroke, "rgb(138, 143, 152)", "nor by a render that changes no element: only changed elements are read again");
        widget.scene.restyle();
        await frame();
        equal(drawn(widget, "w2").style.stroke, "rgb(9, 9, 9)", "restyle() reads it");
    } finally {
        rule.remove();
    }
});

check("style: a change of the colour scheme reads every style again", async () => {
    const native = window.matchMedia;
    // The page's colour scheme cannot be switched from a script, so the query the module listens to is stood in for.
    const scheme = Object.assign(new EventTarget(), { matches: false, media: "(prefers-color-scheme: dark)" });
    window.matchMedia = ((query: string) => (query.includes("prefers-color-scheme") ? scheme : native.call(window, query))) as typeof window.matchMedia;
    try {
        const widget = await circuit();
        const { stats } = sceneOf(widget);
        const styled = stats.styled;
        scheme.dispatchEvent(new Event("change"));
        await frame();
        equal(stats.styled - styled, widget.shadowRoot!.querySelectorAll("ww-shape, ww-path, ww-text, ww-image, ww-group").length);
        widget.remove();
    } finally {
        window.matchMedia = native;
    }
});

check("style: a class on an element between the widget and the scene is a theme signal", async () => {
    const widget = await circuit();
    const rule = widget.shadowRoot!.appendChild(document.createElement("style"));
    rule.textContent = ".window.night ww-path { stroke: rgb(7, 7, 7); }";
    widget.shadowRoot!.querySelector(".window")!.classList.add("night");
    await until(() => drawn(widget, "w2").style.stroke === "rgb(7, 7, 7)", "a class on the scene's parent did not restyle the scene");
});

check("style: the editor's ww-themechange on the document reads every style again, and a scene that is gone ignores it", async () => {
    const widget = await circuit();
    const rule = document.head.appendChild(document.createElement("style"));
    try {
        rule.textContent = "ww-circuit { --wire: rgb(11, 12, 13); }";
        await frame(3);
        equal(drawn(widget, "w2").style.stroke, "rgb(138, 143, 152)", "a new style rule alone is not noticed");
        document.dispatchEvent(new CustomEvent("ww-themechange", { bubbles: true, detail: { theme: "base" } }));
        await until(() => drawn(widget, "w2").style.stroke === "rgb(11, 12, 13)", "the event did not restyle the scene");
        const { stats } = sceneOf(widget);
        widget.remove();
        await frame();
        const styled = stats.styled;
        document.dispatchEvent(new CustomEvent("ww-themechange", { bubbles: true }));
        await frame(2);
        equal(stats.styled, styled, "after the widget is removed the scene no longer listens");
    } finally {
        rule.remove();
    }
});

check("controls: data-ww-control keeps its size on the screen while the view is zoomed out", async () => {
    const widget = await circuit();
    const scene = sceneOf(widget);
    const button = item(widget, "and").appendChild(document.createElement("button"));
    button.setAttribute("data-ww-control", "");
    const view = { x: 0, y: 0, scale: 1 };
    const listeners = new Set<() => void>();
    const zoom = async (scale: number) => {
        view.scale = scale;
        for (const listener of listeners) listener();
        await frame(2);
    };
    scene.viewport = {
        getSnapshot: () => view,
        subscribe: (listener) => (listeners.add(listener), () => void listeners.delete(listener)),
    };
    scene.setAttribute("data-ww-viewport", "canvas");
    const scaleOf = () => {
        const value = getComputedStyle(button).scale;
        return value === "none" ? 1 : parseFloat(value);
    };
    await zoom(1);
    equal(scaleOf(), 1, "at 100 % the control is as designed");
    await zoom(0.25);
    equal(scaleOf(), 4, "at a quarter it is drawn four times larger");
    equal(getComputedStyle(button).getPropertyValue("--ww-scene-zoom").trim(), "0.25", "the zoom is published to the nodes");
    await zoom(2);
    equal(scaleOf(), 1, "zoomed in it grows with the node, as everything else");
    await zoom(0.01);
    equal(scaleOf(), 6, "up to the limit");
    button.style.setProperty("--ww-control-limit", "3");
    equal(scaleOf(), 3, "a widget can lower the limit");
    const hasRule = () => widget.shadowRoot!.adoptedStyleSheets.some((sheet) => [...sheet.cssRules].some((rule) => rule.cssText.includes("data-ww-control")));
    equal(hasRule(), true, "the rule is adopted into the root that holds the scene");
    scene.remove();
    equal(hasRule(), false, "and goes with the last scene of the root");
});

check("style: a render reads the styles of changed elements only, and draws only what changed", async () => {
    const widget = await circuit();
    const { stats } = sceneOf(widget);
    const { styled, drawn: draws, measured } = stats;
    widget.selection = new Set(["in1"]); // re-renders, no path changes
    await widget.updateComplete;
    equal([stats.styled - styled, stats.drawn - draws, stats.measured - measured], [0, 0, 0], "selecting a node changes no drawn element: nothing is read, drawn or measured");
    widget.selection = new Set(["w1"]);
    await widget.updateComplete;
    equal([stats.styled - styled, stats.drawn - draws, stats.measured - measured], [1, 1, 0], "selecting a wire reads and draws that wire");
    sceneOf(widget).restyle();
    await frame();
    const everything = widget.shadowRoot!.querySelectorAll("ww-shape, ww-path, ww-text, ww-image, ww-group").length;
    equal([stats.styled - styled, stats.drawn - draws], [1 + everything, 1], "restyle() reads every style, and draws none that computes to the same");
});

// ── Events ────────────────────────────────────────────────────────────────

check("events: pointer events of a drawn shape arrive on its scene element", async () => {
    const widget = await circuit();
    const seen: string[] = [];
    const root = widget.shadowRoot!;
    const log = (event: Event) => seen.push(`${event.type}:${(event.target as Element).localName}:${(event.target as Element).getAttribute("data-ww-key")}`);
    for (const type of ["click", "pointerdown", "pointermove"]) root.addEventListener(type, log);
    const shape = drawn(widget, "w3");
    pointer(shape, "pointerdown", point(shape));
    pointer(shape, "pointermove", point(shape));
    shape.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, clientX: 5 }));
    equal(seen, ["pointerdown:ww-path:w3", "pointermove:ww-path:w3", "click:ww-path:w3"], "once each, targeted at ww-path, not at ww-scene");
    pointer(shape, "pointerup", point(shape));
});

check("events: hover is a state of the scene element, and a wide band takes the pointer for a thin path", async () => {
    const widget = await circuit();
    const scene = sceneOf(widget);
    const middle = drawn(widget, "w3").getBoundingClientRect();
    const hit = scene.shadowRoot!.elementFromPoint(middle.left + middle.width / 2, middle.top + middle.height / 2 + 4);
    assert(hit?.getAttribute("part") === "hit" && hit.nextElementSibling === drawn(widget, "w3"), "4px beside the 2px line still hits the band drawn right below the path");
    pointer(hit!, "pointerover", point(hit!));
    await frame();
    assert(item(widget, "w3").matches(":state(hover)"), "ww-path:state(hover)");
    equal(drawn(widget, "w3").style.strokeWidth, "4px", "the hover rule of the widget is drawn");
    pointer(hit!, "pointerout", point(hit!));
    await frame();
    equal(drawn(widget, "w3").style.strokeWidth, "2px");
});

// ── Selection ─────────────────────────────────────────────────────────────

check("select: click, modifier click and background click", async () => {
    const widget = await circuit();
    const details: SelectDetail[] = [];
    widget.shadowRoot!.addEventListener("ww-select", (event) => details.push((event as CustomEvent<SelectDetail>).detail));
    await click(item(widget, "and"));
    equal(selected(widget), ["and"]);
    assert(item(widget, "and").hasAttribute("selected"), "the widget rendered selected");
    await click(item(widget, "not"), { ctrlKey: true });
    equal(selected(widget), ["and", "not"], "Ctrl adds");
    await click(proxy(widget, "w1"), { shiftKey: true });
    equal(selected(widget), ["and", "not", "w1"], "Shift adds a path");
    assert(proxy(widget, "w1").classList.contains("selected"), "the module draws the path's selection");
    await click(item(widget, "and"), { shiftKey: true });
    equal(selected(widget), ["not", "w1"], "a modifier click on a selected item removes it");
    await click(item(widget, "not"));
    equal(selected(widget), ["not"], "a plain click on one of several selects only that one");
    await click(background(widget), {}, by(background(widget), 0, 130));
    equal(selected(widget), [], "a click on the background clears");
    equal(details.length, 6, "one event per change");
    equal(details[1].keys, ["and", "not"], "the event carries the keys that should now be selected");
});

check("select: Shift and a drag on the background draws a marquee", async () => {
    const widget = await circuit();
    const scene = sceneOf(widget);
    const marquee = scene.shadowRoot!.querySelector<SVGElement>("[part=marquee]")!;
    const box = scene.getBoundingClientRect();
    // From left of AND to right of NOT, across the row of gates: and, not and the wire between them.
    await sweep(background(widget), { x: box.left + 170, y: box.top + 60 }, { x: box.left + 430, y: box.top + 125 }, { shiftKey: true }, {
        held() {
            equal(getComputedStyle(marquee).display, "block", "the marquee is drawn");
            assert(near(Number(marquee.getAttribute("width")), 260, 2), "with the size of the drag");
            equal(selected(widget), [], "nothing is selected before the release");
        },
    });
    equal(selected(widget), ["and", "not", "w1", "w2", "w3"], "everything the box touches, paths by their line");
    equal(getComputedStyle(marquee).display, "none");

    await click(background(widget), {}, by(background(widget), 0, 130));
    await sweep(background(widget), { x: box.left + 170, y: box.top + 60 }, { x: box.left + 430, y: box.top + 125 }, { shiftKey: true }, { cancel: true });
    equal(selected(widget), [], "Escape cancels the marquee");
    await sweep(background(widget), { x: box.left + 170, y: box.top + 60 }, { x: box.left + 430, y: box.top + 125 });
    equal(selected(widget), [], "a plain drag on the background selects nothing");
});

check("select: keyboard", async () => {
    const widget = await circuit();
    const and = item(widget, "and");
    equal(and.tabIndex, 0, "a selectable node is focusable");
    and.focus();
    assert(deepActive() === and);
    key(" ");
    await settled(widget);
    equal(selected(widget), ["and"], "Space selects");
    item(widget, "not").focus();
    key("Enter", undefined, { shiftKey: true });
    await settled(widget);
    equal(selected(widget), ["and", "not"], "Shift adds");
    proxy(widget, "w2").focus();
    assert(deepActive() === proxy(widget, "w2"), "a selectable path takes focus through its proxy");
    key("Enter");
    await settled(widget);
    equal(selected(widget), ["w2"], "Enter on a path");
    assert(!key("a", undefined, { ctrlKey: true }), "Ctrl+A is consumed");
    await settled(widget);
    equal(selected(widget), ["and", "in1", "in2", "not", "note", "out", "w1", "w2", "w3"], "Ctrl+A selects everything selectable");
    key("Escape");
    await settled(widget);
    equal(selected(widget), [], "Escape clears");

    item(widget, "in1").querySelector("button")!.focus();
    key(" ");
    await settled(widget);
    equal(selected(widget), [], "Space on a control inside a node is the control's");
});

check("select: a cancelled ww-select leaves the selection and starts no move", async () => {
    const widget = await circuit();
    await click(item(widget, "and"));
    widget.addEventListener("ww-select", (event) => event.preventDefault(), { capture: true });
    const moves = events("ww-move");
    await sweep(item(widget, "not"), point(item(widget, "not")), by(item(widget, "not"), 60, 40));
    await settled(widget);
    equal(selected(widget), ["and"], "the selection is the widget's and it kept it");
    equal(moves.stop(), [], "the refused press does not move the node either");
    equal(gate(widget, "not").x, 340);
});

check("select: select=single keeps one, select=none keeps none", async () => {
    const widget = await circuit();
    const scene = sceneOf(widget);
    scene.setAttribute("select", "single");
    await click(item(widget, "and"));
    await click(item(widget, "not"), { ctrlKey: true });
    equal(selected(widget), ["not"], "a modifier click replaces in single mode");
    key("a", item(widget, "not"), { ctrlKey: true });
    await settled(widget);
    equal(selected(widget), ["not"], "no select all");
    scene.setAttribute("select", "none");
    await click(item(widget, "and"));
    equal(selected(widget), ["not"], "nothing is offered with select=none");
});

// ── Moving ────────────────────────────────────────────────────────────────

check("move: a drag previews, then commits one ww-move inside one transaction", async () => {
    const widget = await circuit();
    const not = item(widget, "not");
    let detail: MoveDetail | undefined;
    const model: string[] = [];
    widget.addEventListener("ww-move", (event) => (detail = (event as CustomEvent<MoveDetail>).detail));
    widget.addEventListener("ww-transactionstart", () => model.push(`start ${JSON.parse(widget.getAttribute("model")!).gates[3].x}`));
    widget.addEventListener("ww-transactionend", () => model.push(`end ${JSON.parse(widget.getAttribute("model")!).gates[3].x}`));
    const before = ends(drawn(widget, "w3")).to;
    const changes = mutations(widget);
    await sweep(not, point(not), by(not, 63, 38), {}, {
        held() {
            equal(getComputedStyle(not).translate, "400px 120px", "the node follows the pointer, snapped to the grid of 10");
            const now = ends(drawn(widget, "w3")).to;
            assert(near(now.x, before.x + 60) && near(now.y, before.y + 40), "its wire follows during the drag");
            equal(not.getAttribute("x"), "340", "no attribute changes before the release");
            equal(changes.stop().length, 0, "and nothing in the document");
        },
    });
    await settled(widget);
    equal(detail!.items.map(({ key, x, y }) => ({ key, x, y })), [{ key: "not", x: 400, y: 120 }], "the commit lists the item with its new position");
    equal([detail!.dx, detail!.dy], [60, 40]);
    equal([gate(widget, "not").x, gate(widget, "not").y], [400, 120], "the widget's handler changed the model");
    equal(getComputedStyle(not).translate, "400px 120px", "and the render put the node there");
    equal(model, ["start 340", "end 400"], "the transaction spans the render that reflects the model");
    equal(selected(widget), ["not"], "the press selected the node");
});

check("move: dragging one selected item moves the whole selection", async () => {
    const widget = await circuit();
    await click(item(widget, "and"));
    await click(item(widget, "not"), { ctrlKey: true });
    await click(proxy(widget, "w3"), { ctrlKey: true }); // a path is selected too, but has no position of its own
    let detail: MoveDetail | undefined;
    widget.addEventListener("ww-move", (event) => (detail = (event as CustomEvent<MoveDetail>).detail));
    const length = () => {
        const { from, to } = ends(drawn(widget, "w3"));
        return [Math.round(to.x - from.x), Math.round(to.y - from.y)];
    };
    const span = length();
    await sweep(item(widget, "and"), point(item(widget, "and")), by(item(widget, "and"), -20, 100), {}, {
        held: () => equal(length(), span, "the wire between two moving nodes keeps its shape"),
    });
    await settled(widget);
    equal(detail!.items.map(({ key, x, y }) => ({ key, x, y })), [{ key: "and", x: 170, y: 180 }, { key: "not", x: 320, y: 180 }]);
    equal([gate(widget, "and").x, gate(widget, "not").x, gate(widget, "in1").x], [170, 320, 30], "only the selection moved");
    equal(selected(widget), ["and", "not", "w3"], "the selection survives the move");
});

check("move: Escape and a refused commit change nothing", async () => {
    const widget = await circuit();
    const not = item(widget, "not");
    const before = drawn(widget, "w3").getAttribute("d");
    const log = events("ww-move", "ww-transactionstart");
    await sweep(not, point(not), by(not, 60, 40), {}, { cancel: true });
    await settled(widget);
    equal(log.stop(), [], "Escape: no event, no transaction");
    equal(getComputedStyle(not).translate, "340px 80px", "the node is back");
    equal(drawn(widget, "w3").getAttribute("d"), before, "and its wire");

    // Refused before it reaches the widget's own handler, so the model stays as it is.
    const refuse = (event: Event) => (event.preventDefault(), event.stopPropagation());
    widget.addEventListener("ww-move", refuse, { capture: true, once: true });
    await sweep(not, point(not), by(not, 60, 40));
    await settled(widget);
    equal(getComputedStyle(not).translate, "340px 80px", "a commit the widget does not apply snaps back");
});

check("move: a control inside a node does not start a move", async () => {
    const widget = await circuit();
    const button = item(widget, "in1").querySelector("button")!;
    const log = events("ww-move");
    await sweep(button, point(button), by(button, 60, 40));
    equal(log.stop(), []);
    equal(gate(widget, "in1").x, 30);
});

check("move: a scene that is zoomed or scaled from outside moves by scene pixels", async () => {
    const widget = await circuit();
    const scene = sceneOf(widget);
    scene.style.zoom = "2"; // what Viewport does to its world
    await frame(2);
    const not = item(widget, "not");
    const at = point(port(widget, "not", "a"));
    const inScene = scene.toScene(at.x, at.y);
    const measured = scene.portPosition("not:a")!;
    assert(near(inScene.x, measured.x) && near(inScene.y, measured.y), "client points convert to the same scene points as before");
    equal(ends(drawn(widget, "w3")).to, measured, "the wire still ends at the port");
    await sweep(not, point(not), by(not, 80, 40));
    await settled(widget);
    equal([gate(widget, "not").x, gate(widget, "not").y], [380, 100], "80 by 40 on screen is 40 by 20 in the scene");
    scene.style.zoom = "";
    widget.style.transform = "scale(0.5)";
    widget.style.transformOrigin = "0 0";
    await frame(2);
    await sweep(not, point(not), by(not, 30, 0));
    await settled(widget);
    equal(gate(widget, "not").x, 440, "30 on screen is 60 in a scene drawn at half size");
});

check("viewport: a press the scene acts on is claimed, a plain background press is not", async () => {
    const widget = await circuit();
    const claimed = async (target: Element, init: PointerEventInit = {}, at = point(target)) => {
        const free = pointer(target, "pointerdown", at, init);
        key("Escape", window);
        pointer(target, "pointerup", at, init);
        await frame();
        return !free;
    };
    assert(await claimed(item(widget, "and")), "a movable node");
    assert(await claimed(port(widget, "and", "out")), "a port that starts a wire");
    assert(await claimed(background(widget), { shiftKey: true }, by(background(widget), 0, 130)), "Shift on the background: the marquee");
    assert(!(await claimed(background(widget), {}, by(background(widget), 0, 130))), "the background is left to whoever pans");
    assert(!(await claimed(item(widget, "in1").querySelector("button")!)), "a control inside a node keeps its own behaviour");
    await settled(widget);
});

// ── Resizing ──────────────────────────────────────────────────────────────

check("resize: handles of the selected node, limits, grid and commit", async () => {
    const widget = await circuit();
    const note = item(widget, "note");
    equal(getComputedStyle(handle(widget, "note", "se")).display, "none", "no handles before it is selected");
    await click(note);
    equal(note.shadowRoot!.querySelectorAll("[part=handle]").length, 8);
    equal(getComputedStyle(handle(widget, "note", "se")).display, "block");
    equal(item(widget, "and").shadowRoot!.querySelectorAll("[part=handle]").length, 0, "only resizable nodes have handles");

    let detail: ResizeDetail | undefined;
    widget.addEventListener("ww-resize", (event) => (detail = (event as CustomEvent<ResizeDetail>).detail));
    const log = events("ww-transactionstart", "ww-resize", "ww-transactionend", "ww-move");
    const se = handle(widget, "note", "se");
    await sweep(se, point(se), by(se, 44, 27), {}, {
        held() {
            equal([note.offsetWidth, note.offsetHeight], [220, 90], "the preview is snapped to the grid");
            equal(note.getAttribute("width"), "180", "the attribute is untouched");
        },
    });
    await settled(widget);
    equal(log.stop(), ["ww-transactionstart", "ww-resize", "ww-transactionend"]);
    equal({ ...detail, item: undefined }, { key: "note", x: 190, y: 200, width: 220, height: 90 } as never);
    equal(widget.model.note, { x: 190, y: 200, width: 220, height: 90, text: "Connect NOT to OUT." });

    const nw = handle(widget, "note", "nw");
    await sweep(nw, point(nw), by(nw, 400, 400));
    await settled(widget);
    equal(widget.model.note, { x: 330, y: 250, width: 80, height: 40, text: "Connect NOT to OUT." }, "min-width and min-height stop it; the opposite corner stays");

    await sweep(nw, point(nw), by(nw, -50, -50), {}, { cancel: true });
    await settled(widget);
    equal([note.offsetWidth, note.offsetHeight, widget.model.note.width], [80, 40, 80], "Escape restores the size");
});

check("resize: keep-ratio", async () => {
    const widget = await circuit();
    const note = item(widget, "note");
    note.setAttribute("keep-ratio", "");
    await click(note);
    const e = handle(widget, "note", "e");
    await sweep(e, point(e), by(e, 60, 0));
    await settled(widget);
    equal([widget.model.note.width, widget.model.note.height], [240, 80], "180:60 stays 3:1");
});

// ── Connecting ────────────────────────────────────────────────────────────

check("connect: a drag from a port to a port commits ww-connect", async () => {
    const widget = await circuit();
    const source = port(widget, "not", "out");
    const target = port(widget, "out", "a");
    const link = sceneOf(widget).shadowRoot!.querySelector<SVGElement>("[part=link]")!;
    let detail: ConnectDetail | undefined;
    widget.addEventListener("ww-connect", (event) => (detail = (event as CustomEvent<ConnectDetail>).detail));
    const log = events("ww-transactionstart", "ww-connect", "ww-transactionend", "ww-move", "ww-select");
    // Released 15px beside the port: it attaches to the nearest accepting port within reach.
    await sweep(source, point(source), by(target, -12, 9), {}, {
        held() {
            equal(getComputedStyle(link).display, "block", "the wire is previewed");
            assert(target.hasAttribute("data-ww-port-over") && target.hasAttribute("data-ww-port-candidate"), "the target is marked");
            assert(port(widget, "and", "a").hasAttribute("data-ww-port-candidate") && !source.hasAttribute("data-ww-port-candidate"), "candidates are the accepting ports");
            equal(ends(link).to, sceneOf(widget).portPosition("out:a")!, "the preview ends at the port");
        },
    });
    await settled(widget);
    equal(log.stop(), ["ww-transactionstart", "ww-connect", "ww-transactionend"], "no move and no selection from a port");
    equal([detail!.from, detail!.to, detail!.kind], ["not:out", "out:a", "wire"]);
    assert(detail!.source === source && detail!.target === target);
    equal(widget.model.wires.at(-1), { id: "w4", from: "not", to: "out", input: "a" });
    equal(ends(drawn(widget, "w4")), { from: sceneOf(widget).portPosition("not:out")!, to: sceneOf(widget).portPosition("out:a")! }, "the new wire is drawn between the ports");
    equal(getComputedStyle(link).display, "none");
    equal(widget.shadowRoot!.querySelectorAll("[data-ww-port-candidate], [data-ww-port-over]").length, 0, "the markers are gone");
});

check("connect: no target, Escape and a refusal by the widget add nothing", async () => {
    const widget = await circuit();
    const source = port(widget, "not", "out");
    const log = events("ww-connect");
    await sweep(source, point(source), by(source, 40, 120));
    await sweep(source, point(source), point(port(widget, "out", "a")), {}, { cancel: true });
    equal(log.stop(), [], "a release in the open and Escape commit nothing");
    await sweep(source, point(source), point(port(widget, "not", "a"))); // the widget refuses a gate feeding itself
    await settled(widget);
    equal(widget.model.wires.length, 3);
});

// ── Permissions, the widget's action, cleanup ─────────────────────────────

check("permissions: a reader selects, but changes the circuit only if the author allows it", async () => {
    const widget = await circuit("");
    const not = item(widget, "not");
    const log = events("ww-move", "ww-connect", "ww-resize");
    await sweep(not, point(not), by(not, 60, 40));
    await sweep(port(widget, "not", "out"), point(port(widget, "not", "out")), point(port(widget, "out", "a")));
    await settled(widget);
    equal(log.stop(), [], "can() refuses move and connect");
    equal(selected(widget), ["not"], "selecting is allowed");
    widget.toggleAttribute("allow-editing", true);
    await settled(widget);
    await sweep(not, point(not), by(not, 60, 40));
    await settled(widget);
    equal(gate(widget, "not").x, 400, "with the permission the reader moves it");
});

check("action: deleting the selection removes gates, their wires and selected wires in one transaction", async () => {
    const widget = await circuit();
    await click(item(widget, "and"));
    await click(proxy(widget, "w3"), { ctrlKey: true });
    const node = item(widget, "and");
    const log = events("ww-transactionstart", "ww-transactionend");
    widget.shadowRoot!.querySelector<HTMLButtonElement>("#delete")!.click();
    await settled(widget);
    equal(log.stop(), ["ww-transactionstart", "ww-transactionend"]);
    assert(!node.isConnected, "the gate is gone");
    equal(background(widget).querySelectorAll("path").length, 0, "w1 and w2 lost their gate, w3 was selected");
    equal(sceneOf(widget).shadowRoot!.querySelectorAll("[part=proxy].line").length, 0, "their proxies too");
    equal(selected(widget), []);
});

check("refusal: the SVG renderer refuses ww-sprites with an event that names the fix", async () => {
    const widget = await circuit();
    const scene = sceneOf(widget);
    const errors: SceneErrorDetail[] = [];
    scene.addEventListener("ww-sceneerror", (event) => errors.push((event as CustomEvent<SceneErrorDetail>).detail));
    const logged = warnings();
    scene.insertAdjacentHTML("beforeend", "<ww-sprites></ww-sprites>");
    scene.flush(); // does not throw
    await frame();
    equal(errors.length, 1, "one catchable ww-sceneerror, on the scene");
    assert(errors[0].code === "unsupported" && errors[0].item === (scene.querySelector("ww-sprites") as never), "it names the element");
    assert(/ww-sprites/.test(errors[0].message) && /PixiScene/.test(errors[0].message), `and the fix, got "${errors[0].message}"`);
    equal(logged.stop().length, 1, "an error nobody handled is a warning in development");
    equal(background(widget).querySelectorAll("path").length, 3, "the rest of the scene is still drawn");

    scene.addEventListener("ww-sceneerror", (event) => event.preventDefault());
    const quiet = warnings();
    scene.insertAdjacentHTML("beforeend", "<ww-sprites></ww-sprites>");
    await frame();
    equal([errors.length, quiet.stop().length], [2, 0], "a handler that calls preventDefault() keeps the console quiet");
    for (const sprites of scene.querySelectorAll("ww-sprites")) sprites.remove();
    await frame();
});

check("cleanup: disconnecting removes the drawing, the listeners and a gesture in progress", async () => {
    const before = listeners();
    const widget = await circuit();
    const scene = sceneOf(widget);
    const not = item(widget, "not");
    pointer(not, "pointerdown", point(not));
    pointer(not, "pointermove", by(not, 30, 30));
    await frame(2);
    assert(listeners() > before, "a gesture listens on the window");
    const log = events("ww-move");
    widget.remove();
    await frame(2);
    equal(log.stop(), [], "the interrupted move commits nothing");
    equal(listeners(), before, "nothing is left on window or document");
    assert(!scene.shadowRoot!.querySelector("[part=drawing]"), "the SVG is gone");
    equal(scene.shadowRoot!.querySelectorAll("[part=proxy]").length, 0);
    const flushes = scene.stats.flushes;
    not.setAttribute("x", "5");
    await frame();
    equal(scene.stats.flushes, flushes, "a disconnected scene does not react");

    document.body.append(widget);
    await settled(widget);
    equal(background(widget).querySelectorAll("path").length, 3, "reconnecting draws the scene again");
    widget.remove();
});

// ── Keyboard, on the example ──────────────────────────────────────────────

const spoken = (widget: Element) => widget.shadowRoot!.querySelector("[data-ww-live]")?.textContent?.trim() ?? "";

check("keyboard: a gate is moved with the arrow keys and two gates are wired from a port", async () => {
    const widget = await circuit();
    const not = item(widget, "not");
    not.focus();
    key(" ");
    await settled(widget);
    const log = events("ww-transactionstart", "ww-move", "ww-connect", "ww-transactionend");
    key("ArrowRight");
    key("ArrowRight");
    key("ArrowDown", undefined, { shiftKey: true });
    await frame();
    equal(getComputedStyle(not).translate, "360px 130px", "two grid steps right and one large step down, as a preview");
    equal([gate(widget, "not").x, log.log.length], [340, 0], "nothing is committed yet");
    key("Enter");
    await settled(widget);
    equal([gate(widget, "not").x, gate(widget, "not").y], [360, 130], "Enter commits the move to the model");
    equal(spoken(widget), "Moved.");

    const out = port(widget, "not", "out");
    equal([out.tabIndex, out.getAttribute("role"), out.getAttribute("aria-label")], [0, "button", "Connect from out of not"], "an output port is a button for the keyboard");
    out.focus();
    key("Enter");
    equal(spoken(widget), "Wire from out of not. 4 ports accept it. Arrow keys choose, Enter connects, Escape cancels. a of not, 3 of 4.", "the nearest input is offered first: the gate's own");
    key("Enter"); // the widget refuses a gate that feeds itself
    await settled(widget);
    equal([spoken(widget), widget.model.wires.length], ["Not connected.", 3]);
    key("Enter");
    key("ArrowRight");
    equal(spoken(widget), "a of out, 4 of 4.");
    key("Enter");
    await settled(widget);
    equal(widget.model.wires.at(-1), { id: "w4", from: "not", to: "out", input: "a" }, "the next input is the one of OUT, and Enter connects to it");
    equal(spoken(widget), "Connected out of not to a of out.");
    equal(log.stop(), ["ww-transactionstart", "ww-move", "ww-transactionend", "ww-transactionstart", "ww-connect", "ww-transactionend", "ww-transactionstart", "ww-connect", "ww-transactionend"], "each of them one undo step");
});

check("group and image: the legend moves as one, by pointer and by keyboard, and its picture is drawn once loaded", async () => {
    const widget = await circuit();
    const scene = sceneOf(widget);
    const picture = scene.rendering(item(widget, "legend").querySelector("ww-image") as never) as SVGImageElement;
    await until(() => picture.hasAttribute("href"), "the picture was not drawn");
    equal([picture.getAttribute("width"), picture.getAttribute("href")!.slice(0, 18)], ["24", "data:image/svg+xml"], "a ww-image by URL");
    const group = drawn(widget, "legend");
    equal(group.getAttribute("transform"), "translate(460 210) scale(1)");
    const pane = scene.rendering(item(widget, "legend").querySelector("ww-shape") as never) as SVGRectElement;
    // The pane is not movable itself. The group around it is.
    await sweep(pane, point(pane), by(pane, 43, -18), {}, { held: () => equal(group.getAttribute("transform"), "translate(500 190) scale(1)", "a preview, snapped to the grid") });
    await settled(widget);
    equal(widget.model.legend, { x: 500, y: 190 }, "ww-move reported the group");
    equal(selected(widget), [], "a group that is only movable selects nothing");
    const standIn = proxy(widget, "Legend");
    standIn.focus();
    key("ArrowLeft");
    key("Enter");
    await settled(widget);
    equal(widget.model.legend, { x: 490, y: 190 }, "its stand-in takes the keys: an item that cannot be selected moves alone");
});

// ── In a viewport ─────────────────────────────────────────────────────────

check("viewport: zoomed by the real Viewport, the scene keeps its coordinates", async () => {
    const widget = await circuit();
    const scene = sceneOf(widget);
    const win = widget.shadowRoot!.querySelector<HTMLElement>(".window")!;
    const corner = win.getBoundingClientRect();
    widget.view.zoomTo(2, { x: corner.left, y: corner.top });
    await settled(widget);
    equal([widget.view.scale, getComputedStyle(scene).zoom], [2, "2"], "the viewport zooms the scene with CSS, from outside");
    const out = point(port(widget, "and", "out"));
    const inScene = scene.toScene(out.x, out.y);
    const world = widget.view.toWorld(out.x, out.y);
    assert(near(inScene.x, world.x - scene.clientLeft, 0.01) && near(inScene.y, world.y - scene.clientTop, 0.01), "toScene() agrees with the viewport's toWorld(), inside the scene's border");
    const measured = scene.portPosition("and:out")!;
    assert(near(measured.x, inScene.x) && near(measured.y, inScene.y), "ports are measured in scene pixels");
    equal(ends(drawn(widget, "w3")).from, measured, "and the wire starts there");

    const middle = drawn(widget, "w1").getBoundingClientRect();
    const hit = scene.shadowRoot!.elementFromPoint(middle.left + middle.width / 2, middle.top + middle.height / 2);
    pointer(hit!, "pointerdown", { x: middle.left + middle.width / 2, y: middle.top + middle.height / 2 });
    pointer(hit!, "pointerup", { x: middle.left + middle.width / 2, y: middle.top + middle.height / 2 });
    await settled(widget);
    equal(selected(widget), ["w1"], "a wire is hit where it is shown");

    const and = item(widget, "and");
    await sweep(and, point(and), by(and, 80, 40));
    await settled(widget);
    equal([gate(widget, "and").x, gate(widget, "and").y], [230, 100], "80 by 40 on screen is 40 by 20 in the scene");
    key("ArrowLeft", and);
    key("Enter", and);
    await settled(widget);
    equal(gate(widget, "and").x, 220, "a step of the arrow keys is the grid of the scene, whatever the zoom");

    const box = scene.getBoundingClientRect();
    await sweep(background(widget), { x: box.left + 2 * 20, y: box.top + 2 * 20 }, { x: box.left + 2 * 120, y: box.top + 2 * 170 }, { shiftKey: true });
    await settled(widget);
    equal(selected(widget), ["and", "in1", "in2", "w1", "w2"], "the marquee is in scene coordinates too: the two inputs and the wires that leave them, added to the gate that was selected");
});

check("viewport: a plain drag on the board pans the window, a press on an item does not", async () => {
    const widget = await circuit();
    const scene = sceneOf(widget);
    const win = widget.shadowRoot!.querySelector<HTMLElement>(".window")!;
    await click(item(widget, "and"));
    const board = drawn(widget, "legend").previousElementSibling as SVGRectElement;
    equal(board.localName, "rect", "the board is a drawn shape that covers the whole scene and that nothing claims");
    const seen: string[] = [];
    widget.shadowRoot!.addEventListener("pointerdown", (event) => seen.push(`${(event.target as Element).localName}${event.defaultPrevented ? " claimed" : ""}`));
    const box = win.getBoundingClientRect();
    const from = { x: box.left + 300, y: box.top + 250 };
    equal(scene.shadowRoot!.elementFromPoint(from.x, from.y), board);
    await sweep(board, from, { x: from.x - 120, y: from.y - 60 });
    await settled(widget);
    equal([win.scrollLeft, win.scrollTop], [120, 60], "the viewport took the drag: the window scrolled");
    equal(seen, ["ww-shape", "ww-scene"], "the press went on from the shape to the scene itself, which is what the viewport calls background");
    equal(selected(widget), ["and"], "a drag is no click: the selection stays");

    const not = item(widget, "not");
    await sweep(not, point(not), by(not, 30, 20));
    await settled(widget);
    equal([win.scrollLeft, win.scrollTop, gate(widget, "not").x], [120, 60, 370], "a press on a gate is claimed: the gate moves and the window stays");
    equal(seen.at(-1), "ww-node claimed");
    await click(board, {}, { x: from.x, y: from.y });
    await settled(widget);
    equal(selected(widget), [], "a click on the board clears the selection");
});

// ── Routes ────────────────────────────────────────────────────────────────

check("route: an orthogonal wire is made of horizontal and vertical segments and goes around the gates", async () => {
    const widget = await circuit();
    widget.wireRoute = "orthogonal";
    await settled(widget);
    await frame(2);
    const scene = sceneOf(widget);
    const line = (id: string) => scene.drawingOf(item(widget, id) as never) as { type: "path"; points: Point[] };
    const boxes = (except: string[]) =>
        widget.model.gates.filter((other) => !except.includes(other.id)).map((other) => ({ x: other.x, y: other.y, width: item(widget, other.id).offsetWidth, height: item(widget, other.id).offsetHeight }));
    const crosses = (points: Point[], box: { x: number; y: number; width: number; height: number }) =>
        points.slice(1).some((p, i) => Math.max(p.x, points[i].x) > box.x && Math.min(p.x, points[i].x) < box.x + box.width && Math.max(p.y, points[i].y) > box.y && Math.min(p.y, points[i].y) < box.y + box.height);
    for (const wire of widget.model.wires) {
        const { points } = line(wire.id);
        assert(points.length >= 2 && points.slice(1).every((p, i) => p.x === points[i].x || p.y === points[i].y), `${wire.id} has only horizontal and vertical segments`);
        assert(boxes([wire.from, wire.to]).every((box) => !crosses(points, box)), `${wire.id} crosses no other gate`);
    }
    // A gate that moves into the way is gone around, and the wire follows the gate while it is dragged.
    const wire = line("w3").points;
    const and = gate(widget, "and");
    // Room between AND and NOT, and a gate in the middle of it.
    widget.model = {
        ...widget.model,
        gates: [
            ...widget.model.gates.map((other) => (other.id === "not" ? { ...other, x: 560 } : other.id === "out" ? { ...other, x: 720 } : other)),
            { id: "block", kind: "NOT", x: 380, y: and.y - 4 },
        ],
    };
    await settled(widget);
    await frame(2);
    assert(boxes(["and", "not"]).every((box) => !crosses(line("w3").points, box)), "w3 goes around the gate that was added between its ends");
    assert(line("w3").points.length > 4, "by a detour");
    assert(wire.length >= 2);
    // The wires of a circuit are still curves where the page asks for curves.
    widget.wireRoute = "curve";
    await settled(widget);
    await frame(2);
    assert(drawn(widget, "w1").getAttribute("d")!.includes("C"), "a curve again");
});

// ── The package ───────────────────────────────────────────────────────────

check("import: a widget on the SVG renderer bundles no PixiJS", async () => {
    const bundle = await (await fetch(new URL("./index.js", import.meta.url))).text();
    assert(bundle.includes("ww-scene") && bundle.length > 10000, "this is the bundle of the circuit");
    assert(!/WebGLRenderer|pixi\.js/.test(bundle), "the Pixi renderer is its own import, and nothing here pulls it in");
    equal(Object.keys(sceneElements), ["ww-scene", "ww-node", "ww-path", "ww-shape", "ww-text", "ww-image", "ww-group", "ww-sprites"], "the fixed names a widget registers in its own scope");
});

sharedChecks("ww-bench-svg", "svg");

run();
