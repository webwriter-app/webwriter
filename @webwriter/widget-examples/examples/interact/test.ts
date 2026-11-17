// Checks of what a reader does in a Scene and what the widget is told, on the SVG renderer and on Pixi: the
// preview of a move (`ww-moving`), clicks (`ww-activate`), wires (capacity, taking an end to another port or off,
// connecting by two clicks, a pending wire the widget draws, whole nodes), context menus and the background,
// hit testing, constraints, the undo host and the end of the first layout.
import { assert, check, deepActive, equal, frame, key, mount, mutations, point, pointer, run, settled, until, wait, type Point } from "../../test/harness";
import type { ActivateDetail, BackgroundDetail, ConnectDetail, ConnectingDetail, ContextDetail, DisconnectDetail, MoveDetail, MovingDetail, ReconnectDetail, ResizeDetail, SceneBase, SceneItem } from "@webwriter/widget/scene";
import { Interact, Outer } from "./index";

type Name = "svg" | "pixi";
type PixiLike = SceneBase & { render(): boolean };

const isPixi = (scene: SceneBase): scene is PixiLike => "render" in scene;
const near = (a: number, b: number, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
const sceneOf = (widget: Element) => widget.shadowRoot!.querySelector("ww-scene") as unknown as SceneBase;
const el = (widget: Element, id: string) => widget.shadowRoot!.querySelector<HTMLElement>(`[data-ww-key="${id}"]`)!;
const port = (widget: Element, id: string, name: string) => el(widget, id).querySelector<HTMLElement>(`[data-ww-port="${name}"]`)!;
const link = (widget: Element) => sceneOf(widget).shadowRoot!.querySelector<SVGElement>("[part=link]")!;
const handles = (widget: Element) => [...sceneOf(widget).shadowRoot!.querySelectorAll<SVGElement>("[part=resize]")];
const nodeHandles = (widget: Element, id: string) => [...el(widget, id).shadowRoot!.querySelectorAll<HTMLElement>("[part=handle]")].map((handle) => handle.dataset.wwHandle);
const marked = (widget: Element, attribute: string) => [...widget.shadowRoot!.querySelectorAll<HTMLElement>(`[${attribute}]`)].map((element) => (element.dataset.wwPort ? `${element.closest("[data-ww-key]")!.getAttribute("data-ww-key")}:${element.dataset.wwPort}` : element.getAttribute("data-ww-key")));
const detail = <T>(event: CustomEvent | undefined) => event!.detail as T;
const last = <T>(list: T[]) => list[list.length - 1];

/** The client position of a scene position. */
function client(scene: SceneBase, x: number, y: number): Point {
    const box = scene.getBoundingClientRect();
    return { x: box.left + scene.clientLeft + x, y: box.top + scene.clientTop + y };
}

/** What the pointer really hits at a scene position, through every shadow root. */
function under(scene: SceneBase, x: number, y: number): { element: Element; at: Point } {
    if (isPixi(scene)) scene.render(); // Pixi hit-tests with the transforms of its last frame
    const at = client(scene, x, y);
    let element = document.elementFromPoint(at.x, at.y)!;
    for (;;) {
        const inner = element.shadowRoot?.elementFromPoint(at.x, at.y);
        if (!inner || inner === element) return { element, at };
        element = inner;
    }
}

async function click(scene: SceneBase, x: number, y: number, init: PointerEventInit = {}) {
    const { element, at } = under(scene, x, y);
    pointer(element, "pointerdown", at, init);
    pointer(element, "pointerup", at, init);
    await frame(2);
}

async function press(target: Element, init: PointerEventInit = {}, at = point(target)) {
    pointer(target, "pointerdown", at, init);
    pointer(target, "pointerup", at, init);
    await frame(2);
}

type Steps = { held?: () => unknown; cancel?: boolean };

/** A pointer drag between two client points, on `target`. */
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

/** A drag between two scene positions, starting on what is really there. */
async function drag(scene: SceneBase, from: Point, to: Point, steps: Steps = {}, init: PointerEventInit = {}) {
    const { element, at } = under(scene, from.x, from.y);
    await sweep(element, at, client(scene, to.x, to.y), init, steps);
}

const by = (at: Point, dx: number, dy: number): Point => ({ x: at.x + dx, y: at.y + dy });

async function board(name: Name, props: Partial<Interact> = {}): Promise<Interact> {
    const widget = await mount<Interact>(`<ww-interact-${name}></ww-interact-${name}>`);
    Object.assign(widget, props);
    await settled(widget);
    return widget;
}

/** Registers a check for both renderers. */
function each(title: string, fn: (name: Name) => unknown) {
    for (const name of ["svg", "pixi"] as const) check(`interact (${name}): ${title}`, () => fn(name));
}

// ── The preview of a move ─────────────────────────────────────────────────

each("moving: ww-moving reports the previewed positions and the pointer, and writes nothing", async (name) => {
    const widget = await board(name);
    const scene = sceneOf(widget);
    const a = el(widget, "a");
    const start = point(a);
    const target = by(start, 60, 40);
    const changes = mutations(widget);
    await sweep(a, start, target, {}, {
        held() {
            const moving = widget.of("ww-moving");
            assert(moving.length > 0, "the scene reports every step");
            const now = detail<MovingDetail>(last(moving));
            equal([now.state, now.committed], ["move", false]);
            equal(now.items.map(({ key, x, y }) => ({ key, x, y })), [{ key: "a", x: 100, y: 80 }], "the item is where the preview shows it");
            equal([now.dx, now.dy], [60, 40]);
            assert(now.pointer && near(now.pointer.clientX, target.x) && near(now.pointer.clientY, target.y), "the pointer is in client coordinates");
            const box = scene.getBoundingClientRect();
            assert(now.pointer && near(now.pointer.x, target.x - box.left) && near(now.pointer.y, target.y - box.top), "and in scene coordinates");
            equal(widget.of("ww-move").length, 0, "nothing is committed");
            equal(widget.places.a, { x: 40, y: 40 }, "the model is untouched");
            equal(changes.stop().length, 0, "and nothing in the document");
        },
    });
    await settled(widget);
    const order = widget.seen.map((event) => event.type).filter((type) => type === "ww-move" || type === "ww-moving");
    equal([order.at(-2), order.at(-1)], ["ww-move", "ww-moving"], "the commit comes first, then the end of the preview");
    const move = detail<MoveDetail>(widget.of("ww-move")[0]);
    assert(move.pointer && near(move.pointer.clientX, target.x), "the commit carries the pointer too: a drop outside the model can be decided");
    const end = detail<MovingDetail>(last(widget.of("ww-moving")));
    equal([end.state, end.committed, end.pointer], ["end", true, null]);
    equal(end.items.map(({ x, y }) => [x, y]), [[100, 80]], "at the end the attributes say where the item is");
    equal(widget.places.a, { x: 100, y: 80 });
});

each("moving: a move that is cancelled ends with committed false, and the keyboard reports too", async (name) => {
    const widget = await board(name, { step: 10 });
    const a = el(widget, "a");
    await sweep(a, point(a), by(point(a), 30, 30), {}, { cancel: true });
    const end = detail<MovingDetail>(last(widget.of("ww-moving")));
    equal([end.state, end.committed], ["end", false]);
    equal(widget.of("ww-move").length, 0);
    widget.seen.length = 0;
    a.focus();
    key(" ");
    await settled(widget);
    key("ArrowRight");
    key("ArrowRight");
    await frame();
    const now = detail<MovingDetail>(last(widget.of("ww-moving")));
    equal([now.state, now.pointer, now.items[0].x, now.dx], ["move", null, 60, 20], "a step is 10 pixels where the scene says move-step; there is no pointer");
    key("Enter");
    await settled(widget);
    const move = detail<MoveDetail>(widget.of("ww-move")[0]);
    equal([move.pointer, move.dx, widget.places.a.x], [null, 20, 60]);
    equal(detail<MovingDetail>(last(widget.of("ww-moving"))).committed, true);
});

// ── Activation ────────────────────────────────────────────────────────────

each("activate: every click is reported, also on an item that is selected already", async (name) => {
    const widget = await board(name);
    const a = el(widget, "a");
    await press(a);
    await press(a);
    const types = widget.seen.map((event) => event.type).filter((type) => type === "ww-select" || type === "ww-activate");
    equal(types, ["ww-select", "ww-activate", "ww-activate"], "the second click selects nothing new, and is still a click");
    const [first, second] = widget.of("ww-activate").map((event) => detail<ActivateDetail>(event));
    equal([first.key, first.item === a, first.hit === a, first.via, first.count, second.count], ["a", true, true, "pointer", 1, 2], "the second click soon after is a double click");
    equal([first.shiftKey, first.ctrlKey, first.altKey, first.metaKey], [false, false, false, false]);
    assert(first.pointer && near(first.pointer.clientX, point(a).x), "with where it was");
    await wait(500);
    await press(a, { shiftKey: true });
    const third = detail<ActivateDetail>(last(widget.of("ww-activate")));
    equal([third.count, third.shiftKey], [1, true], "the modifier keys are in it");
});

each("activate: a press inside a group says which member was pressed", async (name) => {
    const widget = await board(name);
    const m2 = el(widget, "m2");
    await press(m2);
    const pressed = detail<ActivateDetail>(widget.of("ww-activate")[0]);
    equal([pressed.key, pressed.item === el(widget, "gp"), pressed.hit === m2, pressed.groups.map((group) => group.getAttribute("data-ww-key")), pressed.target === m2], ["gp", true, true, ["gp"], true], "the group is what was selected, the node what was pressed");
    equal(detail<{ keys: string[] }>(widget.of("ww-select")[0]).keys, ["gp"]);
    await press(m2);
    equal([widget.of("ww-select").length, widget.of("ww-activate").length], [1, 2], "the group is selected already: only the click is reported");
    // m1 is selectable itself, and holds a control.
    await press(el(widget, "m1"));
    assert(detail<ActivateDetail>(last(widget.of("ww-activate"))).item === el(widget, "m1"), "a member that can be selected is the item itself");
    const count = widget.of("ww-activate").length;
    await press(el(widget, "m1").querySelector("button")!);
    equal(widget.of("ww-activate").length, count, "a control inside a node keeps its clicks");
});

each("activate: Enter and Space on an item, a drawn path and a drag that is no click", async (name) => {
    const widget = await board(name);
    const scene = sceneOf(widget);
    const a = el(widget, "a");
    a.focus();
    key("Enter");
    await frame(2);
    const pressed = detail<ActivateDetail>(widget.of("ww-activate")[0]);
    equal([pressed.via, pressed.count, pressed.pointer, pressed.key], ["keyboard", 1, null, "a"]);
    equal(widget.selection, ["a"], "Enter also selects, as before");
    key(" ", undefined, { ctrlKey: true });
    await frame(2);
    equal([widget.of("ww-activate").length, detail<ActivateDetail>(last(widget.of("ww-activate"))).ctrlKey], [2, true]);
    // A path.
    const wire = scene.portPosition("a:out")!;
    const end = scene.portPosition("b:in")!;
    await click(scene, (wire.x + end.x) / 2, wire.y);
    const onPath = detail<ActivateDetail>(last(widget.of("ww-activate")));
    equal([onPath.key, onPath.hit === el(widget, "w1")], ["w1", true], "a click on a drawn item is reported on its element");
    const count = widget.of("ww-activate").length;
    await sweep(a, point(a), by(point(a), 40, 0));
    equal(widget.of("ww-activate").length, count, "a drag is no click");
});

// ── Wires ─────────────────────────────────────────────────────────────────

each("capacity: a full port neither takes a wire nor starts one, and nothing is written to the template", async (name) => {
    const widget = await board(name);
    const html = sceneOf(widget).innerHTML;
    const out = port(widget, "a", "out");
    await sweep(out, point(out), point(port(widget, "b", "in")), {}, {
        held() {
            equal(marked(widget, "data-ww-port-candidate"), ["c:free"], "b:in and c:in hold a wire already and take no other: only c:free is offered");
            equal(marked(widget, "data-ww-port-over"), [], "the full port is not over");
        },
    });
    equal(widget.of("ww-connect").length, 0, "released on the full port: nothing");
    equal(sceneOf(widget).innerHTML, html, "the template has all it had");
    // d:out takes two wires. One is there.
    const d = port(widget, "d", "out");
    await sweep(d, point(d), point(port(widget, "c", "free")));
    await settled(widget);
    equal(detail<ConnectDetail>(widget.of("ww-connect")[0]).to, "c:free");
    equal(widget.wires.length, 4);
    const connecting = widget.of("ww-connecting").length;
    await sweep(d, point(d), point(port(widget, "c", "free")), {}, {
        held() {
            equal([marked(widget, "data-ww-port-candidate"), getComputedStyle(link(widget)).display], [[], "none"], "a port that is full starts no wire");
        },
    });
    equal([widget.of("ww-connecting").length, widget.of("ww-connect").length], [connecting, 1]);
    // By keyboard.
    d.focus();
    key("Enter");
    equal(widget.of("ww-connecting").length, connecting, "nor by the keyboard");
});

each("can: the port is the third argument, so the widget refuses one port and not the node", async (name) => {
    const widget = await board(name, { refused: ["out"] });
    const out = port(widget, "a", "out");
    equal(out.hasAttribute("tabindex"), false, "a port that may start no wire is no button for the keyboard");
    await sweep(out, point(out), point(port(widget, "c", "free")));
    equal(widget.of("ww-connecting").length, 0);
    widget.refused = [];
    await settled(widget);
    await sweep(out, point(out), point(port(widget, "c", "free")));
    equal(widget.of("ww-connect").length, 1);
});

each("rewire: the end of a wire is taken to another port, and the widget is asked", async (name) => {
    const widget = await board(name);
    const scene = sceneOf(widget);
    const from = port(widget, "b", "in");
    const free = port(widget, "c", "free");
    const wire = el(widget, "w1");
    await sweep(from, point(from), point(free), {}, {
        held() {
            assert(wire.matches(":state(rewiring)"), "the path says it is held");
            equal(getComputedStyle(link(widget)).display, "block", "a pending wire runs from the end that stays");
            const numbers = link(widget).getAttribute("d")!.match(/-?[\d.]+/g)!.map(Number);
            const anchor = scene.portPosition("a:out")!;
            assert(near(numbers[0], anchor.x) && near(numbers[1], anchor.y), "it starts at a:out");
            equal(marked(widget, "data-ww-port-candidate").sort(), ["b:in", "c:free"], "the port it comes from is one of the places, a full one is not");
            const connecting = detail<ConnectingDetail>(last(widget.of("ww-connecting")));
            equal([connecting.from, connecting.to, connecting.end, connecting.path === wire, connecting.kind], ["a:out", "c:free", "to", true, "sig"]);
        },
    });
    await settled(widget);
    const reconnect = detail<ReconnectDetail>(widget.of("ww-reconnect")[0]);
    equal([reconnect.end, reconnect.from, reconnect.to, reconnect.previous, reconnect.kind], ["to", "a:out", "c:free", { from: "a:out", to: "b:in" }, "sig"]);
    assert(reconnect.path === wire && reconnect.source === port(widget, "a", "out") && reconnect.target === free, "the path and both elements");
    equal(widget.wires.find((other) => other.id === "w1"), { id: "w1", from: "a:out", to: "c:free" }, "the widget applied it");
    assert(!wire.matches(":state(rewiring)"), "the path is let go");
    const drawn = scene.drawingOf(wire as unknown as SceneItem) as Extract<ReturnType<SceneBase["drawingOf"]>, { type: "path" }>;
    const end = scene.portPosition("c:free")!;
    assert(near(drawn.points.at(-1)!.x, end.x, 14) && near(drawn.points.at(-1)!.y, end.y, 14), "and the path is drawn to the new port");
    equal(widget.of("ww-connecting").at(-1)!.detail.state, "end");
    equal(widget.of("ww-disconnect").length, 0);
    // Nothing for the same port and for Escape, and nothing left in the template.
    const html = scene.innerHTML;
    const again = port(widget, "c", "free");
    await sweep(again, point(again), by(point(again), 2, 2));
    await sweep(again, point(again), point(port(widget, "b", "in")), {}, { cancel: true });
    equal([widget.of("ww-reconnect").length, widget.of("ww-disconnect").length], [1, 0]);
    equal(scene.innerHTML, html, "the template is as it was");
    equal(marked(widget, "data-ww-port-candidate"), []);
});

each("wires: a click on a wire can ask which ports it ends in, and a port how many wires it has", async (name) => {
    const widget = await board(name);
    const scene = sceneOf(widget);
    const wire = el(widget, "w1") as unknown as Parameters<typeof widget.scene.endsOf>[0];
    const ends = widget.scene.endsOf(wire);
    equal([ends.from?.reference, ends.from?.port, ends.from?.element === port(widget, "a", "out"), ends.to?.node === el(widget, "b"), ends.to?.element === port(widget, "b", "in")], ["a:out", "out", true, true, true]);
    equal(widget.scene.endsOf(el(widget, "w3") as never).to?.element === el(widget, "n2"), true, "a whole node is its own element, with no port name");
    equal([widget.scene.wiresAt("b:in").length, widget.scene.wiresAt("a:out").length, widget.scene.wiresAt("c:free").length, widget.scene.wiresAt("n1").length], [1, 1, 0, 1]);
    equal(scene.wiresAt("b:in")[0] === (wire as unknown), true);
    // A click on the end of the path, which does not move it, is a click on the path.
    const end = scene.portPosition("b:in")!;
    await click(scene, end.x - 22, end.y);
    equal([widget.selection, detail<ActivateDetail>(last(widget.of("ww-activate"))).key], [["w1"], "w1"]);
});

each("rewire: dropped in the open it is disconnected, and a refusal leaves the wire", async (name) => {
    const widget = await board(name);
    const from = port(widget, "b", "in");
    await sweep(from, point(from), by(point(from), 0, 150));
    await settled(widget);
    const gone = detail<DisconnectDetail>(widget.of("ww-disconnect")[0]);
    equal([gone.end, gone.from, gone.to, gone.kind, gone.path === el(widget, "w1")], ["to", "a:out", "b:in", "sig", false], "the path is the element that was in the template");
    equal(widget.wires.map((wire) => wire.id), ["w2", "w3"], "the widget removed the wire");
    equal(widget.of("ww-reconnect").length, 0);
    // A widget that refuses.
    const widget2 = await board(name, { locked: true });
    const held = port(widget2, "b", "in");
    await sweep(held, point(held), by(point(held), 0, 150));
    equal([widget2.of("ww-disconnect").length, widget2.of("ww-connecting").length, widget2.wires.length], [0, 0, 3], "a reader that may not connect changes no wire");
});

each("rewire: the end of the path itself is taken too, outside the node", async (name) => {
    const widget = await board(name);
    const scene = sceneOf(widget);
    const end = scene.portPosition("b:in")!;
    await drag(scene, { x: end.x - 22, y: end.y }, { x: end.x - 22, y: end.y + 160 });
    await settled(widget);
    equal([widget.of("ww-disconnect").length, widget.of("ww-select").length], [1, 0], "a press near the end takes the end; it does not select the path");
    equal(detail<DisconnectDetail>(widget.of("ww-disconnect")[0]).to, "b:in");
    // Further from the end, the same press selects the path.
    const widget2 = await board(name);
    const scene2 = sceneOf(widget2);
    const [start, finish] = [scene2.portPosition("a:out")!, scene2.portPosition("b:in")!];
    await click(scene2, (start.x + finish.x) / 2, start.y);
    equal(widget2.selection, ["w1"]);
});

each("connecting: the widget is told which port the wire is over, and may draw the pending wire itself", async (name) => {
    const widget = await board(name);
    const scene = sceneOf(widget);
    const out = port(widget, "a", "out");
    const free = port(widget, "c", "free");
    await sweep(out, point(out), by(point(out), 40, 90), {}, {
        held() {
            const open = detail<ConnectingDetail>(last(widget.of("ww-connecting")));
            equal([open.from, open.to, open.target, open.state, open.via, open.path], ["a:out", null, null, "move", "pointer", null], "over nothing");
            assert(scene.matches(":state(wiring)"), "the scene says a wire is held");
        },
    });
    assert(!scene.matches(":state(wiring)"));
    equal(last(widget.of("ww-connecting")).detail.state, "end");
    const own: boolean[] = [];
    widget.addEventListener("ww-connecting", (event) => {
        // The widget draws the pending wire itself.
        if ((event as CustomEvent<ConnectingDetail>).detail.state === "move") event.preventDefault();
    });
    await sweep(out, point(out), point(free), {}, {
        held() {
            own.push(getComputedStyle(link(widget)).display === "none");
            const over = detail<ConnectingDetail>(last(widget.of("ww-connecting")));
            equal([over.to, over.target === free, over.kind], ["c:free", true, "sig"], "over the port, with its element");
            assert(over.pointer && near(over.pointer.clientX, point(free).x), "and where the pointer is");
        },
    });
    equal(own, [true], "no pending wire of the scene: it is the widget's");
    // The pending wire of the scene is styled by its part.
    equal(getComputedStyle(link(widget)).strokeWidth, "3px", "::part(link) styles it");
});

each("click: a click on a port picks the wire up, the next click puts it down, Escape cancels", async (name) => {
    const widget = await board(name, { clickConnect: true });
    const out = port(widget, "a", "out");
    const free = port(widget, "c", "free");
    await press(out);
    equal(getComputedStyle(link(widget)).display, "block", "the wire is held");
    equal(marked(widget, "data-ww-port-candidate"), ["c:free"]);
    pointer(free, "pointermove", point(free));
    await frame(2);
    equal(marked(widget, "data-ww-port-over"), ["c:free"]);
    const over = detail<ConnectingDetail>(last(widget.of("ww-connecting")));
    equal([over.via, over.to], ["click", "c:free"]);
    pointer(free, "pointerdown", point(free));
    pointer(free, "pointerup", point(free));
    await settled(widget);
    const connect = detail<ConnectDetail>(widget.of("ww-connect")[0]);
    equal([connect.from, connect.to, connect.kind], ["a:out", "c:free", "sig"]);
    equal([widget.of("ww-select").length, getComputedStyle(link(widget)).display], [0, "none"], "the press that put the wire down selected nothing");
    // Escape.
    const html = sceneOf(widget).innerHTML;
    await press(out);
    key("Escape", window);
    await frame(2);
    equal([getComputedStyle(link(widget)).display, marked(widget, "data-ww-port-candidate")], ["none", []]);
    // A click elsewhere.
    await press(out);
    const { element, at } = under(sceneOf(widget), 600, 400);
    pointer(element, "pointerdown", at);
    pointer(element, "pointerup", at);
    await frame(2);
    equal([widget.of("ww-connect").length, getComputedStyle(link(widget)).display], [1, "none"]);
    // The press that is not claimed by the wire goes nowhere: after it a click works as usual again.
    await press(el(widget, "a"));
    equal(widget.selection, ["a"]);
    equal(sceneOf(widget).innerHTML.replace(/ selected(="")?/g, ""), html.replace(/ selected(="")?/g, ""), "the template has all it had");
});

each("click: without the attribute a click on a port does nothing", async (name) => {
    const widget = await board(name);
    await press(port(widget, "a", "out"));
    equal([widget.of("ww-connecting").length, getComputedStyle(link(widget)).display], [0, "none"]);
});

each("node: a whole node starts and takes wires, and the node's own capacity counts", async (name) => {
    const widget = await board(name);
    const scene = sceneOf(widget);
    const [n1, n2, n3] = ["n1", "n2", "n3"].map((id) => el(widget, id));
    await sweep(n1, point(n1, 0.3, 0.5), point(n3, 0.7, 0.5), {}, {
        held() {
            equal(marked(widget, "data-ww-port-candidate").sort(), ["n2", "n3"], "the nodes that take it are marked");
            equal(marked(widget, "data-ww-port-over"), ["n3"], "the one under the pointer");
            equal(getComputedStyle(link(widget)).display, "block");
        },
    });
    await settled(widget);
    const connect = detail<ConnectDetail>(widget.of("ww-connect")[0]);
    equal([connect.from, connect.to, connect.kind, connect.source === n1, connect.target === n3], ["n1", "n3", "net", true, true], "the ends are bare node keys");
    equal([widget.of("ww-move").length, widget.of("ww-select").length], [0, 0], "a press on such a node draws a wire; it does not move or select it");
    assert(widget.wires.some((wire) => wire.from === "n1" && wire.to === "n3"));
    // n3 takes one wire.
    await sweep(n2, point(n2), point(n3), {}, {
        held() {
            equal(marked(widget, "data-ww-port-candidate"), ["n1"], "n3 is full");
        },
    });
    equal(widget.of("ww-connect").length, 1);
    // The same wire with the keyboard.
    const html = scene.innerHTML;
    n1.focus();
    key("Enter");
    const keyboard = detail<ConnectingDetail>(last(widget.of("ww-connecting")));
    equal([keyboard.via, keyboard.from], ["keyboard", "n1"]);
    key("Escape");
    equal(scene.innerHTML, html, "nothing stays in the template, such as the marks of the nodes that take the wire");
    // Not in the mode that wires: the node is moved.
    widget.nodeLinks = false;
    await settled(widget);
    widget.seen.length = 0;
    await sweep(n1, point(n1), by(point(n1), 30, 0));
    await settled(widget);
    equal([widget.of("ww-connecting").length, widget.of("ww-move").length], [0, 1]);
});

// ── Context menu, the background and hit testing ──────────────────────────

each("context: a context menu says what was hit, and may keep the browser's menu away", async (name) => {
    const widget = await board(name);
    const scene = sceneOf(widget);
    const refuse = (event: Event) => event.preventDefault();
    const menu = (target: Element, at: Point, init: PointerEventInit = {}) => pointer(target, "contextmenu", at, { button: 2, pointerType: "mouse", ...init });
    // A node.
    const a = el(widget, "a");
    equal(menu(a, point(a)), true, "the browser's menu stays if nobody cancels");
    let context = detail<ContextDetail>(widget.of("ww-context")[0]);
    equal([context.kind, context.key, context.item === a, context.hit === a, context.via, context.groups], ["node", "a", true, true, "pointer", []]);
    assert(near(context.point.clientX, point(a).x) && near(context.point.x, point(a).x - scene.getBoundingClientRect().left), "where, in client and in scene coordinates");
    widget.addEventListener("ww-context", refuse);
    equal(menu(a, point(a)), false, "a cancelled event cancels the browser's menu");
    // A drawn path.
    const [start, finish] = [scene.portPosition("a:out")!, scene.portPosition("b:in")!];
    const { element, at } = under(scene, (start.x + finish.x) / 2, start.y);
    menu(element, at);
    context = detail<ContextDetail>(last(widget.of("ww-context")));
    equal([context.kind, context.key, context.hit === el(widget, "w1")], ["path", "w1", true], "a wire is named");
    // A node in a group.
    const m2 = el(widget, "m2");
    menu(m2, point(m2));
    context = detail<ContextDetail>(last(widget.of("ww-context")));
    equal([context.kind, context.key, context.hit === m2, context.groups.map((group) => group.getAttribute("data-ww-key"))], ["node", "gp", true, ["gp"]]);
    // The background.
    const surface = scene.shadowRoot!.querySelector<HTMLElement>("[part=surface]")!;
    const empty = client(scene, 620, 250);
    menu(surface, empty);
    context = detail<ContextDetail>(last(widget.of("ww-context")));
    equal([context.kind, context.key, context.item, context.hit, context.target === surface], ["background", "", null, null, true]);
    assert(near(context.point.x, 620) && near(context.point.y, 250), "with the scene point");
    // The menu key.
    a.focus();
    a.dispatchEvent(new PointerEvent("contextmenu", { bubbles: true, composed: true, cancelable: true, pointerType: "", clientX: 1, clientY: 1 }));
    context = detail<ContextDetail>(last(widget.of("ww-context")));
    equal([context.via, context.kind], ["keyboard", "node"]);
    assert(near(context.point.clientX, point(a).x) && near(context.point.clientY, point(a).y), "the middle of the item");
});

each("context: a long press by touch is a context menu, and the browser's own that follows is not reported again", async (name) => {
    const widget = await board(name, { select: "single" });
    widget.addEventListener("ww-context", (event) => event.preventDefault());
    const a = el(widget, "a");
    pointer(a, "pointerdown", point(a), { pointerType: "touch" });
    await wait(650);
    pointer(a, "pointerup", point(a), { pointerType: "touch" });
    await frame(2);
    const context = detail<ContextDetail>(widget.of("ww-context")[0]);
    equal([context.via, context.kind, context.key], ["touch", "node", "a"]);
    equal(widget.of("ww-activate").length, 0, "a long press is no click");
    equal(a.dispatchEvent(new PointerEvent("contextmenu", { bubbles: true, composed: true, cancelable: true, pointerType: "touch" })), false, "the browser's menu is kept away");
    equal(widget.of("ww-context").length, 1, "and not reported twice");
    // In multiple selection a long press by touch adds to the selection: it means that.
    const multiple = await board(name);
    const b = el(multiple, "b");
    pointer(b, "pointerdown", point(b), { pointerType: "touch" });
    await wait(650);
    pointer(b, "pointerup", point(b), { pointerType: "touch" });
    await frame(2);
    equal(multiple.of("ww-context").length, 0);
});

each("activate: a click that assistive technology makes on the focused item is an activation by keyboard", async (name) => {
    const widget = await board(name);
    const a = el(widget, "a");
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, detail: 0 }));
    // A click of a mouse has a count, and was seen as a press and a release: it is not reported twice.
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, detail: 1 }));
    await frame();
    const activations = widget.of("ww-activate").map((event) => detail<ActivateDetail>(event));
    equal(activations.map((one) => [one.key, one.via]), [["a", "keyboard"]]);
});

each("background: a long press by touch is a long press and a context menu of the background", async (name) => {
    const widget = await board(name, { select: "single" });
    widget.addEventListener("ww-context", (event) => event.preventDefault());
    const scene = sceneOf(widget);
    const { element, at } = under(scene, 610, 380);
    pointer(element, "pointerdown", at, { pointerType: "touch" });
    await wait(650);
    pointer(element, "pointerup", at, { pointerType: "touch" });
    await frame(2);
    equal(widget.of("ww-background").map((event) => detail<BackgroundDetail>(event).gesture), ["longpress"]);
    const context = detail<ContextDetail>(widget.of("ww-context")[0]);
    equal([context.kind, context.via], ["background", "touch"]);
});

each("background: a click, a double click and a long press are reported with the scene point", async (name) => {
    const widget = await board(name);
    const scene = sceneOf(widget);
    await click(scene, 620, 250, { pointerType: "mouse" });
    let gestures = widget.of("ww-background").map((event) => detail<BackgroundDetail>(event));
    equal(gestures.map((one) => one.gesture), ["click"]);
    assert(near(gestures[0].point.x, 620) && near(gestures[0].point.y, 250), "the scene point");
    equal(gestures[0].pointerType, "mouse");
    assert(near(gestures[0].point.clientX, client(scene, 620, 250).x), "and the client point");
    await click(scene, 620, 250);
    gestures = widget.of("ww-background").map((event) => detail<BackgroundDetail>(event));
    equal(gestures.map((one) => one.gesture), ["click", "click", "dblclick"]);
    widget.seen.length = 0;
    // A long press is no click.
    const { element, at } = under(scene, 610, 380);
    pointer(element, "pointerdown", at);
    await wait(650);
    pointer(element, "pointerup", at);
    await frame(2);
    equal(widget.of("ww-background").map((event) => detail<BackgroundDetail>(event).gesture), ["longpress"]);
    widget.seen.length = 0;
    // A drag, a click on an item, and a scene that selects nothing.
    await drag(scene, { x: 620, y: 250 }, { x: 660, y: 290 });
    await press(el(widget, "a"));
    equal(widget.of("ww-background").length, 0);
    widget.select = "none";
    await settled(widget);
    await click(scene, 620, 250);
    equal(widget.of("ww-background").length, 1, "also where nothing can be selected");
});

each("hit testing: itemAt and itemsAt answer for a scene or a client point, and the controller converts", async (name) => {
    const widget = await board(name);
    const scene = sceneOf(widget);
    const [start, finish] = [scene.portPosition("a:out")!, scene.portPosition("b:in")!];
    equal(scene.itemAt({ x: 60, y: 60 }) === el(widget, "a"), true, "a node");
    equal(scene.itemAt({ x: (start.x + finish.x) / 2, y: start.y + 3 }) === el(widget, "w1"), true, "a path, in its band");
    equal(scene.itemAt({ x: (start.x + finish.x) / 2, y: start.y + 40 }), null, "and not far from it");
    equal(scene.itemAt({ x: 230, y: 340 }) === el(widget, "msg"), true, "a path that has points");
    equal(scene.itemAt({ x: 668, y: 408 }) === el(widget, "dot"), true, "a circle");
    equal(scene.itemAt({ x: 690, y: 432 }), null, "outside it");
    equal(scene.itemAt({ x: 5, y: 5 }), null, "the background");
    equal(scene.itemAt({ x: 170, y: 260 }) === el(widget, "m1"), true, "a node in a group; the group has no frame");
    // The front first: the wire runs under the node it ends at.
    const through = scene.itemsAt({ x: finish.x + 12, y: finish.y });
    equal(through[0] === el(widget, "b"), true, "a node is above what is drawn");
    // Client points.
    const a = el(widget, "a");
    equal(scene.itemAt(point(a), { client: true }) === a, true);
    const converted = widget.scene.toClient(10, 20);
    const box = scene.getBoundingClientRect();
    assert(near(converted.x, box.left + 10) && near(converted.y, box.top + 20), "toClient");
    const back = widget.scene.toScene(converted.x, converted.y);
    assert(near(back.x, 10, 0.01) && near(back.y, 20, 0.01), "toScene is its inverse");
    equal(widget.scene.itemAt({ x: 60, y: 60 }) === a && widget.scene.itemsAt({ x: 5, y: 5 }).length === 0, true, "the controller too");
    el(widget, "dot").style.pointerEvents = "none";
    equal(scene.itemAt({ x: 660, y: 400 }), null, "an item that takes no pointer is not hit");
});

// ── Constraints ───────────────────────────────────────────────────────────

each("constraint: an item that moves along one axis, within limits, by pointer and by keyboard", async (name) => {
    const widget = await board(name);
    const lifeline = el(widget, "lifeline");
    await sweep(lifeline, point(lifeline), by(point(lifeline), 200, 80), {}, {
        held() {
            const now = detail<MovingDetail>(last(widget.of("ww-moving")));
            equal(now.items.map(({ x, y }) => [x, y]), [[120, 320]], "the preview already stops at max-x, and does not leave the axis");
        },
    });
    await settled(widget);
    equal(widget.places.lifeline, { x: 120, y: 320 });
    await sweep(lifeline, point(lifeline), by(point(lifeline), -300, 0));
    await settled(widget);
    equal(widget.places.lifeline, { x: 20, y: 320 }, "min-x");
    // A path that moves up and down only.
    const scene = sceneOf(widget);
    await drag(scene, { x: 235, y: 340 }, { x: 330, y: 700 });
    await settled(widget);
    equal(widget.places.msg, { x: 160, y: 400 }, "max-y, and x stays");
    await drag(scene, { x: 235, y: 400 }, { x: 100, y: 0 });
    await settled(widget);
    equal(widget.places.msg, { x: 160, y: 300 }, "min-y");
    // The keyboard: a step of 10, and a key against a limit does not count on.
    widget.step = 10;
    await settled(widget);
    lifeline.focus();
    key(" ");
    await settled(widget);
    widget.seen.length = 0;
    key("ArrowDown");
    key("ArrowRight");
    key("ArrowRight", undefined, { shiftKey: true });
    key("ArrowRight", undefined, { shiftKey: true });
    key("ArrowLeft");
    await frame();
    equal(detail<MovingDetail>(last(widget.of("ww-moving"))).items[0], { key: "lifeline", item: detail<MovingDetail>(last(widget.of("ww-moving"))).items[0].item, x: 110, y: 320 }, "right 10, 50, 50 stops at 120; left 10 is 110");
    key("Enter");
    await settled(widget);
    equal(widget.places.lifeline, { x: 110, y: 320 });
});

each("constraint: a selection that moves together keeps every limit", async (name) => {
    const widget = await board(name);
    const lifeline = el(widget, "lifeline");
    const a = el(widget, "a");
    await press(lifeline);
    await press(a, { shiftKey: true });
    equal([...widget.selection].sort(), ["a", "lifeline"]);
    await sweep(a, point(a), by(point(a), 200, 50));
    await settled(widget);
    equal([widget.places.lifeline, widget.places.a], [{ x: 120, y: 320 }, { x: 120, y: 40 }], "the lifeline stops at 120 and has no y: they move 80 across and none down");
});

each("constraint: resize at chosen edges, between limits, for a node and for a drawn rect", async (name) => {
    const widget = await board(name);
    const scene = sceneOf(widget);
    await press(el(widget, "bar"));
    equal(nodeHandles(widget, "bar").sort(), ["e", "w"], "resizable=\"e w\" has these two handles");
    const east = el(widget, "bar").shadowRoot!.querySelector<HTMLElement>("[data-ww-handle=e]")!;
    await sweep(east, point(east), by(point(east), 200, 0));
    await settled(widget);
    equal([widget.places.bar, widget.sizes.bar], [{ x: 520, y: 330 }, { width: 160, height: 40 }], "max-width");
    const west = el(widget, "bar").shadowRoot!.querySelector<HTMLElement>("[data-ww-handle=w]")!;
    await sweep(west, point(west), by(point(west), 300, 0));
    await settled(widget);
    equal(widget.sizes.bar.width, 40, "min-width: the edge stops there");
    equal(widget.places.bar.x, 640);
    // A rect that is drawn.
    equal(handles(widget).length, 0, "a rect that is not selected has no handles");
    await click(scene, 440, 350);
    equal(widget.selection, ["act"]);
    equal(handles(widget).map((handle) => handle.dataset.wwHandle), ["s"], "resizable=\"s\" has the bottom handle");
    const handle = handles(widget)[0];
    const middle = point(handle);
    const box = scene.getBoundingClientRect();
    assert(near(middle.x, box.left + 440) && near(middle.y, box.top + 380), "at the bottom edge");
    await drag(scene, { x: 440, y: 380 }, { x: 440, y: 410 }, {
        held() {
            const drawing = scene.drawingOf(el(widget, "act") as unknown as SceneItem) as { height: number };
            equal(drawing.height, 90, "the rect follows the pointer while it is held");
            assert(near(point(handles(widget)[0]).y, box.top + 410), "and its handle too");
        },
    });
    await settled(widget);
    const resize = detail<ResizeDetail>(last(widget.of("ww-resize")));
    equal([resize.key, resize.item === el(widget, "act"), resize.x, resize.y, resize.width, resize.height], ["act", true, 420, 320, 40, 90], "a ww-resize for a drawn item, with the element");
    equal(widget.sizes.act.height, 90);
    await drag(scene, { x: 440, y: 410 }, { x: 440, y: 700 });
    await settled(widget);
    equal(widget.sizes.act.height, 120, "max-height");
    // The handle is at the bottom edge of the scene: its upper half is what shows.
    await drag(scene, { x: 440, y: 438 }, { x: 440, y: 0 });
    await settled(widget);
    equal(widget.sizes.act.height, 20, "min-height");
    equal(widget.sizes.act.width, 40, "no other edge moved");
});

each("constraint: bounds keep a box inside, when it moves and when an edge is dragged, and an item may have a grid of its own", async (name) => {
    const widget = await board(name);
    const scene = sceneOf(widget);
    // Moves along y only, and the whole box stays between y 300 and 400.
    await drag(scene, { x: 345, y: 340 }, { x: 445, y: 540 });
    await settled(widget);
    equal(widget.places.acts, { x: 330, y: 360 }, "the bottom of the box stops at 400, and x stays");
    await drag(scene, { x: 345, y: 380 }, { x: 345, y: 0 });
    await settled(widget);
    equal(widget.places.acts, { x: 330, y: 300 }, "the top stops at 300");
    // Resized at both edges: an edge stops at the bounds.
    equal(widget.selection, ["acts"]);
    equal(handles(widget).map((handle) => handle.dataset.wwHandle), ["n", "s"], "resizable=\"n s\"");
    await drag(scene, { x: 345, y: 340 }, { x: 345, y: 900 });
    await settled(widget);
    equal([widget.places.acts, widget.sizes.acts], [{ x: 330, y: 300 }, { width: 30, height: 100 }], "the bottom edge stops at 400");
    const resizing = widget.of("ww-resizing").map((event) => detail<MovingDetail & { height: number }>(event));
    assert(resizing.some((one) => one.state === ("resize" as string)) && last(resizing).state === ("end" as string), "ww-resizing reports the steps, and the end");
    equal([last(resizing).committed, last(resizing).height], [true, 100]);
    await drag(scene, { x: 345, y: 300 }, { x: 345, y: 360 });
    await settled(widget);
    equal([widget.places.acts.y, widget.sizes.acts.height], [360, 40], "dragging the top down");
    await drag(scene, { x: 345, y: 360 }, { x: 345, y: 0 });
    await settled(widget);
    equal([widget.places.acts.y, widget.sizes.acts.height], [300, 100], "dragging the top up: it stops at 300");
    // The grid of an item.
    const slot = el(widget, "slot");
    await sweep(slot, point(slot), by(point(slot), 73, 40));
    await settled(widget);
    equal(widget.places.slot, { x: 450, y: 400 }, "this item snaps to multiples of 50, the scene's grid is none; axis x keeps y");
});

each("constraint: the keyboard step is an attribute of the scene", async (name) => {
    const widget = await board(name);
    const a = el(widget, "a");
    a.focus();
    key(" ");
    await settled(widget);
    key("ArrowRight");
    key("Enter");
    await settled(widget);
    equal(widget.places.a.x, 41, "one pixel without move-step");
    widget.step = 25;
    await settled(widget);
    key("ArrowRight");
    key("ArrowDown", undefined, { shiftKey: true });
    key("Enter");
    await settled(widget);
    equal(widget.places.a, { x: 66, y: 165 }, "25, and 125 with Shift");
});

// ── The undo step and the first layout ────────────────────────────────────

for (const inner of ["outermost", "function", "own"] as const) {
    check(`undo: the step is opened on ${inner === "own" ? "the component, as before" : "the widget the editor knows"} (undoHost: ${inner})`, async () => {
        const outer = await mount<Outer>(`<ww-interact-outer inner="${inner}"></ww-interact-outer>`);
        await settled(outer);
        const component = outer.shadowRoot!.firstElementChild as HTMLElement;
        const node = component.shadowRoot!.querySelector<HTMLElement>("[data-ww-key=n]")!;
        const origins: { type: string; origin: EventTarget }[] = [];
        const abort = new AbortController();
        // What the editor does: it takes a step only from an event whose origin is the widget itself.
        for (const type of ["ww-transactionstart", "ww-transactionend"]) document.addEventListener(type, (event) => origins.push({ type, origin: event.composedPath()[0] }), { capture: true, signal: abort.signal });
        await sweep(node, point(node), by(point(node), 30, 0));
        await settled(outer);
        abort.abort();
        const wanted = inner === "own" ? component : outer;
        equal(origins.map((one) => one.type), ["ww-transactionstart", "ww-transactionend"]);
        assert(origins.every((one) => one.origin === wanted), "both events start on the expected host");
    });
}

each("ready: the first layout is announced once, when the sizes and the paths are what they stay", async (name) => {
    const holder = document.body.appendChild(document.createElement("div"));
    try {
        const widget = document.createElement(`ww-interact-${name}`) as Interact;
        let extent: unknown = null;
        let drawn = "";
        widget.addEventListener("ww-ready", () => {
            extent = widget.scene.extent();
            drawn = (sceneOf(widget).drawingOf(el(widget, "w1") as unknown as SceneItem) as { d: string }).d;
        });
        holder.append(widget);
        await until(() => extent, "ww-ready did not come");
        await widget.scene.ready;
        await settled(widget);
        equal(widget.of("ww-ready").length, 1, "once");
        equal(widget.scene.extent(), extent, "the extent has not changed since");
        assert(drawn.startsWith("M"), "the paths are drawn when it comes");
        // A widget that is not shown settles when it is.
        const hidden = document.createElement(`ww-interact-${name}`) as Interact;
        hidden.style.display = "none";
        holder.append(hidden);
        await wait(100);
        await frame(2);
        equal(hidden.of("ww-ready").length, 0, "not while nothing is rendered");
        hidden.style.display = "";
        await until(() => hidden.of("ww-ready").length === 1, "it settles when it is shown");
    } finally {
        holder.remove();
    }
});

void deepActive;
run();
