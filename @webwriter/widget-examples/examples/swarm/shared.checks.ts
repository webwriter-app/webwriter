// Checks of everything the two renderers share, on the bench of bench.ts. The
// circuit page runs them on the SVG renderer and the swarm page on Pixi.
import { assert, check, deepActive, equal, events, frame, key, listeners, mount, mutations, point, pointer, until, type Point } from "../../test/harness";
import type { SceneBase, SceneErrorDetail } from "@webwriter/widget/scene";
import { BROKEN_URL, RED_URL, type Bench, type Socket } from "./bench";

type View = { x: number; y: number; scale: number };
type Drawn = SVGGraphicsElement | { getLocalBounds(): { x: number; y: number; width: number; height: number }; position: Point; scale: Point; visible: boolean };
type PixiLike = SceneBase & { render(): boolean; readonly contextLost: boolean };
type Steps = { held?: () => unknown; cancel?: boolean };

const REST: View = { x: 0, y: 0, scale: 1 };
const isPixi = (scene: SceneBase): scene is PixiLike => "render" in scene;
const near = (a: number, b: number, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
const sceneOf = (widget: Element) => widget.shadowRoot!.querySelector("ww-scene") as unknown as SceneBase;
const item = (widget: Element, id: string) => widget.shadowRoot!.querySelector<HTMLElement>(`[data-ww-key="${id}"]`)!;
const drawn = (widget: Element, id: string) => sceneOf(widget).rendering(item(widget, id) as never) as Drawn;
const standIns = (widget: Element) => [...sceneOf(widget).shadowRoot!.querySelectorAll<SVGPathElement>("[part=proxy]")];
const standIn = (widget: Element, label: string) => standIns(widget).find((element) => element.getAttribute("aria-label") === label)!;
const spoken = (widget: Element) => widget.shadowRoot!.querySelector("[data-ww-live]")?.textContent?.trim() ?? "";
const port = (widget: Element, id: string, name: string) => item(widget, id).querySelector<HTMLElement>(`[data-ww-port="${name}"]`)!;
const keyup = (name: string) => deepActive()!.dispatchEvent(new KeyboardEvent("keyup", { key: name, bubbles: true, composed: true }));

/** Bounds of a drawn item in the coordinates of its group, from either renderer. */
function bounds(widget: Element, id: string) {
    const object = drawn(widget, id);
    if ("getBBox" in object) {
        const { x, y, width, height } = object.getBBox();
        return { x, y, width, height };
    }
    // A Pixi object's own bounds, placed and scaled as its group sees it.
    const { x, y, width, height } = object.getLocalBounds();
    return { x: x * object.scale.x + object.position.x, y: y * object.scale.y + object.position.y, width: width * object.scale.x, height: height * object.scale.y };
}

/** The client position of a scene position. */
function client(scene: SceneBase, x: number, y: number, view = REST): Point {
    const box = scene.getBoundingClientRect();
    const outer = box.width / scene.offsetWidth;
    return { x: box.left + (scene.clientLeft + x * view.scale + view.x) * outer, y: box.top + (scene.clientTop + y * view.scale + view.y) * outer };
}

/** A client position in scene coordinates, measured from the page alone. */
function sceneAt(scene: SceneBase, at: Point, view = REST): Point {
    const box = scene.getBoundingClientRect();
    const outer = box.width / scene.offsetWidth;
    return { x: ((at.x - box.left) / outer - scene.clientLeft - view.x) / view.scale, y: ((at.y - box.top) / outer - scene.clientTop - view.y) / view.scale };
}

/** What the pointer really hits at a scene position, through every shadow root. */
function under(scene: SceneBase, x: number, y: number, view = REST): { element: Element; at: Point } {
    if (isPixi(scene)) scene.render(); // Pixi hit-tests with the transforms of its last frame
    const at = client(scene, x, y, view);
    let element = document.elementFromPoint(at.x, at.y)!;
    for (;;) {
        const inner = element.shadowRoot?.elementFromPoint(at.x, at.y);
        if (!inner || inner === element) return { element, at };
        element = inner;
    }
}

/** Waits for the widget's render and for what the scene does right after it. One frame is enough: the scene works in microtasks. */
async function rendered(widget: Bench) {
    await widget.updateComplete;
    await frame();
}

async function click(scene: SceneBase, x: number, y: number, init: PointerEventInit = {}, view = REST) {
    const { element, at } = under(scene, x, y, view);
    pointer(element, "pointerdown", at, init);
    pointer(element, "pointerup", at, init);
    await frame();
}

/** A pointer drag between two scene positions, starting on what is really there. */
async function sweep(scene: SceneBase, from: Point, to: Point, init: PointerEventInit = {}, steps: Steps = {}, view = REST) {
    const { element, at } = under(scene, from.x, from.y, view);
    const end = client(scene, to.x, to.y, view);
    pointer(element, "pointerdown", at, init);
    pointer(element, "pointermove", { x: at.x + 6, y: at.y + 6 }, init);
    await frame();
    pointer(element, "pointermove", end, init);
    await frame();
    await steps.held?.();
    if (steps.cancel) key("Escape", window);
    else pointer(element, "pointerup", end, init);
    await frame();
}

/** The colour the canvas of a Pixi scene shows at a scene position. */
function pixel(scene: PixiLike, x: number, y: number, view = REST): number[] {
    const canvas = scene.querySelector("canvas") ?? scene.shadowRoot!.querySelector("canvas")!;
    assert(scene.render(), "the scene has a context to draw with");
    const copy = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d")!;
    copy.drawImage(canvas, (x * view.scale + view.x) * devicePixelRatio, (y * view.scale + view.y) * devicePixelRatio, 1, 1, 0, 0, 1, 1);
    return [...copy.getImageData(0, 0, 1, 1).data];
}

/** The fill of a drawn shape as [r, g, b]: its style in SVG, a pixel inside it in Pixi. */
function fill(widget: Element, id: string, x: number, y: number): number[] {
    const scene = sceneOf(widget);
    if (isPixi(scene)) return pixel(scene, x, y).slice(0, 3);
    return (drawn(widget, id) as SVGGraphicsElement).style.fill.match(/[\d.]+/g)!.map(Number);
}

/** The centre of a node's port in scene coordinates, as the browser laid it out. */
const laidOut = (widget: Element, element: Element, view = REST) => sceneAt(sceneOf(widget), point(element), view);

/** Registers the shared checks for the bench registered as `tag`. */
export function sharedChecks(tag: string, name: "svg" | "pixi") {
    const bench = async (attributes = "contenteditable"): Promise<Bench> => {
        const widget = await mount<Bench>(`<${tag} ${attributes}></${tag}>`);
        const scene = sceneOf(widget);
        if (isPixi(scene)) await until(() => !scene.contextLost, "no WebGL context", 8000);
        return widget;
    };
    const both = (title: string, fn: () => unknown) => check(`both (${name}): ${title}`, fn);

    // ── Description ───────────────────────────────────────────────────────

    both("the elements are a description: they render nothing, and changes reach the drawing once per microtask", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        equal(getComputedStyle(item(widget, "crate")).display, "none", "a drawn element has no box of its own");
        equal(bounds(widget, "crate"), { x: 40, y: 230, width: 50, height: 30 }, "the renderer drew it from its attributes");
        const { flushes } = scene.stats;
        const crate = item(widget, "crate");
        crate.setAttribute("x", "50");
        crate.setAttribute("width", "70");
        scene.insertAdjacentHTML("beforeend", `<ww-shape data-ww-key="late" kind="rect" x="500" y="290" width="20" height="10"></ww-shape>`);
        item(widget, "under").remove();
        equal(scene.stats.flushes, flushes, "nothing happens synchronously");
        await Promise.resolve();
        equal(scene.stats.flushes, flushes + 1, "one reconciliation for all of it");
        equal(bounds(widget, "crate"), { x: 50, y: 230, width: 70, height: 30 }, "changed");
        equal(bounds(widget, "late"), { x: 500, y: 290, width: 20, height: 10 }, "added");
        equal(fill(widget, "late", 510, 295), [0, 0, 0], "a shape without any rule of the widget has the module's default: filled in the current colour");
        equal(scene.constructor.name, name === "pixi" ? "PixiScene" : "Scene", "the renderer is the class registered as ww-scene");
    });

    // ── Computed styles ───────────────────────────────────────────────────

    both("styles: a class, [selected] and a custom property are drawn", async () => {
        const widget = await bench();
        equal(fill(widget, "crate", 65, 245), [255, 128, 0], "ww-shape.crate");
        const caption = bounds(widget, "caption");
        assert(near(caption.x, 120, 2) && caption.height > 11 && caption.height < 24 && caption.width > 30, `a text is drawn at its position in the font of its element, 14px here, got ${JSON.stringify(caption)}`);
        item(widget, "caption").style.fontSize = "28px";
        await frame();
        assert(bounds(widget, "caption").height > caption.height * 1.6, "and follows the font properties");
        widget.selection = ["crate"];
        await rendered(widget);
        equal(fill(widget, "crate", 65, 245), [128, 0, 128], "ww-shape.crate[selected]");
        const style = widget.shadowRoot!.appendChild(document.createElement("style"));
        style.textContent = "ww-scene ww-shape.under { fill: var(--under, rgb(0, 0, 255)); }";
        widget.style.setProperty("--under", "rgb(9, 99, 9)");
        await until(() => fill(widget, "under", 305, 228).join() === "9,99,9", "a custom property set on the host was not drawn");
    });

    both("styles: a render reads only what changed; the theme signals and restyle() read everything", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        const { stats } = scene;
        const count = () => [stats.styled, stats.drawn, stats.measured];
        const since = (before: number[]) => count().map((value, index) => value - before[index]);
        const everything = widget.shadowRoot!.querySelectorAll("ww-shape, ww-path, ww-text, ww-image, ww-group").length;

        let before = count();
        widget.requestUpdate();
        await widget.updateComplete;
        equal(since(before), [1, 0, 0], "a render that changes nothing draws nothing and measures no port; the one style it reads is that of the path whose .points array may have changed in place");

        before = count();
        item(widget, "crate").classList.add("marked");
        await frame();
        equal(since(before), [1, 0, 0], "an attribute of one element: one style is read, and nothing is drawn because it computes to the same");

        before = count();
        widget.selection = ["crate"];
        await widget.updateComplete;
        equal(since(before), [2, 1, 0], "a render that selects one element reads and draws that one");

        before = count();
        widget.classList.add("themed");
        await until(() => stats.styled - before[0] >= everything, "a class on the host did not restyle the scene");
        equal(since(before), [everything, 0, everything ? stats.measured - before[2] : 0], "the host's class: every style once");
        assert(stats.measured - before[2] > 0, "and the ports are measured again, because a theme can move them");

        before = count();
        scene.restyle();
        await frame();
        equal(since(before).slice(0, 2), [everything, 0], "restyle()");

        before = count();
        scene.classList.add("themed");
        await frame();
        equal(since(before).slice(0, 2), [everything, 0], "a class on the scene itself");

        before = count();
        item(widget, "cluster").classList.add("themed");
        await frame();
        equal(since(before).slice(0, 2), [3, 0], "a class on a group: the group and what is drawn in it");
    });

    both("hover: the pointer sets ww-path:state(hover), in a band around a thin line", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        const line = item(widget, "line");
        const beside = under(scene, 280, 224); // 4px below the 2px line
        pointer(beside.element, "pointermove", beside.at);
        pointer(beside.element, "pointerover", beside.at);
        await frame(2);
        assert(line.matches(":state(hover)"), "4px beside the line is still the line");
        if (isPixi(scene)) equal(pixel(scene, 280, 220).slice(0, 3), [255, 0, 0], "the hover rule is drawn");
        else equal((drawn(widget, "line") as SVGGraphicsElement).style.stroke, "rgb(255, 0, 0)", "the hover rule is drawn");
        const away = under(scene, 280, 240);
        pointer(beside.element, "pointerout", beside.at);
        pointer(away.element, "pointermove", away.at);
        await frame(2);
        assert(!line.matches(":state(hover)"), "it ends when the pointer leaves the band");
    });

    // ── Ports ─────────────────────────────────────────────────────────────

    both("ports: a path ends where the browser laid its ports out, and follows its nodes", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        const from = scene.portPosition("n1:out")!;
        const to = scene.portPosition("n2:in")!;
        const out = laidOut(widget, port(widget, "n1", "out"));
        assert(near(from.x, out.x) && near(from.y, out.y), "n1:out");
        const wire = bounds(widget, "wire1");
        assert(near(wire.x, from.x, 2.5) && near(wire.x + wire.width, to.x, 2.5), `the wire spans the two ports, got ${JSON.stringify(wire)}`);

        const measured = scene.stats.measured;
        widget.places = { ...widget.places, n2: { x: 260, y: 70 } };
        await rendered(widget);
        const moved = scene.portPosition("n2:in")!;
        assert(near(moved.x, to.x + 40) && near(moved.y, to.y + 30), "the port moved with its node");
        assert(near(bounds(widget, "wire1").width, wire.width + 40, 2.5), "and the wire follows");
        equal(scene.stats.measured, measured, "a node that only moved is not measured again");

        // No render: only the node's layout changes, as when its content grows.
        item(widget, "n1").style.minWidth = "120px";
        await until(() => scene.portPosition("n1:out")!.x > from.x + 20, "the port did not follow the wider node");
        equal(scene.stats.measured, measured + 1, "only the node that resized is measured again");
        const wider = laidOut(widget, port(widget, "n1", "out"));
        assert(near(scene.portPosition("n1:out")!.x, wider.x), "to where the port now is");
    });

    both("ports: a route leaves towards the nearest edge, unless data-ww-side says otherwise", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        const end = scene.portPosition("n2:odd")!;
        const start = scene.portPosition("n1:out")!;
        const lowest = () => {
            const box = bounds(widget, "hook");
            return box.y + box.height;
        };
        assert(lowest() < Math.max(start.y, end.y) + 3, "declared left: the curve arrives from the left and stays above the port");
        const measured = scene.stats.measured;
        port(widget, "n2", "odd").removeAttribute("data-ww-side");
        await until(() => lowest() > end.y + 10, "without the attribute the port faces the bottom edge it sits on, so the curve arrives from below");
        equal(scene.stats.measured, measured + 1, "a change in a node's content measures that node again, and no other");
    });

    both("ports: inside a nested component, and ports that move without a render", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        const socket = item(widget, "n3").querySelector("ww-socket") as Socket;
        const deep = socket.shadowRoot!.querySelector("[data-ww-port]")!;
        const found = scene.portPosition("n3:deep")!;
        const there = laidOut(widget, deep);
        assert(near(found.x, there.x) && near(found.y, there.y), "a port in the open shadow root of a component in the node is found and measured");

        const measured = scene.stats.measured;
        socket.shift(11); // the component renders by itself; nothing in the widget's template changes
        await until(() => near(scene.portPosition("n3:deep")!.y, found.y + 5), "the path did not follow a port that moved inside the component");
        equal(scene.stats.measured, measured + 1);

        const far = scene.portPosition("n4:far")!;
        item(widget, "n4").querySelector(".scroller")!.scrollTop = 40;
        await until(() => near(scene.portPosition("n4:far")!.y, far.y - 40), "a port that scrolled inside its node was not measured again");
        const tether = bounds(widget, "tether");
        assert(near(tether.y, Math.min(scene.portPosition("n4:far")!.y, scene.portPosition("n3:deep")!.y), 2.5), "and its path follows");

        // A style rule moves a port. No observer sees that: the widget says so.
        const before = scene.portPosition("n1:out")!;
        const rule = widget.shadowRoot!.appendChild(document.createElement("style"));
        rule.textContent = ".port.out { top: 0; }";
        await frame(3);
        equal(scene.portPosition("n1:out"), before, "not noticed");
        widget.scene.remeasure();
        await frame();
        assert(scene.portPosition("n1:out")!.y < before.y - 3, "remeasure() measures again");
    });

    // ── Events ────────────────────────────────────────────────────────────

    both("events: pointer events of a drawn shape arrive once, on its scene element; enter and leave are not forwarded", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        const seen: string[] = [];
        const log = (event: Event) => seen.push(`${event.type}:${(event.target as Element).getAttribute("data-ww-key")}`);
        for (const type of ["pointerdown", "pointerup", "click", "dblclick", "contextmenu"]) widget.shadowRoot!.addEventListener(type, log);
        // These two do not bubble, so they are looked for on the way down.
        for (const type of ["pointerenter", "pointerleave"]) widget.shadowRoot!.addEventListener(type, (event) => event.target instanceof HTMLElement && event.target.localName === "ww-shape" && log(event), true);
        const { element, at } = under(scene, 400, 226);
        const mouse = { bubbles: true, composed: true, clientX: at.x, clientY: at.y };
        pointer(element, "pointerdown", at);
        pointer(element, "pointerup", at);
        element.dispatchEvent(new MouseEvent("click", mouse));
        element.dispatchEvent(new MouseEvent("dblclick", mouse));
        element.dispatchEvent(new MouseEvent("contextmenu", mouse));
        element.dispatchEvent(new PointerEvent("pointerenter", { ...mouse, bubbles: false }));
        element.dispatchEvent(new PointerEvent("pointerleave", { ...mouse, bubbles: false }));
        equal(seen, ["pointerdown:over", "pointerup:over", "click:over", "dblclick:over", "contextmenu:over"], "the circle drawn above the line takes them, not the line's band");
    });

    // ── Selection ─────────────────────────────────────────────────────────

    both("select: click, modifier click, background click and a refused selection", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        await click(scene, 65, 245);
        equal(widget.selection, ["crate"], "a click on a drawn shape selects it");
        const n1 = point(item(widget, "n1"));
        const node = sceneAt(scene, n1);
        await click(scene, node.x, node.y, { ctrlKey: true });
        equal(widget.selection, ["crate", "n1"], "Ctrl adds");
        await click(scene, 65, 245, { shiftKey: true });
        equal(widget.selection, ["n1"], "a modifier click on a selected item removes it");
        await click(scene, 330, 224);
        equal(widget.selection, ["line"], "a plain click selects one: the line, through the shape below it");
        await click(scene, 520, 300);
        equal(widget.selection, [], "a click on the background clears, also where a shape that is not selectable lies");
        equal(widget.log, ["select:crate", "select:crate,n1", "select:n1", "select:line", "select:"], "one ww-select per change");

        widget.addEventListener("ww-select", (event) => event.preventDefault(), { capture: true });
        await sweep(scene, { x: 65, y: 245 }, { x: 165, y: 245 });
        await rendered(widget);
        equal(widget.log.filter((entry) => entry.startsWith("move")), [], "a cancelled ww-select also stops the move the press would have started");
    });

    both("select: select=single keeps one, select=none offers nothing", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        scene.setAttribute("select", "single");
        await click(scene, 65, 245);
        await click(scene, 330, 224, { ctrlKey: true });
        equal(widget.selection, ["line"], "a modifier click replaces");
        standIn(widget, "line").focus();
        key("a", undefined, { ctrlKey: true });
        await rendered(widget);
        equal(widget.selection, ["line"], "no select all");
        await sweep(scene, { x: 20, y: 300 }, { x: 200, y: 200 }, { shiftKey: true });
        equal(widget.selection, ["line"], "no marquee: the drag is a click that did not happen");
        scene.setAttribute("select", "none");
        await click(scene, 65, 245);
        equal(widget.selection, ["line"]);
    });

    both("select: Shift and a drag on the background draws a marquee, which adds what it touches", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        const marquee = scene.shadowRoot!.querySelector<SVGElement>("[part=marquee]")!;
        const n1 = sceneAt(scene, point(item(widget, "n1")));
        await click(scene, n1.x, n1.y);
        await sweep(scene, { x: 20, y: 212 }, { x: 300, y: 275 }, { shiftKey: true }, {
            held() {
                equal(getComputedStyle(marquee).display, "block", "the marquee is drawn");
                equal(["x", "y", "width", "height"].map((side) => Math.round(Number(marquee.getAttribute(side)))), [20, 212, 280, 63], "in scene coordinates");
                equal(getComputedStyle(marquee).stroke, "rgb(200, 0, 120)", "in the colour of --ww-scene-selection");
                equal(getComputedStyle(marquee).strokeDasharray, "3px, 2px", "and styled by the widget through ::part(marquee)");
                assert(scene.matches(":state(marquee)") && widget.scene.marquee, "the scene says that a marquee is drawn");
                equal(widget.selection, ["n1"], "nothing changes before the release");
            },
        });
        equal([...widget.selection].sort(), ["caption", "crate", "line", "n1", "pic"], "a shape, a text and a picture by their box, a path by its line, added to what was selected");
        equal(getComputedStyle(marquee).display, "none");
        assert(!scene.matches(":state(marquee)") && !widget.scene.marquee);

        await sweep(scene, { x: 20, y: 300 }, { x: 540, y: 20 }, { shiftKey: true }, { cancel: true });
        equal(widget.selection.length, 5, "Escape cancels the marquee");
        await sweep(scene, { x: 20, y: 300 }, { x: 540, y: 20 });
        equal(widget.selection.length, 5, "a plain drag on the background selects nothing");
    });

    both("select: keyboard, with stand-ins for drawn items in template order", async () => {
        const widget = await bench();
        equal(standIns(widget).map((element) => element.getAttribute("aria-label")), ["line", "Crate", "caption", "pic", "Cluster", "wire1"], "one per selectable or movable drawn item, in template order");
        assert(standIns(widget).every((element) => element.tabIndex === 0), "each takes focus, so the Tab key visits them in that order");
        equal(item(widget, "n1").tabIndex, 0, "a selectable node takes focus itself");

        widget.wires = [{ id: "early", from: "n2:out", to: "inner:in" }, ...widget.wires];
        await rendered(widget);
        equal(standIns(widget).map((element) => element.getAttribute("aria-label")).slice(-2), ["early", "wire1"], "an element added before another gets its stand-in before it");

        standIn(widget, "Crate").focus();
        assert(deepActive() === standIn(widget, "Crate"));
        key(" ");
        await rendered(widget);
        equal(widget.selection, ["crate"], "Space selects");
        equal(spoken(widget), "1 item selected.", "and it is announced");
        assert(standIn(widget, "Crate").classList.contains("selected"), "the stand-in shows the selection");
        item(widget, "n1").focus();
        key("Enter", undefined, { shiftKey: true });
        await rendered(widget);
        equal(widget.selection, ["crate", "n1"], "Shift adds");
        assert(!key("a", undefined, { ctrlKey: true }), "Ctrl+A is consumed");
        await rendered(widget);
        equal([...widget.selection].sort(), ["caption", "cluster", "crate", "early", "line", "n1", "n2", "n3", "note", "pic", "wire1"], "everything selectable");
        equal(spoken(widget), "11 items selected.");
        key("Escape");
        await rendered(widget);
        equal(widget.selection, [], "Escape clears");
        equal(spoken(widget), "Selection cleared.");
    });

    both("selection is drawn by the module: outline, stand-in and handles, in --ww-scene-selection", async () => {
        const widget = await bench();
        widget.selection = ["n1", "crate", "line", "note"];
        await rendered(widget);
        equal(getComputedStyle(item(widget, "n1")).outlineColor, "rgb(200, 0, 120)", "a selected node has an outline");
        equal(getComputedStyle(standIn(widget, "Crate")).stroke, "rgb(200, 0, 120)", "a selected shape is outlined by its stand-in");
        assert(standIn(widget, "line").classList.contains("line") && getComputedStyle(standIn(widget, "line")).strokeWidth === "12px", "a selected line gets a halo");
        const d = standIn(widget, "Crate").getAttribute("d")!;
        equal(d, "M40 230L90 230L90 260L40 260Z", "the stand-in has the outline of the shape, in scene coordinates");
        const handle = item(widget, "note").shadowRoot!.querySelector<HTMLElement>("[part=handle]")!;
        equal(getComputedStyle(handle).borderTopColor, "rgb(200, 0, 120)", "the handles are parts of the node");
        const svg = sceneOf(widget).shadowRoot!.querySelector("[part=proxies]")!;
        equal(getComputedStyle(svg).pointerEvents, "none", "the stand-ins take no pointer: hit testing is the drawing's, in its own order");
    });

    // ── Moving ────────────────────────────────────────────────────────────

    both("move: a drawn shape previews, then commits one ww-move inside one transaction", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        const crate = item(widget, "crate");
        const log = events("ww-transactionstart", "ww-move", "ww-transactionend");
        const changes = mutations(widget);
        await sweep(scene, { x: 65, y: 245 }, { x: 128, y: 283 }, {}, {
            held() {
                equal(bounds(widget, "crate"), { x: 100, y: 270, width: 50, height: 30 }, "the shape follows the pointer, snapped to the grid of 10");
                equal(crate.getAttribute("x"), "40", "no attribute changes before the release");
                equal(changes.stop().length, 0, "and nothing in the document");
            },
        });
        await rendered(widget);
        equal(log.stop(), ["ww-transactionstart", "ww-move", "ww-transactionend"]);
        equal(widget.log, ["select:crate", "move:crate@100,270"], "the press selected it, the release moved it");
        equal(widget.places.crate, { x: 100, y: 270 });
        equal(bounds(widget, "crate"), { x: 100, y: 270, width: 50, height: 30 }, "the render put it there");
    });

    both("move: text, pictures, free paths and nodes move, and the selection moves together", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        await until(() => widget.errors.length === 0 && bounds(widget, "pic").width > 0, "the picture did not load");
        await sweep(scene, { x: 125, y: 248 }, { x: 125, y: 278 });
        await rendered(widget);
        equal(widget.places.caption, { x: 120, y: 270 }, "a ww-text");
        await sweep(scene, { x: 196, y: 278 }, { x: 216, y: 278 });
        await rendered(widget);
        equal(widget.places.pic, { x: 200, y: 260 }, "a ww-image");
        await sweep(scene, { x: 280, y: 220 }, { x: 280, y: 190 });
        await rendered(widget);
        equal(widget.places.line, { x: 260, y: 190 }, "a path along .points, which are relative to its x and y");
        assert(near(bounds(widget, "line").y, 190, 2), "and it is drawn there");

        widget.selection = ["crate", "n2", "wire1"];
        await rendered(widget);
        const before = bounds(widget, "wire1");
        const n2 = sceneAt(scene, point(item(widget, "n2"), 0.5, 0.3));
        await sweep(scene, n2, { x: n2.x + 40, y: n2.y + 20 }, {}, {
            held() {
                equal(bounds(widget, "crate").x, 80, "a drawn shape moves with a node");
                assert(near(bounds(widget, "wire1").width, before.width + 40, 2.5), "and the wire follows during the drag");
            },
        });
        await rendered(widget);
        equal(widget.log.at(-1), "move:crate@80,250;n2@260,60", "one event for everything movable in the selection; a wire has no position of its own");
        equal(widget.selection, ["crate", "n2", "wire1"], "the selection survives the move");
    });

    both("move: a group moves as one, with the node and the wire in it", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        widget.wires = [...widget.wires, { id: "wire2", from: "n2:out", to: "inner:in" }];
        await rendered(widget);
        const inner = item(widget, "inner").getBoundingClientRect();
        const end = scene.portPosition("inner:in")!;
        // A press on the pane, which is neither selectable nor movable itself: the group around it acts.
        await sweep(scene, { x: 520, y: 50 }, { x: 490, y: 90 }, {}, {
            held() {
                const now = item(widget, "inner").getBoundingClientRect();
                equal([now.left - inner.left, now.top - inner.top], [-30, 40], "the node in the group moves with it");
                const port = scene.portPosition("inner:in")!;
                assert(near(port.x, end.x - 30) && near(port.y, end.y + 40), "and so does its port");
                equal(item(widget, "cluster").getAttribute("x"), "440", "as a preview");
            },
        });
        await rendered(widget);
        equal(widget.log.slice(-2), ["select:cluster", "move:cluster@410,80"], "the group is what was selected and moved");
        const pane = bounds(widget, "pane"); // Pixi counts the stroke of one pixel
        assert(near(pane.x, 0, 0.5) && near(pane.y, 0, 0.5) && near(pane.width, 100, 1) && near(pane.height, 80, 1), "what is drawn in the group keeps its own coordinates");
        equal(standIn(widget, "Cluster").getAttribute("d"), "M410 80L510 80L510 160L410 160Z", "the group's stand-in is the box around its content");
    });

    both("move: Escape and a refused commit change nothing", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        const log = events("ww-move", "ww-transactionstart");
        await sweep(scene, { x: 65, y: 245 }, { x: 165, y: 245 }, {}, { cancel: true });
        await rendered(widget);
        equal(log.stop(), [], "Escape: no event, no transaction");
        equal(bounds(widget, "crate").x, 40, "the shape is back");
        widget.addEventListener("ww-move", (event) => (event.preventDefault(), event.stopPropagation()), { capture: true, once: true });
        await sweep(scene, { x: 65, y: 245 }, { x: 165, y: 245 });
        await rendered(widget);
        equal(bounds(widget, "crate").x, 40, "a commit the widget does not apply snaps back");
    });

    both("move by keyboard: the arrow keys move the selection, as one ww-move", async () => {
        const widget = await bench();
        const crate = standIn(widget, "Crate");
        crate.focus();
        assert(key("ArrowRight"), "an item that is not selected does not move, and the key is left alone");
        key(" ");
        await rendered(widget);
        const log = events("ww-transactionstart", "ww-move", "ww-transactionend");
        assert(!key("ArrowRight"), "the key is consumed");
        await frame();
        equal(bounds(widget, "crate").x, 50, "one grid step, as a preview");
        equal(item(widget, "crate").getAttribute("x"), "40");
        equal(spoken(widget), "x 50, y 230.", "each step is announced");
        key("ArrowDown", undefined, { shiftKey: true });
        key("ArrowRight");
        await frame();
        equal(bounds(widget, "crate"), { x: 60, y: 280, width: 50, height: 30 }, "Shift is five grid steps");
        equal(log.log, [], "nothing is committed while the keys go on");
        assert(!key("Enter"), "Enter commits");
        await rendered(widget);
        equal(log.stop(), ["ww-transactionstart", "ww-move", "ww-transactionend"], "one move, one undo step");
        equal(widget.log.at(-1), "move:crate@60,280");
        equal(spoken(widget), "Moved.");
        equal(widget.selection, ["crate"], "Enter was the move's and did not change the selection");

        key("ArrowLeft");
        await frame();
        key("Escape");
        await rendered(widget);
        equal([bounds(widget, "crate").x, widget.places.crate.x], [60, 60], "Escape takes the move back");
        equal(spoken(widget), "Cancelled.");
        equal(widget.selection, ["crate"], "and leaves the selection");
    });

    both("move by keyboard: commits when the keys rest and when focus leaves; nodes and groups move too", async () => {
        const widget = await bench();
        const n1 = item(widget, "n1");
        n1.focus();
        key(" ");
        await rendered(widget);
        key("ArrowDown");
        keyup("ArrowDown");
        equal(widget.places.n1, { x: 40, y: 40 }, "not at once");
        await until(() => widget.places.n1.y === 50, "the move was not committed after the keys rested");

        widget.selection = ["n1", "cluster"];
        await rendered(widget);
        standIn(widget, "Cluster").focus();
        key("ArrowLeft");
        await frame();
        equal([getComputedStyle(n1).translate, getComputedStyle(item(widget, "cluster")).translate], ["30px 50px", "430px 40px"], "the whole selection moves, a node and a group");
        item(widget, "n2").focus();
        await rendered(widget);
        equal(widget.log.at(-1), "move:cluster@430,40;n1@30,50", "leaving the item commits");

        sceneOf(widget).removeAttribute("grid");
        widget.selection = ["n2"];
        await rendered(widget);
        key("ArrowRight");
        key("ArrowRight", undefined, { shiftKey: true });
        key("ArrowUp");
        key("Enter");
        await rendered(widget);
        equal(widget.log.at(-1), "move:n2@231,39", "without a grid a step is one pixel, and ten with Shift");
    });

    // ── Wiring ────────────────────────────────────────────────────────────

    both("wire: a drag from a port to a port in a nested component commits ww-connect", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        const link = scene.shadowRoot!.querySelector<SVGElement>("[part=link]")!;
        const deep = item(widget, "n3").querySelector("ww-socket")!.shadowRoot!.querySelector<HTMLElement>("[data-ww-port]")!;
        const from = scene.portPosition("n1:out")!;
        const to = scene.portPosition("n3:deep")!;
        const log = events("ww-transactionstart", "ww-connect", "ww-transactionend", "ww-move", "ww-select");
        // Released 10px beside the port: the wire attaches to the nearest accepting port within reach.
        await sweep(scene, from, { x: to.x - 8, y: to.y + 6 }, {}, {
            held() {
                equal(getComputedStyle(link).display, "block", "the wire is previewed");
                assert(deep.hasAttribute("data-ww-port-over") && deep.hasAttribute("data-ww-port-candidate"), "the target is marked, inside its component");
                assert(port(widget, "n2", "in").hasAttribute("data-ww-port-candidate") && port(widget, "inner", "in").hasAttribute("data-ww-port-candidate"), "candidates are the ports that accept the kind");
                assert(!port(widget, "n4", "far").hasAttribute("data-ww-port-candidate") && !port(widget, "n1", "out").hasAttribute("data-ww-port-candidate"), "and no others");
                const d = link.getAttribute("d")!.match(/-?[\d.]+/g)!.map(Number);
                assert(near(d.at(-2)!, to.x) && near(d.at(-1)!, to.y), "the preview ends at the port");
            },
        });
        await rendered(widget);
        equal(log.stop(), ["ww-transactionstart", "ww-connect", "ww-transactionend"], "no move and no selection from a port");
        equal(widget.log, ["connect:n1:out>n3:deep:wire"]);
        const wire = bounds(widget, "wire2");
        assert(near(wire.x, from.x, 2.5) && near(wire.x + wire.width, to.x, 2.5), "the widget added the wire, and it is drawn between the ports");
        equal(getComputedStyle(link).display, "none");
        assert(!deep.hasAttribute("data-ww-port-candidate") && !widget.shadowRoot!.querySelector("[data-ww-port-candidate], [data-ww-port-over]"), "the markers are gone");

        widget.refuse = true;
        await sweep(scene, scene.portPosition("n2:out")!, scene.portPosition("inner:in")!);
        await sweep(scene, scene.portPosition("n2:out")!, { x: 300, y: 300 });
        await sweep(scene, scene.portPosition("n2:out")!, scene.portPosition("inner:in")!, {}, { cancel: true });
        await rendered(widget);
        equal(widget.log, ["connect:n1:out>n3:deep:wire", "connect:n2:out>inner:in:wire"], "a release in the open and Escape ask nothing");
        equal(widget.wires.length, 2, "and the widget decides what is allowed");
    });

    both("wire by keyboard: pick up at a port, step through the accepting ports, connect or cancel", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        const out = port(widget, "n1", "out");
        equal([out.tabIndex, out.getAttribute("role"), out.getAttribute("aria-label")], [0, "button", "Connect from out of First"], "a port that starts a wire is a named button");
        assert(!port(widget, "n2", "in").hasAttribute("tabindex"), "a port that only accepts is not");
        const link = scene.shadowRoot!.querySelector<SVGElement>("[part=link]")!;
        const ends = () => link.getAttribute("d")!.match(/-?[\d.]+/g)!.map(Number).slice(-2);
        out.focus();
        assert(!key("Enter"), "Enter picks the wire up");
        equal(spoken(widget), "Wire from out of First. 4 ports accept it. Arrow keys choose, Enter connects, Escape cancels. in of n2, 2 of 4.", "it starts at the nearest port");
        equal(widget.shadowRoot!.querySelectorAll("[data-ww-port-candidate]").length + 1, 4, "the candidates are marked, also the one in a shadow root");
        assert(port(widget, "n2", "in").hasAttribute("data-ww-port-over"));
        assert(near(ends()[0], scene.portPosition("n2:in")!.x), "the wire is drawn to it");
        key("ArrowRight");
        equal(spoken(widget), "deep of n3, 3 of 4.", "in template order");
        key("ArrowDown");
        key("ArrowDown");
        equal(spoken(widget), "in of inner, 1 of 4.", "around the end");
        key("ArrowLeft");
        key("ArrowUp");
        equal(spoken(widget), "deep of n3, 3 of 4.", "and back");
        equal(widget.selection, [], "the keys are the wire's: nothing was selected or moved");
        const log = events("ww-transactionstart", "ww-connect", "ww-transactionend");
        key(" ");
        await rendered(widget);
        equal(log.stop(), ["ww-transactionstart", "ww-connect", "ww-transactionend"]);
        equal(widget.log, ["connect:n1:out>n3:deep:wire"]);
        equal(spoken(widget), "Connected out of First to deep of n3.");
        equal(getComputedStyle(link).display, "none");

        key("Enter");
        key("Escape");
        equal(spoken(widget), "Cancelled.");
        assert(!widget.shadowRoot!.querySelector("[data-ww-port-candidate]") && getComputedStyle(link).display === "none", "Escape puts the wire down");
        key("Enter");
        port(widget, "n2", "out").focus();
        assert(!widget.shadowRoot!.querySelector("[data-ww-port-candidate]"), "and so does leaving the port");
        widget.refuse = true;
        out.focus();
        key("Enter");
        key("Enter");
        await rendered(widget);
        equal(spoken(widget), "Not connected.", "a refusal by the widget is said");
        equal(widget.wires.length, 2);
    });

    both("text: German from the shipped catalog, and the widget's own entries", async () => {
        const widget = await bench(`contenteditable lang="de"`);
        const out = port(widget, "n1", "out");
        // The German catalog is a file of its own: the names are written again when it has arrived.
        await until(() => out.getAttribute("aria-label") === "Verbindung beginnen bei out an First", "the German catalog of Scene did not arrive");
        out.focus();
        key("Enter");
        equal(spoken(widget), "Verbindung von out an First. 4 Anschlüsse nehmen sie an. Pfeiltasten wählen aus, Eingabetaste verbindet, Escape bricht ab. in an n2, 2 von 4.");
        key("Escape");
        equal(spoken(widget), "Abgebrochen.");
        widget.lang = "en";
        await until(() => out.getAttribute("aria-label") === "Connect from out of First", "the name of the port did not follow the language");
        widget.texts = { noTarget: "Nothing fits.", port: (name, node) => `${node}/${name}` };
        widget.wires = [];
        const far = port(widget, "n4", "far");
        far.setAttribute("data-ww-link", "nothing-accepts-this");
        await rendered(widget);
        far.focus();
        key("Enter");
        equal(spoken(widget), "Nothing fits.", "an entry of the messages option wins");
    });

    // ── Resizing ──────────────────────────────────────────────────────────

    both("resize: handles of the selected node, grid, limits, commit and Escape", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        const note = item(widget, "note");
        const handle = (side: string) => sceneAt(scene, point(note.shadowRoot!.querySelector(`[data-ww-handle="${side}"]`)!));
        widget.selection = ["note"];
        await rendered(widget);
        equal(note.shadowRoot!.querySelectorAll("[part=handle]").length, 8);
        const log = events("ww-transactionstart", "ww-resize", "ww-transactionend", "ww-move");
        const se = handle("se");
        await sweep(scene, se, { x: se.x + 44, y: se.y + 27 }, {}, {
            held() {
                equal([note.offsetWidth, note.offsetHeight], [160, 90], "the preview is snapped to the grid");
                equal(note.getAttribute("width"), "120", "the attribute is untouched");
            },
        });
        await rendered(widget);
        equal(log.stop(), ["ww-transactionstart", "ww-resize", "ww-transactionend"]);
        equal(widget.note, { x: 40, y: 120, width: 160, height: 90 });
        const nw = handle("nw");
        await sweep(scene, nw, { x: nw.x + 300, y: nw.y + 300 });
        await rendered(widget);
        equal(widget.note, { x: 140, y: 170, width: 60, height: 40 }, "min-width and min-height stop it; the opposite corner stays");
        const corner = handle("nw");
        await sweep(scene, corner, { x: corner.x - 50, y: corner.y - 50 }, {}, { cancel: true });
        await rendered(widget);
        equal([note.offsetWidth, note.offsetHeight, widget.note.width], [60, 40, 60], "Escape restores the size");
    });

    // ── Pictures ──────────────────────────────────────────────────────────

    both("image: by URL and by image source, shown only once loaded, and a failure is an event", async () => {
        // Without mount(), which waits: the first moments are what is looked at.
        const container = await mount(`<div></div>`);
        const widget = container.appendChild(document.createElement(tag)) as Bench;
        widget.toggleAttribute("contenteditable", true);
        await widget.updateComplete;
        const scene = sceneOf(widget);
        const shown = (id: string) => {
            const object = drawn(widget, id);
            return "getBBox" in object ? object.hasAttribute("href") : object.visible;
        };
        assert(!shown("pic"), "a picture given by URL is not shown before it has loaded");
        await until(() => shown("pic"), "the picture never appeared");
        if (isPixi(scene)) await until(() => !scene.contextLost, "no WebGL context", 8000);
        equal(bounds(widget, "pic"), { x: 180, y: 262, width: 32, height: 32 }, "at its position and size");
        equal(bounds(widget, "stamp"), { x: 230, y: 262, width: 20, height: 20 }, "an image source is drawn at once, in its own size where the template gives none");
        if (isPixi(scene)) {
            equal(pixel(scene, 196, 278).slice(0, 3), [200, 0, 0], "the picture of the URL");
            equal(pixel(scene, 240, 272).slice(0, 3), [0, 0, 200], "the picture of the canvas");
        } else {
            equal((drawn(widget, "pic") as SVGGraphicsElement).getAttribute("href"), RED_URL);
            assert((drawn(widget, "stamp") as SVGGraphicsElement).getAttribute("href")!.startsWith("data:image/png"), "a canvas is drawn through a URL of its content");
        }
        equal(widget.errors, []);

        widget.picture = BROKEN_URL;
        await until(() => widget.errors.length > 0, "a picture that cannot be loaded was not reported");
        const error: SceneErrorDetail = widget.errors[0];
        assert(error.code === "load" && error.item === (item(widget, "pic") as never) && error.message.includes(BROKEN_URL), `ww-sceneerror says what failed, got ${error.message}`);
        assert(!shown("pic"), "and nothing broken is drawn");
        widget.picture = RED_URL;
        await until(() => shown("pic"), "a good URL after a bad one is drawn again");
        equal(widget.errors.length, 1);
    });

    // ── Touch ─────────────────────────────────────────────────────────────

    both("touch: a tap selects, a long press adds, a long press on the background and a drag is the marquee", async () => {
        const widget = await bench();
        const scene = sceneOf(widget);
        const touch = { pointerType: "touch", pointerId: 21 };
        const moved = (target: EventTarget) => target.dispatchEvent(new Event("touchmove", { bubbles: true, composed: true, cancelable: true }));
        await click(scene, 65, 245, touch);
        equal(widget.selection, ["crate"], "a tap selects one");
        await click(scene, 330, 224, touch);
        equal(widget.selection, ["line"], "the next tap selects another");

        const crate = under(scene, 65, 245);
        pointer(crate.element, "pointerdown", crate.at, touch);
        equal(widget.selection, ["line"], "a touch does not select at once: it may become a long press");
        assert(!moved(crate.element), "the browser may not pan while the scene holds the touch");
        assert(!crate.element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, composed: true, cancelable: true, clientX: crate.at.x, clientY: crate.at.y })), "nor open its menu for the long press");
        await until(() => widget.selection.length === 2, "a long press did not add the item");
        equal(widget.selection, ["line", "crate"]);
        pointer(crate.element, "pointerup", crate.at, touch);
        await frame(2);
        equal(widget.selection, ["line", "crate"], "the release after a long press changes nothing");

        const empty = under(scene, 20, 212);
        pointer(empty.element, "pointerdown", empty.at, touch);
        assert(moved(empty.element), "a touch on the background is the browser's, or the viewport's, to pan");
        await until(() => scene.matches(":state(marquee)"), "a long press on the background did not start the marquee");
        assert(!moved(empty.element), "from then on the scene holds the touch");
        const end = client(scene, 200, 275);
        pointer(empty.element, "pointermove", { x: empty.at.x + 8, y: empty.at.y + 8 }, touch);
        await frame(2);
        pointer(empty.element, "pointermove", end, touch);
        await frame(2);
        pointer(empty.element, "pointerup", end, touch);
        await rendered(widget);
        equal([...widget.selection].sort(), ["caption", "crate", "line", "pic"], "the marquee adds what it touches");

        pointer(empty.element, "pointerdown", empty.at, touch);
        pointer(empty.element, "pointermove", { x: empty.at.x + 30, y: empty.at.y }, touch);
        pointer(empty.element, "pointerup", { x: empty.at.x + 30, y: empty.at.y }, touch);
        await frame(2);
        assert(!scene.matches(":state(marquee)") && widget.selection.length === 4, "a drag without the long press is a pan: no marquee, and the selection stays");
    });

    // ── Permissions ───────────────────────────────────────────────────────

    both("permissions: can is asked by name, again during a drag, and a hidden node takes its path with it", async () => {
        const widget = await bench("");
        const scene = sceneOf(widget);
        equal(getComputedStyle(item(widget, "guarded")).display, "none", "data-ww-can works on a node as on any element");
        equal(scene.portPosition("guarded:in"), null, "a node that is not rendered has no ports");
        equal(bounds(widget, "leash").width, 0, "and its path is not drawn");
        assert(!port(widget, "n1", "out").hasAttribute("tabindex"), "a reader who may not connect gets no button on the port");
        await sweep(scene, { x: 65, y: 245 }, { x: 165, y: 245 });
        await rendered(widget);
        equal(widget.log, ["select:crate"], "a reader selects, but moves nothing without the permission");

        widget.toggleAttribute("allow-editing", true);
        await rendered(widget);
        await until(() => scene.portPosition("guarded:in") !== null && bounds(widget, "leash").width > 0, "the node that appeared did not get its path");
        equal(port(widget, "n1", "out").tabIndex, 0, "with the permission the port is a button");
        await sweep(scene, { x: 65, y: 245 }, { x: 165, y: 245 }, {}, {
            async held() {
                equal(bounds(widget, "crate").x, 140);
                widget.toggleAttribute("allow-editing", false); // the author, or an undo, takes the permission back
                await until(() => bounds(widget, "crate").x === 40, "the running move was not cancelled");
                equal(spoken(widget), "Cancelled. This is no longer allowed here.");
            },
        });
        await rendered(widget);
        equal(widget.log, ["select:crate"], "and it commits nothing");
    });

    // ── Cleanup ───────────────────────────────────────────────────────────

    both("cleanup: disconnecting puts a wire down, takes back what the module wrote, and reconnecting restores it", async () => {
        const before = listeners();
        const widget = await bench();
        const scene = sceneOf(widget);
        const out = port(widget, "n1", "out");
        out.focus();
        key("Enter");
        assert(widget.shadowRoot!.querySelector("[data-ww-port-candidate]"), "a wire is held");
        const log = events("ww-connect", "ww-move", "ww-select");
        widget.remove();
        await frame();
        equal(log.stop(), [], "nothing is committed");
        assert(!widget.shadowRoot!.querySelector("[data-ww-port-candidate], [data-ww-port-over]"), "the markers of the wire are gone");
        equal(["tabindex", "role", "aria-label"].filter((name) => out.hasAttribute(name)), [], "and so is what made the port a button");
        equal(scene.shadowRoot!.querySelectorAll("[part=proxy]").length, 0, "the stand-ins are removed");
        equal(listeners(), before, "nothing is left on window or document");
        const { flushes } = scene.stats;
        item(widget, "crate").setAttribute("x", "5");
        await frame();
        equal(scene.stats.flushes, flushes, "a disconnected scene does not react");

        document.body.append(widget);
        await rendered(widget);
        await until(() => out.tabIndex === 0, "the port did not become a button again");
        equal(standIns(widget).length, 6, "reconnecting draws the scene and its stand-ins again");
        equal(bounds(widget, "crate").x, 5);
        widget.remove();
    });

    // ── A viewport that tracks its view ───────────────────────────────────

    both("viewport: the view of a canvas viewport moves the drawing, the nodes and the pointer", async () => {
        const widget = await bench("contenteditable windowed");
        const scene = sceneOf(widget);
        const corner = scene.getBoundingClientRect();
        widget.view.zoomTo(2, { x: corner.left, y: corner.top });
        widget.view.panBy(-60, -40);
        await rendered(widget);
        const view: View = { x: widget.view.x, y: widget.view.y, scale: widget.view.scale };
        equal(view, { x: -60, y: -40, scale: 2 }, "the real Viewport tracks the view of the scene, which is its window");

        const n1 = item(widget, "n1").getBoundingClientRect();
        const origin = scene.getBoundingClientRect();
        equal([n1.left - origin.left, n1.top - origin.top], [40 * 2 - 60, 40 * 2 - 40], "a node is where the view puts it");
        assert(near(n1.width, 2 * item(widget, "n1").offsetWidth, 1.5), "at the view's scale");
        const at = point(port(widget, "n1", "out"));
        const world = widget.view.toWorld(at.x, at.y);
        const inScene = scene.toScene(at.x, at.y);
        assert(near(inScene.x, world.x, 0.01) && near(inScene.y, world.y, 0.01), "toScene() goes through the view, as the viewport's toWorld() does");
        const measured = scene.portPosition("n1:out")!;
        assert(near(measured.x, inScene.x, 0.75) && near(measured.y, inScene.y, 0.75), "ports are measured in scene coordinates while zoomed");
        const wire = bounds(widget, "wire1");
        assert(near(wire.x, measured.x, 2.5), "and paths are drawn in them");

        const node = sceneAt(scene, point(item(widget, "n1")), view);
        await sweep(scene, node, { x: node.x + 20, y: node.y + 30 }, {}, {}, view);
        await rendered(widget);
        equal(widget.places.n1, { x: 60, y: 70 }, "a node moves by scene pixels");

        widget.view.panBy(0, -200); // down to the lower half of the scene
        await rendered(widget);
        const lower: View = { x: -60, y: -240, scale: 2 };
        equal({ x: widget.view.x, y: widget.view.y, scale: widget.view.scale }, lower);
        const hit = under(scene, 65, 245, lower);
        const there = sceneAt(scene, hit.at, lower);
        assert(near(there.x, 65, 0.01) && near(there.y, 245, 0.01));
        const targets: (string | null)[] = [];
        widget.shadowRoot!.addEventListener("pointerdown", (event) => targets.push((event.target as Element).getAttribute("data-ww-key")), { once: true });
        await click(scene, 65, 245, {}, lower);
        await rendered(widget);
        equal([targets, widget.selection], [["crate"], ["crate"]], "a drawn shape is hit where it is shown");
        if (isPixi(scene)) equal(pixel(scene, 65, 245, lower).slice(0, 3), [128, 0, 128], "and drawn there");

        await sweep(scene, { x: 65, y: 245 }, { x: 105, y: 265 }, {}, { held: () => equal(bounds(widget, "crate").x, 80, "80 pixels on screen are 40 in the scene") }, lower);
        await rendered(widget);
        equal(widget.places.crate, { x: 80, y: 250 });
        equal({ x: widget.view.x, y: widget.view.y, scale: widget.view.scale }, lower, "none of this moved the view");

        const marquee = scene.shadowRoot!.querySelector<SVGElement>("[part=marquee]")!;
        await sweep(scene, { x: 60, y: 215 }, { x: 150, y: 270 }, { shiftKey: true }, {
            held: () => equal(["x", "y", "width", "height"].map((side) => Math.round(Number(marquee.getAttribute(side)))), [60, 215, 90, 55], "the marquee is in scene coordinates"),
        }, lower);
        await rendered(widget);
        equal([...widget.selection].sort(), ["caption", "crate"]);
    });

    both("viewport: fit and the pan limits use the scene's extent, and the wheel zooms", async () => {
        const widget = await bench("contenteditable windowed");
        const scene = sceneOf(widget);
        const extent = widget.scene.extent()!;
        assert(extent.x === 0 && extent.y === 0 && extent.width >= 560 && extent.height >= 320, `the extent is the box around everything in the scene, got ${JSON.stringify(extent)}`);
        scene.style.width = "280px";
        scene.setAttribute("data-ww-viewport-fit", "content");
        await rendered(widget);
        widget.view.fit();
        await rendered(widget);
        const fitted = Math.min(280 / extent.width, 320 / extent.height);
        assert(near(widget.view.scale, fitted, 0.002), `the viewport fits what the scene reports, got ${widget.view.scale}`);
        const view = (): View => ({ x: widget.view.x, y: widget.view.y, scale: widget.view.scale });
        const centre = client(scene, extent.x + extent.width / 2, extent.y + extent.height / 2, view());
        const box = scene.getBoundingClientRect();
        assert(near(centre.x, box.left + box.width / 2) && near(centre.y, box.top + box.height / 2), "centred in the window");
        assert(near(item(widget, "n1").getBoundingClientRect().left - box.left, 40 * widget.view.scale + widget.view.x, 0.5), "the nodes follow the fitted view");

        const before = view();
        const overNode = point(item(widget, "n2"));
        assert(!item(widget, "n2").dispatchEvent(new WheelEvent("wheel", { bubbles: true, composed: true, cancelable: true, ctrlKey: true, deltaY: -200, clientX: overNode.x, clientY: overNode.y })), "Ctrl and the wheel over a node is taken");
        await rendered(widget);
        assert(widget.view.scale > before.scale * 1.2, "and zooms the view");
        const still = scene.toScene(overNode.x, overNode.y);
        const kept = sceneAt(scene, overNode, view());
        assert(near(still.x, kept.x, 0.01) && near(still.y, kept.y, 0.01), "the scene's coordinates follow the new view");

        const size = { width: extent.width * widget.view.scale, height: extent.height * widget.view.scale };
        widget.view.panBy(100000, 100000);
        await rendered(widget);
        assert(near(widget.view.x, 0, 0.5) && near(widget.view.y + size.height, 320, 0.5), `panning stops where the extent meets the edge of the window, got ${JSON.stringify(view())}`);
        widget.view.panBy(-100000, -100000);
        await rendered(widget);
        assert(near(widget.view.x + size.width, 280, 0.5) && near(widget.view.y, 0, 0.5), `on the other side too, got ${JSON.stringify(view())}`);
    });

    both("viewport: a press that nothing claims pans, also on a drawn shape, and the scene's keys are its own", async () => {
        const widget = await bench("contenteditable windowed");
        const scene = sceneOf(widget);
        const view = (): View => ({ x: widget.view.x, y: widget.view.y, scale: widget.view.scale });
        widget.view.zoomTo(2);
        widget.selection = ["n1"];
        await rendered(widget);
        const start = view();
        // The board is drawn everywhere and nothing claims it: a press on it is a press on the background.
        const seen: string[] = [];
        widget.shadowRoot!.addEventListener("pointerdown", (event) => seen.push(`${(event.target as Element).localName}${event.defaultPrevented ? " claimed" : ""}`));
        await sweep(scene, { x: 250, y: 100 }, { x: 235, y: 110 }, {}, {}, start);
        await rendered(widget);
        equal(view(), { x: start.x - 30, y: start.y + 20, scale: 2 }, "a plain drag on the board pans the view");
        equal(widget.selection, ["n1"], "and is no click: the selection stays");
        equal(seen, ["ww-shape", "ww-scene"], "the press reaches the widget on the shape and then, unclaimed, on the scene itself: the viewport's background");
        const now = view();
        await sweep(scene, { x: 280, y: 220 }, { x: 300, y: 220 }, {}, {}, now);
        await rendered(widget);
        equal([view(), widget.places.line], [now, { x: 280, y: 220 }], "a press on a movable line is claimed: it moves the line, not the view");
        equal(seen.at(-1), "ww-path claimed");
        await click(scene, 250, 100, {}, now);
        await rendered(widget);
        equal(widget.selection, [], "a click on the board clears the selection, once");
        equal(widget.log.filter((entry) => entry === "select:").length, 1);

        // The hand: with Space held on the window, the viewport claims a press before the scene sees it.
        key(" ", scene);
        await sweep(scene, { x: 290, y: 220 }, { x: 300, y: 220 }, {}, {}, now);
        scene.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true, composed: true }));
        await rendered(widget);
        equal([view().x, widget.places.line, widget.selection], [now.x + 20, { x: 280, y: 220 }, []], "a press the viewport claimed pans, also on an item: the scene leaves it alone");
        widget.view.panBy(-20, 0);
        await rendered(widget);

        const crate = standIn(widget, "Crate");
        crate.focus();
        key("ArrowRight");
        await rendered(widget);
        assert(near(widget.view.x, now.x - 40, 0.5), "an arrow key on an item that does not move is the viewport's: it pans");
        key(" ");
        await rendered(widget);
        const panned = view();
        key("ArrowRight");
        key("Enter");
        await rendered(widget);
        equal([view(), widget.places.crate.x], [panned, 50], "on a selected item the arrow key moves the item and the view stays");
    });
}
