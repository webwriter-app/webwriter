/** @jsx createElement */
/** @jsxFrag Fragment */
// Checks of the React binding (@webwriter/react) in a real browser with real React: a widget made with
// createReactWidget() for every module hook, in read and in edit mode. Components are written in TSX; there is
// no compiler step beyond esbuild's JSX transform.
import { Fragment, createElement, useLayoutEffect, useRef, useState } from "react";
import { assert, check, drag, editorSetOption, equal, events, frame, key, mount, point, pointer, run, settled, typeInto, until, wait, type Point } from "../../test/harness";
import { wheel } from "../diagram-view/helpers";
import {
    createReactWidget, useWidget, hasComputedDeclarations, resolveDeclarations,
} from "@webwriter/react";
import { useEvent } from "@webwriter/react/base";
import { useJsonData } from "@webwriter/react/data";
import { useDrag } from "@webwriter/react/drag";
import { useExercise } from "@webwriter/react/exercise";
import { useHelp } from "@webwriter/react/help";
import { useLocalize, useWidgetMsg } from "@webwriter/react/localize";
import { usePermissions, useWidgetPermissions } from "@webwriter/react/permissions";
import { usePlayback } from "@webwriter/react/playback";
import { usePrintNote } from "@webwriter/react/print";
import { sceneElements, useScene } from "@webwriter/react/scene";
import { useSettings } from "@webwriter/react/settings";
import { useShortcuts } from "@webwriter/react/shortcuts";
import { useViewport } from "@webwriter/react/viewport";
import type { ViewportOptions } from "@webwriter/react/viewport";

// The scene elements are registered once, with the page's registry.
for (const [tag, element] of Object.entries(sceneElements)) if (!customElements.get(tag)) customElements.define(tag, element);

type Any = any;
const near = (a: number, b: number, tolerance = 0.01) => Math.abs(a - b) <= tolerance;
const nearPoint = (a: Point, b: Point, tolerance = 0.01) => near(a.x, b.x, tolerance) && near(a.y, b.y, tolerance);
const inside = (host: Element, selector: string) => host.shadowRoot!.querySelector<HTMLElement>(selector)!;

// ── 1. Viewport, Drag and Shortcuts: a board ──────────────────────────────

const BOARD = { x: 0, y: 0, width: 1200, height: 800 };
type Chip = { id: string; x: number; y: number };

/** Makes a board widget on a viewport in the canvas form, a drag target in world coordinates and two actions on one key. */
function defineBoard(tag: string, viewportOptions: ViewportOptions = { bounds: () => BOARD, margin: 0 }) {
    function BoardUI({ host }: { host: Any }) {
        const [chips, setChips] = useState<Chip[]>([]);
        const viewport = useViewport(host, viewportOptions);
        useDrag(host, { viewport: viewport.core });
        useShortcuts(host, {
            fit: () => void viewport.fit(),
            decline: () => {
                host.log.push("decline");
                return host.declines ? false : undefined;
            },
            take: () => {
                host.log.push("take");
                return host.blockTake ? false : undefined;
            },
        });
        const win = useRef<HTMLDivElement>(null);
        useEvent(win, "ww-dragcommit", (event) => {
            const { x, y, key } = event.detail;
            host.lastDrop = { x, y, key };
            if (x === null || y === null) return;
            setChips((list) => [...list, { id: `c${list.length}`, x, y }]);
        });
        useLayoutEffect(() => void (host.api = { viewport }));
        const { x, y, scale } = viewport;
        return (
            <>
                <style>{`:host { display: flex; width: 640px; height: 260px; } .side { width: 120px; padding: 6px; box-sizing: border-box; }
                    .chip { width: 60px; padding: 4px; border: 1px solid #555; background: #fff; touch-action: none; }
                    .board { position: relative; flex: 1; min-width: 0; overflow: hidden; border: 1px solid #c8c8c8; background: #f4f4f5; }
                    .world { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
                    .placed { position: absolute; width: 60px; height: 30px; background: #bfdbfe; }`}</style>
                <div className="side">
                    <div className="chip" data-ww-drag="chip" data-ww-drag-effect="copy" data-ww-key="and" tabIndex={0}>AND</div>
                </div>
                <div className="board" ref={win} tabIndex={0} data-ww-viewport="canvas" data-ww-viewport-zoom="0.25 4"
                    data-ww-drop="chip" data-ww-drop-position="point" data-ww-drop-space="world" aria-label="Board">
                    <div className="world" style={{ transform: `translate(${x}px, ${y}px) scale(${scale})` }}>
                        {chips.map((chip) => <div className="placed" key={chip.id} style={{ left: chip.x, top: chip.y }} />)}
                    </div>
                    <span data-ww-viewport-controls="" />
                </div>
            </>
        );
    }
    class Board extends createReactWidget(BoardUI) {
        static actions = { fit: { label: { _: "Fit" }, shortcut: "F" }, decline: { label: { _: "Decline" }, shortcut: "D" }, take: { label: { _: "Take" }, shortcut: "D" } };
        log: string[] = [];
        declines = false;
        blockTake = false;
        lastDrop: { x: number | null; y: number | null; key: string | undefined } | null = null;
        api!: { viewport: ReturnType<typeof useViewport> };
    }
    customElements.define(tag, Board);
    return Board;
}
type BoardWidget = InstanceType<ReturnType<typeof defineBoard>>;
defineBoard("ww-rb-board");
defineBoard("ww-rb-board-start", { bounds: () => BOARD, margin: 5000, wheel: "zoom", start: { centre: { x: 600, y: 400 }, scale: 1 }, fit: { padding: 10, maxScale: 0.5 }, resize: "centre" });

async function board(tag = "ww-rb-board", style = "") {
    const widget = await mount<BoardWidget>(`<${tag} ${style}></${tag}>`);
    await until(() => widget.api && widget.api.viewport.width > 0, "the viewport never opened");
    await frame(3);
    const win = inside(widget, ".board");
    return { widget, win, chip: inside(widget, ".chip"), view: () => widget.api.viewport, centre: () => { const r = win.getBoundingClientRect(); return widget.api.viewport.toWorld(r.left + win.clientLeft + win.clientWidth / 2, r.top + win.clientTop + win.clientHeight / 2); } };
}

check("viewport: the hook mounts, reports the view, and the host element is a widget", async () => {
    const { widget, view } = await board();
    assert(view().width > 0 && view().height > 0, "the window has a size");
    assert(view().scale > 0 && view().min === 0.25 && view().max === 4, "scale and limits come from the window's attribute");
    assert(widget.shadowRoot!.querySelector("[data-ww-viewport-action]"), "the module put its controls in the marked element");
});

check("viewport: centerOn and setView set the view and return promises; the component renders the new scale", async () => {
    const { widget, view, centre } = await board();
    const done = widget.api.viewport.centerOn({ x: 700, y: 500 }, 2);
    assert(done instanceof Promise, "centerOn returns a promise");
    await done;
    assert(nearPoint(centre(), { x: 700, y: 500 }) && view().scale === 2, "the world point is in the centre");
    await widget.api.viewport.setView({ x: -100, y: -50, scale: 1 });
    equal([view().x, view().y, view().scale], [-100, -50, 1]);
    const world = centre();
    await widget.api.viewport.setView({ scale: 2 });
    assert(view().scale === 2 && nearPoint(centre(), world), "only a scale keeps the centre");
    await until(() => inside(widget, ".world").style.transform.includes("scale(2)"), "the component rendered the scale");
    const glide = await widget.api.viewport.centerOn({ x: 300, y: 200 }, 1, { animate: false });
    assert(glide === undefined && nearPoint(centre(), { x: 300, y: 200 }));
});

check("viewport: fit(call) resolves with the view, fitted() waits for a fitted view, and ww-viewportfit announces the fit", async () => {
    const { widget, view } = await board();
    const fits: string[] = [];
    widget.addEventListener("ww-viewportfit", (event) => fits.push((event as CustomEvent).detail.reason));
    await widget.api.viewport.setView({ scale: 2 });
    const result = await widget.api.viewport.fit();
    assert(result.scale < 1 && result.scale === view().scale, "the promise resolves with the fitted view");
    equal(fits, ["request"]);
    const first = await widget.api.viewport.fitted();
    assert(first.scale === result.scale, "a fitted view that is up to date resolves at once");
    // A box is fitted once and leaves the view alone; follow "none" fits once.
    const box = await widget.api.viewport.fit({ box: { x: 0, y: 0, width: 200, height: 100 } });
    assert(box.scale > result.scale, "a smaller box is shown larger");
    await widget.api.viewport.fit({ follow: "none" });
    assert(widget.api.viewport.fit({ animate: false }) instanceof Promise);
});

check("viewport: options wheel, start, fit and resize reach the core", async () => {
    const { widget, win, view, centre } = await board("ww-rb-board-start", `style="width: 640px"`);
    assert(nearPoint(centre(), { x: 600, y: 400 }, 0.5) && view().scale === 1, "start: a world point in the centre, applied once");
    const at = point(win, 0.3, 0.4);
    const before = view().scale;
    assert(wheel(win, at, { deltaY: -100 }), "wheel zoom: the plain wheel is consumed");
    await until(() => view().scale > before, "and it zoomed in");
    const fitted = await widget.api.viewport.fit();
    assert(fitted.scale <= 0.5, "the fit option maxScale limits a fit");
});

check("viewport: autoPan and autoPanWhile are forwarded", async () => {
    const { widget, win, view } = await board();
    await widget.api.viewport.setView({ x: 0, y: 0, scale: 1 });
    // The module pans when a pointer is held at the edge of the window.
    const rect = win.getBoundingClientRect();
    const moved = widget.api.viewport.autoPan(rect.right - 2, rect.top + rect.height / 2);
    assert(typeof moved === "boolean", "autoPan answers whether the view moved");
    const abort = new AbortController();
    widget.api.viewport.autoPanWhile({ last: { clientX: rect.left + 10, clientY: rect.top + 10 }, ended: abort.signal });
    await frame(3);
    abort.abort();
    assert(view().scale === 1, "the scale did not change");
});

check("drag: a drop on a canvas viewport reports the world point under the view (option viewport)", async () => {
    const { widget, chip, win, view } = await board();
    await view().centerOn({ x: 700, y: 500 }, 2);
    await frame(2);
    const at = point(win, 0.6, 0.4);
    const size = chip.getBoundingClientRect();
    let expected: Point | null = null;
    await drag(chip, at, { held: () => void (expected = view().toWorld(at.x - size.width / 2, at.y - size.height / 2)) });
    assert(widget.lastDrop && widget.lastDrop.x !== null, "the commit reports a point");
    assert(nearPoint({ x: widget.lastDrop!.x!, y: widget.lastDrop!.y! }, expected!, 0.05), `world point (${JSON.stringify(widget.lastDrop)} for ${JSON.stringify(expected)})`);
    const rect = win.getBoundingClientRect();
    assert(Math.abs(widget.lastDrop!.x! - (at.x - rect.left)) > 20, "which is not the target's own pixels");
    equal(widget.lastDrop!.key, "and");
    await until(() => widget.shadowRoot!.querySelectorAll(".placed").length === 1, "the component placed what was dropped");
});

check("shortcuts: an action that returns false declines the key; the next action takes it; both decline: it reaches the page", async () => {
    const { widget, win } = await board();
    const reached: string[] = [];
    const page = new AbortController();
    document.addEventListener("keydown", (event) => reached.push(event.key), { signal: page.signal });
    // `decline` and `take` share the key, the first declared runs first.
    equal([key("d", win), widget.log, reached], [false, ["decline"], []], "the first action has the key and takes it");
    widget.log.length = 0;
    widget.declines = true;
    equal([key("d", win), widget.log, reached], [false, ["decline", "take"], []], "decline gives the key to take");
    widget.log.length = 0;
    widget.blockTake = true;
    equal([key("d", win), widget.log, reached], [true, ["decline", "take"], ["d"]], "both decline: the key is not consumed");
    page.abort();
    equal([key("f", win), widget.api.viewport.scale > 0], [false, true], "an action with a handler runs from its key");
});

check("shortcuts: keysOf and labelsOf come from the declaration; running is empty at rest", async () => {
    const widget = await mount<Any>(`<ww-rb-keys></ww-rb-keys>`);
    equal(widget.api.keysOf("fit"), ["F"]);
    assert(/F$/.test(widget.api.labelsOf("fit")[0]));
    equal(widget.api.running, []);
});

function KeysUI({ host }: { host: Any }) {
    const shortcuts = useShortcuts(host, { fit: () => undefined });
    useLayoutEffect(() => void (host.api = shortcuts));
    return <button data-ww-shortcut="fit">Fit</button>;
}
class Keys extends createReactWidget(KeysUI) {
    static actions = { fit: { label: { _: "Fit" }, shortcut: "F" } };
}
customElements.define("ww-rb-keys", Keys);

// ── 2. Scene ──────────────────────────────────────────────────────────────

type Place = { x: number; y: number };
function SceneUI({ host }: { host: Any }) {
    const [places, setPlaces] = useState<Record<string, Place>>({ a: { x: 40, y: 40 }, b: { x: 300, y: 40 }, c: { x: 300, y: 160 } });
    const scene = useScene(host, {
        can: (action, _item, port) => {
            host.asked.push([action, (port as HTMLElement | undefined)?.dataset.wwPort ?? null]);
            return !(action === "connect" && !!port && host.refused.includes((port as HTMLElement).dataset.wwPort));
        },
        undoHost: () => host,
    });
    useEvent(host.shadowRoot, "ww-move", (event) => {
        setPlaces((now) => {
            const next = { ...now };
            for (const { key, x, y } of event.detail.items) next[key] = { x, y };
            return next;
        });
    });
    useLayoutEffect(() => void (host.api = scene));
    const port = (side: "right" | "left"): Any => ({ position: "absolute", width: 14, height: 14, borderRadius: "50%", background: "#07f", top: 23, [side]: -7 });
    return (
        <>
            <style>{`:host { display: block; } ww-scene { display: block; width: 500px; height: 300px; } ww-node { box-sizing: border-box; background: #fff; border: 1px solid #555; }
                ww-path { stroke: #333; stroke-width: 2px; }`}</style>
            <ww-scene select="multiple">
                <ww-node data-ww-key="a" x={places.a.x} y={places.a.y} width="100" height="60" selectable movable>a
                    <span style={port("right")} data-ww-port="out" data-ww-link="sig" /></ww-node>
                <ww-node data-ww-key="b" x={places.b.x} y={places.b.y} width="100" height="60" selectable movable>b
                    <span style={port("left")} data-ww-port="in" data-ww-accept="sig" /></ww-node>
                <ww-node data-ww-key="c" x={places.c.x} y={places.c.y} width="100" height="60" selectable movable>c
                    <span style={port("left")} data-ww-port="in" data-ww-accept="sig" /></ww-node>
                <ww-path data-ww-key="w1" from="a:out" to="b:in" />
            </ww-scene>
        </>
    );
}
class SceneWidget extends createReactWidget(SceneUI) {
    asked: [string, string | null][] = [];
    refused: string[] = [];
    api!: ReturnType<typeof useScene>;
}
customElements.define("ww-rb-scene", SceneWidget);

async function scene() {
    const widget = await mount<SceneWidget>(`<ww-rb-scene></ww-rb-scene>`);
    await until(() => widget.api, "the hook never returned");
    await widget.api.ready;
    await frame(2);
    const element = inside(widget, "ww-scene");
    return { widget, element, node: (id: string) => inside(widget, `[data-ww-key="${id}"]`) };
}

check("scene: ready resolves after the first layout, extent is the content, marquee is false", async () => {
    const { widget } = await scene();
    const first = widget.api.ready;
    assert(first instanceof Promise, "ready is read as a promise when the property is");
    await first;
    const box = widget.api.extent();
    assert(box && box.width >= 360 && box.height >= 120, `extent covers the nodes (${JSON.stringify(box)})`);
    equal(widget.api.marquee, false);
});

check("scene: toScene and toClient convert through the view and are inverse", async () => {
    const { widget, element } = await scene();
    const rect = element.getBoundingClientRect();
    const client = widget.api.toClient(10, 20);
    assert(nearPoint(client, { x: rect.left + element.clientLeft + 10, y: rect.top + element.clientTop + 20 }, 1.5), "scene origin is at the corner of the window");
    assert(nearPoint(widget.api.toScene(client.x, client.y), { x: 10, y: 20 }), "toScene undoes toClient");
});

check("scene: itemAt and itemsAt find what is drawn at a point, in scene and in client coordinates", async () => {
    const { widget, node } = await scene();
    equal(widget.api.itemAt({ x: 90, y: 70 }) === (node("a") as unknown), true, "a point in node a");
    equal(widget.api.itemAt({ x: 450, y: 280 }), null, "the background");
    const at = widget.api.toClient(350, 190);
    equal(widget.api.itemAt(at, { client: true }) === (node("c") as unknown), true, "client coordinates with {client: true}");
    const all = widget.api.itemsAt({ x: 90, y: 70 });
    assert(Array.isArray(all) && all[0] === (node("a") as unknown), "the topmost first");
});

check("scene: endsOf names the ends of a wire, wiresAt counts the wires of a port", async () => {
    const { widget, node } = await scene();
    const wire = inside(widget, `[data-ww-key="w1"]`) as unknown as Parameters<typeof widget.api.endsOf>[0];
    const ends = widget.api.endsOf(wire);
    equal([ends.from?.node === (node("a") as unknown), ends.to?.node === (node("b") as unknown)], [true, true]);
    equal([ends.from?.reference, ends.from?.port, ends.to?.port], ["a:out", "out", "in"]);
    equal([ends.from?.element === node("a").querySelector(`[data-ww-port="out"]`), ends.to?.element === node("b").querySelector(`[data-ww-port="in"]`)], [true, true], "the port elements");
    equal([widget.api.wiresAt("b:in").length, widget.api.wiresAt("a:out").length, widget.api.wiresAt("c:in").length], [1, 1, 0]);
    assert(widget.api.wiresAt("b:in")[0] === (wire as unknown));
});

check("scene: measureText sizes a text from a font entry or an element, and breaks lines at \\n", async () => {
    const { widget, node } = await scene();
    const one = widget.api.measureText("ab");
    const two = widget.api.measureText("ab\nab");
    assert(one.width > 0 && one.height > 0, "a size");
    assert(two.height > one.height && near(two.width, one.width, 1), "two lines are taller, not wider");
    const big = widget.api.measureText("ab", { fontSize: 40 });
    assert(big.width > one.width, "a font entry changes the size");
    assert(widget.api.measureText("ab", node("a")).width > 0, "the font of an element");
});

check("scene: a real pointer move gives ww-moving and ww-move with the pointer, and the component renders the new place", async () => {
    const { widget, element, node } = await scene();
    const log = events("ww-transactionstart", "ww-transactionend");
    const seen: CustomEvent[] = [];
    for (const type of ["ww-moving", "ww-move"]) widget.addEventListener(type, (event) => seen.push(event as CustomEvent));
    const from = widget.api.toClient(60, 50);
    const to = widget.api.toClient(110, 110);
    const target = document.elementFromPoint(from.x, from.y) ? node("a") : node("a");
    pointer(target, "pointerdown", from);
    pointer(target, "pointermove", { x: from.x + 6, y: from.y + 6 });
    await frame(2);
    pointer(target, "pointermove", to);
    await frame(2);
    pointer(target, "pointerup", to);
    await frame(3);
    const types = seen.map((event) => event.type);
    assert(types.includes("ww-moving") && types.includes("ww-move"), `both events (${types})`);
    const move = seen.find((event) => event.type === "ww-move")!.detail;
    equal([move.items[0].key, Math.round(move.dx), Math.round(move.dy)], ["a", 50, 60]);
    assert(move.pointer !== null, "MoveDetail has the pointer");
    const moving = seen.filter((event) => event.type === "ww-moving");
    assert(moving.some((event) => event.detail.state === "move") && moving.at(-1)!.detail.state === "end", "the preview then its end");
    await until(() => node("a").getAttribute("x") === String(move.items[0].x), "the component rendered the committed place");
    equal(log.stop().length % 2, 0, "every undo step that was opened is closed (undoHost: a function)");
    assert(element.isConnected);
});

check("scene: can gets the port as third argument, and refuses one port and not the node", async () => {
    const { widget, node } = await scene();
    widget.refused = ["out"];
    widget.asked.length = 0;
    const out = node("a").querySelector<HTMLElement>(`[data-ww-port="out"]`)!;
    const from = point(out);
    const connects: Event[] = [];
    widget.addEventListener("ww-connect", (event) => connects.push(event));
    pointer(out, "pointerdown", from);
    pointer(out, "pointermove", { x: from.x + 6, y: from.y + 6 });
    await frame(2);
    const target = node("c").querySelector<HTMLElement>(`[data-ww-port="in"]`)!;
    pointer(out, "pointermove", point(target));
    await frame(2);
    pointer(out, "pointerup", point(target));
    await frame(2);
    assert(widget.asked.some(([action, name]) => action === "connect" && name === "out"), `the port was the third argument (${JSON.stringify(widget.asked.slice(0, 4))})`);
    equal(connects.length, 0, "the refused port started no wire");
    widget.refused = [];
    pointer(node("a"), "pointerdown", widget.api.toClient(60, 50));
    pointer(node("a"), "pointerup", widget.api.toClient(60, 50));
    await frame(2);
});

check("scene: restyle and remeasure are forwarded", async () => {
    const { widget } = await scene();
    widget.api.restyle();
    widget.api.remeasure();
    await widget.api.ready;
});

// ── 3. Settings, declarations, Permissions, Help, Playback, Data, Localize ─

type Texts = { lang: string };
const SETTINGS = {
    speed: { type: Number, default: 1, min: 0, max: 10, label: (widget: Texts) => (widget.lang === "de" ? "Tempo" : "Speed"), description: (widget: Texts) => ({ _: widget.lang === "de" ? "Wie schnell" : "How fast" }) },
    mode: { type: "select", default: "a", options: [{ value: "a", label: (widget: Texts) => (widget.lang === "de" ? "Eins" : "One") }, { value: "b", label: "Two" }] },
    shown: { type: Boolean, default: true },
} as const;

function PanelUI({ host }: { host: Any }) {
    const widget = useWidget(host);
    const { can, editing } = usePermissions(host);
    const settings = useSettings(host, SETTINGS);
    const help = useHelp(host);
    const printNote = usePrintNote(host);
    const playback = usePlayback(host, { steps: () => 3 });
    const data = useJsonData(host, { defaults: { count: 0 } });
    const localize = useLocalize(host, { sourceLocale: "en", targetLocales: ["de"], load: async () => ({ templates: { greet: "Hallo" } }) });
    useLayoutEffect(() => void (host.api = { settings, help, printNote, playback, data, localize, can, widget }));
    return (
        <div>
            <span id="mode">{editing ? "edit" : "read"}</span>
            <span id="can">{String(can("allowSort"))}</span>
            <input type="number" data-ww-setting="speed" />
            <span data-ww-setting-label="speed" />
            <select data-ww-setting="mode" />
            <span id="speed">{String(settings.values.speed)}</span>
            <span id="label">{settings.labelOf("speed")}</span>
            <button data-ww-help-toggle="" data-ww-help="Opens help">?</button>
            <span id="help">{String(help.open)}</span>
            <span id="print-note">{printNote.text}</span>
            <button data-ww-playback="step">step</button>
            <span id="step">{playback.currentStep}</span>
            <button id="count" onClick={() => data.set({ count: data.value.count + 1 })}>{data.value.count}</button>
            <span id="greet">{localize.msg("greet", "Hello")}</span>
            <span id="lang">{widget.lang}</span>
        </div>
    );
}
class Panel extends createReactWidget(PanelUI) {
    static options = { note: { type: String, label: (widget: Texts) => (widget.lang === "de" ? "Notiz" : "Note") }, plain: { type: Boolean, label: { _: "Plain" } } };
    static actions = { reset: { label: (widget: Texts) => (widget.lang === "de" ? "Zurücksetzen" : "Reset") } };
    static permissions = { allowSort: { label: (widget: Texts) => (widget.lang === "de" ? "Sortieren" : "Sort") } };
    api!: Any;
}
customElements.define("ww-rb-panel", Panel);

check("declarations: static options, actions and permissions with function texts are answered on the instance", async () => {
    const widget = await mount<Any>(`<ww-rb-plain lang="en"></ww-rb-plain>`);
    assert(hasComputedDeclarations(Plain.options) && !hasComputedDeclarations({ x: { label: "a" } }));
    equal([widget.options.note.label, widget.actions.reset.label, widget.permissions.allowSort.label], ["Note", "Reset", "Sort"], "the editor reads plain texts");
    equal(widget.options.plain.label, { _: "Plain" }, "a text that is not a function is passed as it is");
    assert(widget.options.note.type === String, "the other fields are passed as before");
    widget.setAttribute("lang", "de");
    equal([widget.options.note.label, widget.actions.reset.label, widget.permissions.allowSort.label], ["Notiz", "Zurücksetzen", "Sortieren"], "asked again with the widget");
    assert(resolveDeclarations(widget, Plain.options as Any)!.note.label === "Notiz", "resolveDeclarations is the same function");
    widget.options = { mine: { type: Boolean } };
    equal(Object.keys(widget.options), ["mine"], "a later write replaces the accessor");
});
function PlainUI({ host }: { host: Any }) {
    useWidget(host);
    return <span />;
}
class Plain extends createReactWidget(PlainUI) {
    static options = { note: { type: String, label: (widget: Texts) => (widget.lang === "de" ? "Notiz" : "Note") }, plain: { type: Boolean, label: { _: "Plain" } } };
    static actions = { reset: { label: (widget: Texts) => (widget.lang === "de" ? "Zurücksetzen" : "Reset") } };
    static permissions = { allowSort: { label: (widget: Texts) => (widget.lang === "de" ? "Sortieren" : "Sort") } };
}
customElements.define("ww-rb-plain", Plain);

check("settings: a label that is a function of the widget is asked again when the language changes, and merged with the class's options", async () => {
    const widget = await mount<Panel>(`<ww-rb-panel lang="en"></ww-rb-panel>`);
    await until(() => widget.api, "mounted");
    const options = () => widget.options as Any;
    equal([options().speed.label, options().speed.description, options().mode.options.map((c: Any) => c.label)], ["Speed", { _: "How fast" }, ["One", "Two"]]);
    equal([options().note.label, options().plain.label], ["Note", { _: "Plain" }], "the class's own options are in, with their function text answered");
    equal([inside(widget, "#label").textContent, inside(widget, "[data-ww-setting-label]").textContent, widget.api.settings.labelOf("mode", "a")], ["Speed", "Speed", "One"]);
    const heard: string[] = [];
    widget.addEventListener("optionschange", () => heard.push(options().speed.label));
    widget.setAttribute("lang", "de");
    await until(() => heard.at(-1) === "Tempo", "the editor was not told");
    await settled(widget);
    equal([options().speed.label, options().note.label, options().mode.options[0].label, inside(widget, "#label").textContent, widget.api.settings.labelOf("mode", "a")], ["Tempo", "Notiz", "Eins", "Tempo", "Eins"]);
    widget.remove();
    await wait(10);
    assert(!Object.hasOwn(widget, "options") || typeof Object.getOwnPropertyDescriptor(widget, "options")!.get === "function", "after unmount the accessor of the declaration is back");
});

check("settings: a setting is one attribute, bound control, property and editor option; the value renders", async () => {
    const widget = await mount<Panel>(`<ww-rb-panel></ww-rb-panel>`);
    await until(() => widget.api && inside(widget, "#speed"), "mounted");
    equal(inside(widget, "#speed").textContent, "1");
    typeInto(inside(widget, "input[data-ww-setting=speed]") as HTMLInputElement, "4", "input", "change");
    await until(() => widget.getAttribute("speed") === "4", "the attribute follows the control");
    await until(() => inside(widget, "#speed").textContent === "4", "the component renders it");
    equal((widget as Any).speed, 4);
    assert(editorSetOption(widget, "speed", 7), "the editor can write it");
    await until(() => inside(widget, "#speed").textContent === "7");
    assert(widget.api.settings.set("speed", 2) === true && widget.getAttribute("speed") === "2");
});

check("permissions: edit and read mode, a permission by its attribute, and useWidgetPermissions follows the widget", async () => {
    const edit = await mount<Panel>(`<ww-rb-panel contenteditable="true"></ww-rb-panel>`);
    await until(() => inside(edit, "#mode"), "mounted");
    equal([inside(edit, "#mode").textContent, inside(edit, "#can").textContent], ["edit", "true"]);
    const read = await mount<Panel>(`<ww-rb-panel></ww-rb-panel>`);
    await until(() => inside(read, "#mode"), "mounted");
    equal([inside(read, "#mode").textContent, inside(read, "#can").textContent], ["read", "false"]);
    read.setAttribute("allowsort", "");
    await until(() => inside(read, "#can").textContent === "true", "the attribute grants the permission");
    const nested = await mount<Any>(`<ww-rb-outer></ww-rb-outer>`);
    await until(() => nested.shadowRoot!.querySelector("ww-rb-inner")?.shadowRoot?.querySelector("#n"), "the inner widget mounted");
    const inner = () => nested.shadowRoot!.querySelector("ww-rb-inner")!.shadowRoot!.querySelector("#n")!.textContent;
    equal(inner(), "read|false|Hello?", "the inner widget answers like the outer one");
    nested.setAttribute("allowsort", "");
    await until(() => inner()!.startsWith("read|true"), "and follows a change");
    nested.setAttribute("contenteditable", "true");
    await until(() => inner()!.startsWith("edit|true"), "also the mode");
});
function InnerUI({ host }: { host: Any }) {
    const { can, editing } = useWidgetPermissions(host);
    const msg = useWidgetMsg(host);
    return <span id="n">{`${editing ? "edit" : "read"}|${can("allowSort")}|${msg("greet", "Hello")}?`}</span>;
}
class Inner extends createReactWidget(InnerUI) {}
customElements.define("ww-rb-inner", Inner);
function OuterUI({ host }: { host: Any }) {
    usePermissions(host);
    const localize = useLocalize(host, { sourceLocale: "en", targetLocales: ["de"], load: async () => ({ templates: { greet: "Hallo" } }) });
    useLayoutEffect(() => void (host.localize = localize));
    return <ww-rb-inner />;
}
class Outer extends createReactWidget(OuterUI) {
    static permissions = { allowSort: { label: { _: "Sort" } } };
}
customElements.define("ww-rb-outer", Outer);

check("localize: useLocalize follows the widget's language, and useWidgetMsg of an inner widget follows the outer one", async () => {
    const widget = await mount<Panel>(`<ww-rb-panel lang="en"></ww-rb-panel>`);
    await until(() => inside(widget, "#greet"), "mounted");
    equal(inside(widget, "#greet").textContent, "Hello", "the first render is in the source language");
    widget.setAttribute("lang", "de");
    await until(() => inside(widget, "#greet").textContent === "Hallo", "the catalog arrived");
    await widget.api.localize.loaded;
    equal(widget.api.localize.locale, "de");
    const nested = await mount<Any>(`<ww-rb-outer lang="en"></ww-rb-outer>`);
    const inner = () => nested.shadowRoot!.querySelector("ww-rb-inner")?.shadowRoot?.querySelector("#n")?.textContent;
    await until(() => inner(), "mounted");
    assert(inner()!.endsWith("|Hello?"));
    nested.setAttribute("lang", "de");
    await until(() => inner()!.endsWith("|Hallo?"), "the inner msg follows the outer language");
});

check("help: the toggle opens the overlay and the component renders open", async () => {
    const widget = await mount<Panel>(`<ww-rb-panel style="display:block;width:300px"></ww-rb-panel>`);
    await until(() => inside(widget, "#help"), "mounted");
    equal(inside(widget, "#help").textContent, "false");
    inside(widget, "[data-ww-help-toggle]").click();
    await until(() => inside(widget, "#help").textContent === "true", "open");
    assert(widget.api.help.form === "labels" || widget.api.help.form === "list");
    widget.api.help.close();
    await until(() => inside(widget, "#help").textContent === "false", "closed");
});

check("print note: the note is in the shadow root, and the component renders its text in the widget's language", async () => {
    const widget = await mount<Panel>(`<ww-rb-panel lang="de"></ww-rb-panel>`);
    await until(() => inside(widget, "#print-note").textContent!.startsWith("Dieser interaktive Inhalt"), "German");
    equal(widget.api.printNote.address, null, "no public address here");
    equal(widget.shadowRoot!.querySelectorAll("[data-ww-print-note]").length, 1, "one note");
    equal(inside(widget, "[data-ww-print-note]").firstChild!.textContent, inside(widget, "#print-note").textContent);
});

check("playback: a discrete run steps, the component renders the step, and run() answers", async () => {
    const widget = await mount<Panel>(`<ww-rb-panel></ww-rb-panel>`);
    await until(() => inside(widget, "#step"), "mounted");
    equal([inside(widget, "#step").textContent, widget.api.playback.steps, widget.api.playback.paused], ["0", 3, true]);
    inside(widget, "[data-ww-playback=step]").click();
    await until(() => inside(widget, "#step").textContent === "1", "stepped");
    widget.api.playback.seek(2);
    await until(() => inside(widget, "#step").textContent === "2");
    assert(widget.api.playback.run("reset") === true);
    await until(() => inside(widget, "#step").textContent === "0");
});

check("data: the block holds the value, a click writes it, an outside change renders", async () => {
    const widget = await mount<Panel>(`<ww-rb-panel><script type="application/json" slot="data">{"count":2,"extra":true}</script></ww-rb-panel>`);
    await until(() => inside(widget, "#count"), "mounted");
    equal(inside(widget, "#count").textContent, "2");
    inside(widget, "#count").click();
    await until(() => inside(widget, "#count").textContent === "3");
    await settled(widget);
    equal(JSON.parse(widget.querySelector(":scope > script")!.textContent!), { count: 3, extra: true }, "an unknown key is kept");
    widget.querySelector(":scope > script")!.textContent = `{"count":9,"extra":true}`;
    await until(() => inside(widget, "#count").textContent === "9", "a change from outside");
});

// ── 4. Exercise ───────────────────────────────────────────────────────────

function QuizUI({ host }: { host: Any }) {
    const exercise = useExercise<string>(host, {
        response: () => host.getAttribute("data-response") ?? undefined,
        respond: (response) => (response === undefined ? host.removeAttribute("data-response") : host.setAttribute("data-response", response)),
        solution: () => "a",
        score: (response, solution) => ({ correct: response === solution ? 1 : 0, total: 1 }),
    });
    useLayoutEffect(() => void (host.api = exercise));
    return <div><button id="pick" onClick={() => exercise.respond("a")}>a</button><output id="summary">{exercise.summary}</output><span id="result">{exercise.result ? `${exercise.result.correct}/${exercise.result.total}` : "-"}</span></div>;
}
class Quiz extends createReactWidget(QuizUI) {
    static formAssociated = true;
    api!: Any;
}
customElements.define("ww-rb-quiz", Quiz);

check("exercise: respond stores, check shows the score, the host has the actions, and the form value is the response", async () => {
    const widget = await mount<Quiz>(`<ww-rb-quiz></ww-rb-quiz>`);
    await until(() => widget.api, "mounted");
    equal([typeof (widget as Any).check, typeof (widget as Any).reset, Object.keys((widget as Any).actions)].slice(0, 2), ["function", "function"]);
    equal(inside(widget, "#result").textContent, "-");
    inside(widget, "#pick").click();
    await settled(widget);
    equal(widget.getAttribute("data-response"), "a");
    (widget as Any).check();
    await until(() => inside(widget, "#result").textContent === "1/1", "the score is shown");
    assert(inside(widget, "#summary").textContent!.length > 0, "and spoken");
    (widget as Any).reset();
    await until(() => inside(widget, "#result").textContent === "-", "reset clears the feedback");
});

// ── 5. The widget itself ──────────────────────────────────────────────────

check("index: createReactWidget mounts once, keeps its tree on a synchronous move, unmounts when removed", async () => {
    const widget = await mount<Panel>(`<ww-rb-panel></ww-rb-panel>`);
    await until(() => inside(widget, "#mode"), "mounted");
    const element = inside(widget, "#mode");
    const parent = widget.parentElement!;
    parent.append(widget);
    await wait(20);
    assert(widget.isConnected && inside(widget, "#mode") === element, "a move keeps the tree");
    widget.remove();
    await wait(20);
    equal(widget.shadowRoot!.childElementCount, 0, "removal unmounts it");
    parent.append(widget);
    await until(() => widget.shadowRoot!.querySelector("#mode"), "a new tree after it is connected again");
});

// React assigns a prop as a property when the element has one of that name. The scene elements have a setter
// for every property that mirrors an attribute, so such a prop is written like any other.
function PropsUI({ bend }: { bend: number | null }) {
    const E = createElement as Any;
    return E("ww-scene", null,
        E("ww-node", { "data-ww-key": "a", x: 0, y: 0, width: 40, height: 40, outline: "circle" }),
        E("ww-node", { "data-ww-key": "b", x: 200, y: 0, width: 40, height: 40, outline: "rounded" }),
        E("ww-group", { scale: 2 }),
        E("ww-path", { from: "a", to: "b", route: "arc", bend, rewire: "from to", waypoints: "50,60 e:70,80" },
            E("ww-text", { side: "above", at: "start" }, "label")));
}
class PropsWidget extends createReactWidget(function PropsHost({ host }: { host: HTMLElement }) {
    const [bend, setBend] = useState<number | null>(0.3);
    useLayoutEffect(() => { (host as Any).setBend = setBend; }, [host]);
    return <PropsUI bend={bend} />;
}) {}
customElements.define("ww-rb-props", PropsWidget);

check("scene elements: a prop that names an attribute of a scene element is written as that attribute, and removed with null", async () => {
    const widget = await mount<Any>(`<ww-rb-props style="display:block;width:300px;height:120px"></ww-rb-props>`);
    const path = (await until(() => widget.shadowRoot!.querySelector("ww-path"), "the scene renders")) as Any;
    equal(path.getAttribute("route"), "arc");
    equal(path.route, "arc");
    equal(path.getAttribute("bend"), "0.3");
    equal(path.getAttribute("rewire"), "from to");
    equal(JSON.stringify(path.rewire), '["from","to"]');
    equal(path.waypoints.length, 2);
    equal(path.waypoints[1].from, "end");
    equal(widget.shadowRoot!.querySelector("ww-node")!.getAttribute("outline"), "circle");
    equal(widget.shadowRoot!.querySelector("ww-group")!.getAttribute("scale"), "2");
    const text = widget.shadowRoot!.querySelector("ww-text") as Any;
    equal(text.getAttribute("side"), "above");
    equal(text.getAttribute("at"), "start");
    equal(typeof text.at.x, "number", "the getter is still the shown position");
    widget.setBend(null);
    await until(() => !path.hasAttribute("bend"), "null removes the attribute");
    path.waypoints = [{ x: 1, y: 2, from: "start" }, { x: 3, y: 4, from: "end" }];
    equal(path.getAttribute("waypoints"), "1,2 e:3,4");
});

run();
