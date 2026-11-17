// Checks of @webwriter/vue, with real Vue components made by createVueWidget() in a real browser. There is no
// single-file compiler in this build, so the components are plain `defineComponent` objects with render functions.
// Every module the binding has mounts and works once; the calls and options added to match the Lit binding
// (Scene, Viewport, Drag, Settings, Shortcuts, declarations with texts that are functions) are checked in detail.
import { assert, check, drag, equal, frame, key, mount, point, pointer, run, until, type Point } from "../../test/harness";
import { defineComponent, h, reactive, ref, useHost } from "vue";
import { createVueWidget, useWidget, resolveDeclarations } from "@webwriter/vue";
import { defineSceneElements, useScene, type MoveDetail, type MovingDetail } from "@webwriter/vue/scene";
import { useViewport, type ViewportFitDetail } from "@webwriter/vue/viewport";
import { useDrag } from "@webwriter/vue/drag";
import { useSettings } from "@webwriter/vue/settings";
import { useShortcuts } from "@webwriter/vue/shortcuts";
import { usePermissions } from "@webwriter/vue/permissions";
import { useHelp } from "@webwriter/vue/help";
import { usePlayback } from "@webwriter/vue/playback";
import { usePrintNote } from "@webwriter/vue/print";
import { useJsonData } from "@webwriter/vue/data";
import { useLocalize } from "@webwriter/vue/localize";
import { useExercise } from "@webwriter/vue/exercise";
import type { SceneBase } from "@webwriter/widget/scene";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

defineSceneElements();

/** Defines a widget element: a component made by createVueWidget() and the static declarations of its class. */
function widget(tag: string, component: Any, statics: Record<string, unknown> = {}) {
    const Element = class extends createVueWidget(component) {};
    Object.assign(Element, statics);
    customElements.define(tag, Element);
}

const near = (a: number, b: number, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
const nearPoint = (a: Point, b: Point, tolerance = 1.5) => near(a.x, b.x, tolerance) && near(a.y, b.y, tolerance);

/** A mounted widget, waited for until Vue has rendered into its shadow root. */
async function open<T = Any>(html: string): Promise<T> {
    const host = await mount<Any>(html);
    await until(() => host.shadowRoot?.firstElementChild, "the widget did not render");
    await frame(2);
    return host;
}
const inside = <E extends Element = HTMLElement>(host: Element, selector: string) => host.shadowRoot!.querySelector<E>(selector)!;

// ── Scene ─────────────────────────────────────────────────────────────────

const SceneBoard = defineComponent({
    setup() {
        const host = useHost() as Any;
        const places = reactive<Record<string, { x: number; y: number }>>({ a: { x: 40, y: 40 }, b: { x: 300, y: 40 }, c: { x: 300, y: 160 } });
        const refused = ref<string[]>([]);
        const seen: CustomEvent[] = [];
        // The port is the third argument of `can` for a connection that starts at one.
        const scene = useScene({ can: (action, _item, port) => !(action === "connect" && !!port && refused.value.includes((port as HTMLElement).dataset.wwPort ?? "")) });
        Object.assign(host, { scene, places, refused, seen });
        const record = (event: Event) => void seen.push(event as CustomEvent);
        const onMove = (event: CustomEvent<MoveDetail>) => {
            record(event);
            for (const { key, x, y } of event.detail.items) places[key] = { x, y };
        };
        const port = (name: string, mode: "link" | "accept", side: string) =>
            h("span", { "data-ww-port": name, [`data-ww-${mode}`]: "sig", style: { position: "absolute", [side]: "-7px", top: "23px", width: "14px", height: "14px", borderRadius: "50%", background: "rgb(0, 120, 255)" } });
        const node = (key: string, ...children: unknown[]) =>
            h("ww-node", { "data-ww-key": key, x: places[key].x, y: places[key].y, width: 100, height: 60, selectable: "", movable: "", style: { boxSizing: "border-box", background: "#fff", border: "1px solid #555" } }, [key, ...(children as never[])]);
        return () =>
            h("ww-scene", { style: { display: "block", width: "600px", height: "300px", color: "rgb(60, 60, 70)" }, select: "multiple", onWwMove: onMove, onWwMoving: record, onWwReady: record, onWwConnect: record }, [
                node("a", port("out", "link", "right")),
                node("b", port("in", "accept", "left")),
                node("c", port("in", "accept", "left")),
                h("ww-path", { "data-ww-key": "w1", from: "a:out", to: "b:in", "marker-end": "arrow", selectable: "", style: { stroke: "rgb(40, 40, 40)", strokeWidth: "2px" } }),
                h("ww-text", { "data-ww-key": "t", x: 40, y: 240, style: { font: "16px sans-serif" } }, "Hello"),
            ]);
    },
});
widget("ww-vue-scene", SceneBoard);

async function board() {
    const host = await open(`<ww-vue-scene></ww-vue-scene>`);
    await host.scene.ready;
    await frame(2);
    return host;
}
const sceneOf = (host: Element) => inside(host, "ww-scene") as unknown as SceneBase;
const element = (host: Element, id: string) => inside(host, `[data-ww-key="${id}"]`);
const portOf = (host: Element, id: string, name: string) => element(host, id).querySelector<HTMLElement>(`[data-ww-port="${name}"]`)!;

/** The element the pointer really hits at a client point, through every shadow root. */
function under(at: Point): Element {
    let target = document.elementFromPoint(at.x, at.y)!;
    for (;;) {
        const inner = target.shadowRoot?.elementFromPoint(at.x, at.y);
        if (!inner || inner === target) return target;
        target = inner;
    }
}

/** A pointer drag between two client points, starting on what is really there. */
async function sweep(from: Point, to: Point, held?: () => unknown) {
    const target = under(from);
    pointer(target, "pointerdown", from);
    pointer(target, "pointermove", { x: from.x + 6, y: from.y + 6 });
    await frame(2);
    pointer(target, "pointermove", to);
    await frame(2);
    await held?.();
    pointer(target, "pointerup", to);
    await frame(3);
}

check("scene: the scene mounts, `ready` resolves, and extent and the snapshot are there", async () => {
    const host = await board();
    equal(host.scene.core.scenes.length, 1, "the core found the scene in the shadow root");
    equal(host.scene.marquee, false);
    const extent = host.scene.extent();
    assert(extent && extent.width > 100 && extent.height > 100, `an extent: ${JSON.stringify(extent)}`);
    await host.scene.ready;
    equal(host.seen.filter((event: CustomEvent) => event.type === "ww-ready").length, 1, "ww-ready reached the component's listener (`onWwReady`)");
});

check("scene: toScene and toClient convert through the view, and are inverses", async () => {
    const host = await board();
    const a = element(host, "a");
    // The node a is 100 x 60 at (40, 40).
    assert(nearPoint(host.scene.toClient(90, 70), point(a)), "the centre of a, in client coordinates");
    const back = host.scene.toScene(point(a).x, point(a).y);
    assert(nearPoint(back, { x: 90, y: 70 }, 0.01), `and back: ${JSON.stringify(back)}`);
    const there = host.scene.toClient(10, 20);
    assert(nearPoint(host.scene.toScene(there.x, there.y), { x: 10, y: 20 }, 0.01));
});

check("scene: itemAt and itemsAt answer for a scene point or a client point", async () => {
    const host = await board();
    const a = element(host, "a");
    equal(host.scene.itemAt({ x: 60, y: 60 }) === a, true, "a node");
    equal(host.scene.itemAt({ x: 590, y: 290 }), null, "the background");
    equal(host.scene.itemAt(point(a), { client: true }) === a, true, "a client point");
    equal(host.scene.itemsAt({ x: 5, y: 5 }).length, 0);
    const items = host.scene.itemsAt({ x: 60, y: 60 });
    assert(items.length >= 1 && items[0] === a, "the topmost first");
});

check("scene: endsOf names the ports of an attached path and wiresAt counts the wires of a port", async () => {
    const host = await board();
    const wire = element(host, "w1");
    const ends = host.scene.endsOf(wire);
    equal([ends.from?.reference, ends.from?.port, ends.from?.element === portOf(host, "a", "out"), ends.to?.node === element(host, "b"), ends.to?.element === portOf(host, "b", "in")], ["a:out", "out", true, true, true]);
    equal([host.scene.wiresAt("b:in").length, host.scene.wiresAt("a:out").length, host.scene.wiresAt("c:in").length, host.scene.wiresAt("a").length], [1, 1, 0, 0]);
    equal(host.scene.wiresAt("b:in")[0] === wire, true);
});

check("scene: measureText sizes a text from an element's font or from font entries, before it is drawn", async () => {
    const host = await board();
    const measured = host.scene.measureText("Hello", element(host, "t"));
    assert(measured.width > 20 && measured.width < 100, `a width: ${measured.width}`);
    equal(measured.lines, 1);
    const lines = host.scene.measureText("one\ntwo", element(host, "t"));
    equal(lines.lines, 2);
    equal(lines.height, 2 * measured.height, "two lines are twice as high");
    assert(host.scene.measureText("Hello", { fontSize: 28 }).width > measured.width * 1.2, "another font size");
});

check("scene: a move with real pointer events is previewed by ww-moving, committed by ww-move, and the component renders it", async () => {
    const host = await board();
    const a = element(host, "a");
    const start = point(a);
    const target = { x: start.x + 60, y: start.y + 40 };
    await sweep(start, target, () => {
        const moving = host.seen.filter((event: CustomEvent) => event.type === "ww-moving");
        assert(moving.length > 0, "the scene reports every step");
        const now = moving.at(-1)!.detail as MovingDetail;
        equal([now.state, now.committed, now.dx, now.dy], ["move", false, 60, 40]);
        assert(now.pointer && near(now.pointer.clientX, target.x) && near(now.pointer.clientY, target.y), "with the pointer in client coordinates");
        equal(host.places.a, { x: 40, y: 40 }, "the model is untouched while the pointer is down");
    });
    const types = host.seen.map((event: CustomEvent) => event.type).filter((type: string) => type === "ww-move" || type === "ww-moving");
    equal([types.at(-2), types.at(-1)], ["ww-move", "ww-moving"], "the commit comes first, then the end of the preview");
    const move = host.seen.find((event: CustomEvent) => event.type === "ww-move")!.detail as MoveDetail;
    assert(move.pointer && near(move.pointer.clientX, target.x), "the commit carries the pointer too");
    equal(host.places.a, { x: 100, y: 80 });
    await until(() => element(host, "a").getAttribute("x") === "100" || (element(host, "a") as Any).x === 100, "Vue rendered the new position");
});

check("scene: `can` gets the port as its third argument and refuses one port, not the whole node", async () => {
    const host = await board();
    const connect = async () => {
        const out = portOf(host, "a", "out");
        await sweep(point(out), point(portOf(host, "c", "in")));
    };
    host.refused.value = ["out"];
    await connect();
    equal(host.seen.filter((event: CustomEvent) => event.type === "ww-connect").length, 0, "the port `out` is refused");
    host.refused.value = [];
    await connect();
    const connected = host.seen.filter((event: CustomEvent) => event.type === "ww-connect");
    equal(connected.length, 1, "and allowed once it is not refused");
    equal([connected[0].detail.from, connected[0].detail.to], ["a:out", "c:in"]);
});

// ── Viewport and Drag ─────────────────────────────────────────────────────

const BOARD = { x: 0, y: 0, width: 1200, height: 800 };
const WorldBoard = defineComponent({
    setup() {
        const host = useHost() as Any;
        const chips = ref<{ id: string; x: number; y: number }[]>([]);
        const padding = ref(0);
        const viewport = useViewport({ bounds: () => BOARD, margin: 0, fit: () => ({ padding: padding.value }) });
        // The viewport converts the pointer's place into the world's.
        const dragging = useDrag({ viewport: viewport.core });
        const fits: ViewportFitDetail[] = [];
        const state = { lastDrop: null as null | { x: number | null; y: number | null; key: string | undefined } };
        Object.assign(host, { viewport, dragging, chips, padding, fits, state });
        host.addEventListener("ww-viewportfit", (event: CustomEvent<ViewportFitDetail>) => fits.push(event.detail));
        const drop = (event: CustomEvent) => {
            const { x, y, key } = event.detail;
            state.lastDrop = { x, y, key };
            if (x !== null && y !== null) chips.value = [...chips.value, { id: `c${chips.value.length}`, x, y }];
        };
        return () =>
            h("div", { style: { display: "flex", width: "640px", height: "260px" } }, [
                h("div", { style: { width: "120px", padding: "6px", boxSizing: "border-box" } }, h("div", { class: "chip", "data-ww-drag": "chip", "data-ww-drag-effect": "copy", "data-ww-key": "and", tabindex: "0", style: { width: "60px", padding: "4px", border: "1px solid #555", touchAction: "none" } }, "AND")),
                h("div", { class: "board", "data-ww-viewport": "canvas", "data-ww-viewport-zoom": "0.25 4", "data-ww-drop": "chip", "data-ww-drop-position": "point", "data-ww-drop-space": "world", style: { position: "relative", flex: "1", minWidth: "0", overflow: "hidden", background: "#f4f4f5" }, onWwDragcommit: drop }, [
                    h("div", { class: "world", style: { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", transformOrigin: "0 0", transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` } },
                        chips.value.map((chip) => h("div", { class: "placed", key: chip.id, style: { position: "absolute", left: `${chip.x}px`, top: `${chip.y}px`, width: "60px", height: "30px", background: "#bfdbfe" } }))),
                ]),
            ]);
    },
});
widget("ww-vue-world", WorldBoard);

async function world() {
    const host = await open(`<ww-vue-world></ww-vue-world>`);
    await until(() => host.viewport.width > 0, "the viewport never opened");
    await frame(3);
    const win = inside(host, ".board");
    const centre = () => {
        const rect = win.getBoundingClientRect();
        return host.viewport.toWorld(rect.left + win.clientLeft + win.clientWidth / 2, rect.top + win.clientTop + win.clientHeight / 2) as Point;
    };
    return { host, win, centre, vp: host.viewport };
}

check("viewport: the window opens, its form is canvas, and the fields follow the snapshot into the render", async () => {
    const { host, vp } = await world();
    equal(vp.core.form, "canvas");
    assert(vp.width > 300 && vp.height > 200, "the size of the window");
    assert(vp.min === 0.25 && vp.max === 4, "the zoom limits from the attribute");
    const transform = () => inside(host, ".world").style.transform;
    const before = transform();
    await vp.zoomTo(2);
    await frame(2);
    assert(transform() !== before && transform().includes("scale(2)"), `the template follows the view: ${transform()}`);
});

check("viewport: centerOn puts a world point in the centre and sets the scale; the promise resolves when it is there", async () => {
    const { vp, centre } = await world();
    await vp.centerOn({ x: 700, y: 500 }, 2);
    equal(vp.scale, 2);
    assert(nearPoint(centre(), { x: 700, y: 500 }, 0.5), `the centre: ${JSON.stringify(centre())}`);
    await vp.centerOn({ x: 300, y: 200 });
    equal(vp.scale, 2, "without a scale the scale stays");
    assert(nearPoint(centre(), { x: 300, y: 200 }, 0.5));
});

check("viewport: setView sets the origin and the scale, or only the scale about the centre", async () => {
    const { vp, centre } = await world();
    await vp.setView({ x: -100, y: -50, scale: 1.5 });
    equal([vp.x, vp.y, vp.scale], [-100, -50, 1.5]);
    const was = centre();
    await vp.setView({ scale: 2 });
    equal(vp.scale, 2);
    assert(nearPoint(centre(), was, 0.5), "the centre stays under the centre");
});

check("viewport: fit takes options and returns the view; fitted resolves with a fitted view; ww-viewportfit announces it", async () => {
    const { host, vp } = await world();
    const fitted = await vp.fitted();
    const wanted = Math.min(vp.width / BOARD.width, vp.height / BOARD.height);
    assert(near(fitted.scale, wanted, 0.01), `the first fit: ${fitted.scale} of ${wanted}`);
    await vp.zoomTo(2);
    const again = await vp.fit();
    assert(near(again.scale, wanted, 0.01) && near(vp.scale, wanted, 0.01), "fit() returns to the fitted view and resolves with it");
    assert(host.fits.some((fit: ViewportFitDetail) => fit.reason === "request"), "ww-viewportfit with reason request");
    const small = await vp.fit({ box: { x: 0, y: 0, width: 100, height: 50 } });
    assert(small.scale > wanted * 2, `fit({box}) fits another box: ${small.scale}`);
    await vp.fit();
    await vp.fit({ follow: "none" });
    equal(vp.scale === small.scale, false);
    // The option `fit` is a function that is asked at every fit.
    host.padding.value = 100;
    const padded = await vp.fit();
    assert(padded.scale < wanted, `padding makes the fitted view smaller: ${padded.scale} of ${wanted}`);
});

check("viewport: autoPan moves the view for a pointer at the edge, and autoPanWhile keeps panning until it ends", async () => {
    const { win, vp } = await world();
    await vp.setView({ x: 0, y: 0, scale: 1 });
    const rect = win.getBoundingClientRect();
    const inner = { x: rect.left + win.clientLeft, y: rect.top + win.clientTop };
    equal(vp.autoPan(inner.x + win.clientWidth / 2, inner.y + win.clientHeight / 2), false, "the centre does not pan");
    equal(vp.autoPan(inner.x + win.clientWidth - 2, inner.y + win.clientHeight / 2), true, "the right edge pans");
    assert(vp.x < 0, "towards the content on the right");
    const abort = new AbortController();
    const source = { last: { clientX: inner.x + win.clientWidth - 2, clientY: inner.y + win.clientHeight / 2 }, ended: abort.signal };
    vp.autoPanWhile(source);
    const before = vp.x;
    await frame(8);
    assert(vp.x < before, "a pointer held still at the edge keeps panning");
    abort.abort();
    await frame(2);
    const stopped = vp.x;
    await frame(5);
    equal(vp.x, stopped, "and stops with the gesture");
});

check("drag: a drop on a canvas viewport with `data-ww-drop-space=\"world\"` reports the world point under the view", async () => {
    const { host, win, vp, centre } = await world();
    const chip = inside(host, ".chip");
    await vp.centerOn({ x: 700, y: 500 }, 2);
    await frame(2);
    equal(host.dragging.item, null, "nothing is held");
    const at = point(win, 0.6, 0.4);
    const size = () => chip.getBoundingClientRect();
    const worldOf = () => vp.toWorld(at.x - size().width / 2, at.y - size().height / 2) as Point;
    let expected: Point | null = null;
    await drag(chip, at, { held: () => { expected = worldOf(); equal(host.dragging.via, "pointer", "the binding follows the drag"); assert(host.dragging.item, "an item is held"); } });
    const drop = host.state.lastDrop;
    assert(drop && drop.x !== null && drop.y !== null, "the commit reports a point");
    assert(nearPoint({ x: drop.x, y: drop.y }, expected!, 0.05), `the world point: ${JSON.stringify(drop)} for ${JSON.stringify(expected)}`);
    const rect = win.getBoundingClientRect();
    assert(Math.abs(drop.x - (at.x - rect.left)) > 20, "which is not a position in the target's own pixels");
    equal([drop.key, host.chips.value.length], ["and", 1], "and the component placed what was dropped");
    await frame(2);
    equal(host.dragging.item, null, "the item is released");
    assert(centre(), "the view is intact");
    // At another view the same place is another world point.
    await vp.centerOn({ x: 300, y: 200 }, 1);
    await frame(2);
    await drag(chip, at, { held: () => void (expected = worldOf()) });
    assert(nearPoint({ x: host.state.lastDrop!.x!, y: host.state.lastDrop!.y! }, expected!, 0.05), "following the view");
});

// ── Settings and declarations ─────────────────────────────────────────────

const Tunable = defineComponent({
    setup() {
        const host = useHost() as Any;
        const settings = useSettings({
            declarations: {
                speed: { type: Number, default: 5, min: 1, max: 10, label: (widget: HTMLElement) => `Speed in ${widget.getAttribute("data-unit") ?? "x"}`, description: (widget: HTMLElement) => `Unit: ${widget.dataset.unit ?? "none"}` },
                mode: { type: String, default: "a", options: [{ value: "a", label: (widget: HTMLElement) => `A of ${widget.dataset.unit ?? "x"}` }, { value: "b", label: "B" }] },
                showGrid: { type: Boolean, default: true },
            },
        });
        Object.assign(host, { settings });
        return () => h("div", [h("span", { class: "speed" }, String(settings.get("speed"))), h("span", { class: "label" }, settings.labelOf("speed")), h("span", { class: "choice" }, settings.labelOf("mode", "a"))]);
    },
});
widget("ww-vue-tunable", Tunable, { options: { extra: { type: String, label: (widget: HTMLElement) => `Extra ${widget.dataset.unit ?? "x"}` } } });

check("settings: a label that is a function of the widget is asked again when the widget changes", async () => {
    const host = await open<Any>(`<ww-vue-tunable></ww-vue-tunable>`);
    equal(host.options.speed.label, "Speed in x", "the editor's options hold the answer, not the function");
    equal(host.options.speed.description, "Unit: none");
    equal(host.options.mode.options[0].label, "A of x", "also the label of a choice");
    equal(host.options.extra.label, "Extra x", "and a text of the class's own `static options`");
    equal(inside(host, ".label").textContent, "Speed in x", "labelOf answers the same");
    host.setAttribute("data-unit", "px");
    equal(host.options.speed.label, "Speed in px", "the editor reads it again");
    equal(host.options.extra.label, "Extra px");
    await until(() => inside(host, ".label").textContent === "Speed in px", "the component renders the new label");
    equal(inside(host, ".choice").textContent, "A of px");
    equal(typeof host.options.speed.label, "string");
});

check("settings: a setting is an attribute, read by the accessor and the component, written as a step", async () => {
    const host = await open<Any>(`<ww-vue-tunable></ww-vue-tunable>`);
    equal([host.speed, host.settings.get("speed"), host.hasAttribute("speed")], [5, 5, false], "the default is never written to the document");
    host.setAttribute("speed", "8");
    await until(() => inside(host, ".speed").textContent === "8", "the component follows the attribute");
    equal(host.speed, 8);
    equal(host.settings.set("speed", 99), true, "a value outside the limits is moved to the nearest");
    equal(host.getAttribute("speed"), "10");
    equal(host.options.showGrid.inverted, true, "a boolean that defaults to true is declared with its negative attribute");
    equal(host.options.speed.attribute, "speed");
});

const Declared = defineComponent({
    setup() {
        const host = useHost() as Any;
        host.textContent ||= "";
        return () => h("p", "declared");
    },
});
const plain = (text: string) => (widget: HTMLElement) => `${text} ${widget.dataset.n ?? "0"}`;
widget("ww-vue-declared", Declared, {
    options: { size: { type: Number, label: plain("Size"), description: "fixed" } },
    actions: { reset: { label: plain("Reset"), shortcut: "R" } },
    permissions: { allowEditing: { label: plain("Allow editing") } },
    optionGroups: { look: { label: plain("Look") } },
});
widget("ww-vue-fixed", Declared, { options: { size: { type: Number, label: "Size" } } });

check("declarations: static options, actions, permissions and optionGroups with texts that are functions are answered on the instance", async () => {
    const host = await open<Any>(`<ww-vue-declared data-n="1"></ww-vue-declared>`);
    equal(host.options.size.label, "Size 1");
    equal(host.options.size.description, "fixed", "a fixed text stays");
    equal(host.actions.reset.label, "Reset 1");
    equal(host.actions.reset.shortcut, "R", "other fields stay");
    equal(host.permissions.allowEditing.label, "Allow editing 1");
    equal(host.optionGroups.look.label, "Look 1");
    host.dataset.n = "2";
    equal(host.options.size.label, "Size 2", "asked again at every read");
    host.options = { own: {} };
    equal(Object.keys(host.options), ["own"], "a write replaces the accessor, as in the Lit binding");
    equal(resolveDeclarations(host, (host.constructor as Any).actions)!.reset.label, "Reset 2", "and resolveDeclarations is exported");
});

check("declarations: a class without a computed text gets no accessor", async () => {
    const host = await open<Any>(`<ww-vue-fixed></ww-vue-fixed>`);
    equal(Object.hasOwn(host, "options"), false);
    equal(host.options, undefined, "the editor then reads the static map");
    equal((host.constructor as Any).options.size.label, "Size");
});

// ── Shortcuts ─────────────────────────────────────────────────────────────

const Keyed = defineComponent({
    setup(_props, { expose }) {
        const host = useHost() as Any;
        const shortcuts = useShortcuts();
        const calls: string[] = [];
        const busy = ref(true);
        // A method that returns false declines the key.
        const first = () => (calls.push("first"), busy.value ? false : undefined);
        const second = () => void calls.push("second");
        expose({ first, second });
        Object.assign(host, { shortcuts, calls, busy });
        return () => h("div", { class: "target", tabindex: "0" }, shortcuts.labelsOf("second").join(" "));
    },
});
widget("ww-vue-keyed", Keyed, { actions: { first: { label: "First", shortcut: "Enter" }, second: { label: "Second", shortcut: "Enter" } } });

check("shortcuts: an action that returns false declines the key and the next action with it runs; otherwise the first keeps it", async () => {
    const host = await open<Any>(`<ww-vue-keyed></ww-vue-keyed>`);
    equal(host.shortcuts.keysOf("first"), ["Enter"]);
    equal(host.shortcuts.running, []);
    const target = inside(host, ".target");
    equal(key("Enter", target), false, "the key was taken: the event is cancelled");
    equal(host.calls, ["first", "second"], "the first declined, the second ran");
    host.calls.length = 0;
    host.busy.value = false;
    equal(key("Enter", target), false);
    equal(host.calls, ["first"], "an action that does not decline keeps the key");
    assert(host.shortcuts.labelsOf("first").length > 0, "labelsOf gives the keys as a person reads them");
});

// ── The other modules, once each ──────────────────────────────────────────

const Gated = defineComponent({
    setup() {
        const host = useHost() as Any;
        const permissions = usePermissions();
        Object.assign(host, { gate: permissions });
        return () => h("p", { class: "state" }, `${permissions.editing}/${permissions.can("allowEditing")}`);
    },
});
widget("ww-vue-gated", Gated, { permissions: { allowEditing: { label: "Allow editing" } } });

check("permissions: editing and can() follow the mode and the author's grant, and the component renders again", async () => {
    const host = await open<Any>(`<ww-vue-gated></ww-vue-gated>`);
    const state = () => inside(host, ".state").textContent;
    equal(state(), "false/false");
    host.setAttribute("allowediting", "");
    await until(() => state() === "false/true", "the grant reaches the render");
    host.removeAttribute("allowediting");
    host.setAttribute("contenteditable", "true");
    await until(() => state() === "true/true", "edit mode");
    equal(host.gate.editing, true);
});

const Helped = defineComponent({
    setup() {
        const host = useHost() as Any;
        const help = useHelp();
        Object.assign(host, { help });
        return () => h("div", { style: { width: "400px", height: "200px", position: "relative" } }, [h("button", { class: "toggle", "data-ww-help-toggle": "" }, "?"), h("button", { class: "go", "data-ww-help": "Starts the run" }, "Go"), h("span", { class: "open" }, String(help.open))]);
    },
});
widget("ww-vue-helped", Helped);

check("help: the toggle button opens the overlay, and `open` and `form` are state of the component", async () => {
    const host = await open<Any>(`<ww-vue-helped></ww-vue-helped>`);
    equal([host.help.open, host.help.form], [false, null]);
    inside(host, ".toggle").click();
    await until(() => inside(host, ".open").textContent === "true", "open reaches the render");
    equal(host.help.form === "labels" || host.help.form === "list", true);
    host.help.close();
    await until(() => inside(host, ".open").textContent === "false");
});

const Noted = defineComponent({
    setup() {
        const host = useHost() as Any;
        const note = usePrintNote({ address: "https://example.org/lesson" });
        Object.assign(host, { note });
        return () => h("p", { class: "text" }, note.text);
    },
});
widget("ww-vue-noted", Noted);

check("print note: the note is in the shadow root with the address, and `text` and `address` are state of the component", async () => {
    const host = await open<Any>(`<ww-vue-noted lang="de"></ww-vue-noted>`);
    await until(() => inside(host, ".text").textContent!.startsWith("Dieser interaktive Inhalt"), "German");
    equal(host.note.address, "https://example.org/lesson");
    const note = inside(host, "[data-ww-print-note]");
    equal(note.querySelector("[data-ww-print-address]")!.textContent, "https://example.org/lesson");
    equal(host.shadowRoot!.querySelectorAll("[data-ww-print-note]").length, 1, "one note");
});

const Stepped = defineComponent({
    setup() {
        const host = useHost() as Any;
        const shown = ref(0);
        const playback = usePlayback({ steps: () => 3, show: (index: number) => void (shown.value = index), interval: () => 0.5 });
        Object.assign(host, { playback });
        return () => h("p", { class: "step" }, `${shown.value}:${playback.currentStep}:${playback.ended}`);
    },
});
widget("ww-vue-stepped", Stepped);

check("playback: a discrete run steps, seeks and ends, and the component shows it", async () => {
    const host = await open<Any>(`<ww-vue-stepped></ww-vue-stepped>`);
    const p = host.playback;
    equal([p.steps, p.currentStep, p.paused, p.ended], [3, 0, true, false]);
    p.step();
    await until(() => inside(host, ".step").textContent === "1:1:false", "step");
    p.seek(2);
    await until(() => inside(host, ".step").textContent === "2:2:true", "the last step ends the run");
    p.back();
    equal(p.currentStep, 1);
    equal(p.run("seek", 0), true);
    equal(p.currentStep, 0);
    p.reset();
    equal(p.ended, false);
});

const Counted = defineComponent({
    setup() {
        const host = useHost() as Any;
        const data = useJsonData({ defaults: { votes: 0 } });
        Object.assign(host, { data });
        return () => h("p", { class: "votes" }, String(data.value.votes));
    },
});
widget("ww-vue-counted", Counted);

check("data: the data-block helper holds a value, writes later, and the component renders it", async () => {
    const host = await open<Any>(`<ww-vue-counted contenteditable></ww-vue-counted>`);
    equal([host.data.value.votes, host.data.unsaved, host.data.invalid], [0, false, false]);
    host.data.set({ votes: 2 });
    await until(() => inside(host, ".votes").textContent === "2", "the value reaches the render");
    equal(host.data.get().votes, 2);
    host.data.flush();
    equal(host.data.unsaved, false, "flush writes the block");
    assert(host.querySelector("script")?.textContent?.includes('"votes":2'), "into the document");
});

const Spoken = defineComponent({
    setup() {
        const host = useHost() as Any;
        const localize = useLocalize({ sourceLocale: "en", targetLocales: ["de"], load: async () => ({ templates: { Hello: "Hallo" } }) });
        Object.assign(host, { localize });
        return () => h("p", { class: "text" }, `${localize.msg("Hello")}|${localize.locale}`);
    },
});
widget("ww-vue-spoken", Spoken);

check("localize: msg answers in the widget's language, and follows its `lang`", async () => {
    const host = await open<Any>(`<ww-vue-spoken></ww-vue-spoken>`);
    equal(inside(host, ".text").textContent, "Hello|en");
    host.setAttribute("lang", "de");
    await until(() => inside(host, ".text").textContent === "Hallo|de", "the catalog is in and the component rendered again");
    await host.localize.loaded;
});

const Asked = defineComponent({
    setup() {
        const host = useHost() as Any;
        const answer = ref<string | undefined>(undefined);
        const exercise = useExercise({
            response: () => answer.value,
            respond: (response: string | undefined) => void (answer.value = response),
            solution: () => "yes",
            score: (response: string | undefined, solution: string) => ({ marks: [response === solution], correct: response === solution ? 1 : 0, total: 1 }),
        });
        Object.assign(host, { exercise, answer });
        return () => h("p", { class: "mode" }, `${exercise.mode}`);
    },
});
widget("ww-vue-asked", Asked, { actions: { extra: { label: (widget: HTMLElement) => `Extra ${widget.dataset.n ?? "0"}` } } });

check("exercise: the helper declares its actions next to the class's, with function texts answered", async () => {
    const host = await open<Any>(`<ww-vue-asked data-n="3"></ww-vue-asked>`);
    assert(["check", "reset"].every((name) => name in host.actions), `the helper's actions: ${Object.keys(host.actions)}`);
    equal(host.actions.extra.label, "Extra 3", "a text of the class's static actions that is a function");
    equal(typeof host.exercise.available("check"), "boolean");
    host.exercise.respond("yes");
    equal(host.answer.value, "yes");
});

check("useWidget: the snapshot of the widget runtime is a readonly ref", async () => {
    const probe = defineComponent({ setup() { const snapshot = useWidget(); (useHost() as Any).snapshot = snapshot; return () => h("p", "x"); } });
    widget("ww-vue-probe", probe);
    const host = await open<Any>(`<ww-vue-probe></ww-vue-probe>`);
    equal(typeof host.snapshot.value, "object");
});

// Vue assigns a prop as a property when the element has one of that name. The scene elements have a setter
// for every property that mirrors an attribute, so such a prop is written like any other.
check("scene elements: a prop that names an attribute of a scene element is written as that attribute, and removed with null", async () => {
    const state = reactive<{ bend: number | null }>({ bend: 0.3 });
    widget("ww-vue-props", defineComponent({
        setup: () => () => h("ww-scene", null, [
            h("ww-node", { "data-ww-key": "a", x: 0, y: 0, width: 40, height: 40, outline: "circle" }),
            h("ww-node", { "data-ww-key": "b", x: 200, y: 0, width: 40, height: 40, outline: "rounded" }),
            h("ww-group", { scale: 2 }),
            h("ww-path", { from: "a", to: "b", route: "arc", bend: state.bend, rewire: "from to", waypoints: "50,60 e:70,80" }, [
                h("ww-text", { side: "above", at: "start" }, "label"),
            ]),
        ]),
    }));
    const host = await open<Any>(`<ww-vue-props style="display:block;width:300px;height:120px"></ww-vue-props>`);
    const path = (await until(() => host.shadowRoot!.querySelector("ww-path"), "the scene renders")) as Any;
    equal(path.getAttribute("route"), "arc");
    equal(path.getAttribute("bend"), "0.3");
    equal(path.getAttribute("rewire"), "from to");
    equal(path.waypoints.length, 2);
    equal(host.shadowRoot!.querySelector("ww-node")!.getAttribute("outline"), "circle");
    equal(host.shadowRoot!.querySelector("ww-group")!.getAttribute("scale"), "2");
    const text = host.shadowRoot!.querySelector("ww-text") as Any;
    equal(text.getAttribute("side"), "above");
    equal(text.getAttribute("at"), "start");
    state.bend = null;
    await until(() => !path.hasAttribute("bend"), "null removes the attribute");
});

await run();
