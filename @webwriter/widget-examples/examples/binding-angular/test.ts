// Checks of the Angular binding, @webwriter/angular, with real Angular components. The build has no Angular
// compiler plugin, so the components are plain classes that the JIT compiler (`@angular/compiler`) turns into
// components when the page runs: `component(Class, template)` applies the `Component` decorator by hand.
// Every widget is made with `createAngularWidget` and mounted in the page. The checks cover every module binding of the package
// and, for what the binding gained from the cores, the calls and options of Scene, Viewport, Drag, Settings,
// Shortcuts and the declarations with texts that are functions of the widget.
import "@angular/compiler";
import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, signal, type Type } from "@angular/core";
import { assert, check, drag, editorSetPermission, equal, frame, key, mount, mutations, point, pointer, run, typeInto, until, type Point } from "../../test/harness";
import { createAngularWidget, injectWidget, injectWidgetHost } from "@webwriter/angular";
import { injectActions } from "@webwriter/angular/base";
import { injectDrag } from "@webwriter/angular/drag";
import { injectHelp } from "@webwriter/angular/help";
import { injectJsonData } from "@webwriter/angular/data";
import { injectExercise, scoreOf } from "@webwriter/angular/exercise";
import { injectLocalize, injectWidgetMsg } from "@webwriter/angular/localize";
import { injectPermissions, injectWidgetPermissions } from "@webwriter/angular/permissions";
import { injectPlayback } from "@webwriter/angular/playback";
import { injectPrintNote } from "@webwriter/angular/print";
import { injectScene } from "@webwriter/angular/scene";
import { injectSettings } from "@webwriter/angular/settings";
import { injectShortcuts } from "@webwriter/angular/shortcuts";
import { injectViewport } from "@webwriter/angular/viewport";
import { sceneElements } from "@webwriter/widget/scene";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

for (const [name, element] of Object.entries(sceneElements)) if (!customElements.get(name)) customElements.define(name, element as CustomElementConstructor);

// ── Components without a compiler step ────────────────────────────────────

let counter = 0;

/** Makes a class an Angular component: what `@Component({...})` does, applied by hand. */
function component(Class: Type<unknown>, template: string, imports: Type<unknown>[] = []): Type<unknown> {
    Component({ selector: `ang-c${counter++}`, template, imports, schemas: [CUSTOM_ELEMENTS_SCHEMA] })(Class);
    return Class;
}

/** What the widget a component runs in keeps for the checks: the component itself. */
const expose = (instance: object) => void ((injectWidgetHost() as Any).probe = instance);

/** Registers a widget of a component and returns its tag. `extend` adds the static declarations the widget class has. */
async function define(Class: Type<unknown>, template: string, options: { styles?: string; extend?: (Base: Any) => Any; imports?: Type<unknown>[] } = {}): Promise<string> {
    component(Class, template, options.imports);
    const Base = await createAngularWidget(Class, { styles: options.styles });
    const Widget = options.extend ? options.extend(Base) : class extends Base {};
    const tag = `ww-ang-${counter++}`;
    customElements.define(tag, Widget);
    return tag;
}

async function show<W = Any>(tag: string, attributes = "", inner = ""): Promise<W & { probe: Any }> {
    const widget = await mount<Any>(`<${tag} ${attributes}>${inner}</${tag}>`);
    await until(() => widget.probe, "the component did not start");
    await frame(2);
    return widget;
}

const $ = <E extends Element = HTMLElement>(widget: Element, selector: string) => widget.shadowRoot!.querySelector<E>(selector)!;
const text = (widget: Element, selector: string) => $(widget, selector).textContent!.trim();
const near = (a: number, b: number, tolerance = 1.5) => Math.abs(a - b) <= tolerance;

// ── Widget, Permissions: the factory, read mode and edit mode ─────────────

class Plain {
    readonly widget = injectWidget();
    readonly permissions = injectPermissions();
    constructor() {
        expose(this);
    }
}
const plain = await define(
    Plain,
    `<p class="mode">{{ widget().editable ? "edit" : "read" }}</p>
     <p class="lang">{{ widget().lang }}</p>
     <p class="can">{{ permissions.can("allowReset") }}</p>
     <p class="editing">{{ permissions.editing() }}</p>`,
    {
        extend: (Base) =>
            class extends Base {
                static permissions = { allowReset: { type: Boolean, label: (widget: HTMLElement) => ({ _: `Reset ${widget.getAttribute("data-tag")}` }) } };
                // A text that is a function of the widget.
                static options = { caption: { type: String, label: (widget: HTMLElement) => ({ _: `Caption of ${widget.getAttribute("data-tag")}` }) } };
                static actions = { clear: { label: (widget: HTMLElement) => ({ _: `Clear ${widget.getAttribute("data-tag")}` }) } };
            },
    },
);

check("factory: the widget mounts the component in its shadow root and follows the mode and the language", async () => {
    const widget = await show(plain, `lang="de" data-tag="one"`);
    assert(widget.shadowRoot && widget.shadowRoot.contains($(widget, ".mode")), "rendered inside the shadow root");
    equal([text(widget, ".mode"), text(widget, ".lang")], ["read", "de"]);
    widget.setAttribute("contenteditable", "");
    await until(() => text(widget, ".mode") === "edit", "the mode did not reach the template");
    widget.setAttribute("lang", "fr");
    await until(() => text(widget, ".lang") === "fr", "the language did not reach the template");
});

check("permissions: a read-mode widget has the permission only when the author granted it; edit mode has all", async () => {
    const widget = await show(plain);
    equal([text(widget, ".can"), text(widget, ".editing")], ["false", "false"]);
    assert(editorSetPermission(widget, "allowReset", true), "the editor accepts the declared permission");
    await until(() => text(widget, ".can") === "true", "the grant did not reach the template");
    editorSetPermission(widget, "allowReset", false);
    await until(() => text(widget, ".can") === "false");
    widget.setAttribute("contenteditable", "");
    await until(() => text(widget, ".editing") === "true" && text(widget, ".can") === "true", "edit mode");
});

check("declarations: a text that is a function of the widget is answered on the instance, and the static map keeps the function", async () => {
    const widget = await show(plain, `data-tag="one"`);
    const Widget = widget.constructor as Any;
    assert(typeof Widget.options.caption.label === "function", "the static declaration is untouched");
    equal(widget.options.caption.label, { _: "Caption of one" });
    equal(widget.actions.clear.label, { _: "Clear one" });
    equal(widget.permissions.allowReset.label, { _: "Reset one" });
    widget.setAttribute("data-tag", "two");
    equal([widget.options.caption.label, widget.actions.clear.label], [{ _: "Caption of two" }, { _: "Clear two" }], "asked again at every read");
    widget.options = { own: { type: String } };
    equal(Object.keys(widget.options), ["own"], "a later write replaces the accessor");
});

// ── Settings ──────────────────────────────────────────────────────────────

class Gauge {
    readonly settings = injectSettings();
    readonly permissions = injectPermissions();
    resets = 0;
    constructor() {
        injectActions({ reset: () => void this.resets++ });
        expose(this);
    }
}
const gauge = await define(
    Gauge,
    `<label><span data-ww-setting-label="speed"></span><input class="speed-input" type="range" data-ww-setting="speed"></label>
     <output class="speed">{{ settings.value("speed") }}</output>
     <output class="label">{{ settings.labelOf("speed") }}</output>
     <output class="choice">{{ settings.labelOf("mode", "slow") }}</output>`,
    {
        extend: (Base) =>
            class extends Base {
                static settings = {
                    // A label that is a function of the widget, for a text from the widget's own catalog.
                    speed: { type: Number, default: 5, min: 1, max: 10, step: 1, label: (widget: HTMLElement) => ({ _: `Speed ${widget.getAttribute("data-tag")}` }), placeholder: (widget: HTMLElement) => ({ _: `p ${widget.getAttribute("data-tag")}` }) },
                    loud: { type: Boolean, default: true, label: { _: "Loud" } },
                    mode: {
                        type: "select",
                        default: "slow",
                        label: { _: "Mode" },
                        options: [
                            { value: "slow", label: (widget: HTMLElement) => ({ _: `Slow ${widget.getAttribute("data-tag")}` }) },
                            { value: "fast", label: { _: "Fast" } },
                        ],
                    },
                };
                static options = { caption: { type: String, label: (widget: HTMLElement) => ({ _: `Caption ${widget.getAttribute("data-tag")}` }) } };
                static actions = { reset: { label: (widget: HTMLElement) => ({ _: `Reset ${widget.getAttribute("data-tag")}` }) } };
            },
    },
);

check("settings: the host gets a property per setting that follows the attribute, and the template reads it", async () => {
    const widget = await show(gauge, `data-tag="one"`);
    equal([widget.speed, text(widget, ".speed")], [5, "5"], "the default");
    widget.setAttribute("speed", "8");
    await until(() => text(widget, ".speed") === "8", "an attribute reaches the template");
    equal(widget.speed, 8);
    widget.speed = 3;
    equal(widget.getAttribute("speed"), "3", "a property is reflected to the attribute");
    await until(() => text(widget, ".speed") === "3");
    widget.setAttribute("no-loud", "");
    equal(widget.loud, false, "a boolean that defaults to true is stored as its negative");
    equal(widget.probe.settings.set("speed", 99), true, "the core clamps what it can keep");
    equal(widget.probe.settings.set("speed", 4), true);
    await until(() => text(widget, ".speed") === "4");
});

check("settings: a control marked data-ww-setting is bound by the core", async () => {
    const widget = await show(gauge);
    const input = $<HTMLInputElement>(widget, ".speed-input");
    equal(input.value, "5");
    typeInto(input, "7", "input", "change");
    await until(() => widget.getAttribute("speed") === "7", "the entry reached the attribute");
    await until(() => text(widget, ".speed") === "7", "and the template");
});

check("settings: a label that is a function of the widget is read again when the widget changes", async () => {
    const widget = await show(gauge, `data-tag="one"`);
    const settings = widget.probe.settings;
    equal([settings.labelOf("speed"), settings.labelOf("mode", "slow"), settings.labelOf("mode", "fast")], ["Speed one", "Slow one", "Fast"]);
    equal([text(widget, ".label"), text(widget, ".choice")], ["Speed one", "Slow one"], "the template shows them");
    assert(/Speed one/.test(text(widget, "[data-ww-setting-label=speed]")), "so does the label of the control");
    widget.setAttribute("data-tag", "two");
    equal([settings.labelOf("speed"), settings.labelOf("mode", "slow")], ["Speed two", "Slow two"], "answered for the widget as it is now");
    equal(widget.options.speed.label._, "Speed two", "and the editor's declaration too");
    equal(widget.options.speed.placeholder._, "p two");
    equal(widget.options.mode.options[0].label._, "Slow two", "also the label of a choice");
});

check("settings: options of the editor hold the class's options with their texts answered, and the settings", async () => {
    const widget = await show(gauge, `data-tag="one"`);
    equal(Object.keys(widget.options).sort(), ["caption", "loud", "mode", "speed"]);
    equal(widget.options.caption.label, { _: "Caption one" }, "a static option, with its function asked");
    equal(widget.actions.reset.label, { _: "Reset one" }, "an action, though the component made the host's reset method");
    widget.reset();
    equal(widget.probe.resets, 1, "the action is a method of the host");
    widget.setAttribute("data-tag", "two");
    equal(widget.options.caption.label, { _: "Caption two" });
    // The component is gone: the settings leave the editor's options, the static option stays and stays computed.
    widget.remove();
    await frame(2);
    equal(Object.keys(widget.options), ["caption"], "no settings without the component");
    equal(widget.options.caption.label, { _: "Caption two" }, "the accessor of the class's declarations is back");
    equal("speed" in widget, false, "the property of a setting is gone with the component");
});

// ── Shortcuts ─────────────────────────────────────────────────────────────

class Keys {
    readonly shortcuts = injectShortcuts();
    calls: string[] = [];
    constructor() {
        injectActions({
            first: () => (this.calls.push("first"), false), // declines: nothing to do
            second: () => void this.calls.push("second"),
            third: () => (this.calls.push("third"), false),
        });
        expose(this);
    }
}
const keys = await define(Keys, `<button class="target">go</button><output class="keys">{{ shortcuts.labelsOf("second").join(",") }}</output><output class="running">{{ shortcuts.running().length }}</output>`, {
    extend: (Base) =>
        class extends Base {
            static actions = {
                first: { label: { _: "First" }, shortcut: "X" },
                second: { label: { _: "Second" }, shortcut: "X" },
                third: { label: { _: "Third" }, shortcut: "Q" },
            };
        },
});

check("shortcuts: an action that returns false declines the key, and the next action that has it runs", async () => {
    const widget = await show(keys);
    const target = $(widget, ".target");
    equal(widget.probe.shortcuts.keysOf("second"), ["X"]);
    assert(text(widget, ".keys").length > 0, "the labels are in the template");
    const notTaken = key("x", target);
    equal(widget.probe.calls, ["first", "second"], "the first declined, the second took it");
    equal(notTaken, false, "a taken key is prevented");
    widget.probe.calls.length = 0;
    equal(key("q", target), true, "an action that declines is the only one: the key goes to the page");
    equal(widget.probe.calls, ["third"]);
});

// ── Scene ─────────────────────────────────────────────────────────────────

type Place = { x: number; y: number };

class Board {
    readonly host = injectWidgetHost();
    readonly places = signal<Record<string, Place>>({ a: { x: 40, y: 40 }, b: { x: 240, y: 40 } });
    readonly wires = signal([{ id: "w1", from: "a:out", to: "b:in" }]);
    /** What the scene asked `can`, with the port as the third argument. */
    readonly asked: { action: string; port: string | undefined }[] = [];
    readonly scene = injectScene({
        can: (action, _item, port) => (this.asked.push({ action, port: (port as HTMLElement | undefined)?.dataset.wwPort }), true),
        // The step is opened on the first child of the shadow root, not on the widget: the option is passed on.
        undoHost: () => this.host.shadowRoot!.firstElementChild,
    });
    constructor() {
        expose(this);
    }
    onMove(event: CustomEvent) {
        const places = { ...this.places() };
        for (const { key, x, y } of event.detail.items) places[key] = { x, y };
        this.places.set(places);
    }
}
const board = await define(
    Board,
    `<ww-scene style="display: block; width: 400px; height: 240px; color: #333" select="multiple" (ww-move)="onMove($event)">
       <ww-node data-ww-key="a" [attr.x]="places()['a'].x" [attr.y]="places()['a'].y" width="100" height="60" selectable movable>a
         <span data-ww-port="out" data-ww-link="sig" style="position: absolute; right: -7px; top: 23px; width: 14px; height: 14px; background: #07f"></span></ww-node>
       <ww-node data-ww-key="b" [attr.x]="places()['b'].x" [attr.y]="places()['b'].y" width="100" height="60" selectable movable>b
         <span data-ww-port="in" data-ww-accept="sig" data-ww-capacity="1" style="position: absolute; left: -7px; top: 23px; width: 14px; height: 14px; background: #0a5"></span></ww-node>
       @for (wire of wires(); track wire.id) {
         <ww-path [attr.data-ww-key]="wire.id" [attr.from]="wire.from" [attr.to]="wire.to" selectable></ww-path>
       }
     </ww-scene>
     <output class="marquee">{{ scene.marquee() }}</output>`,
);

const sceneOf = (widget: Element) => $<Any>(widget, "ww-scene");
const node = (widget: Element, id: string) => $<HTMLElement>(widget, `[data-ww-key="${id}"]`);
const port = (widget: Element, id: string, name: string) => node(widget, id).querySelector<HTMLElement>(`[data-ww-port="${name}"]`)!;

async function laidOut(widget: Any) {
    await widget.probe.scene.ready;
    await frame(2);
    return widget;
}

check("scene: it mounts in the widget's shadow root, the snapshot is a signal and the first layout settles (`ready`)", async () => {
    const widget = await show(board);
    const scene = widget.probe.scene;
    equal([text(widget, ".marquee"), scene.marquee()], ["false", false]);
    let announced = 0;
    widget.addEventListener("ww-ready", () => announced++);
    await scene.ready;
    const extent = scene.extent();
    assert(extent && extent.width > 100 && extent.height > 50, `the extent is what the layout leaves (${JSON.stringify(extent)})`);
    assert(scene.ready instanceof Promise && scene.core.ready === scene.ready, "the promise is the core's");
    assert(sceneOf(widget).querySelectorAll("ww-node").length === 2);
});

check("scene: toScene and toClient convert through the view, and each is the inverse of the other", async () => {
    const widget = await laidOut(await show(board));
    const scene = widget.probe.scene;
    const box = sceneOf(widget).getBoundingClientRect();
    const origin = scene.toClient(0, 0);
    assert(near(origin.x, box.left + sceneOf(widget).clientLeft, 0.5) && near(origin.y, box.top + sceneOf(widget).clientTop, 0.5), "scene (0, 0) is the corner inside the border");
    const client = scene.toClient(10, 20);
    const back = scene.toScene(client.x, client.y);
    assert(near(back.x, 10, 0.01) && near(back.y, 20, 0.01), "toScene is its inverse");
    assert(near(client.x - origin.x, 10, 0.01) && near(client.y - origin.y, 20, 0.01));
});

check("scene: itemAt and itemsAt answer for a scene point and for a client point", async () => {
    const widget = await laidOut(await show(board));
    const scene = widget.probe.scene;
    equal(scene.itemAt({ x: 60, y: 60 }) === node(widget, "a"), true, "a node");
    equal(scene.itemAt({ x: 5, y: 5 }), null, "the background");
    const a = node(widget, "a");
    equal(scene.itemAt(point(a, 0.3, 0.5), { client: true }) === a, true, "a client point");
    equal(scene.itemsAt({ x: 60, y: 60 })[0] === a, true, "the topmost first");
    equal(scene.itemsAt({ x: 5, y: 5 }).length, 0);
    const wire = node(widget, "w1");
    const start = scene.toScene(point(port(widget, "a", "out")).x, point(port(widget, "a", "out")).y);
    assert(scene.itemsAt({ x: 170, y: start.y }).some((item: Element) => item === wire) || scene.itemAt({ x: 170, y: start.y }) === wire, "a path between the nodes, in its band");
});

check("scene: endsOf names the ports a path ends in, and wiresAt the paths of a port", async () => {
    const widget = await laidOut(await show(board));
    const scene = widget.probe.scene;
    const wire = node(widget, "w1") as Any;
    const ends = scene.endsOf(wire);
    equal([ends.from?.reference, ends.from?.port, ends.from?.element === port(widget, "a", "out"), ends.to?.node === node(widget, "b"), ends.to?.element === port(widget, "b", "in")], ["a:out", "out", true, true, true]);
    equal([scene.wiresAt("b:in").length, scene.wiresAt("a:out").length, scene.wiresAt("a:none").length], [1, 1, 0]);
    equal(scene.wiresAt("b:in")[0] === wire, true);
});

check("scene: measureText gives the size of a text from a font, without drawing it", async () => {
    const widget = await laidOut(await show(board));
    const scene = widget.probe.scene;
    const one = scene.measureText("Middle", node(widget, "a"));
    assert(one.width > 5 && one.height > 5, `an element's font (${JSON.stringify(one)})`);
    const lines = scene.measureText("one\ntwo", node(widget, "a"));
    assert(lines.height > one.height * 1.5, "a line break makes a second line");
    const small = scene.measureText("Middle", { fontSize: 12 });
    const wide = scene.measureText("Middle", { fontSize: 28 });
    assert(wide.width > small.width * 1.5, "from font entries");
    assert(scene.measureText("Middle").width > 0, "and from the scene's own font");
});

check("scene: a move with real pointer events shows ww-moving, commits ww-move, and the template renders the new place", async () => {
    const widget = await laidOut(await show(board));
    const a = node(widget, "a");
    const origins: { type: string; origin: EventTarget }[] = [];
    const log = (type: string) => widget.addEventListener(type, (event: Event) => origins.push({ type, origin: event.composedPath()[0] }));
    const seen: CustomEvent[] = [];
    for (const type of ["ww-moving", "ww-move"]) widget.addEventListener(type, (event: Event) => seen.push(event as CustomEvent));
    const abort = new AbortController();
    for (const type of ["ww-transactionstart", "ww-transactionend"]) document.addEventListener(type, (event) => origins.push({ type, origin: event.composedPath()[0] }), { capture: true, signal: abort.signal });
    void log;
    const start = point(a, 0.3, 0.5);
    const target: Point = { x: start.x + 60, y: start.y + 40 };
    pointer(a, "pointerdown", start);
    pointer(a, "pointermove", { x: start.x + 6, y: start.y + 6 });
    await frame(2);
    pointer(a, "pointermove", target);
    await frame(2);
    const moving = seen.filter((event) => event.type === "ww-moving");
    assert(moving.length > 0, "the scene reports every step");
    const now = moving.at(-1)!.detail;
    equal([now.state, now.committed, now.items.map(({ key, x, y }: Any) => ({ key, x, y }))], ["move", false, [{ key: "a", x: 100, y: 80 }]]);
    assert(now.pointer && near(now.pointer.clientX, target.x), "the pointer is in client coordinates");
    equal(widget.probe.places().a, { x: 40, y: 40 }, "nothing is committed yet");
    pointer(a, "pointerup", target);
    await until(() => widget.probe.places().a.x === 100, "the commit did not arrive");
    abort.abort();
    const move = seen.find((event) => event.type === "ww-move")!.detail;
    assert(move.pointer && near(move.pointer.clientX, target.x), "the commit carries the pointer too");
    equal(widget.probe.places().a, { x: 100, y: 80 });
    await until(() => a.getAttribute("x") === "100", "the component rendered the new place");
    const undo = origins.filter((one) => one.type.startsWith("ww-transaction"));
    equal(undo.map((one) => one.type), ["ww-transactionstart", "ww-transactionend"], "one undo step");
    assert(undo.every((one) => one.origin === widget.shadowRoot!.firstElementChild), "opened on the element `undoHost` names");
});

check("scene: `can` is asked with the port when a connection starts at one", async () => {
    const widget = await laidOut(await show(board));
    const out = port(widget, "a", "out");
    const start = point(out);
    pointer(out, "pointerdown", start);
    pointer(out, "pointermove", { x: start.x + 30, y: start.y + 30 });
    await frame(2);
    key("Escape", window);
    pointer(out, "pointerup", { x: start.x + 30, y: start.y + 30 });
    await frame(2);
    const connect = widget.probe.asked.filter((one: Any) => one.action === "connect");
    assert(connect.some((one: Any) => one.port === "out"), `asked about the port (${JSON.stringify(widget.probe.asked)})`);
    assert(widget.probe.asked.some((one: Any) => one.port === undefined), "and without a port for the other actions");
});

check("scene: restyle and remeasure do not fail, and the scene can be moved without Angular rendering twice", async () => {
    const widget = await laidOut(await show(board));
    widget.probe.scene.restyle();
    widget.probe.scene.remeasure();
    const records = mutations(widget.shadowRoot!);
    await frame(3);
    equal(records.stop().filter((record: MutationRecord) => record.type === "childList").length, 0, "nothing is rebuilt");
});

// ── Viewport and Drag ─────────────────────────────────────────────────────

const BOARD = { x: 0, y: 0, width: 1200, height: 800 };
type Chip = { id: string; x: number; y: number };

class World {
    readonly host = injectWidgetHost();
    maxScale = 4;
    readonly viewport = injectViewport({ bounds: () => BOARD, margin: 0, fit: () => ({ maxScale: this.maxScale }) });
    // The viewport converts the pointer's place into the world's.
    readonly drag = injectDrag({ viewport: this.viewport.core });
    readonly chips = signal<Chip[]>([]);
    lastDrop: { x: number | null; y: number | null; key: string | undefined } | null = null;
    readonly transform = computed(() => `translate(${this.viewport.x()}px, ${this.viewport.y()}px) scale(${this.viewport.scale()})`);
    constructor() {
        expose(this);
    }
    drop(event: CustomEvent) {
        const { x, y, key } = event.detail;
        this.lastDrop = { x, y, key };
        if (x === null || y === null) return;
        this.chips.set([...this.chips(), { id: `c${this.chips().length}`, x, y }]);
    }
}
const world = await define(
    World,
    `<div class="root"><div class="side"><div class="chip" data-ww-drag="chip" data-ww-drag-effect="copy" data-ww-key="and" tabindex="0">AND</div></div>
     <div class="board" data-ww-viewport="canvas" data-ww-viewport-zoom="0.25 4" data-ww-drop="chip" data-ww-drop-position="point" data-ww-drop-space="world" (ww-dragcommit)="drop($event)">
       <div class="world" [style.transform]="transform()">
         @for (chip of chips(); track chip.id) { <div class="placed" [style.left.px]="chip.x" [style.top.px]="chip.y"></div> }
       </div>
     </div></div>
     <output class="scale">{{ viewport.scale().toFixed(2) }}</output>`,
    {
        styles: `
            :host { display: block; }
            .root { display: flex; width: 640px; height: 260px; }
            .side { width: 120px; padding: 6px; box-sizing: border-box; border: 1px solid #c8c8c8; }
            .chip { width: 60px; padding: 4px; border: 1px solid #555; background: #fff; touch-action: none; }
            .board { position: relative; flex: 1; min-width: 0; overflow: hidden; border: 1px solid #c8c8c8; background: #f4f4f5; }
            .world { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
            .placed { position: absolute; width: 60px; height: 30px; border: 1px solid #555; background: #bfdbfe; }`,
    },
);

async function worldView() {
    const widget = await show(world);
    const vp = widget.probe.viewport;
    await until(() => vp.width() > 0, "the viewport never opened");
    await frame(2);
    const win = $(widget, ".board");
    const centre = () => {
        const rect = win.getBoundingClientRect();
        return vp.toWorld(rect.left + win.clientLeft + win.clientWidth / 2, rect.top + win.clientTop + win.clientHeight / 2);
    };
    return { widget, vp, win, centre, chip: $(widget, ".chip") };
}

check("viewport: it mounts, and each member is a signal of its own value", async () => {
    const { widget, vp } = await worldView();
    equal([typeof vp.x(), typeof vp.y(), typeof vp.scale(), vp.min(), vp.max()], ["number", "number", "number", 0.25, 4]);
    assert(vp.width() > 300 && vp.height() > 150, "the size of the window");
    equal(text(widget, ".scale"), vp.scale().toFixed(2), "the template shows the scale");
});

check("viewport: centerOn puts a world point in the centre and sets the scale; setView sets the view itself", async () => {
    const { vp, centre, widget } = await worldView();
    await vp.centerOn({ x: 700, y: 500 }, 2);
    equal(vp.scale(), 2);
    let c = centre();
    assert(near(c.x, 700, 0.5) && near(c.y, 500, 0.5), `the point is in the centre (${JSON.stringify(c)})`);
    await until(() => text(widget, ".scale") === "2.00", "the template followed");
    await vp.centerOn({ x: 100, y: 50 }, 100);
    equal(vp.scale(), 4, "clamped to the zoom limit");
    await vp.setView({ x: -100, y: -50, scale: 2 });
    equal([vp.x(), vp.y(), vp.scale()], [-100, -50, 2]);
    await vp.setView({ scale: 1 });
    equal(vp.scale(), 1);
    c = centre();
    equal(await vp.centerOn({ x: 300, y: 200 }, 1, { animate: false }), undefined, "a motion option is accepted");
});

check("viewport: fit takes options of a call, resolves with the view, and fitted() resolves when the view is a fitted one", async () => {
    const { vp, widget } = await worldView();
    const fits: Any[] = [];
    widget.addEventListener("ww-viewportfit", (event: Event) => fits.push((event as CustomEvent).detail));
    const whole = await vp.fit();
    assert(whole.scale > 0.25 && whole.scale < 0.4, `the bounds are fitted (${whole.scale})`);
    equal(vp.scale(), whole.scale);
    const part = await vp.fit({ box: { x: 0, y: 0, width: 100, height: 60 } });
    assert(part.scale > whole.scale * 2, "a box of the call is fitted instead");
    equal(fits.at(-1).reason, "request", "ww-viewportfit says what was fitted");
    const back = await vp.fit({ follow: "none" });
    equal(back.scale, whole.scale, "fit() with a call that has no box fits the content again");
    await vp.fit();
    const now = await vp.fitted();
    equal(now.scale, vp.scale(), "fitted() at once, as the view is fitted");
    vp.zoomTo(1);
    const later = vp.fitted().then((snapshot: Any) => snapshot.scale);
    await vp.fit();
    equal(await later, whole.scale, "a view that something else changed is not a fitted one: fitted() waits for the next fit");
});

check("viewport: the option `fit` is asked at every fit, and the wheel, start and resize options reach the core", async () => {
    const { vp, widget } = await worldView();
    widget.probe.maxScale = 0.28;
    equal((await vp.fit()).scale, 0.28, "the largest scale of a fit");
    widget.probe.maxScale = 4;
    assert((await vp.fit()).scale > 0.28);

    class Options {
        readonly viewport = injectViewport({ bounds: () => BOARD, wheel: "zoom", start: { centre: { x: 600, y: 400 }, scale: 1 }, resize: "centre" });
        constructor() {
            expose(this);
        }
    }
    const tag = await define(Options, `<div class="win" data-ww-viewport="canvas" style="width: 400px; height: 200px"></div>`, { styles: ":host { display: block }" });
    const other = await show(tag);
    const view = other.probe.viewport;
    await until(() => view.width() > 0, "the second viewport never opened");
    await frame(2);
    const win = $(other, ".win");
    const rect = win.getBoundingClientRect();
    const middle = { x: rect.left + win.clientLeft + win.clientWidth / 2, y: rect.top + win.clientTop + win.clientHeight / 2 };
    const at = view.toWorld(middle.x, middle.y);
    assert(near(at.x, 600, 0.5) && near(at.y, 400, 0.5), `start: the world point is in the centre (${JSON.stringify(at)})`);
    equal(view.scale(), 1);
    // `wheel: "zoom"`: the plain wheel zooms.
    const before = view.scale();
    win.dispatchEvent(new WheelEvent("wheel", { bubbles: true, composed: true, cancelable: true, clientX: middle.x, clientY: middle.y, deltaY: -100 }));
    await until(() => view.scale() > before, "the plain wheel did not zoom");
});

check("viewport: autoPan pans for a pointer at the edge, and autoPanWhile keeps panning until the gesture ends", async () => {
    const { vp, win } = await worldView();
    await vp.centerOn({ x: 600, y: 400 }, 1);
    const rect = win.getBoundingClientRect();
    const inside = (x: number, y: number) => ({ x: rect.left + win.clientLeft + x, y: rect.top + win.clientTop + y });
    const middle = inside(win.clientWidth / 2, win.clientHeight / 2);
    equal(vp.autoPan(middle.x, middle.y), false, "the middle does nothing");
    const x0 = vp.x();
    const edge = inside(2, win.clientHeight / 2);
    equal(vp.autoPan(edge.x, edge.y), true, "the left edge pans");
    assert(vp.x() > x0, "the content moved right");
    const ended = new AbortController();
    const held = vp.x();
    vp.autoPanWhile({ last: { clientX: edge.x, clientY: edge.y }, ended: ended.signal });
    await until(() => vp.x() > held + 20, "a pointer held still keeps panning");
    ended.abort();
    await frame(3);
    const stopped = vp.x();
    await frame(4);
    equal(vp.x(), stopped, "the loop ends with the gesture");
});

check("drag: a drop on a canvas viewport marked data-ww-drop-space=world reports the world point under the pan and zoom", async () => {
    const { widget, vp, win, chip, centre } = await worldView();
    await vp.centerOn({ x: 700, y: 500 }, 2);
    await frame(2);
    void centre;
    const at = point(win, 0.6, 0.4);
    const size = chip.getBoundingClientRect();
    let expected: Point | null = null;
    await drag(chip, at, { held: () => void (expected = vp.toWorld(at.x - size.width / 2, at.y - size.height / 2)) });
    const dropped = widget.probe.lastDrop;
    assert(dropped && dropped.x !== null && dropped.y !== null, "the commit reports a point");
    assert(near(dropped.x, expected!.x, 0.5) && near(dropped.y, expected!.y, 0.5), `the world point (${JSON.stringify(dropped)} for ${JSON.stringify(expected)})`);
    const rect = win.getBoundingClientRect();
    assert(Math.abs(dropped.x - (at.x - rect.left)) > 20, "which is not a position in the target's own pixels");
    equal(dropped.key, "and");
    await until(() => widget.probe.chips().length === 1, "the component placed the chip");
    equal(widget.probe.drag.item(), null, "nothing is held after the drop");
    equal(widget.probe.drag.via(), null);
});

// ── The modules that did not change: one behaviour each ───────────────────

class Helper {
    readonly help = injectHelp();
    constructor() {
        expose(this);
    }
}
const helper = await define(Helper, `<button data-ww-help-toggle>?</button><span data-ww-help="A tip">Control</span><output class="open">{{ help.open() }}</output>`);

check("help: the toggle opens and closes the overlay, and the signal follows", async () => {
    const widget = await show(helper);
    equal(text(widget, ".open"), "false");
    widget.probe.help.toggle(true);
    await until(() => text(widget, ".open") === "true", "open");
    assert(widget.probe.help.form() !== null, "the form of the overlay");
    widget.probe.help.close();
    await until(() => text(widget, ".open") === "false", "closed");
});

class Noted {
    readonly printNote = injectPrintNote({ address: "https://example.org/lesson" });
    constructor() {
        expose(this);
    }
}
const noted = await define(Noted, `<output class="text">{{ printNote.text() }}</output>`);

check("print note: the note is in the shadow root with the address, and `text` and `address` are signals", async () => {
    const widget = await show(noted);
    await until(() => text(widget, ".text").startsWith("This interactive content"), "the text");
    equal(widget.probe.printNote.address(), "https://example.org/lesson");
    equal(widget.shadowRoot!.querySelectorAll("[data-ww-print-note]").length, 1, "one note");
    assert(widget.shadowRoot!.querySelector("[data-ww-print-address]"), "with the address");
});

class Player {
    readonly shown = signal(-1);
    readonly playback = injectPlayback({ steps: () => 3, show: (index) => this.shown.set(index) });
    constructor() {
        expose(this);
    }
}
const player = await define(Player, `<output class="step">{{ playback.currentStep() }}/{{ playback.steps() }}</output><output class="paused">{{ playback.paused() }}</output>`);

check("playback: a discrete run steps, goes back, seeks and resets; the signals follow", async () => {
    const widget = await show(player);
    const playback = widget.probe.playback;
    equal([playback.steps(), playback.paused()], [3, true], "the signal holds the state after connecting");
    playback.step();
    await until(() => text(widget, ".step") === "1/3", "one step");
    playback.seek(2);
    equal([playback.currentStep(), widget.probe.shown()], [2, 2]);
    playback.back();
    equal(playback.currentStep(), 1);
    playback.reset();
    equal(playback.currentStep(), 0);
});

class Poll {
    readonly data = injectJsonData<{ vote: string | null }>({ defaults: { vote: null }, block: "document" });
    constructor() {
        expose(this);
    }
}
const poll = await define(Poll, `<output class="vote">{{ data.value().vote }}</output><output class="unsaved">{{ data.unsaved() }}</output>`);

check("data: the value is read from the block, a change is written to it, and the signal follows", async () => {
    const widget = await show(poll, "", `<script type="application/json">{"vote":"tea","kept":1}</script>`);
    equal(text(widget, ".vote"), "tea");
    widget.probe.data.set({ vote: "coffee" });
    equal(widget.probe.data.get().vote, "coffee", "at once");
    await until(() => text(widget, ".vote") === "coffee");
    widget.probe.data.flush();
    await until(() => !widget.probe.data.unsaved(), "written");
    equal(JSON.parse(widget.querySelector("script")!.textContent!), { vote: "coffee", kept: 1 }, "unknown keys are kept");
});

class Speaker {
    readonly localize = injectLocalize({
        sourceLocale: "en",
        targetLocales: ["en", "de"],
        load: async (locale) => ({ templates: locale === "de" ? { hello: "Hallo", count: "Zwei" } : {} }),
    });
    constructor() {
        expose(this);
    }
}
const speaker = await define(Speaker, `<span class="parent">{{ localize.msg("hello", "Hello") }}</span><span class="locale">{{ localize.locale() }}</span>`);

check("localize: the language of the widget selects the catalog, msg answers in it and falls back to the source text", async () => {
    const widget = await show(speaker, `lang="en"`);
    equal([text(widget, ".parent"), text(widget, ".locale")], ["Hello", "en"]);
    widget.setAttribute("lang", "de");
    await widget.probe.localize.loaded;
    await until(() => text(widget, ".parent") === "Hallo", "the catalog did not arrive");
    equal(widget.probe.localize.msg("missing", "Fallback"), "Fallback");
    equal(widget.probe.localize.getLocale(), "de");
});

// A child component of a widget that binds Localization: it asks the widget for the catalog.
class Parent {
    readonly permissions = injectPermissions();
    readonly localize = injectLocalize({ sourceLocale: "en", targetLocales: ["en", "de"], load: async (locale) => ({ templates: locale === "de" ? { hello: "Hallo" } : {} }) });
    constructor() {
        expose(this);
    }
}
class Inner {
    readonly msg = injectWidgetMsg();
    readonly permissions = injectWidgetPermissions();
}
Component({ selector: "ang-child", template: `<span class="child">{{ msg("hello", "Hello") }}</span><span class="childedit">{{ permissions.editing() }}</span>`, schemas: [CUSTOM_ELEMENTS_SCHEMA] })(Inner);
const parent = await define(Parent, `<ang-child></ang-child>`, { imports: [Inner] });

check("localize: a child component asks the widget for its catalog (injectWidgetMsg) and follows its language; injectWidgetPermissions answers for the widget", async () => {
    const widget = await show(parent, `lang="en"`);
    equal([text(widget, ".child"), text(widget, ".childedit")], ["Hello", "false"]);
    widget.setAttribute("lang", "de");
    await until(() => text(widget, ".child") === "Hallo", "the child did not follow the language");
    widget.setAttribute("contenteditable", "");
    await until(() => text(widget, ".childedit") === "true", "the child did not follow the mode");
});

class Quiz {
    readonly response = signal<string | undefined>(undefined);
    readonly exercise = injectExercise<string, string>({
        response: () => this.response(),
        respond: (response) => this.response.set(response),
        solution: () => "b",
        score: (response, solution) => scoreOf([response === solution]),
    });
    constructor() {
        expose(this);
    }
}
const quiz = await define(Quiz, `<output class="result">{{ exercise.result()?.correct ?? "-" }}</output><output class="locked">{{ exercise.locked() }}</output><output class="summary">{{ exercise.summary() }}</output>`, {
    extend: (Base) =>
        class extends Base {
            static actions = { share: { label: (widget: HTMLElement) => ({ _: `Share ${widget.getAttribute("data-tag")}` }) } };
        },
});

check("exercise: respond, check and reset run through the helper; the host has the actions, the class's own with their texts answered", async () => {
    const widget = await show(quiz, `data-tag="one"`);
    const exercise = widget.probe.exercise;
    equal(typeof widget.check, "function", "the host has check()");
    equal([Object.keys(widget.actions).sort(), widget.actions.share.label], [["check", "reset", "share"], { _: "Share one" }], "the static action keeps a computed text");
    equal(text(widget, ".result"), "-");
    exercise.respond("b");
    widget.check();
    await until(() => text(widget, ".result") === "1", "the score");
    assert(text(widget, ".summary").length > 0, "a summary");
    exercise.respond("a");
    widget.check();
    await until(() => text(widget, ".result") === "0");
    widget.reset();
    await until(() => text(widget, ".result") === "-", "reset");
    widget.setAttribute("submitted", "");
    await until(() => text(widget, ".locked") === "true", "a submitted widget is locked");
});

await run();
