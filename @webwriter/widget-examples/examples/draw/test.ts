// Checks of what Scene draws besides nodes, on the SVG renderer and on Pixi:
// paths between whole nodes (outlines, bends, loops, waypoints, orthogonal
// routes), markers, labels, shapes and text, the grid, and framed groups.
import { assert, check, equal, frame, key, mount, mutations, pointer, run, settled, until, type Point } from "../../test/harness";
import type { Drawing, SceneBase, SceneItem } from "@webwriter/widget/scene";
import { Draw, MARKER_KINDS, type Nested } from "./index";
import "./export.checks";

type PathDrawing = Extract<Drawing, { type: "path" }>;
type PixiLike = SceneBase & { render(): boolean; readonly contextLost: boolean };
type Name = "svg" | "pixi";
type PixiObject = {
    children: PixiObject[];
    text: string;
    position: Point;
    rotation: number;
    anchor: Point;
    style: { stroke?: { width: number } };
    width: number;
    height: number;
    getLocalBounds(): { x: number; y: number; width: number; height: number };
    texture: unknown;
    tileScale: Point;
    tilePosition: Point;
};

const isPixi = (scene: SceneBase): scene is PixiLike => "render" in scene;
const near = (a: number, b: number, tolerance = 1) => Math.abs(a - b) <= tolerance;
const nearPoint = (a: Point, b: Point, tolerance = 1) => near(a.x, b.x, tolerance) && near(a.y, b.y, tolerance);
const sceneOf = (widget: Element) => widget.shadowRoot!.querySelector("ww-scene") as unknown as SceneBase;
const item = (widget: Element, id: string) => widget.shadowRoot!.querySelector<HTMLElement>(`[data-ww-key="${id}"]`)!;
const drawing = (widget: Element, id: string) => sceneOf(widget).drawingOf(item(widget, id) as unknown as SceneItem)!;
const pathOf = (widget: Element, id: string) => drawing(widget, id) as PathDrawing;
/** What the renderer made for an item: an SVG element, or a Pixi object that the checks cast to what they look at. */
const rendering = (widget: Element, id: string) => sceneOf(widget).rendering(item(widget, id) as unknown as SceneItem) as SVGGraphicsElement;
const standIns = (widget: Element) => [...sceneOf(widget).shadowRoot!.querySelectorAll<SVGPathElement>("[part=proxy]")];
const selectionOf = (widget: Draw) => [...widget.selection].sort();
const handle = (widget: Element, id: string, name: string) => item(widget, id).shadowRoot!.querySelector<HTMLElement>(`[data-ww-handle="${name}"]`)!;
const last = <T>(list: T[]) => list[list.length - 1];

/** The client position of a scene position (no view applied). */
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

/** A pointer drag between two scene positions, starting on what is really there. */
async function sweep(scene: SceneBase, from: Point, to: Point, held?: () => unknown, init: PointerEventInit = {}) {
    const { element, at } = under(scene, from.x, from.y);
    const end = client(scene, to.x, to.y);
    pointer(element, "pointerdown", at, init);
    pointer(element, "pointermove", { x: at.x + 6, y: at.y + 6 }, init);
    await frame();
    pointer(element, "pointermove", end, init);
    await frame();
    await held?.();
    pointer(element, "pointerup", end, init);
    await frame(2);
}

/** The colour the canvas of a Pixi scene shows at a scene position, as [r, g, b, a]. */
function pixel(scene: PixiLike, x: number, y: number): number[] {
    const canvas = scene.shadowRoot!.querySelector("canvas")!;
    assert(scene.render(), "the scene has a context to draw with");
    const copy = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d")!;
    copy.drawImage(canvas, x * devicePixelRatio, y * devicePixelRatio, 1, 1, 0, 0, 1, 1);
    return [...copy.getImageData(0, 0, 1, 1).data];
}

/** The strongest alpha around a scene position: a mark of one pixel may fall between pixels. */
function ink(scene: PixiLike, x: number, y: number): number {
    return Math.max(...[-1, 0].flatMap((dx) => [-1, 0].map((dy) => pixel(scene, x + dx, y + dy)[3])));
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** A segment of a polyline crosses a box. */
function crosses(points: Point[], box: { x: number; y: number; width: number; height: number }): boolean {
    return points.slice(1).some((p, i) => {
        const q = points[i];
        return Math.max(p.x, q.x) > box.x && Math.min(p.x, q.x) < box.x + box.width && Math.max(p.y, q.y) > box.y && Math.min(p.y, q.y) < box.y + box.height;
    });
}

/** The points of a drawn path as numbers of its data, for the SVG renderer. */
const dataOf = (element: Element) => element.getAttribute("d")!.match(/-?[\d.]+/g)!.map(Number);

function drawChecks(name: Name) {
    const tag = `ww-draw-${name}`;
    const draw = async (attributes = "contenteditable"): Promise<Draw> => {
        const widget = await mount<Draw>(`<${tag} ${attributes}></${tag}>`);
        const scene = sceneOf(widget);
        if (isPixi(scene)) await until(() => !scene.contextLost, "no WebGL context", 8000);
        await settled(widget);
        await frame(2);
        return widget;
    };
    const both = (title: string, fn: () => unknown) => check(`draw (${name}): ${title}`, fn);

    // ── Paths between whole nodes ─────────────────────────────────────────

    both("outline: a path between nodes ends on the outline each node declares", async () => {
        const widget = await draw();
        // A rectangle and a rounded rectangle: a line between their sides.
        const ab = pathOf(widget, "ab");
        assert(nearPoint(ab.points[0], { x: 120, y: 70 }), "starts on the right side of the rectangle A");
        assert(nearPoint(ab.markers[0].polygon![0], { x: 260, y: 70 }), "its arrow ends on the left side of B");
        // A circle: B to C leaves B and meets C's circle (centre 510, 100; radius 30).
        const bc = pathOf(widget, "bc");
        assert(near(distance(bc.markers[1].polygon![0], { x: 510, y: 100 }), 30, 0.6), "the end is on the circle");
        // An ellipse: A to D is a step that leaves A and arrives at the middle of D's left side.
        const ad = pathOf(widget, "ad");
        assert(nearPoint(last(ad.points), { x: 260, y: 220 }, 0.6), "the step ends at the left of the ellipse D");
        // A node without an outline keeps its centre: H to C starts in the middle of H.
        const hc = pathOf(widget, "hc");
        assert(nearPoint(hc.points[0], { x: 510, y: 220 }), "a node without outline attaches at its centre");
        assert(near(distance(hc.markers[0].polygon![0], { x: 510, y: 100 }), 30, 0.6), "and ends on C's circle");
        // The same with the points between the ends on the outline: a ray from the centre of an ellipse.
        const dh = pathOf(widget, "dh");
        const [rx, ry, cx, cy] = [50, 30, 310, 220];
        const start = dh.points[0];
        assert(near(((start.x - cx) / rx) ** 2 + ((start.y - cy) / ry) ** 2, 1, 0.02), "the start is on the ellipse");
    });

    both("outline: a node says which outline: rounded rectangle, circle and ellipse, also for the selection", async () => {
        const widget = await draw();
        const radius = (id: string) => getComputedStyle(item(widget, id)).borderTopLeftRadius;
        equal(radius("b"), "12px", "a rounded node has its radius");
        equal(radius("c"), "50%", "a circle");
        equal(radius("d"), "50%", "an ellipse");
        equal(radius("h"), "0px", "a node without an outline is left as it is");
        // The selection outline of a node follows its border radius, so a round node gets a round outline.
        await click(sceneOf(widget), 510, 100);
        assert(item(widget, "c").hasAttribute("selected"), "the circle is selected");
        const outline = getComputedStyle(item(widget, "c"));
        equal(outline.outlineStyle, "solid");
        equal(outline.borderTopLeftRadius, "50%");
    });

    both("follow: a path between nodes follows a move preview, a keyboard move and a resize", async () => {
        const widget = await draw();
        const scene = sceneOf(widget);
        const before = pathOf(widget, "ab").points[0];
        // By pointer: the preview of the move is in the path while the pointer is down.
        let during: Point | null = null;
        await sweep(scene, { x: 80, y: 70 }, { x: 80, y: 130 }, () => {
            during = pathOf(widget, "ab").points[0];
        });
        assert(during !== null && (during as Point).y > before.y + 10, "the path followed the preview");
        assert(near(widget.places.a.y, 110), "the widget applied the move");
        assert(nearPoint(pathOf(widget, "ab").points[0], during!, 0.5), "and the path is where the preview had it");
        // By keyboard: every step moves the path, before anything is committed.
        const node = item(widget, "a");
        node.focus();
        const at = pathOf(widget, "ab").points[0].y;
        key("ArrowDown", node, { shiftKey: true });
        await frame(2);
        assert(pathOf(widget, "ab").points[0].y > at, "the path follows a step of the keyboard");
        key("Escape", node);
        await until(() => near(pathOf(widget, "ab").points[0].y, at, 0.5), "taken back");
        // A resize: the path ends on the new outline.
        await click(scene, 20, 110); // clears the selection
        await click(scene, 80, 130);
        assert(item(widget, "a").hasAttribute("selected"), "A is selected");
        assert(handle(widget, "a", "e") !== null, "its handles are there");
        let wide = 0;
        // The handle on the right edge, in the middle of it: A has moved down by 60.
        await sweep(scene, { x: 120, y: 130 }, { x: 170, y: 130 }, () => {
            wide = pathOf(widget, "ab").points[0].x;
        });
        assert(wide > 120 + 30, `the path ended on the outline of the larger node while it was resized: ${wide}`);
    });

    both("bend: two paths between the same nodes, one each way, stay apart", async () => {
        const widget = await draw();
        const ab = pathOf(widget, "ab");
        const ba = pathOf(widget, "ba");
        const middle = (points: Point[]) => points[Math.floor(points.length / 2)];
        assert(Math.abs(middle(ba.points).y - 70) > 10, "the arc between B and A is bent away from the straight line");
        assert(middle(ba.points).y > 70, "a positive bend is to the left of the way, which leaves B for A downwards");
        equal(ab.points.length, 2, "the straight one is a line");
        // The arc ends where it meets the outlines, and is a curve in the data of the SVG path.
        if (name === "svg") assert(/Q/.test((rendering(widget, "ba") as SVGElement).getAttribute("d")!), "a quadratic curve");
        // A negative bend turns it to the other side; no bend is a line.
        item(widget, "ba").setAttribute("bend", "-0.3");
        await frame(2);
        assert(middle(pathOf(widget, "ba").points).y < 70, "negative: to the right of the way");
        item(widget, "ba").setAttribute("bend", "0");
        await frame(2);
        equal(pathOf(widget, "ba").points.length, 2, "bend 0 is straight");
        // route="arc" has a bend of its own without the attribute, and takes the attribute too.
        const bc = pathOf(widget, "bc");
        assert(Math.abs(middle(bc.points).y - (70 + 100) / 2) > 5 || bc.points.length > 2, "route arc");
    });

    both("loop: a path from a node to itself is a loop at an angle", async () => {
        const widget = await draw();
        const centre = { x: 510, y: 100 };
        const loop = pathOf(widget, "cc");
        const [first, end] = [loop.points[0], last(loop.points)];
        assert(near(distance(first, centre), 30, 0.7), "it leaves the circle");
        assert(near(distance(loop.markers[0].polygon![0], centre), 30, 0.7), "and its arrow comes back to the circle");
        const far = loop.points.reduce((a, b) => (distance(a, centre) > distance(b, centre) ? a : b));
        const angle = (point: Point) => ((Math.atan2(point.x - centre.x, centre.y - point.y) * 180) / Math.PI + 360) % 360;
        assert(near(angle(far), 45, 12), `the tip points at 45 degrees (it is at ${angle(far).toFixed(0)})`);
        assert(distance(far, centre) > 30 + 20, "outside the node");
        item(widget, "cc").setAttribute("loop", "180");
        await frame(2);
        const down = pathOf(widget, "cc").points.reduce((a, b) => (distance(a, centre) > distance(b, centre) ? a : b));
        assert(near(angle(down), 180, 12), "another angle");
        assert(down.y > 100, "it is below the node now");
        assert(end.x !== undefined);
    });

    both("waypoints: the widget's own route, relative to the ends, follows the nodes", async () => {
        const widget = await draw();
        const dh = pathOf(widget, "dh");
        // From the centre of D (310, 220) by (40, 60), and from the centre of H (510, 220) by (-40, 60).
        const inner = dh.points.slice(1, 3);
        assert(nearPoint(inner[0], { x: 350, y: 280 }) && nearPoint(inner[1], { x: 470, y: 280 }), `the waypoints are where they say: ${JSON.stringify(inner)}`);
        widget.places = { ...widget.places, h: { x: 500, y: 200 } };
        await settled(widget);
        await frame(2);
        const moved = pathOf(widget, "dh").points.slice(1, 3);
        assert(nearPoint(moved[0], { x: 350, y: 280 }) && nearPoint(moved[1], { x: 490, y: 280 }), "the waypoint of the end moved with H, the other stayed");
        widget.places = { ...widget.places, d: { x: 260, y: 160 } };
        await settled(widget);
        await frame(2);
        const lifted = pathOf(widget, "dh").points.slice(1, 3);
        assert(nearPoint(lifted[0], { x: 350, y: 250 }), "the one of the start moved with D");
    });

    both("waypoints: they put the ends on chosen points of the outlines, so that several paths can share a side", async () => {
        const widget = await draw();
        // A's centre is (80, 70) and B's is (300, 70): a point of the right side of A and a point of the left side of B, as offsets from the centres.
        item(widget, "ab").setAttribute("waypoints", "40,-10 e:-40,10");
        await frame(2);
        let ab = pathOf(widget, "ab");
        assert(nearPoint(ab.points[0], { x: 120, y: 60 }, 0.6), `the path starts at the chosen point of A: ${JSON.stringify(ab.points[0])}`);
        assert(nearPoint(ab.markers[0].polygon![0], { x: 260, y: 80 }, 0.6), "and ends at the chosen point of B");
        // A second path on the same sides, further down: both stay on their nodes when a node moves.
        widget.places = { ...widget.places, b: { x: 260, y: 100 } };
        await settled(widget);
        await frame(2);
        ab = pathOf(widget, "ab");
        assert(nearPoint(ab.points[0], { x: 120, y: 60 }, 0.6), "the start did not move with B");
        assert(nearPoint(ab.markers[0].polygon![0], { x: 260, y: 130 }, 0.6), "the end moved with B");
    });

    both("orthogonal: a path of horizontal and vertical segments goes around the other nodes", async () => {
        const widget = await draw();
        const g = { x: 270, y: 320, width: 80, height: 60 };
        const axis = (points: Point[]) => points.slice(1).every((p, i) => p.x === points[i].x || p.y === points[i].y);
        const detour = pathOf(widget, "ef");
        assert(axis(detour.points), "only horizontal and vertical segments");
        assert(!crosses(detour.points, g), "G is in the way and is not crossed");
        assert(detour.points.length > 4, "it takes a detour");
        assert(nearPoint(detour.points[0], { x: 100, y: 350 }) && nearPoint(detour.markers[0].polygon![0], { x: 520, y: 350 }), "from the right side of E to the left side of F");
        // Nothing in the way: no detour. A node that moves into the way is gone around.
        widget.places = { ...widget.places, g: { x: 270, y: 120 } };
        await settled(widget);
        await frame(2);
        equal(pathOf(widget, "ef").points.length, 2, "a straight line");
        widget.places = { ...widget.places, g: { x: 270, y: 330 } };
        await settled(widget);
        await frame(2);
        assert(!crosses(pathOf(widget, "ef").points, { x: 270, y: 330, width: 80, height: 60 }), "a node that moves into the way is gone around");
        assert(axis(pathOf(widget, "ef").points));
    });

    // ── Markers ───────────────────────────────────────────────────────────

    both("markers: every kind, at the end, drawn in the stroke colour, with the path ending at the base", async () => {
        const widget = await draw();
        // The stroke is 2px: a marker is 8 + 2 * 2 = 12 long.
        const inset: Record<string, number> = { arrow: 12, "open-arrow": 0, triangle: 12, "triangle-filled": 12, diamond: 18, "diamond-filled": 18, circle: 9.6, "circle-open": 9.6 };
        MARKER_KINDS.forEach((kind, index) => {
            const path = pathOf(widget, `m-${kind}`);
            equal(path.markers.length, 1, kind);
            equal(path.markers[0].kind, kind);
            const tip = 90 + index * 90;
            assert(near(last(path.points).x, tip - inset[kind], 0.3), `${kind}: the line ends ${inset[kind]} before the tip`);
            assert(near(last(path.points).y, 440));
        });
        // The shapes: polygons, an open line and a circle; filled ones in the stroke colour.
        equal(pathOf(widget, "m-arrow").markers[0].filled, true);
        equal(pathOf(widget, "m-triangle").markers[0].filled, false);
        assert(pathOf(widget, "m-open-arrow").markers[0].line !== null);
        assert(pathOf(widget, "m-circle").markers[0].circle !== null);
        // Start and end are independent.
        const twice = pathOf(widget, "m-start");
        equal(twice.markers.map((marker) => marker.kind), ["triangle", "circle"]);
        assert(near(twice.points[0].x, 20 + 12, 0.3) && near(last(twice.points).x, 110 - 9.6, 0.3), "trimmed at both ends");
        // What is drawn.
        if (name === "svg") {
            const decor = (id: string) => rendering(widget, id)!.nextElementSibling as SVGElement;
            const [arrow, hollow] = [decor("m-arrow").firstElementChild as SVGElement, decor("m-triangle").firstElementChild as SVGElement];
            equal(arrow.style.fill, "rgb(40, 40, 40)", "an arrow is painted in the stroke colour");
            equal(hollow.style.fill, "rgb(255, 255, 255)", "a hollow marker is filled with --ww-scene-marker-fill");
            equal(hollow.style.stroke, "rgb(40, 40, 40)");
            equal(decor("m-diamond").firstElementChild!.localName, "polygon");
            equal(decor("m-circle-open").firstElementChild!.localName, "circle");
            equal(decor("m-open-arrow").firstElementChild!.localName, "polyline");
        } else {
            const scene = sceneOf(widget) as PixiLike;
            const inside = (kind: string, back: number) => pixel(scene, 90 + MARKER_KINDS.indexOf(kind as never) * 90 - back, 440);
            const filled = inside("arrow", 6);
            assert(filled[3] > 200 && filled[0] < 80, `an arrow is painted in the stroke colour: ${filled}`);
            const hollow = inside("triangle", 6);
            assert(hollow[3] > 200 && hollow[0] > 200, `a hollow marker is filled with --ww-scene-marker-fill: ${hollow}`);
            assert(inside("arrow", -4)[3] < 20, "nothing beyond the tip");
        }
    });

    both("markers: they scale with the stroke width and take the colour of the path", async () => {
        const widget = await draw();
        const arrow = item(widget, "m-arrow");
        arrow.classList.add("thick");
        await frame(2);
        // 6px: a marker is 8 + 2 * 6 = 20 long.
        assert(near(last(pathOf(widget, "m-arrow").points).x, 90 - 20, 0.3), `longer markers on a thicker line: ${last(pathOf(widget, "m-arrow").points).x}`);
        arrow.classList.remove("thick");
        arrow.style.setProperty("--ww-scene-marker-size", "30");
        await frame(2);
        assert(near(last(pathOf(widget, "m-arrow").points).x, 90 - 30, 0.3), "--ww-scene-marker-size sets the length");
        arrow.style.removeProperty("--ww-scene-marker-size");
        arrow.style.stroke = "rgb(200, 0, 0)";
        await frame(2);
        if (name === "svg") equal(((rendering(widget, "m-arrow")!.nextElementSibling as SVGElement).firstElementChild as SVGElement).style.fill, "rgb(200, 0, 0)");
        else {
            const colour = pixel(sceneOf(widget) as PixiLike, 90 - 6, 440);
            assert(colour[0] > 150 && colour[1] < 60, `the colour of the path: ${colour}`);
        }
        // On a path that is too short for its markers they shrink, and leave some line.
        item(widget, "m-start").setAttribute("marker-end", "diamond-filled");
        item(widget, "m-start").style.setProperty("--ww-scene-marker-size", "100");
        await frame(2);
        const short = pathOf(widget, "m-start");
        assert(short.points.length >= 2 && distance(short.points[0], last(short.points)) > 5, "some line is left");
    });

    // ── Labels ────────────────────────────────────────────────────────────

    both("labels: at the start, the middle and the end, beside or on the line, several per path", async () => {
        const widget = await draw();
        const uml = pathOf(widget, "uml");
        equal(uml.labels.length, 3);
        const [start, end, name] = uml.labels;
        equal(start.lines, ["1..*"]);
        equal(name.lines, ["owns"]);
        assert(near(start.x, 40 + 24, 1.5) || start.x > 40, "the first is near the start");
        assert(start.y < 250 - start.height / 2 + 0.5 && start.y < 250, "above the line");
        assert(near(end.x, 200 - 24, 1.5) || end.x < 200, "the second is near the end");
        // On the line, in the middle: its centre is on the line, and it has a box (padding) around the text.
        assert(near(name.x, 120, 1.5) && near(name.y, 250, 0.6), "the third is on the line in the middle");
        assert(name.width > 30 && name.height > 14, "the box is larger than the text");
        // A label does not become a path of its own.
        equal(pathOf(widget, "ab").labels.length, 1, "the weight");
        // `above` and `below`, `left` and `right`, `gap`.
        const label = item(widget, "uml-end");
        label.setAttribute("side", "below");
        await frame(2);
        assert(pathOf(widget, "uml").labels[1].y > 250, "below");
        label.setAttribute("gap", "20");
        await frame(2);
        assert(pathOf(widget, "uml").labels[1].y > 250 + 20, "the gap is the space between line and box");
        label.setAttribute("side", "left");
        label.removeAttribute("gap");
        await frame(2);
        // Travelling to the right, the left is up.
        assert(pathOf(widget, "uml").labels[1].y < 250, "left of the way is above when it goes to the right");
        label.setAttribute("side", "right");
        await frame(2);
        assert(pathOf(widget, "uml").labels[1].y > 250, "right of the way");
        label.setAttribute("at", "0.25");
        label.removeAttribute("along");
        await frame(2);
        assert(near(pathOf(widget, "uml").labels[1].x, 40 + 160 / 4, 1.5), "a fraction of the length");
    });

    both("labels: they follow the direction of the line, upright, and have several lines", async () => {
        const widget = await draw();
        const label = item(widget, "uml-name");
        label.setAttribute("follow", "");
        await frame(2);
        equal(pathOf(widget, "uml").labels[2].rotate, 0, "a horizontal line");
        // A line that goes down is read from the top to the bottom; one that goes to the left is not upside down.
        const rot = pathOf(widget, "rot");
        equal(rot.labels.length, 2);
        equal(rot.labels[0].rotate, 90, "follow turns it along a vertical line");
        equal(rot.labels[1].rotate, -20, "a label can have its own angle");
        equal(rot.labels[0].lines.length, 1);
        // Several lines: one text with a line break, and a style that keeps it.
        const lines = pathOf(widget, "rot").labels[1];
        equal(lines.lines, ["two", "lines"]);
        assert(lines.height > 2 * 12, "the box is two lines high");
        if (name === "svg") {
            const group = (rendering(widget, "rot")!.nextElementSibling as SVGElement).querySelectorAll("g")[1];
            equal(group.querySelectorAll("tspan").length, 2, "two lines in the SVG text");
            assert(/rotate\(-20\)/.test(group.getAttribute("transform")!), "turned");
        } else {
            const texts = (rendering(widget, "rot") as unknown as PixiObject).children[1].children as PixiObject[];
            equal(texts[1].text, "two\nlines");
        }
    });

    both("labels: they take the pointer with their path and add no tab stop", async () => {
        const widget = await draw();
        const scene = sceneOf(widget);
        const uml = pathOf(widget, "uml");
        const before = standIns(widget).length;
        equal(before, 5, "one stand-in for each selectable path (ba, cc, ad, uml) and the group, none for a label");
        assert(standIns(widget).every((standIn) => !/owns|1\.\.\*|0\.\.1|back|^x$/.test(standIn.getAttribute("aria-label")!)), "no stand-in of a label");
        // A press on the label of a path is a press on the path.
        await click(scene, uml.labels[2].x, uml.labels[2].y);
        equal(selectionOf(widget), ["uml"], "the label is part of the path");
        // Its markers and labels are part of the selection outline.
        const outline = standIns(widget).find((standIn) => standIn.getAttribute("aria-label") === "uml")!;
        assert((outline.getAttribute("d")!.match(/M/g) ?? []).length >= 1 + 1 + 3, "the outline of the path holds its marker and its three labels");
        // The marker is part of it too: a press on the diamond.
        await click(scene, 5, 5);
        equal(selectionOf(widget), [], "a press on the background clears");
        const tip = uml.markers[0].polygon![0];
        // The middle of the diamond: further from the line than its band reaches.
        await click(scene, tip.x - 9, tip.y);
        equal(selectionOf(widget), ["uml"], "a press on its marker");
        // A marquee that touches only a label of the path selects the path: the label is part of it.
        await click(scene, 5, 5);
        const small = uml.labels[0];
        await sweep(scene, { x: small.x - 20, y: small.y - small.height / 2 - 14 }, { x: small.x + 5, y: small.y }, undefined, { shiftKey: true });
        equal(selectionOf(widget), ["uml"], "a marquee over a label");
    });

    both("labels: their text and style are read from the template, and change with it", async () => {
        const widget = await draw();
        // A change of style that only a class of the scene brings, which no label sees: restyle.
        equal(pathOf(widget, "ab").labels[0].style.fill, "rgb(0, 0, 120)");
        sceneOf(widget).classList.add("alt");
        await frame(2);
        equal(pathOf(widget, "ab").labels[0].style.fill, "rgb(200, 0, 0)", "a class on the scene reaches the labels");
        const weight = item(widget, "ab-weight");
        const [first] = pathOf(widget, "ab").labels;
        weight.textContent = "weight 12";
        await frame(2);
        const [again] = pathOf(widget, "ab").labels;
        equal(again.lines, ["weight 12"]);
        assert(again.width > first.width + 20, "wider for more text");
        equal(again.style.background, "rgb(255, 255, 200)", "the box has the background of the label");
        weight.classList.remove("boxed");
        await frame(2);
        equal(pathOf(widget, "ab").labels[0].style.background, "none");
        // Added and removed.
        weight.remove();
        await frame(2);
        equal(pathOf(widget, "ab").labels.length, 0, "removed");
    });

    // ── Shapes and text ───────────────────────────────────────────────────

    both("text: rotation, line breaks, halo, background and vertical alignment", async () => {
        const widget = await draw();
        const scene = sceneOf(widget);
        equal((drawing(widget, "rotated") as Extract<Drawing, { type: "text" }>).rotate, 30);
        equal((drawing(widget, "lines") as Extract<Drawing, { type: "text" }>).text, "one\ntwo", "white-space: pre-line keeps the line break");
        equal((drawing(widget, "halo") as Extract<Drawing, { type: "text" }>).text, "Halo");
        if (name === "svg") {
            equal(rendering(widget, "rotated")!.getAttribute("transform"), "rotate(30 640 40)", "about x, y");
            equal(rendering(widget, "lines")!.querySelectorAll("tspan").length, 2, "two lines");
            const halo = (rendering(widget, "halo") as SVGElement).style;
            equal(halo.stroke, "rgb(255, 255, 0)");
            equal(halo.paintOrder, "stroke", "the halo is under the letters");
            const back = rendering(widget, "box")!.previousElementSibling as SVGRectElement;
            equal(back.localName, "rect", "a box below the text");
            equal(back.style.fill, "rgb(255, 230, 200)");
            const text = (rendering(widget, "box") as SVGGraphicsElement).getBBox();
            assert(near(Number(back.getAttribute("width")), text.width + 16, 0.5), `with the padding: 10 on the left and 6 on the right: ${back.getAttribute("width")} for ${text.width}`);
            equal(back.getAttribute("rx"), "4");
            const middle = (rendering(widget, "mid") as SVGGraphicsElement).getBBox();
            assert(near(middle.y + middle.height / 2, 250, 2.5), `the middle of the text is at y: ${middle.y + middle.height / 2}`);
            const top = (rendering(widget, "halo") as SVGGraphicsElement).getBBox();
            assert(near(top.y, 150, 4), `the default is the top: ${top.y}`);
        } else {
            const rotated = rendering(widget, "rotated") as unknown as PixiObject;
            assert(near(rotated.rotation, (30 * Math.PI) / 180, 0.001), "rotated about its position");
            assert((rendering(widget, "lines") as unknown as PixiObject).text.includes("\n"), "two lines");
            assert((rendering(widget, "halo") as unknown as PixiObject).style.stroke!.width === 4, "a halo of 4px");
            const text = rendering(widget, "box") as unknown as PixiObject;
            const parent = (text as unknown as { parent: PixiObject }).parent;
            const back = parent.children[parent.children.indexOf(text) - 1];
            assert(back !== undefined && back !== text, "a box right below the text");
            assert(near(back.getLocalBounds().width, text.getLocalBounds().width + 16, 1.5), "with the padding");
            equal((rendering(widget, "mid") as unknown as PixiObject).anchor.y, 0.5, "the middle");
            equal((rendering(widget, "halo") as unknown as PixiObject).anchor.y, 0, "the top is the default");
            assert(ink(scene as PixiLike, 600 + 3, 190 + 8) > 200, "the box is painted");
        }
    });

    both("text: the size a text will have is known before it is drawn, and extent() includes text", async () => {
        const widget = await draw();
        const scene = widget.scene;
        const element = item(widget, "mid");
        const measured = scene.measureText("Middle", element);
        assert(measured.width > 20 && measured.width < 80, `a width: ${measured.width}`);
        equal(measured.lines, 1);
        const lines = scene.measureText("one\ntwo", item(widget, "lines"));
        equal(lines.lines, 2);
        equal(lines.lineHeight, 18, "the line-height of the style");
        equal(lines.height, 36);
        const wide = scene.measureText("Middle", { fontSize: 28 });
        assert(wide.width > measured.width * 1.5, "another font size");
        if (name === "svg") {
            const box = (rendering(widget, "mid") as SVGGraphicsElement).getBBox();
            assert(near(box.width, measured.width, 1.5), `what is drawn is as wide as measured: ${box.width} and ${measured.width}`);
        } else {
            const box = (rendering(widget, "mid") as unknown as PixiObject).getLocalBounds();
            assert(near(box.width, measured.width, 3), `what is drawn is as wide as measured: ${box.width} and ${measured.width}`);
        }
        // The extent holds the text at the bottom right, which is lower than any node or line, and the turned rectangle.
        const extent = scene.extent()!;
        assert(extent.y + extent.height >= 484, `the extent reaches the text: ${extent.y + extent.height}`);
        assert(extent.x + extent.width >= 749, "to its right end");
        assert(extent.x + extent.width < 760, "and not beyond");
        assert(extent.x < -5, `a text that ends at the right of its x, in a group, reaches to the left: ${extent.x}`);
        // The grid is not part of it.
        widget.grid = "";
        await settled(widget);
        await frame(2);
        const without = scene.extent()!;
        equal(JSON.stringify(without), JSON.stringify(extent), "a grid has no extent");
    });

    both("shapes: a corner radius and a rotation", async () => {
        const widget = await draw();
        const scene = sceneOf(widget);
        equal((drawing(widget, "round") as Extract<Drawing, { type: "rect" }>).radius, 14);
        const turned = drawing(widget, "turned") as Extract<Drawing, { type: "rect" }>;
        equal(turned.rotate, 45);
        if (name === "svg") {
            equal(rendering(widget, "round")!.getAttribute("rx"), "14");
            equal(rendering(widget, "turned")!.getAttribute("transform"), "rotate(45 660 365)", "a rect turns about its centre");
        } else {
            const pixiScene = scene as PixiLike;
            assert(ink(pixiScene, 601, 291) < 30, "a rounded corner is empty");
            assert(ink(pixiScene, 640, 310) > 200, "and the shape is filled");
            // The turned rectangle: along its long axis (40 * (cos 45, sin 45)) it is there, at its old corner it is not.
            assert(ink(pixiScene, 660 + 24, 365 + 24) > 200, "painted where it was turned to");
            assert(ink(pixiScene, 622, 352) < 30, "empty where it was");
        }
    });

    // ── The hit width ─────────────────────────────────────────────────────

    both("hit width: a path takes the pointer in the band that its template says", async () => {
        const widget = await draw();
        const scene = sceneOf(widget);
        // The step from A to D runs down at x = 190 between y = 70 and y = 220.
        await click(scene, 203, 160);
        equal(selectionOf(widget), ["ad"], "13px beside the line, inside the 30px band");
        await click(scene, 5, 5);
        item(widget, "ad").removeAttribute("hit-width");
        await frame(2);
        await click(scene, 203, 160);
        equal(selectionOf(widget), [], "the default band is narrower");
        await click(scene, 193, 160);
        equal(selectionOf(widget), ["ad"], "and the line itself is hit");
    });

    // ── The grid ──────────────────────────────────────────────────────────

    both("grid: dots or lines at a spacing, drawn as one pattern", async () => {
        const widget = await draw();
        const scene = sceneOf(widget);
        const grid = () => scene.drawingOf(scene.background!) as Extract<Drawing, { type: "grid" }>;
        equal(grid().kind, "dots");
        equal(grid().spacing, 20);
        assert(grid().area.width >= 760 && grid().area.height >= 490, "it covers the scene");
        equal(grid().area.x % 20, 0, "in whole cells");
        if (name === "svg") {
            const element = scene.rendering(scene.background!) as SVGElement;
            equal(element.querySelectorAll("pattern").length, 1, "one pattern");
            assert(element.querySelectorAll("*").length <= 5, "and no shape for each dot");
            equal(element.querySelectorAll("circle").length, 1);
            equal((element.querySelector("circle") as SVGElement).style.fill, "rgb(120, 120, 140)", "the colour is --ww-scene-grid-color");
        } else {
            const sprite = scene.rendering(scene.background!) as unknown as PixiObject;
            assert(sprite.width >= 760, "one tiling sprite");
            // The marks are at the multiples of the spacing. The size of a mark is --ww-scene-grid-size.
            scene.style.setProperty("--ww-scene-grid-size", "3");
            scene.restyle();
            await frame(2);
            assert(ink(scene as PixiLike, 580, 20) > 60, "a dot where a multiple of the spacing is");
            assert(ink(scene as PixiLike, 590, 30) < 20, "none between");
        }
        // Another spacing; without one, the grid of the snap is used.
        scene.setAttribute("background-spacing", "10");
        await frame(2);
        equal(grid().spacing, 10);
        scene.removeAttribute("background-spacing");
        scene.setAttribute("grid", "40");
        await frame(2);
        equal(grid().spacing, 40, "the snap grid is the default spacing");
        scene.removeAttribute("grid");
        scene.setAttribute("background-spacing", "20");
        scene.setAttribute("background", "lines");
        await frame(2);
        equal(grid().kind, "lines");
        if (name === "svg") equal((scene.rendering(scene.background!) as SVGElement).querySelectorAll("path").length, 1, "lines are a path in the tile");
        else {
            scene.style.setProperty("--ww-scene-grid-size", "1");
            scene.restyle();
            await frame(2);
            assert(ink(scene as PixiLike, 580, 30) > 30, "a vertical line at a multiple of the spacing");
            assert(ink(scene as PixiLike, 590, 30) < 20, "none between");
        }
        // It takes no pointer: a press on the background is a press on the scene.
        const { element } = under(scene, 5, 5);
        assert(!element.closest("[part=grid]"), "no pointer for a grid");
        // Without the attribute there is none.
        scene.removeAttribute("background");
        await frame(2);
        equal(scene.background, null);
        if (name === "svg") assert(!scene.shadowRoot!.querySelector("[part=grid]"), "nothing drawn");
    });

    both("grid: it follows the view of the viewport", async () => {
        const widget = await draw("contenteditable windowed");
        widget.windowed = true;
        await settled(widget);
        await frame(3);
        const scene = sceneOf(widget);
        const grid = () => scene.drawingOf(scene.background!) as Extract<Drawing, { type: "grid" }>;
        const visible = () => {
            const a = scene.toScene(scene.getBoundingClientRect().left + scene.clientLeft, scene.getBoundingClientRect().top + scene.clientTop);
            const b = scene.toScene(scene.getBoundingClientRect().right - scene.clientLeft, scene.getBoundingClientRect().bottom - scene.clientTop);
            return { left: a.x, top: a.y, right: b.x, bottom: b.y };
        };
        const covers = () => {
            const [area, view] = [grid().area, visible()];
            return area.x <= view.left && area.y <= view.top && area.x + area.width >= view.right && area.y + area.height >= view.bottom;
        };
        assert(covers(), "it covers what is visible");
        widget.view.zoomTo(0.5);
        await frame(3);
        const zoomed = grid().area;
        assert(zoomed.width > 760, `zoomed out, more of it is drawn: ${zoomed.width}`);
        assert(covers(), "it covers what is visible when zoomed out");
        widget.view.panBy(-300, -200);
        await frame(3);
        assert(covers(), "and after panning");
        assert(grid().area.x !== zoomed.x || grid().area.y !== zoomed.y, "the area moved with the view");
    });

    // ── Groups that frame their members ───────────────────────────────────

    both("frame: a group is drawn around its members, with padding and a label", async () => {
        const widget = await draw();
        const net = drawing(widget, "net") as Extract<Drawing, { type: "group" }>;
        const frameOf = () => (drawing(widget, "net") as Extract<Drawing, { type: "group" }>).frame!;
        assert(net.frame !== null, "a frame");
        // The members span x 40 to 180 and y 140 to 200; padding 10; the label takes a line above.
        const box = frameOf();
        equal(box.x, 30);
        equal(box.width, 160);
        assert(near(box.y + box.height, 210, 0.01), "the bottom edge");
        assert(box.y < 130 - 10, "the label is above the members");
        equal(box.label!.text, "Net");
        equal(box.interactive, true);
        // It follows its members while they move: here by attribute.
        item(widget, "n1").setAttribute("x", "0");
        await frame(2);
        equal(frameOf().x, -10, "the frame grew to the left");
        equal(frameOf().width, 200);
        item(widget, "n1").setAttribute("x", "40");
        await frame(2);
        equal(frameOf().x, 30);
        // A larger padding, a radius.
        item(widget, "net").setAttribute("padding", "20");
        item(widget, "net").setAttribute("radius", "8");
        await frame(2);
        equal(frameOf().x, 20);
        equal(frameOf().radius, 8);
        // What is drawn.
        if (name === "svg") {
            const element = item(widget, "net");
            const shape = (rendering(widget, "net") as SVGElement).firstElementChild!;
            equal(shape.getAttribute("part"), "frame", "the frame is the first child of the group");
            equal((shape.firstElementChild as SVGElement).getAttribute("rx"), "8");
            equal((shape.firstElementChild as SVGElement).style.fill, "rgb(235, 235, 255)", "it has the fill of the group");
            equal(shape.querySelector("text")!.textContent, "Net");
            assert(element.hasAttribute("frame"));
        } else {
            const group = rendering(widget, "net") as unknown as PixiObject;
            assert(group.children.length >= 1, "the frame is drawn in the group");
            equal(group.children[0].children[0].text, "Net", "with the label");
        }
        // Without members there is no frame.
        item(widget, "n1").remove();
        item(widget, "n2").remove();
        await frame(2);
        equal((drawing(widget, "net") as Extract<Drawing, { type: "group" }>).frame, null, "an empty group has none");
        if (name === "svg") assert(!(rendering(widget, "net") as SVGElement).querySelector("[part=frame]"));
    });

    both("frame: a press inside the frame moves the group and its members, which follow", async () => {
        const widget = await draw();
        const scene = sceneOf(widget);
        const before = item(widget, "n1").getBoundingClientRect().top;
        // Inside the frame, away from its nodes and from every path.
        await sweep(scene, { x: 60, y: 195 }, { x: 60, y: 235 });
        assert(widget.log.some((line) => line.startsWith("move:net@0,40")), `the group moved by 40: ${widget.log.join(" | ")}`);
        await settled(widget);
        await frame(2);
        assert(near(item(widget, "n1").getBoundingClientRect().top - before, 40, 0.6), "the member moved with it");
        equal((drawing(widget, "net") as Extract<Drawing, { type: "group" }>).frame!.y < 130, true);
        // The outline of the group, for the selection, is its frame.
        const outline = standIns(widget).find((standIn) => standIn.getAttribute("aria-label") === "net")!;
        assert(outline !== undefined, "a stand-in");
        const [a, b] = [dataOf(outline).slice(0, 2), dataOf(outline).slice(4, 6)];
        assert(near(a[0], 30, 0.6) && near(b[0], 190, 0.6), `the outline is the frame: ${outline.getAttribute("d")}`);
        equal(selectionOf(widget), ["net"], "pressing the frame selects the group");
        // By keyboard the group moves, and its members with it.
        outline.focus();
        const left = item(widget, "n1").getBoundingClientRect().left;
        key("ArrowRight", outline, { shiftKey: true });
        await frame(2);
        assert(near(item(widget, "n1").getBoundingClientRect().left - left, 10, 0.6), "the members follow a move by keyboard");
        key("Escape", outline);
        await frame(2);
        assert(near(item(widget, "n1").getBoundingClientRect().left - left, 0, 0.6), "and come back when it is taken back");
    });

    // ── The authored document ─────────────────────────────────────────────

    both("document: nothing is written to the authored elements, in either mode", async () => {
        for (const mode of ["contenteditable", ""]) {
            const widget = await draw(mode);
            const scene = sceneOf(widget);
            const allowed = new Set(["x", "y", "width", "height", "selected", "style"]);
            const watch = mutations(scene);
            await sweep(scene, { x: 80, y: 120 }, { x: 80, y: 150 });
            const node = item(widget, "a");
            node.focus();
            key("ArrowRight", node);
            await frame(2);
            key("Escape", node);
            await settled(widget);
            await frame(2);
            const written = watch.stop().filter((record) => record.type !== "attributes" || !allowed.has(record.attributeName!));
            // Lit writes comments and text of its own; attributes of the module would be something else.
            assert(written.filter((record) => record.type === "attributes").length === 0, `the module wrote attributes: ${written.map((record) => record.attributeName).join()}`);
            assert(written.filter((record) => (record.target as Element).localName === "ww-text").length === 0, "labels are left alone");
        }
    });

    both("document: the drawing is the same in edit and in read mode", async () => {
        const [edit, read] = [await draw("contenteditable"), await draw("")];
        for (const id of ["ab", "ba", "cc", "ef", "dh", "uml", "m-triangle"]) {
            equal(JSON.stringify(pathOf(edit, id)), JSON.stringify(pathOf(read, id)), id);
        }
    });
}

// ── Nodes in a scaled group ───────────────────────────────────────────────

check("nested: paths between nodes in a scaled group, and from outside to a node inside it", async () => {
    const widget = await mount<Nested>(`<ww-draw-nested></ww-draw-nested>`);
    await settled(widget);
    await frame(2);
    const scene = widget.shadowRoot!.querySelector("ww-scene") as unknown as SceneBase;
    const path = (id: string) => scene.drawingOf(widget.shadowRoot!.querySelector(`[data-ww-key="${id}"]`) as unknown as SceneItem) as PathDrawing;
    // Inside the group, in its own coordinates: p is the ellipse (30, 20; 20 x 10), q the rectangle from 80 to 120.
    const pq = path("pq");
    assert(near(pq.markers[0].polygon![0].x, 80, 0.6), "the arrow ends on the left side of q, in the coordinates of the group");
    const [px, py] = [pq.points[0].x - 30, pq.points[0].y - 20];
    assert(near((px / 20) ** 2 + (py / 10) ** 2, 1, 0.03), "and starts on the ellipse");
    // A label without any style of the widget's: the colour of the text, no stroke of the path, no dashes.
    const label = pq.labels[0].style;
    equal([label.fill, label.stroke, label.dash], ["rgb(60, 60, 70)", "none", "none"], "a label does not inherit the stroke of its path");
    // From outside: in scene coordinates q is at 190 to 270 and from 100 to 140 (scale 2 at 30, 20).
    const rq = path("rq");
    assert(near(rq.markers[0].polygon![0].x, 270, 0.6), `the path of the scene ends on q's right side: ${rq.markers[0].polygon![0].x}`);
    // A loop at the bottom of q, in the group: it leaves and comes back at the lower side (y = 60), and its marker has the scale of the group.
    const loop = path("qq");
    assert(near(loop.points[0].y, 60, 0.8), `the loop leaves at the bottom of q: ${loop.points[0].y}`);
    // A move of the group, by pointer: the path from outside follows it.
    const before = path("rq").points.at(-1)!;
    const box = scene.getBoundingClientRect();
    const from = { x: box.left + 30 + 2 * 30, y: box.top + 20 + 2 * 20 };
    pointer(scene.shadowRoot!.elementFromPoint(from.x, from.y) ?? scene, "pointerdown", from);
    pointer(scene, "pointermove", { x: from.x + 6, y: from.y + 6 });
    await frame();
    pointer(scene, "pointermove", { x: from.x + 40, y: from.y + 10 });
    await frame();
    const during = path("rq").points.at(-1)!;
    pointer(scene, "pointerup", { x: from.x + 40, y: from.y + 10 });
    await frame(2);
    assert(during.x > before.x + 30, `the path followed the preview of the group: ${before.x} to ${during.x}`);
    assert(widget.place.x === 70, `the group moved by 40: ${widget.place.x}`);
    assert(near(path("rq").markers[0].polygon![0].x, 310, 0.6), "and the path ends on the moved q: 270 + 40");
});

drawChecks("svg");
drawChecks("pixi");

run();
