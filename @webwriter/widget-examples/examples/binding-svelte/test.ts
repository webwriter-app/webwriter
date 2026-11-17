// Checks of @webwriter/svelte against the real Svelte 5: a widget element made with the binding's own mixins
// (withWidgetRuntime, withSettings, withExercise, withDeclarations), mounted in the page, in edit and read mode.
// The components are the .svelte files of this folder, compiled by compile.mjs.
//
// One check at least for every module the binding has (it mounts, the state is there, a behaviour works), and for
// what came with the last release of the cores: Scene (`ready`, `toScene`, `toClient`, `itemAt`, `itemsAt`, `endsOf`,
// `wiresAt`, `measureText`, `undoHost`, `can` with a port), Viewport (`fit(call)`, `fitted`, `centerOn`, `setView`,
// `autoPan`, `autoPanWhile`), Drag into a world target, texts that are functions of the widget, and a shortcut that
// declines a key.
import { tick } from "svelte";
import { get } from "svelte/store";
import { sceneElements, type MoveDetail, type MovingDetail, type SceneBase, type ConnectDetail } from "@webwriter/widget/scene";
import { withDeclarations, widgetStore } from "@webwriter/svelte";
import { coreStore, listen, rootOf } from "@webwriter/svelte/base";
import { settingsStore } from "@webwriter/svelte/settings";
import { assert, check, editorSetOption, editorSetPermission, equal, frame, key, listeners, mount, point, pointer, run, transactionSteps, until, wait, type Point } from "../../test/harness";

// The scene elements live in the registry of the page: a Svelte shadow root has no registry of its own.
for (const [name, element] of Object.entries(sceneElements)) if (!customElements.get(name)) customElements.define(name, element as CustomElementConstructor);
await import("./scene.svelte.js");
await import("./world.svelte.js");
await import("./settings.svelte.js");
await import("./run.svelte.js");
await import("./exercise.svelte.js");

// What the components put on their host, for the checks.
type Store<Value = any> = { subscribe(run: (value: Value) => void): () => void; core: any; refresh(): void; [name: string]: any };
type Widget = HTMLElement & Record<string, any>;

/** A change reaches the DOM: Svelte's flush, then the frames of the cores. */
async function settled() {
    await tick();
    await frame(2);
    await tick();
}

async function board<E extends Widget = Widget>(tag: string, attributes = ""): Promise<E> {
    const widget = await mount<E>(`<${tag} ${attributes}></${tag}>`);
    await settled();
    return widget;
}

const root = (widget: Widget) => widget.shadowRoot!;
const q = <E extends Element = HTMLElement>(widget: Widget, selector: string) => root(widget).querySelector<E>(selector)!;
const text = (widget: Widget, selector: string) => q(widget, selector).textContent!.trim();
const near = (a: number, b: number, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
const nearPoint = (a: Point, b: Point, tolerance = 1.5) => near(a.x, b.x, tolerance) && near(a.y, b.y, tolerance);
const click = async (element: Element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, cancelable: true }));
    await settled();
};

// ── 1. Scene ──────────────────────────────────────────────────────────────

const sceneOf = (widget: Widget) => q(widget, "ww-scene") as unknown as SceneBase;
const nodeOf = (widget: Widget, id: string) => q(widget, `[data-ww-key="${id}"]`);
const portOf = (widget: Widget, id: string, name: string) => nodeOf(widget, id).querySelector<HTMLElement>(`[data-ww-port="${name}"]`)!;
const seen = (widget: Widget, type: string) => (widget.seen as CustomEvent[]).filter((event) => event.type === type);
const detail = <T>(event: CustomEvent | undefined) => event!.detail as T;
const last = <T>(list: T[]) => list[list.length - 1]!;

/** A pointer drag on `target`, with a check while the pointer is held. */
async function sweep(target: Element, from: Point, to: Point, held?: () => unknown) {
    pointer(target, "pointerdown", from);
    pointer(target, "pointermove", { x: from.x + 6, y: from.y + 6 });
    await frame(2);
    pointer(target, "pointermove", to);
    await frame(2);
    await held?.();
    pointer(target, "pointerup", to);
    await settled();
}

check("scene: it mounts, the store holds the snapshot, and ready resolves with the first layout", async () => {
    const widget = await board("ww-b-scene");
    const scene = widget.scene as Store<{ marquee: boolean }>;
    equal(get(scene as any), { marquee: false });
    equal(text(widget, ".marquee"), "no marquee", "the template reads $scene.marquee");
    assert(sceneOf(widget).tagName === "WW-SCENE" && root(widget).querySelectorAll("ww-node").length === 3 && root(widget).querySelectorAll("ww-path").length === 1);
    await scene.ready;
    const extent = scene.extent();
    assert(extent && extent.width > 100, "the extent is known once ready resolved");
    equal(seen(widget, "ww-ready").length, 1, "ww-ready came once");
    equal(scene.extent(), extent, "and the extent did not change since");
    equal(typeof Object.getOwnPropertyDescriptor(scene, "ready")?.get, "function", "ready is read when asked");
    scene.restyle();
    scene.remeasure();
});

check("scene: toScene and toClient are inverse, itemAt and itemsAt answer for scene and client points", async () => {
    const widget = await board("ww-b-scene");
    const scene = widget.scene as Store;
    await scene.ready;
    const box = sceneOf(widget).getBoundingClientRect();
    const converted = scene.toClient(10, 20);
    assert(near(converted.x, box.left + 10) && near(converted.y, box.top + 20), "toClient");
    const back = scene.toScene(converted.x, converted.y);
    assert(nearPoint(back, { x: 10, y: 20 }, 0.01), "toScene is its inverse");
    assert(scene.itemAt({ x: 60, y: 60 }) === nodeOf(widget, "a"), "a node, at a scene point");
    assert(scene.itemAt(point(nodeOf(widget, "b")), { client: true }) === nodeOf(widget, "b"), "and at a client point");
    equal(scene.itemAt({ x: 480, y: 300 }), null, "the background is null");
    const at = scene.itemsAt({ x: 60, y: 60 });
    assert(at[0] === nodeOf(widget, "a"), "the topmost first");
    equal(scene.itemsAt({ x: 480, y: 300 }).length, 0, "and nothing at the background");
});

check("scene: endsOf names the ends of an attached path, wiresAt counts the wires of a port or a node", async () => {
    const widget = await board("ww-b-scene");
    const scene = widget.scene as Store;
    await scene.ready;
    const wire = q(widget, "ww-path");
    const ends = scene.endsOf(wire);
    assert(ends.from?.node === nodeOf(widget, "a") && ends.from.port === "out" && ends.from.element === portOf(widget, "a", "out"), "from: node, port name and port element");
    assert(ends.to?.node === nodeOf(widget, "b") && ends.to.port === "in", "to");
    equal(scene.wiresAt("b:in").length, 1, "one wire ends at b:in");
    assert(scene.wiresAt("b:in")[0] === wire);
    equal(scene.wiresAt("c:in").length, 0, "a port without a wire");
});

check("scene: measureText gives the size of a text from a font, an element or font entries", async () => {
    const widget = await board("ww-b-scene");
    const scene = widget.scene as Store;
    const one = scene.measureText("Hello");
    assert(one.width > 10 && one.height > 5, `a size (${JSON.stringify(one)})`);
    const two = scene.measureText("Hello\nHello");
    assert(two.height > one.height * 1.5 && near(two.width, one.width, 1), "\\n breaks lines");
    const big = scene.measureText("Hello", { fontSize: 40 });
    assert(big.width > one.width * 2, "from font entries");
    const styled = document.createElement("span");
    styled.style.font = "30px serif";
    document.body.append(styled);
    const fromElement = scene.measureText("Hello", styled);
    styled.remove();
    assert(fromElement.width > one.width * 1.5, "from an element's font");
});

check("scene: a move with real pointer events sends ww-moving, then ww-move, and the component follows", async () => {
    const widget = await board("ww-b-scene");
    const scene = widget.scene as Store;
    await scene.ready;
    const a = nodeOf(widget, "a");
    const start = point(a);
    const target = { x: start.x + 60, y: start.y + 40 };
    await sweep(a, start, target, () => {
        const moving = seen(widget, "ww-moving");
        assert(moving.length > 0, "the scene reports every step");
        const now = detail<MovingDetail>(last(moving));
        equal([now.state, now.committed], ["move", false]);
        equal(now.items.map(({ key, x, y }) => ({ key, x, y })), [{ key: "a", x: 100, y: 80 }]);
        assert(now.pointer && near(now.pointer.clientX, target.x) && near(now.pointer.clientY, target.y), "the pointer is in client coordinates");
        equal(seen(widget, "ww-move").length, 0, "nothing is committed yet");
        equal(widget.places().a, { x: 40, y: 40 }, "the model is untouched");
    });
    const order = (widget.seen as CustomEvent[]).map((event) => event.type).filter((type) => type === "ww-move" || type === "ww-moving");
    equal([order.at(-2), order.at(-1)], ["ww-move", "ww-moving"], "the commit comes first, then the end of the preview");
    const move = detail<MoveDetail>(seen(widget, "ww-move")[0]);
    assert(move.pointer && near(move.pointer.clientX, target.x), "the commit carries the pointer too");
    equal(widget.places().a, { x: 100, y: 80 }, "the component moved the node");
    equal([nodeOf(widget, "a").getAttribute("x"), nodeOf(widget, "a").getAttribute("y")].map(Number), [100, 80], "and Svelte wrote it into the template");
});

check("scene: `can` is asked with the port as its third argument, so one port is refused and not the node", async () => {
    const widget = await board("ww-b-scene");
    await (widget.scene as Store).ready;
    widget.refused = ["out"];
    const out = portOf(widget, "a", "out");
    await sweep(out, point(out), point(portOf(widget, "c", "in")));
    equal(seen(widget, "ww-connect").length, 0, "a refused port starts no wire");
    widget.refused = [];
    await sweep(out, point(out), point(portOf(widget, "c", "in")));
    equal(seen(widget, "ww-connect").length, 1);
    equal(detail<ConnectDetail>(seen(widget, "ww-connect")[0]).from, "a:out");
    await settled();
    equal(root(widget).querySelectorAll("ww-path").length, 2, "the component drew the new wire");
    equal((widget.scene as Store).wiresAt("c:in").length, 1);
});

check("scene: the undo host is an option of the store, and the step of a move stays open until the render", async () => {
    const widget = await board("ww-b-scene");
    await (widget.scene as Store).ready;
    const steps = transactionSteps(widget, () => nodeOf(widget, "a").getAttribute("x"));
    const a = nodeOf(widget, "a");
    await sweep(a, point(a), { x: point(a).x + 30, y: point(a).y });
    const log = steps.stop();
    assert(log.length >= 2 && log[0]!.startsWith("start") && log.at(-1)!.startsWith("end"), `one step: ${log.join(", ")}`);
    equal(log.at(-1), "end 70", "the template has the new place when the step ends");
});

check("scene: the shadow root observers and listeners of a scene widget are released when it leaves", async () => {
    const before = listeners();
    const widget = await board("ww-b-scene");
    await (widget.scene as Store).ready;
    widget.remove();
    await settled();
    equal(listeners(), before, "nothing is left on the window or the document");
});

// ── 2. Viewport, Drag and Shortcuts ───────────────────────────────────────

const winOf = (widget: Widget) => q(widget, ".board");
const view = (widget: Widget) => (widget.viewport as Store).core.getSnapshot() as { x: number; y: number; scale: number; width: number; height: number; min: number; max: number };
const centre = (widget: Widget) => {
    const box = winOf(widget).getBoundingClientRect();
    return (widget.viewport as Store).toWorld(box.left + box.width / 2, box.top + box.height / 2) as Point;
};

check("viewport: it mounts, $viewport holds the view and the template follows it", async () => {
    const widget = await board("ww-b-world");
    const store = widget.viewport as Store;
    const now = get(store as any) as ReturnType<typeof view>;
    assert(now.width > 200 && now.height > 100, "the size of the window");
    equal([now.min, now.max], [0.25, 4], "the zoom limits");
    const drawn = (widget: Widget) => (q(widget, ".world").style.transform.match(/-?\d[\d.]*(?:e-?\d+)?/g) ?? []).map(Number);
    assert(drawn(widget).every((value, index) => near(value, [now.x, now.y, now.scale][index]!, 0.001)), `the template draws the view (${q(widget, ".world").style.transform})`);
    store.zoomBy(2);
    await settled();
    equal(get(store as any).scale, now.scale * 2);
    assert(near(drawn(widget)[2]!, now.scale * 2, 0.001), "and again after a change");
    store.panBy(10, 5);
    store.zoomTo(1);
    equal(view(widget).scale, 1);
});

check("viewport: fit with options, and fitted() resolves once the view is a fitted one", async () => {
    const widget = await board("ww-b-world");
    const store = widget.viewport as Store;
    const fitted = await store.fitted();
    equal(fitted.scale, view(widget).scale, "the snapshot of the fitted view");
    const full = view(widget).scale;
    await store.zoomTo(2);
    const padded = await store.fit({ box: { x: 0, y: 0, width: 300, height: 200 } });
    assert(padded.scale > full, "a box is fitted instead of the content");
    await store.fit();
    equal(view(widget).scale, full, "fit() returns to the fitted view");
    const fits: string[] = [];
    widget.addEventListener("ww-viewportfit", (event) => fits.push((event as CustomEvent).detail.reason));
    await store.fit({ follow: "none" });
    equal(fits, ["request"], "ww-viewportfit announces the fit");
    const animated = store.fit({ animate: 50 });
    assert(animated instanceof Promise, "a promise for a fit that glides");
    await animated;
    equal(view(widget).scale, full);
});

check("viewport: centerOn and setView put a world point in the centre, or set the view, clamped to the limits", async () => {
    const widget = await board("ww-b-world");
    const store = widget.viewport as Store;
    await store.centerOn({ x: 500, y: 300 });
    assert(nearPoint(centre(widget), { x: 500, y: 300 }), "centred");
    await store.centerOn({ x: 100, y: 50 }, 2);
    assert(view(widget).scale === 2 && nearPoint(centre(widget), { x: 100, y: 50 }), "with a scale");
    await store.centerOn({ x: 100, y: 50 }, 100);
    equal(view(widget).scale, 4, "the zoom limit applies");
    await store.setView({ x: -100, y: -50, scale: 2 });
    equal([view(widget).x, view(widget).y, view(widget).scale], [-100, -50, 2]);
    const was = centre(widget);
    await store.setView({ scale: 1 });
    assert(view(widget).scale === 1 && nearPoint(centre(widget), was), "with only a scale the world point in the centre stays");
    await settled();
    equal(get(store as any).scale, 1, "$viewport follows");
    const glide = store.centerOn({ x: 600, y: 400 }, 1, { animate: 50 });
    await glide;
    assert(nearPoint(centre(widget), { x: 600, y: 400 }), "an animated call resolves when the view is there");
});

check("viewport: autoPan pans for a pointer at the edge, autoPanWhile keeps panning while the gesture runs", async () => {
    const widget = await board("ww-b-world");
    const store = widget.viewport as Store;
    await store.setView({ x: -300, y: -100, scale: 1 });
    const box = winOf(widget).getBoundingClientRect();
    const was = view(widget).x;
    assert(!store.autoPan(box.left + box.width / 2, box.top + box.height / 2), "the middle of the window does nothing");
    assert(store.autoPan(box.left + 2, box.top + box.height / 2), "the left edge pans");
    assert(view(widget).x > was, "towards the content that lies to the left");
    const ended = new AbortController();
    const source = { last: { clientX: box.right - 2, clientY: box.top + box.height / 2 }, ended: ended.signal };
    const before = view(widget).x;
    store.autoPanWhile(source);
    await frame(8);
    ended.abort();
    assert(view(widget).x < before, "a pointer held at the right edge keeps panning");
    const stopped = view(widget).x;
    await frame(4);
    equal(view(widget).x, stopped, "and stops when the gesture ended");
});

check("viewport: the options wheel, start, resize and the follow of a fit reach the core", async () => {
    // wheel: "zoom" makes the plain wheel zoom about the pointer; the default pans.
    const zoom = await board("ww-b-world", `wheel="zoom"`);
    const win = winOf(zoom);
    const box = win.getBoundingClientRect();
    const scale = view(zoom).scale;
    assert(!win.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientX: box.left + 100, clientY: box.top + 100, bubbles: true, cancelable: true, composed: true })), "the wheel is taken");
    assert(view(zoom).scale > scale, "and zooms");
    const pan = await board("ww-b-world");
    const panned = view(pan).x;
    const panBox = winOf(pan).getBoundingClientRect();
    winOf(pan).dispatchEvent(new WheelEvent("wheel", { deltaX: 30, clientX: panBox.left + 100, clientY: panBox.top + 100, bubbles: true, cancelable: true, composed: true }));
    assert(view(pan).x !== panned, "the default pans");
    // start: a world point in the centre, asked when the window first has a size.
    const started = await board("ww-b-world", `start-x="500" start-y="300"`);
    assert(nearPoint(centre(started), { x: 500, y: 300 }) && view(started).scale === 1, "the first view");
    // resize: "centre" keeps the world point in the centre when the window changes size.
    const kept = await board("ww-b-world", `start-x="500" start-y="300" resize="centre"`);
    kept.style.width = "500px";
    await until(() => view(kept).width < 400, "the window did not shrink");
    await settled();
    assert(nearPoint(centre(kept), { x: 500, y: 300 }), "the world point in the centre stays there");
    // fit: {follow: "none"} leaves a fitted view alone when the window changes size.
    const still = await board("ww-b-world", `follow="none"`);
    const fitScale = view(still).scale;
    still.style.height = "520px";
    await until(() => view(still).height > 400, "the window did not grow");
    equal(view(still).scale, fitScale, "no fit again");
    const follows = await board("ww-b-world");
    const first = view(follows).scale;
    follows.style.height = "520px";
    await until(() => view(follows).scale !== first, "a fitted view fits again by itself");
});

check("drag: an item dropped on a world target reports the world point under the pan and zoom of the view", async () => {
    const widget = await board("ww-b-world");
    const store = widget.viewport as Store;
    const chip = q(widget, ".chip");
    const win = winOf(widget);
    const box = win.getBoundingClientRect();
    const at = { x: box.left + 140, y: box.top + 90 };
    const size = chip.getBoundingClientRect();
    let expected: Point | undefined;
    const world = (centre: Point) => store.toWorld(centre.x - size.width / 2, centre.y - size.height / 2) as Point;
    const dragTo = async (to: Point) => {
        pointer(chip, "pointerdown", point(chip));
        pointer(chip, "pointermove", { x: point(chip).x + 6, y: point(chip).y + 6 });
        await frame(2);
        pointer(chip, "pointermove", to);
        await frame(2);
        expected = world(to);
        pointer(chip, "pointerup", to);
        await until(() => widget.lastDrop, "no commit");
        await settled();
    };
    await dragTo(at);
    assert(widget.lastDrop.key === "and", "the key of the item");
    assert(nearPoint({ x: widget.lastDrop.x, y: widget.lastDrop.y }, expected!, 0.05), `the world point (${JSON.stringify(widget.lastDrop)} for ${JSON.stringify(expected)})`);
    equal(widget.chips().length, 1, "the component placed a chip");
    // At another view the same place is another world point.
    widget.lastDrop = null;
    await store.setView({ x: -200, y: -100, scale: 2 });
    await dragTo(at);
    assert(nearPoint({ x: widget.lastDrop.x, y: widget.lastDrop.y }, expected!, 0.05), "the same client place, under another view");
    equal(widget.chips().length, 2);
    equal(get(widget.drag as any), { item: null, via: null }, "the drag store is idle again");
});

check("shortcuts: keys run an action as one undo step, a button gets its aria-keyshortcuts, an action that declines leaves the key", async () => {
    const widget = await board("ww-b-world");
    const shortcuts = widget.shortcuts as Store;
    equal(shortcuts.keysOf("fit"), ["F"]);
    assert(shortcuts.labelsOf("fit").length === 1 && /F/.test(shortcuts.labelsOf("fit")[0]), "labels");
    equal(get(shortcuts as any).running, [], "nothing runs");
    assert(q(widget, "[data-ww-shortcut=fit]").getAttribute("aria-keyshortcuts")?.toUpperCase().includes("F"), "the button names its key");
    const board_ = winOf(widget);
    board_.focus();
    assert(widget.chips().length === 0);
    // Delete has nothing to do without a chip: the action declines and the key is left alone.
    assert(key("Delete", board_), "the key is not taken: the action returned false");
    await (widget.viewport as Store).setView({ scale: 2 });
    const scale = view(widget).scale;
    assert(!key("f", board_), "F is taken by fit");
    await settled();
    assert(view(widget).scale !== scale, "and fit ran");
    // With a chip the same key is the action's.
    const chip = q(widget, ".chip");
    const box = winOf(widget).getBoundingClientRect();
    const to = { x: box.left + 100, y: box.top + 80 };
    pointer(chip, "pointerdown", point(chip));
    pointer(chip, "pointermove", { x: point(chip).x + 6, y: point(chip).y + 6 });
    await frame(2);
    pointer(chip, "pointermove", to);
    await frame(2);
    pointer(chip, "pointerup", to);
    await until(() => widget.chips().length === 1, "no chip");
    await settled();
    const steps = transactionSteps(widget, () => widget.chips().length);
    assert(!key("Delete", board_), "the key is taken: the action had something to do");
    await settled();
    equal(widget.chips().length, 0);
    equal(steps.stop().length, 2, "one undo step, start and end");
    // The key is the page's again.
    assert(key("Delete", board_));
});

// ── 3. Settings, declarations, Permissions and Help ───────────────────────

check("settings: a setting is an attribute and a property, $settings has the values, a bound control follows", async () => {
    const widget = await board("ww-b-settings");
    const store = widget.settingsStore as Store;
    equal(widget.speed, 1, "the default");
    equal(get(store as any).values.speed, 1);
    widget.setAttribute("speed", "5");
    await settled();
    equal(widget.speed, 5);
    equal(text(widget, ".speed"), "5", "the template reads $settings.values");
    equal(q<HTMLInputElement>(widget, "[data-ww-setting=speed]").value, "5", "the bound control");
    const steps = transactionSteps(widget, () => widget.getAttribute("speed"));
    store.set("speed", 3);
    await settled();
    equal([widget.getAttribute("speed"), widget.speed], ["3", 3], "set() writes the attribute");
    equal(steps.stop(), ["start 5", "end 3"], "as one undo step");
    widget.loud = false;
    await settled();
    equal([widget.hasAttribute("no-loud"), q<HTMLInputElement>(widget, "[data-ww-setting=loud]").checked], [true, false], "a boolean that defaults to true is stored as no-loud");
    assert(settingsStore !== undefined);
    let failed: unknown;
    try {
        settingsStore(document.createElement("div"));
    } catch (error) {
        failed = error;
    }
    assert(String(failed).includes("withSettings"), "a host without withSettings is told");
});

check("settings: the editor changes an option through the declarations the widget gives it", async () => {
    const widget = await board("ww-b-settings");
    assert(editorSetOption(widget, "speed", 7));
    equal(widget.speed, 7);
    assert(!editorSetOption(widget, "speed", 99), "out of range");
    assert(editorSetOption(widget, "mode", "busy"));
    await settled();
    equal(q<HTMLSelectElement>(widget, "[data-ww-setting=mode]").value, "busy");
});

check("settings: a label that is a function of the widget is asked again, so the editor reads the new text", async () => {
    const widget = await board("ww-b-settings");
    equal(widget.options.speed.label, { _: "Speed of the card" }, "a setting's label");
    equal(widget.options.speed.description, { _: "How fast the card runs" }, "and its description");
    equal(widget.options.mode.options[0].label, { _: "the card calm" }, "and the label of a choice");
    equal(widget.options.mode.options[1].label, { _: "Busy" }, "a fixed text stays");
    equal(widget.options.note.label, { _: "Note on the card" }, "the texts of the class's static options too");
    widget.subject = "the clock";
    equal(widget.options.speed.label, { _: "Speed of the clock" }, "a change of the widget shows");
    equal(widget.options.note.label, { _: "Note on the clock" });
    equal(widget.options.mode.options[0].label, { _: "the clock calm" });
    const store = widget.settingsStore as Store;
    equal(store.labelOf("speed"), "Speed of the clock", "labelOf answers the same");
    store.refresh();
    await settled();
    equal(text(widget, "[data-ww-setting-label=speed]"), "Speed of the clock", "and so does the label the core writes into the template");
    // The options are plain maps for a reader that does not ask the widget.
    assert(typeof (widget.constructor as any).options.note.label === "function", "the static map is unchanged");
});

check("declarations: withDeclarations answers computed texts of options, actions, permissions and optionGroups on the instance", async () => {
    const widget = await board("ww-b-settings");
    equal(widget.permissions.allowReset.label, { _: "Reset the card" });
    widget.subject = "the clock";
    equal(widget.permissions.allowReset.label, { _: "Reset the clock" }, "asked on every read");
    class Plain extends withDeclarations(HTMLElement) {
        static options = { x: { type: String, label: (w: { name: string }) => ({ _: `X of ${w.name}` }) } };
        static actions = { go: { label: (w: { name: string }) => ({ _: `Go ${w.name}` }) } };
        static optionGroups = { g: { label: (w: { name: string }) => ({ _: `Group ${w.name}` }) } };
        static permissions = { p: { label: { _: "Fixed" } } };
        name = "one";
    }
    customElements.define("ww-b-plain", Plain);
    const plain = document.createElement("ww-b-plain") as Plain & Record<string, any>;
    equal(plain.options.x.label, { _: "X of one" });
    equal(plain.actions.go.label, { _: "Go one" });
    equal(plain.optionGroups.g.label, { _: "Group one" });
    equal(plain.permissions, undefined, "a map without a computed text is not answered on the instance");
    plain.name = "two";
    equal(plain.options.x.label, { _: "X of two" });
    plain.options = { y: { type: String } };
    equal(Object.keys(plain.options), ["y"], "a later write replaces the accessor");
    class Own extends withDeclarations(HTMLElement) {
        static options = { x: { type: String, label: () => ({ _: "static" }) } };
        get options() {
            return { own: { type: String } };
        }
    }
    customElements.define("ww-b-own", Own);
    equal(Object.keys((document.createElement("ww-b-own") as any).options), ["own"], "a member the class defines itself is left alone");
});

check("permissions: $permissions answers for the mode and the author's grant, edit and read", async () => {
    const reading = await board("ww-b-settings");
    equal(text(reading, ".mode"), "reading");
    assert(editorSetPermission(reading, "allowReset", true), "the editor grants a declared permission");
    await settled();
    equal(text(reading, ".mode"), "reading can reset", "a reader may reset once the author granted it");
    assert(reading.permissionsStore.can("allowReset"));
    const editing = await board("ww-b-settings", `contenteditable="true"`);
    equal(text(editing, ".mode"), "editing can reset", "an author may do what is declared");
    editing.contentEditable = "false";
    editing.removeAttribute("contenteditable");
    await settled();
    equal(text(editing, ".mode"), "reading", "the store follows the mode");
});

check("help: the toggle button opens the overlay, $help.open follows, close() closes it", async () => {
    const widget = await board("ww-b-settings");
    const help = widget.helpStore as Store;
    equal(get(help as any).open, false);
    equal(text(widget, ".help-state"), "help closed");
    await click(q(widget, ".help"));
    await settled();
    equal(get(help as any).open, true);
    equal(text(widget, ".help-state"), "help open");
    assert(["labels", "list"].includes(get(help as any).form), "the form of the overlay");
    help.close();
    await settled();
    equal(text(widget, ".help-state"), "help closed");
    help.toggle(true);
    assert(get(help as any).open, "toggle(true)");
    help.toggle();
    assert(!get(help as any).open, "toggle()");
});

check("print note: the store has the text and the address, and the note is in the shadow root", async () => {
    const widget = await board("ww-b-settings");
    const note = get(widget.printNoteStore as any);
    assert(note.text.startsWith("This interactive content"), "the text in English");
    equal(note.address, "https://example.org/lesson");
    equal(text(widget, ".print-text"), note.text, "the component renders it");
    equal(root(widget).querySelectorAll("[data-ww-print-note]").length, 1, "one note");
    equal(q(widget, "[data-ww-print-address]").textContent, "https://example.org/lesson");
});

// ── 4. Playback, data, localization ───────────────────────────────────────

check("playback: the marked buttons step, the store reads the run live, playbackRate and currentTime can be set", async () => {
    const widget = await board("ww-b-run");
    const playback = widget.playback as Store;
    equal(text(widget, ".step"), "one paused 0/4");
    equal([playback.paused, playback.ended, playback.currentStep, playback.steps, playback.duration], [true, false, 0, 4, 3]);
    await click(q(widget, "[data-ww-playback=step]"));
    equal(text(widget, ".step"), "two paused 1/4", "a marked button steps and the component shows it");
    equal(playback.currentStep, 1);
    equal(playback.currentTime, 1);
    playback.run("step");
    await settled();
    playback.seek(3);
    await settled();
    equal([text(widget, ".step"), playback.ended], ["four paused 3/4", true]);
    await click(q(widget, "[data-ww-playback=back]"));
    equal(playback.currentStep, 2);
    playback.playbackRate = 2;
    equal(playback.playbackRate, 2, "a setter");
    playback.currentTime = 1;
    equal([playback.currentStep, playback.currentTime], [1, 1], "currentTime moves the run");
    playback.reset();
    await settled();
    equal(text(widget, ".step"), "one paused 0/4");
    assert(playback.run("seek", 2), "run() takes a command as a marked button gives it");
    equal(playback.currentStep, 2);
});

check("data: set() changes the value now and writes the block later; a change from outside reaches the store", async () => {
    const widget = await board("ww-b-run", `contenteditable="true"`);
    const data = widget.data as Store;
    equal(data.get(), { count: 0 });
    equal(text(widget, ".count"), "Count 0");
    await click(q(widget, ".count"));
    equal(text(widget, ".count"), "Count 1");
    equal(get(data as any).value, { count: 1 });
    data.flush();
    await settled();
    const block = widget.querySelector<HTMLScriptElement>(`script[type="application/json"]`);
    assert(block && JSON.parse(block.textContent!).count === 1, "the block has the value");
    equal(get(data as any).unsaved, false);
    block!.textContent = JSON.stringify({ count: 9 });
    await until(() => data.get().count === 9, "a change of the block from outside did not arrive");
    await settled();
    equal(text(widget, ".count"), "Count 9", "and the template shows it");
    // widgetStore follows the runtime's snapshot.
    equal(typeof get(widgetStore(widget) as any), "object");
});

check("localize: the store follows the language of the widget and loads the catalog", async () => {
    const widget = await board("ww-b-run", `lang="en"`);
    const l10n = widget.l10n as Store;
    equal(text(widget, ".locale"), "en");
    equal(get(l10n as any).templates, undefined, "no catalog for the source language");
    widget.setAttribute("lang", "de");
    await l10n.loaded;
    await settled();
    equal([l10n.getLocale(), text(widget, ".locale")], ["de", "de"]);
    equal(get(l10n as any).templates, { greeting: "Hallo" });
    await l10n.setLocale("en");
    equal(l10n.getLocale(), "en");
});

// ── 5. Exercise ───────────────────────────────────────────────────────────

check("exercise: the response is stored, check shows the score, the actions are the editor's, a text of one may be a function", async () => {
    const widget = await board("ww-b-exercise");
    const exercise = widget.exercise as Store;
    assert((widget.constructor as any).formAssociated, "form-associated");
    equal(text(widget, ".state"), "open -");
    await click(q(widget, ".choice:nth-child(1)"));
    equal(text(widget, ".state"), "open a");
    equal(exercise.core.result, null, "no feedback before Check");
    await click(q(widget, ".check"));
    equal([exercise.core.result.correct, exercise.core.result.total], [0, 1]);
    assert(text(widget, "output").length > 0, "a summary");
    equal(get(exercise as any).summary, text(widget, "output"));
    assert(exercise.available("reset"), "an action that can run");
    // The editor reads the declaration of the instance.
    const names = Object.keys(widget.actions);
    assert(names.includes("check") && names.includes("reset") && names.includes("clear"), `the helper's own and the class's: ${names.join()}`);
    equal(widget.actions.clear.label, { _: "Clear answer" }, "a computed text is resolved");
    widget.noun = "choice";
    equal(widget.actions.clear.label, { _: "Clear choice" }, "and asked again");
    widget.reset();
    await settled();
    equal(text(widget, ".state"), "open -", "reset() of the host reaches the helper");
});

// ── 6. The binding's base ─────────────────────────────────────────────────

check("base: coreStore binds a core to a component, and a store value keeps its identity until the state changes", async () => {
    const widget = await board("ww-b-settings");
    const store = widget.helpStore as Store;
    const values: unknown[] = [];
    const stop = store.subscribe((value: unknown) => values.push(value));
    store.refresh();
    await settled();
    equal(values.length, 1, "a refresh that changes nothing sends nothing");
    store.toggle(true);
    equal(values.length, 2);
    assert(values[0] !== values[1]);
    stop();
    assert(rootOf(widget) === widget.shadowRoot);
    assert(typeof coreStore === "function" && typeof listen === "function");
});

await run();
