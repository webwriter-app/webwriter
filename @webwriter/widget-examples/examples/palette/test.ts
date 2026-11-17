import { addedListeners, assert, check, deepActive, drag, equal, events, key, listeners, listenerTypes, mount, point, pointer, run, settled, type Point } from "../../test/harness";
import type { DragCommitDetail } from "@webwriter/widget/drag";
import { click, glided, hold } from "../shared/sort-input";
import type { Palette } from "./index";
import "./index";

const GRID = 20;
const root = (widget: Element) => widget.shadowRoot!;
const canvas = (widget: Element) => root(widget).querySelector<HTMLElement>(".canvas")!;
const trash = (widget: Element) => root(widget).querySelector<HTMLElement>(".trash")!;
const swatch = (widget: Element, type: string) => root(widget).querySelector<HTMLElement>(`.palette [data-type="${type}"]`)!;
const shape = (widget: Element, id: string) => root(widget).querySelector<HTMLElement>(`.shape[data-ww-key="${id}"]`)!;
const live = (widget: Element) => root(widget).querySelector("[data-ww-live]")!.textContent!.trim();
const near = (a: number, b: number, tolerance = 0.6) => Math.abs(a - b) <= tolerance;
const snap = (value: number) => Math.round(value / GRID) * GRID;
const shapes = (widget: Palette) => widget.shapes.map(({ id, type, x, y }) => `${id}:${type}@${x},${y}`);
const markup = (list: object[] = [], attributes = "allow-arranging") => `<ww-palette ${attributes} shapes='${JSON.stringify(list)}'></ww-palette>`;

/** The place on the screen of a point of the canvas, in the canvas' own coordinates. Only without zoom and transforms. */
function onCanvas(widget: Element, x: number, y: number): Point {
    const box = canvas(widget).getBoundingClientRect();
    return { x: box.left + canvas(widget).clientLeft + x - canvas(widget).scrollLeft, y: box.top + canvas(widget).clientTop + y - canvas(widget).scrollTop };
}

function commits(widget: Element): DragCommitDetail[] {
    const seen: DragCommitDetail[] = [];
    widget.addEventListener("ww-dragcommit", (event) => void seen.push((event as CustomEvent<DragCommitDetail>).detail));
    return seen;
}

check("copy: a palette shape dropped on the canvas creates one at the grid point, and the palette keeps its button", async () => {
    const widget = await mount<Palette>(markup());
    const button = swatch(widget, "circle");
    const before = button.getBoundingClientRect();
    const seen = commits(widget);
    const log = events("ww-dragpick", "ww-transactionstart", "ww-dragcommit", "ww-transactionend");
    // The press is at the button's centre, so its centre goes where the pointer goes.
    const centre = { x: 133, y: 87 };
    const expected = { x: snap(centre.x - before.width / 2), y: snap(centre.y - before.height / 2) };

    await hold(button, onCanvas(widget, centre.x, centre.y));
    equal(button.getAnimations().length, 1, "the real button is lifted by an animation");
    equal([root(widget).querySelectorAll(".palette button").length, button.style.length], [3, 0], "nothing is cloned and no style attribute is written");
    const lifted = button.getBoundingClientRect();
    const origin = onCanvas(widget, 0, 0);
    assert(near(lifted.left - origin.x, expected.x, 0.05) && near(lifted.top - origin.y, expected.y, 0.05), "the lifted button sits on the grid while it is held");
    assert(canvas(widget).hasAttribute("data-ww-drop-candidate") && canvas(widget).hasAttribute("data-ww-drop-over"), "the canvas is marked");
    assert(!trash(widget).hasAttribute("data-ww-drop-candidate"), "the ww-dragpick handler took the trash away for a new shape");
    equal(widget.shapes, [], "nothing changes before the release");

    let rendered = -1;
    document.addEventListener("ww-transactionend", () => (rendered = root(widget).querySelectorAll(".shape").length), { once: true });
    pointer(button, "pointerup", onCanvas(widget, centre.x, centre.y));
    await settled(widget);
    equal(rendered, 1, "the transaction ended after the widget rendered the new shape");
    equal(button.getAnimations().length, 0, "the button is back at once: it does not glide home");
    await glided(widget);
    equal(log.stop(), ["ww-dragpick", "ww-transactionstart", "ww-dragcommit", "ww-transactionend"]);
    equal(shapes(widget), [`s1:circle@${expected.x},${expected.y}`]);
    equal(JSON.parse(widget.getAttribute("shapes")!), widget.shapes, "the shapes are in the attribute");
    const [detail] = seen;
    equal([detail.effect, detail.key, detail.kind, detail.index, detail.slot], ["copy", "new-circle", "shape", null, null]);
    assert(detail.item === button && detail.source === null && detail.target === canvas(widget), "the commit names the palette button and the canvas");
    assert(swatch(widget, "circle") === button && near(button.getBoundingClientRect().left, before.left, 0.01), "the same button is in the palette");
    const placed = shape(widget, "s1").getBoundingClientRect();
    assert(near(placed.left, lifted.left, 0.05) && near(placed.top, lifted.top, 0.05), "the shape is where the button was dropped");
});

check("move: a placed shape follows the pointer on the grid; a drop on its own point commits nothing", async () => {
    const widget = await mount<Palette>(markup([{ id: "s1", type: "square", x: 40, y: 40 }]));
    const seen = commits(widget);
    const start = point(shape(widget, "s1"));
    await hold(shape(widget, "s1"), { x: start.x + 47, y: start.y + 33 });
    const origin = onCanvas(widget, 0, 0);
    const lifted = shape(widget, "s1").getBoundingClientRect();
    assert(near(lifted.left - origin.x, 80, 0.05) && near(lifted.top - origin.y, 80, 0.05), `the shape snaps while held: ${lifted.left - origin.x}, ${lifted.top - origin.y}`);
    assert(shape(widget, "s1").hasAttribute("data-ww-dragging"), "a shadow-rendered item is marked");
    pointer(shape(widget, "s1"), "pointerup", { x: start.x + 47, y: start.y + 33 });
    await glided(widget);
    equal(shapes(widget), ["s1:square@80,80"]);
    equal([seen[0].effect, seen[0].key, seen[0].x, seen[0].y], ["move", "s1", 80, 80]);
    assert(seen[0].source === canvas(widget), "the source is the canvas the shape sits in");
    assert(!root(widget).querySelector("[data-ww-dragging], [data-ww-drop-over], [data-ww-drop-candidate], [data-ww-drag-overlay]"), "nothing is left behind");

    const log = events("ww-dragcommit", "ww-transactionstart");
    const again = point(shape(widget, "s1"));
    await drag(shape(widget, "s1"), { x: again.x + 7, y: again.y + 5 });
    equal([shapes(widget), log.stop()], [["s1:square@80,80"], []], "less than half a step snaps back: no commit and no transaction");
});

check("point: the coordinates are the canvas' own under CSS zoom and with the canvas scrolled", async () => {
    const frame = await mount(`<div style="zoom: 1.5">${markup([{ id: "s1", type: "square", x: 40, y: 40 }, { id: "s9", type: "square", x: 900, y: 600 }])}</div>`);
    const widget = frame.querySelector<Palette>("ww-palette")!;
    await settled(widget);
    const seen = commits(widget);
    canvas(widget).scrollLeft = 100;
    canvas(widget).scrollTop = 60;
    equal([canvas(widget).scrollLeft, canvas(widget).scrollTop], [100, 60], "the canvas scrolls");

    // A new shape: the button's centre is dropped at a known place of the canvas' box.
    const button = swatch(widget, "square");
    const size = button.getBoundingClientRect();
    const box = canvas(widget).getBoundingClientRect();
    const at = { x: box.left + 210, y: box.top + 150 }; // screen pixels
    const border = parseFloat(getComputedStyle(canvas(widget)).borderLeftWidth); // a 1px border is two thirds of a pixel wide at this zoom
    const expected = {
        x: snap(210 / 1.5 - border + 100 - size.width / 1.5 / 2), // the canvas' pixels: unzoomed, without its border, scrolled
        y: snap(150 / 1.5 - border + 60 - size.height / 1.5 / 2),
    };
    let held = new DOMRect();
    await drag(button, at, { held: () => void (held = button.getBoundingClientRect()) });
    await glided(widget);
    equal([seen[0].x, seen[0].y], [expected.x, expected.y]);
    const placed = shape(widget, "s10").getBoundingClientRect();
    assert(near(placed.left, held.left, 0.1) && near(placed.top, held.top, 0.1), "the new shape is rendered where the button was held");

    // An existing shape: 90 by 60 screen pixels are 60 by 40 of the canvas' own.
    canvas(widget).scrollLeft = canvas(widget).scrollTop = 0;
    const start = point(shape(widget, "s1"));
    await drag(shape(widget, "s1"), { x: start.x + 90, y: start.y + 60 });
    equal([seen[1].key, seen[1].x, seen[1].y], ["s1", 100, 80]);
});

check("point: under a rotated and scaled ancestor the shape lands where it was held", async () => {
    const frame = await mount(`<div style="margin: 140px 0 0 60px; width: 340px; transform: rotate(90deg) scale(0.8)">${markup([{ id: "s1", type: "square", x: 40, y: 40 }])}</div>`);
    const widget = frame.querySelector<Palette>("ww-palette")!;
    await settled(widget);
    const seen = commits(widget);
    const start = point(shape(widget, "s1"));
    let held = new DOMRect();
    // 64 screen pixels down are 80 of the canvas' pixels along its x axis; 32 to the left are 40 along its y axis.
    await drag(shape(widget, "s1"), { x: start.x - 32, y: start.y + 64 }, { held: () => void (held = shape(widget, "s1").getBoundingClientRect()) });
    await glided(widget);
    equal([seen[0].x, seen[0].y], [120, 80]);
    const placed = shape(widget, "s1").getBoundingClientRect();
    assert(near(placed.left, held.left, 0.1) && near(placed.top, held.top, 0.1), "rendered at its new point, the shape is where the pointer held it");
    assert(near(held.left, start.x - 16 - 32, 0.1) && near(held.top, start.y - 16 + 64, 0.1), "the lifted shape followed the pointer exactly");
});

check("axis: a slider only moves sideways, by pointer and with the keyboard", async () => {
    const widget = await mount<Palette>(markup([{ id: "s1", type: "slider", x: 40, y: 60 }]));
    const slider = () => shape(widget, "s1");
    const start = point(slider());
    const top = slider().getBoundingClientRect().top;
    await hold(slider(), { x: start.x + 64, y: start.y + 50 });
    const origin = onCanvas(widget, 0, 0);
    const lifted = slider().getBoundingClientRect();
    assert(near(lifted.top, top, 0.05), "it does not leave its row");
    assert(near(lifted.left - origin.x, 100, 0.05), "it snaps along its axis");
    pointer(slider(), "pointerup", { x: start.x + 64, y: start.y + 50 });
    await glided(widget);
    equal(shapes(widget), ["s1:slider@100,60"]);

    slider().focus();
    key(" ");
    key("ArrowDown");
    key("ArrowUp");
    assert(near(slider().getBoundingClientRect().top, top, 0.05) && !/from the top/.test(live(widget)), "the keys across its axis do nothing");
    key("ArrowRight");
    assert(/Canvas, 120 from the left, 60 from the top/.test(live(widget)), `the point is announced: "${live(widget)}"`);
    key("Enter");
    await glided(widget);
    equal(shapes(widget), ["s1:slider@120,60"]);
});

check("trash: a placed shape dropped there is deleted; a new shape cannot go there", async () => {
    const widget = await mount<Palette>(markup([{ id: "s1", type: "circle", x: 40, y: 40 }, { id: "s2", type: "square", x: 120, y: 40 }]));
    const seen = commits(widget);
    await drag(shape(widget, "s1"), trash(widget), {
        held: () => assert(trash(widget).hasAttribute("data-ww-drop-over") && !canvas(widget).hasAttribute("data-ww-drop-over"), "the trash is the target under the shape"),
    });
    equal(shapes(widget), ["s2:square@120,40"]);
    assert(seen[0].target === trash(widget) && seen[0].x === null && seen[0].index === null, "a target without a position reports membership only");

    await drag(swatch(widget, "circle"), trash(widget), {
        held: () => assert(!trash(widget).hasAttribute("data-ww-drop-candidate") && !trash(widget).hasAttribute("data-ww-drop-over"), "the trash is no candidate for a new shape"),
    });
    equal([shapes(widget), seen.length], [["s2:square@120,40"], 1], "a release on it commits nothing");
});

check("keyboard: a shape is placed from the palette, moved with the arrow keys and deleted through Tab", async () => {
    const widget = await mount<Palette>(markup());
    const button = swatch(widget, "square");
    button.focus();
    key(" ");
    equal(live(widget), "Picked up Square. Use the arrow keys to choose a place, Enter to drop, Escape to cancel.", "one target: nothing is said about Tab");
    key("ArrowDown");
    const said = /^Canvas, (\d+) from the left, (\d+) from the top$/.exec(live(widget));
    assert(said, `the canvas is entered and the point announced: "${live(widget)}"`);
    const [x, y] = [Number(said[1]), Number(said[2])];
    const middle = point(canvas(widget));
    const lifted = point(button);
    assert(x % GRID === 0 && y % GRID === 0 && near(lifted.x, middle.x, GRID) && near(lifted.y, middle.y, GRID), "the button is lifted to the grid point nearest the middle of the canvas");
    key("ArrowRight");
    key("ArrowDown");
    equal(live(widget), `Canvas, ${x + GRID} from the left, ${y + GRID} from the top`);
    equal(widget.shapes, [], "nothing changes before Enter");
    key("Enter");
    await settled(widget);
    equal(shapes(widget), [`s1:square@${x + GRID},${y + GRID}`]);
    equal(live(widget), `Added Square to Canvas, ${x + GRID} from the left, ${y + GRID} from the top.`);
    assert(deepActive() === button, "focus is still on the palette button");
    await glided(widget);

    shape(widget, "s1").focus();
    key("Enter");
    assert(live(widget).endsWith("Tab moves to the next target."), `two targets: Tab is explained: "${live(widget)}"`);
    key("ArrowLeft");
    key("ArrowLeft");
    const origin = onCanvas(widget, 0, 0);
    assert(near(shape(widget, "s1").getBoundingClientRect().left - origin.x, x - GRID, 0.05), "the shape is lifted to the point");
    key(" ");
    await settled(widget);
    equal(shapes(widget), [`s1:square@${x - GRID},${y + GRID}`]);
    assert(deepActive() === shape(widget, "s1"), "focus is on the moved shape");
    await glided(widget);

    key("Enter");
    key("ArrowUp");
    key("Escape");
    await glided(widget);
    equal([shapes(widget), live(widget)], [[`s1:square@${x - GRID},${y + GRID}`], "Cancelled."], "Escape puts it back");
    assert(near(shape(widget, "s1").getBoundingClientRect().left - origin.x, x - GRID, 0.05) && shape(widget, "s1").getAnimations().length === 0, "and nothing holds it any more");

    key("Enter");
    key("Tab");
    equal(live(widget), "Trash");
    assert(trash(widget).hasAttribute("data-ww-drop-over") && shape(widget, "s1").getAnimations().length === 0, "Tab goes to the trash and the shape is no longer lifted");
    key("Tab");
    assert(/^Canvas/.test(live(widget)), "and round to the canvas again");
    key("Tab", undefined, { shiftKey: true });
    key("Enter");
    await glided(widget);
    equal([shapes(widget), live(widget)], [[], "Dropped Square on Trash."]);
});

check("click: a click on a shape and then on a place does the same as a drag", async () => {
    const widget = await mount<Palette>(markup());
    const button = swatch(widget, "circle");
    const size = button.getBoundingClientRect();
    click(button);
    assert(button.hasAttribute("data-ww-dragging") && canvas(widget).hasAttribute("data-ww-drop-candidate"), "the button is picked up and the canvas marked");
    assert(/^Selected Circle\. Click where/.test(live(widget)), `the pick-up is announced: "${live(widget)}"`);
    click(button);
    assert(!button.hasAttribute("data-ww-dragging") && !canvas(widget).hasAttribute("data-ww-drop-candidate") && live(widget) === "Cancelled.", "a second click puts it back");

    click(button);
    click(canvas(widget), onCanvas(widget, 150, 110));
    await glided(widget);
    const expected = { x: snap(150 - size.width / 2), y: snap(110 - size.height / 2) };
    equal(shapes(widget), [`s1:circle@${expected.x},${expected.y}`], "the shape is placed with its centre at the click, on the grid");
    assert(!button.hasAttribute("data-ww-dragging"), "the pick-up is over");

    click(shape(widget, "s1"));
    click(canvas(widget), onCanvas(widget, 300, 60));
    await glided(widget);
    equal(shapes(widget), [`s1:circle@${snap(300 - 20)},${snap(60 - 20)}`], "a placed shape is moved by two clicks");

    click(shape(widget, "s1"));
    click(swatch(widget, "square"));
    assert(swatch(widget, "square").hasAttribute("data-ww-dragging") && !shape(widget, "s1").hasAttribute("data-ww-dragging"), "a click on another shape picks that one up instead");
    click(document.body);
    assert(!swatch(widget, "square").hasAttribute("data-ww-dragging"), "a click outside the widget ends the pick-up");
    await settled(widget);

    click(shape(widget, "s1"));
    click(trash(widget));
    await glided(widget);
    equal(shapes(widget), [], "and the trash deletes by click");
});

check("permission: without it nothing can be picked up, and it is taken back in the middle of a drag", async () => {
    const widget = await mount<Palette>(markup([{ id: "s1", type: "square", x: 40, y: 40 }], ""));
    const seen = commits(widget);
    equal([swatch(widget, "circle").hasAttribute("data-ww-drag"), getComputedStyle(shape(widget, "s1")).touchAction], [false, "auto"], "nothing is marked and touch scrolling stays on");
    await drag(shape(widget, "s1"), onCanvas(widget, 200, 100));
    click(shape(widget, "s1"));
    shape(widget, "s1").focus();
    key(" ");
    key("ArrowRight");
    key("Enter");
    await glided(widget);
    equal([shapes(widget), seen.length], [["s1:square@40,40"], 0]);

    widget.setAttribute("allow-arranging", "");
    await settled(widget);
    equal(getComputedStyle(shape(widget, "s1")).touchAction, "none", "granted: a touch on a shape drags instead of scrolling");
    await hold(shape(widget, "s1"), onCanvas(widget, 200, 100));
    equal(shape(widget, "s1").getAnimations().length, 1, "the drag runs");
    widget.removeAttribute("allow-arranging");
    await settled(widget);
    await glided(widget);
    equal([shape(widget, "s1").getAnimations().length, live(widget)], [0, "Cancelled. This is no longer allowed here."], "the shape is put back and the reader is told why");
    pointer(shape(widget, "s1"), "pointerup", onCanvas(widget, 200, 100));
    await glided(widget);
    equal([shapes(widget), seen.length], [["s1:square@40,40"], 0]);
});

check("cleanup: a disconnect in the middle of a pick-up leaves no listener and no module element", async () => {
    const outside = listeners();
    const types = listenerTypes();
    const widget = await mount<Palette>(markup([{ id: "s1", type: "square", x: 40, y: 40 }]));
    equal(addedListeners(types), ["online"], "while nothing is picked up: the module text listens for the browser coming back online, to ask again for a catalog that could not be loaded");
    const before = listeners();
    click(shape(widget, "s1"));
    assert(listeners() > before, "a pick-up by click listens on the window for Escape and for a click elsewhere");
    key("Escape", window);
    equal(listeners(), before, "Escape ends it, also without focus in the widget");
    shape(widget, "s1").focus();
    key(" ");
    key("ArrowRight");
    assert(shape(widget, "s1").getAnimations().length === 1, "the shape is lifted");
    const held = shape(widget, "s1");
    widget.remove();
    equal([listeners(), held.getAnimations().length, held.hasAttribute("data-ww-dragging")], [outside, 0, false]);
    assert(!root(widget).querySelector("[data-ww-drag-overlay], [data-ww-live]"), "overlay and live region are gone");
});

run();
