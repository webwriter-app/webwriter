import { addedListeners, assert, check, equal, frame, listeners, listenerTypes, mount, point, pointer, run, settled, transactionSteps, until, warnings } from "../../test/harness";
import { Scene, SceneShape, SceneSprites, sceneElements, type SceneBase, type SceneErrorDetail } from "@webwriter/widget/scene";
import { PixiScene } from "@webwriter/widget/scene/pixi";
import "./bench-pixi";
import type { Diagram } from "./diagram";
import "./diagram";
import { Swarm } from "./index";
import { RED_URL, BROKEN_URL } from "./bench";
import { report } from "./perf";
import { sharedChecks } from "./shared.checks";

type PixiObject = { children: PixiObject[]; text: string; visible: boolean; particleChildren: { x: number; y: number; rotation: number }[]; getLocalBounds(): { x: number; y: number; width: number; height: number } };
type View = { x: number; y: number; scale: number };

/** The same widget on the SVG renderer: what a browser without WebGL registers. */
class SvgSwarm extends Swarm {
    static scopedElements = { ...sceneElements, "ww-scene": Scene };
}
customElements.define("ww-swarm-svg", SvgSwarm);

// The scene elements in the page's own registry, for a scene without a widget and without a module core around it.
customElements.define("ww-scene", class extends PixiScene {});
customElements.define("ww-sprites", class extends SceneSprites {});
customElements.define("ww-shape", class extends SceneShape {});

const sceneOf = <S extends SceneBase = PixiScene>(widget: Element) => widget.shadowRoot!.querySelector("ww-scene") as unknown as S;
const item = (widget: Element, id: string) => widget.shadowRoot!.querySelector<HTMLElement>(`[data-ww-key="${id}"]`)!;
const isPixi = (scene: SceneBase): scene is PixiScene => "render" in scene;
const near = (a: number, b: number, tolerance = 1.5) => Math.abs(a - b) <= tolerance;

/** The colour the scene's canvas shows at a scene position, read right after a render. */
function pixel(scene: PixiScene, x: number, y: number, view: View = { x: 0, y: 0, scale: 1 }): number[] {
    const canvas = scene.shadowRoot!.querySelector("canvas")!;
    assert(scene.render(), "the scene has a context to draw with");
    const copy = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d")!;
    copy.drawImage(canvas, (x * view.scale + view.x) * devicePixelRatio, (y * view.scale + view.y) * devicePixelRatio, 1, 1, 0, 0, 1, 1);
    return [...copy.getImageData(0, 0, 1, 1).data];
}

/** A pointer drag between two client points, on `target`. */
async function sweep(target: Element, from: { x: number; y: number }, to: { x: number; y: number }, init: PointerEventInit = {}) {
    pointer(target, "pointerdown", from, init);
    pointer(target, "pointermove", { x: from.x + 6, y: from.y + 6 }, init);
    await frame();
    pointer(target, "pointermove", to, init);
    await frame();
    pointer(target, "pointerup", to, init);
    await frame();
}

/** What the browser hits at a scene position: a drawn SVG shape, the canvas, a proxy or a node. */
function hit(scene: SceneBase, x: number, y: number) {
    if (isPixi(scene)) scene.render(); // Pixi hit-tests with the transforms of its last frame
    const box = scene.getBoundingClientRect();
    const at = { x: box.left + scene.clientLeft + x, y: box.top + scene.clientTop + y };
    return { element: scene.shadowRoot!.elementFromPoint(at.x, at.y)!, at };
}

async function ready<W extends HTMLElement>(markup: string): Promise<W> {
    const widget = await mount<W>(markup);
    const scene = sceneOf<SceneBase>(widget);
    if (isPixi(scene)) await until(() => !scene.contextLost, "no WebGL context", 8000);
    await settled(widget);
    return widget;
}

// ── The swarm example: Pixi renderer ──────────────────────────────────────

check("pixi: a shape is drawn with its computed style, and a custom property change reaches it", async () => {
    const widget = await ready<Swarm>(`<ww-swarm count="0"></ww-swarm>`);
    const scene = sceneOf(widget);
    equal(pixel(scene, 300, 150), [232, 243, 234, 255], "fill: var(--habitat)");
    equal(pixel(scene, 300, 10), [91, 138, 104, 255], "stroke");
    equal(pixel(scene, 300, 3), [0, 0, 0, 0], "outside the shape the canvas is transparent");
    widget.style.setProperty("--habitat", "oklch(0.5 0.2 30)");
    await until(() => pixel(scene, 300, 150)[0] !== 232, "the new custom property did not reach the canvas");
    const [r, g, b] = pixel(scene, 300, 150);
    assert(r > 150 && g < 90 && b < 80, `oklch() is drawn as its sRGB colour, got ${[r, g, b]}`);
});

check("pixi: sprites are one batch from the array; count and positions follow it", async () => {
    const widget = await ready<Swarm>(`<ww-swarm count="300"></ww-swarm>`);
    const scene = sceneOf(widget);
    const batch = scene.rendering(widget.shadowRoot!.querySelector("ww-sprites") as never) as unknown as PixiObject;
    const positions = () => batch.particleChildren.map((particle) => [particle.x, particle.y]);
    equal(batch.particleChildren.length, 300);
    equal(positions(), widget.creatures.map((creature) => [creature.x, creature.y]));

    const before = positions();
    widget.step(); // changes the array in place and re-renders
    await widget.updateComplete;
    assert(positions().every(([x, y], i) => x !== before[i][0] || y !== before[i][1]), "every sprite moved");
    equal(positions(), widget.creatures.map((creature) => [creature.x, creature.y]), "to where the array says");

    widget.count = 1200;
    await widget.updateComplete;
    equal(batch.particleChildren.length, 1200, "the batch grows with the array");
    widget.count = 1;
    await widget.updateComplete;
    equal(batch.particleChildren.length, 1, "and shrinks");
    Object.assign(widget.creatures[0], { x: 100, y: 100, vx: 0, vy: 0, rotation: 0, scale: 2, tint: 0xff0000 });
    widget.requestUpdate();
    await widget.updateComplete;
    const [r, g, b] = pixel(scene, 100, 100);
    assert(r > 200 && g < 60 && b < 60, `the sprite is drawn at its position with its tint, got ${[r, g, b]}`);
});

check("pixi: a ww-node is HTML above the canvas at its scene position", async () => {
    const widget = await ready<Swarm>(`<ww-swarm count="10"></ww-swarm>`);
    const scene = sceneOf(widget);
    const label = widget.shadowRoot!.querySelector<HTMLElement>("ww-node")!;
    const { element, at } = hit(scene, 30, 28);
    assert(element === scene.shadowRoot!.querySelector("slot") || label.contains(element) || element === label, "the node is what the pointer hits");
    assert(widget.shadowRoot!.elementFromPoint(at.x, at.y) === label, "it lies above the canvas");
    const box = scene.getBoundingClientRect();
    equal([label.getBoundingClientRect().left - box.left, label.getBoundingClientRect().top - box.top], [20, 20]);
    assert(label.textContent!.includes("10 creatures"), "and is rendered by the widget's template");
});

check("pixi: pointer events on the canvas are dispatched on the scene element that was hit", async () => {
    const widget = await ready<Swarm>(`<ww-swarm count="5"></ww-swarm>`);
    const scene = sceneOf(widget);
    const habitat = widget.shadowRoot!.querySelector<HTMLElement>("ww-shape")!;
    const targets: unknown[] = [];
    widget.shadowRoot!.addEventListener("click", (event) => targets.push(event.target));
    const inside = hit(scene, 300, 150);
    equal(inside.element.localName, "canvas");
    inside.element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, clientX: inside.at.x, clientY: inside.at.y }));
    equal(targets.map((target) => target === habitat), [true], "the click arrives once, on ww-shape");
    await widget.updateComplete;
    equal(widget.count, 105, "and runs the handler the template put on ww-shape");
    widget.count = 0; // no sprite may cover the pixels read below
    await widget.updateComplete;

    const outside = hit(scene, 300, 4);
    outside.element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, clientX: outside.at.x, clientY: outside.at.y }));
    equal(targets.map((target) => target === scene), [false, true], "a click beside the shape is a click on the scene");
    equal(pixel(scene, 300, 8), [0, 0, 0, 0], "the 2px stroke does not reach this row");

    pointer(inside.element, "pointermove", inside.at);
    await frame();
    assert(habitat.matches(":state(hover)"), "hover is derived from the hit test");
    await until(() => pixel(scene, 300, 8)[0] === 91, "the hover style (a 4px stroke) is not drawn");
    pointer(outside.element, "pointermove", outside.at);
    await frame();
    assert(!habitat.matches(":state(hover)"), "and ends when the pointer leaves the shape");
});

check("undo: Run, Pause and the click that adds creatures are one undo step each, and the step holds the attribute", async () => {
    const widget = await ready<Swarm>(`<ww-swarm count="5"></ww-swarm>`);
    const run = widget.shadowRoot!.querySelector<HTMLButtonElement>("#run")!;
    const steps = transactionSteps(widget, () => `${widget.getAttribute("count")} ${widget.hasAttribute("running")}`);
    run.click();
    await until(() => widget.hasAttribute("running"), "Run did not reach the attribute");
    await settled(widget);
    equal(run.textContent, "Pause");
    run.click();
    await until(() => !widget.hasAttribute("running"), "Pause did not reach the attribute");
    await settled(widget);
    const inside = hit(sceneOf(widget), 300, 150);
    inside.element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, clientX: inside.at.x, clientY: inside.at.y }));
    await until(() => widget.getAttribute("count") === "105", "the click on the habitat did not reach the attribute");
    await settled(widget);
    // Each step starts before Lit wrote the attribute and ends after it: the editor undoes the write as one step.
    equal(steps.stop(), ["start 5 false", "end 5 true", "start 5 true", "end 5 false", "start 5 false", "end 105 false"]);
});

check("pixi: the WebGL context is released while the widget is hidden and restored when it returns", async () => {
    const widget = await ready<Swarm>(`<ww-swarm count="1"></ww-swarm>`);
    const scene = sceneOf(widget);
    const canvas = scene.shadowRoot!.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2")!;
    assert(gl && !gl.isContextLost(), "the scene draws with WebGL 2");
    Object.assign(widget.creatures[0], { x: 100, y: 100, vx: 1, vy: 0, rotation: 0, scale: 2, tint: 0xff0000 });
    widget.style.display = "none";
    await until(() => gl.isContextLost(), "the context was not released", 5000);
    assert(scene.contextLost && !scene.render(), "nothing is drawn meanwhile");
    widget.step();
    await widget.updateComplete; // the description keeps changing while hidden

    widget.style.display = "";
    await until(() => !gl.isContextLost(), "the context was not restored", 5000);
    await frame(2);
    assert(scene.shadowRoot!.querySelector("canvas") === canvas, "the same canvas");
    equal(pixel(scene, 300, 150).slice(0, 3), [232, 243, 234], "the shape is drawn again");
    const [r, g, b] = pixel(scene, 101, 100);
    assert(r > 200 && g < 60 && b < 60, `and so is the sprite, with its texture, where the step taken while hidden put it; got ${[r, g, b]}`);
});

check("pixi: disconnecting destroys the renderer, the canvas and every listener", async () => {
    const before = listeners();
    const outside = listenerTypes();
    const widget = await ready<Swarm>(`<ww-swarm count="50" running></ww-swarm>`);
    const scene = sceneOf(widget);
    const canvas = scene.shadowRoot!.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2")!;
    // One per module that has text: the module text listens for the browser coming back online, to ask again for a catalog that could not be loaded.
    // Besides that, a scene follows two signals of the page for its whole life: printing (`beforeprint`, `afterprint`) and the editor's `ww-themechange`. They go with the scene, as the count below checks.
    const signals = new Set(["beforeprint", "afterprint", "ww-themechange"]);
    equal([...new Set(addedListeners(outside))].filter((type) => !signals.has(type)), ["online"], "the renderer listens on the canvas only, not on window or document");
    widget.remove();
    await frame(2);
    assert(gl.isContextLost(), "the context is given back");
    assert(!canvas.isConnected && !scene.shadowRoot!.querySelector("canvas"), "the canvas is gone");
    assert(!scene.render(), "nothing draws any more");
    equal(listeners(), before);
    const tick = widget.tick;
    await frame(3);
    equal(widget.tick, tick, "the widget's loop stopped as well");
});

// ── The swarm in a viewport ───────────────────────────────────────────────

check("pixi viewport: the view of the real Viewport is applied to the stage, the sprites and the HTML nodes", async () => {
    const widget = await ready<Swarm>(`<ww-swarm count="1" zoomable></ww-swarm>`);
    const scene = sceneOf(widget);
    equal([widget.view.x, widget.view.y, widget.view.scale], [0, 0, 1], "fit=none opens at 100 %");
    Object.assign(widget.creatures[0], { x: 100, y: 100, vx: 0, vy: 0, rotation: 0, scale: 2, tint: 0xff0000 });
    const corner = scene.getBoundingClientRect();
    widget.view.zoomTo(2, { x: corner.left, y: corner.top });
    await settled(widget);
    equal([widget.view.x, widget.view.y, widget.view.scale], [-20, -20, 2], "zoomed about the corner, the habitat's corner (10, 10 in the scene) meets the window's: panning is limited to the extent the scene reports");
    equal(pixel(scene, 10.5, 100, { x: -20, y: -20, scale: 2 }), [91, 138, 104, 255], "and its edge is drawn there");
    widget.view.panBy(-50, -30);
    await settled(widget);
    const view: View = { x: widget.view.x, y: widget.view.y, scale: widget.view.scale };
    equal(view, { x: -70, y: -50, scale: 2 });
    equal(pixel(scene, 300, 150, view), [232, 243, 234, 255], "the habitat is drawn through the view");
    const [r, g, b] = pixel(scene, 100, 100, view);
    assert(r > 200 && g < 60 && b < 60, `the sprite batch too, got ${[r, g, b]}`);
    const nest = item(widget, "nest1").getBoundingClientRect();
    equal([nest.left - corner.left, nest.top - corner.top], [140 * 2 - 70, 270 * 2 - 50], "a node above the canvas is where the view puts it");
    const at = { x: corner.left + 300 * 2 - 70, y: corner.top + 150 * 2 - 50 };
    const world = widget.view.toWorld(at.x, at.y);
    equal([scene.toScene(at.x, at.y), world], [{ x: 300, y: 150 }, { x: 300, y: 150 }], "toScene() goes through the view, like the viewport's toWorld()");

    // Hit testing: the habitat's edge is where it is drawn, not where it was.
    const habitat = widget.shadowRoot!.querySelector<HTMLElement>("ww-shape")!;
    const canvas = scene.shadowRoot!.querySelector("canvas")!;
    const clicks: number[] = [];
    habitat.addEventListener("click", (event) => clicks.push(Math.round(scene.toScene(event.clientX, event.clientY).x)));
    const clickAt = (x: number, y: number) => canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, clientX: corner.left + x * 2 - 70, clientY: corner.top + y * 2 - 50 }));
    scene.render();
    clickAt(340, 150); // 610 on screen, which was the habitat's right edge before the zoom
    clickAt(340, 180);
    clickAt(340, 318); // below the habitat, and outside the window
    equal(clicks, [340, 340], "a click is tested against the shapes where the view shows them");
});

check("pixi viewport: selecting and moving HTML nodes while zoomed, and fitting the habitat", async () => {
    const widget = await ready<Swarm>(`<ww-swarm count="0" zoomable fit="content"></ww-swarm>`);
    const scene = sceneOf(widget);
    await until(() => widget.view.scale !== 1, "the viewport did not fit the scene's extent");
    const scale = Math.floor(Math.min(620 / 600, 320 / 300) * 1000) / 1000;
    assert(near(widget.view.scale, scale, 0.002), `fit shows the habitat, which is what the scene reports as its extent, got ${widget.view.scale}`);
    const box = scene.getBoundingClientRect();
    const left = widget.view.x + 10 * widget.view.scale;
    assert(near(left, (620 - 600 * widget.view.scale) / 2, 0.5), "centred");

    widget.view.zoomTo(2, { x: box.left, y: box.bottom });
    await settled(widget);
    const nest1 = item(widget, "nest1");
    const nest2 = item(widget, "nest2");
    pointer(nest1, "pointerdown", point(nest1));
    pointer(nest1, "pointerup", point(nest1));
    await settled(widget);
    equal(widget.selection, ["nest1"], "a click selects an HTML node");
    pointer(nest2, "pointerdown", point(nest2), { ctrlKey: true });
    pointer(nest2, "pointerup", point(nest2), { ctrlKey: true });
    await settled(widget);
    equal(widget.selection, ["nest1", "nest2"], "Ctrl adds");
    const before = widget.nests.map((nest) => nest.x);
    const view = [widget.view.x, widget.view.y];
    await sweep(nest1, point(nest1), { x: point(nest1).x + 60, y: point(nest1).y - 40 });
    await settled(widget);
    equal(widget.nests.map((nest) => [nest.x, nest.y]), [[before[0] + 30, 250], [before[1] + 30, 250], [before[2], 270]], "60 by 40 on screen is 30 by 20 in the scene, for the whole selection");
    equal([widget.view.x, widget.view.y], view, "the drag of a node did not pan the view");
    const rect = nest1.getBoundingClientRect();
    assert(near(rect.left - box.left, (before[0] + 30) * 2 + widget.view.x, 0.5), "and the node is drawn where the model now puts it");
});

// ── Without WebGL ─────────────────────────────────────────────────────────

check("pixi: without WebGL the scene reports ww-sceneerror and the HTML nodes stay usable", async () => {
    const native = HTMLCanvasElement.prototype.getContext;
    // What a browser without WebGL does: it hands out no context.
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        return type.startsWith("webgl") ? null : (native as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof native;
    const logged = warnings();
    try {
        const errors: SceneErrorDetail[] = [];
        const listen = (event: Event) => errors.push((event as CustomEvent<SceneErrorDetail>).detail);
        document.addEventListener("ww-sceneerror", listen);
        const widget = await mount<Swarm>(`<ww-swarm count="20"></ww-swarm>`);
        const scene = sceneOf(widget);
        await until(() => errors.length > 0, "no error was reported");
        document.removeEventListener("ww-sceneerror", listen);
        await settled(widget);
        assert(errors.length === 1 && errors[0].code === "webgl" && errors[0].item === null, "one catchable event, on the scene");
        assert(/WebGL/.test(errors[0].message) && /SVG renderer/.test(errors[0].message), `it says what is missing and what to do, got "${errors[0].message}"`);
        assert(scene.matches(":state(failed)") && scene.contextLost && !scene.render(), "the scene is marked and draws nothing");
        assert(widget.shadowRoot!.querySelector(".notice")!.textContent!.includes("cannot draw"), "the widget tells the reader");
        equal(logged.stop(), [], "the widget handled the event, so nothing is logged");

        const nest = item(widget, "nest2");
        const box = scene.getBoundingClientRect();
        equal([nest.getBoundingClientRect().left - box.left, nest.getBoundingClientRect().top - box.top], [290, 270], "the nodes are laid out as ever");
        await sweep(nest, point(nest), { x: point(nest).x + 40, y: point(nest).y - 30 });
        await settled(widget);
        equal([widget.selection, widget.nests[1]], [["nest2"], { id: "nest2", x: 330, y: 240 }] as never, "and can be selected and moved");
        widget.remove();
        await frame(2);
    } finally {
        HTMLCanvasElement.prototype.getContext = native;
        logged.stop();
    }
});

check("fallback: the same template on the SVG renderer draws all but the sprites", async () => {
    const errors: SceneErrorDetail[] = [];
    const listen = (event: Event) => errors.push((event as CustomEvent<SceneErrorDetail>).detail);
    document.addEventListener("ww-sceneerror", listen);
    const widget = await ready<Swarm>(`<ww-swarm-svg count="20" zoomable></ww-swarm-svg>`);
    document.removeEventListener("ww-sceneerror", listen);
    const scene = sceneOf<SceneBase>(widget);
    equal(scene.constructor.name, "Scene");
    equal(errors.map((error) => [error.code, error.item?.localName]), [["unsupported", "ww-sprites"]], "the sprite batch is refused with an event, which this widget expects");
    assert(!widget.shadowRoot!.querySelector(".notice"), "and shows nothing for");
    const rect = scene.rendering(widget.shadowRoot!.querySelector("ww-shape") as never) as SVGRectElement;
    equal([rect.localName, rect.style.fill, rect.getAttribute("width")], ["rect", "rgb(232, 243, 234)", "600"], "the habitat is drawn, with its CSS");
    const nest = item(widget, "nest1");
    pointer(nest, "pointerdown", point(nest));
    pointer(nest, "pointerup", point(nest));
    await settled(widget);
    equal(widget.selection, ["nest1"], "the nodes work as on Pixi");
    const corner = scene.getBoundingClientRect();
    widget.view.zoomTo(2, { x: corner.left, y: corner.top });
    await settled(widget);
    equal(Math.round(rect.getBoundingClientRect().width), 1200, "and so does the viewport: the SVG drawing follows its view");
});

// ── A scene on its own ────────────────────────────────────────────────────

check("pixi: sprites with a texture by URL, in a scene without a widget around it", async () => {
    const errors: SceneErrorDetail[] = [];
    const scene = await mount<PixiScene>(`<ww-scene style="width: 200px; height: 100px"><ww-shape kind="rect" width="200" height="100" style="fill: rgb(0, 0, 60)"></ww-shape><ww-sprites></ww-sprites></ww-scene>`);
    scene.addEventListener("ww-sceneerror", (event) => (errors.push((event as CustomEvent<SceneErrorDetail>).detail), event.preventDefault()));
    await until(() => !scene.contextLost, "no WebGL context", 8000);
    const sprites = scene.querySelector("ww-sprites") as SceneSprites;
    const batch = scene.rendering(sprites) as unknown as PixiObject;
    sprites.items = [{ x: 50, y: 50, scale: 2 }];
    await frame();
    equal(pixel(scene, 50, 50).slice(0, 3), [255, 255, 255], "without a texture a sprite is a white square");
    sprites.texture = RED_URL;
    await Promise.resolve();
    assert(!batch.visible, "a batch is not shown while its texture loads");
    equal(pixel(scene, 50, 50).slice(0, 3), [0, 0, 60], "so no white squares flash");
    await until(() => batch.visible, "the texture never arrived");
    equal(pixel(scene, 50, 50).slice(0, 3), [200, 0, 0], "then it is drawn with it");
    sprites.setAttribute("texture", BROKEN_URL);
    sprites.texture = null; // the attribute is the URL now
    await until(() => errors.length > 0, "a texture that cannot be loaded was not reported");
    assert(errors[0].code === "load" && errors[0].item === sprites && !batch.visible, "ww-sceneerror on the batch, and nothing broken is drawn");
});

// ── One template, two renderers ───────────────────────────────────────────

for (const tag of ["ww-diagram-svg", "ww-diagram-pixi"]) {
    const name = tag.endsWith("pixi") ? "pixi" : "svg";
    const diagram = () => ready<Diagram>(`<${tag}></${tag}>`);
    /** Bounds of a drawn item in the coordinates of its group, from either renderer. */
    const drawnBounds = (scene: SceneBase, id: string, widget: Element) => {
        const object = scene.rendering(item(widget, id) as never) as SVGGraphicsElement | PixiObject;
        return "getBBox" in object ? object.getBBox() : object.getLocalBounds();
    };

    check(`both (${name}): the same template is mirrored`, async () => {
        const widget = await diagram();
        const scene = sceneOf<SceneBase>(widget);
        equal(scene.constructor.name, name === "pixi" ? "PixiScene" : "Scene", "the renderer is the class registered as ww-scene");
        const count = (object: PixiObject): number => object.children.reduce((sum, child) => sum + 1 + count(child), 0);
        const root = scene.rendering(item(widget, "group") as never);
        equal(root instanceof SVGElement ? root.querySelectorAll("*").length : count(root as PixiObject), 1, "the group holds its one drawn child");
        const box = drawnBounds(scene, "plate", widget);
        equal([box.x, box.y, box.width, box.height], [10, 10, 240, 120], "a rect has its attributes' geometry");
        const circle = drawnBounds(scene, "dot", widget);
        assert(near(circle.x, 185) && near(circle.width, 30), "a circle is centred on x, y");
    });

    check(`both (${name}): nodes are HTML at their position, also inside a scaled group, and paths end at their ports`, async () => {
        const widget = await diagram();
        const scene = sceneOf<SceneBase>(widget);
        const origin = scene.getBoundingClientRect();
        const centre = (id: string, port: string) => {
            const at = point(item(widget, id).querySelector(`[data-ww-port="${port}"]`)!);
            return { x: at.x - origin.left, y: at.y - origin.top };
        };
        const b = item(widget, "b").getBoundingClientRect();
        equal([b.left - origin.left, b.top - origin.top], [320, 120], "group at 300,40 with scale 2, node at 10,40");
        const from = scene.portPosition("a:out")!;
        const to = scene.portPosition("b:in")!;
        assert(near(from.x, centre("a", "out").x) && near(from.y, centre("a", "out").y), "a:out is where the browser laid the port out");
        assert(near(to.x, centre("b", "in").x) && near(to.y, centre("b", "in").y), "b:in too, through the group's transform");
        const wire = drawnBounds(scene, "wire", widget);
        assert(near(wire.x, from.x, 2) && near(wire.x + wire.width, to.x, 2), `the wire spans the two ports, got ${JSON.stringify(wire)}`);
        assert(near(wire.y, Math.min(from.y, to.y), 2) && near(wire.height, Math.abs(from.y - to.y), 3));
    });

    check(`both (${name}): template order is drawing order, and events reach the scene element on top`, async () => {
        const widget = await diagram();
        const scene = sceneOf<SceneBase>(widget);
        const targets: (string | null)[] = [];
        widget.shadowRoot!.addEventListener("pointerdown", (event) => targets.push((event.target as Element).getAttribute("data-ww-key")));
        const press = () => {
            const { element, at } = hit(scene, 70, 60); // where the red and the blue circle overlap
            pointer(element, "pointerdown", at);
            pointer(element, "pointerup", at);
        };
        press();
        widget.order = ["blue", "red"];
        await settled(widget);
        press();
        equal(targets, ["blue", "red"], "the later element is drawn on top");
        const { element, at } = hit(scene, 150, 100);
        pointer(element, "pointerdown", at);
        equal(targets.at(-1), "plate", "beside the circles the plate is hit");
    });

    check(`both (${name}): selecting a drawn shape, and the selected style`, async () => {
        const widget = await diagram();
        const scene = sceneOf<SceneBase>(widget);
        const { element, at } = hit(scene, 200, 60);
        pointer(element, "pointerdown", at);
        pointer(element, "pointerup", at);
        await settled(widget);
        equal(widget.selection, ["dot"]);
        const proxy = scene.shadowRoot!.querySelector("[part=proxy]")!;
        assert(proxy.classList.contains("selected") && proxy.getAttribute("tabindex") === "0", "the module's proxy shows the selection and takes focus");
        if (isPixi(scene)) equal(pixel(scene, 200, 60).slice(0, 3), [255, 128, 0], "ww-shape[selected] is drawn");
        else equal((scene.rendering(item(widget, "dot") as never) as SVGElement).style.fill, "rgb(255, 128, 0)");
        const empty = hit(scene, 400, 240);
        pointer(empty.element, "pointerdown", empty.at);
        pointer(empty.element, "pointerup", empty.at);
        await settled(widget);
        equal(widget.selection, [], "a click on the background clears");
    });

    check(`both (${name}): a scene zoomed from outside is hit at the same scene positions`, async () => {
        const widget = await diagram();
        const scene = sceneOf<SceneBase>(widget);
        scene.style.zoom = "2";
        await frame(2);
        const box = scene.getBoundingClientRect();
        const at = { x: box.left + 2 * 200, y: box.top + 2 * 60 }; // the dot, at 200, 60 in the scene
        equal(scene.toScene(at.x, at.y), { x: 200, y: 60 });
        if (isPixi(scene)) scene.render();
        const element = scene.shadowRoot!.elementFromPoint(at.x, at.y)!;
        pointer(element, "pointerdown", at);
        pointer(element, "pointerup", at);
        await settled(widget);
        equal(widget.selection, ["dot"]);
    });

    check(`both (${name}): text content and .points are mirrored`, async () => {
        const widget = await diagram();
        const scene = sceneOf<SceneBase>(widget);
        const text = () => {
            const object = scene.rendering(item(widget, "label") as never);
            return object instanceof SVGElement ? object.textContent : (object as PixiObject).text;
        };
        equal(text(), "first");
        widget.label = "second";
        await settled(widget);
        equal(text(), "second", "a change of the text content is seen without any attribute");
        const line = drawnBounds(scene, "line", widget);
        // Pixi's bounds include the stroke and end with the last dash.
        assert(near(line.x, 20, 2.5) && line.width > 185 && line.width < 205, `a path along .points, got ${JSON.stringify(line)}`);
        (item(widget, "line") as HTMLElement & { points: unknown }).points = [{ x: 20, y: 150 }, { x: 120, y: 150 }];
        await frame();
        const shorter = drawnBounds(scene, "line", widget).width;
        assert(shorter > 85 && shorter < 105, `setting .points redraws it, got ${shorter}`);
    });
}

check("pixi: dashes and modern colour notations are drawn, though Pixi knows neither", async () => {
    const widget = await ready<Diagram>(`<ww-diagram-pixi></ww-diagram-pixi>`);
    const scene = sceneOf(widget);
    equal(pixel(scene, 25, 150), [200, 0, 0, 255], "inside a dash of stroke-dasharray: 10px, 10px");
    equal(pixel(scene, 35, 150), [0, 0, 0, 0], "inside a gap");
    equal(pixel(scene, 45, 150), [200, 0, 0, 255], "the next dash");
    const probe = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d")!;
    probe.fillStyle = "oklch(0.9 0.05 150)";
    probe.fillRect(0, 0, 1, 1);
    equal(pixel(scene, 150, 100), [...probe.getImageData(0, 0, 1, 1).data], "fill: oklch(…) as the browser resolves it");
    const [r, g, b] = pixel(scene, 330, 55);
    assert(r > 200 && g < 60 && b < 60, `a polygon inside a scaled group, got ${[r, g, b]}`);
});

sharedChecks("ww-bench-pixi", "pixi");

// perf.html loads this bundle to measure instead of checking.
if ((globalThis as { SCENE_PERF?: boolean }).SCENE_PERF) void report();
else run();
