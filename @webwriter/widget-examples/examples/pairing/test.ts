import { assert, check, deepActive, drag, equal, events, key, listeners, mount, mutations, point, pointer, run, settled, transactionSteps, until } from "../../test/harness";
import type { DragCommitDetail, DragPickDetail } from "@webwriter/widget/drag";
import { click, glided, hold, moveTo } from "../shared/sort-input";
import type { Pairing } from "./index";
import "./index";

const root = (widget: Element) => widget.shadowRoot!;
const term = (widget: Element, id: string) => root(widget).querySelector<HTMLElement>(`.term[data-ww-key="${id}"]`)!;
const definition = (widget: Element, id: string) => root(widget).querySelector<HTMLElement>(`.definition[data-id="${id}"]`)!;
const connector = (widget: Element) => root(widget).querySelector<SVGLineElement>("[data-ww-drag-connector]");
const ends = (line: SVGLineElement) => ["x1", "y1", "x2", "y2"].map((name) => Number(line.getAttribute(name)));
const candidates = (widget: Element) => [...root(widget).querySelectorAll<HTMLElement>("[data-ww-drop-candidate]")].map((target) => target.dataset.id);
const live = (widget: Element) => root(widget).querySelector("[data-ww-live]")!.textContent!.trim();
const near = (a: number, b: number, tolerance = 0.6) => Math.abs(a - b) <= tolerance;
const markup = (links: Record<string, string> = {}, attributes = "") => `<ww-pairing ${attributes} links='${JSON.stringify(links)}'></ww-pairing>`;
const marks = "[data-ww-drag-overlay], [data-ww-dragging], [data-ww-drop-candidate], [data-ww-drop-over]";

function commits(widget: Element): DragCommitDetail[] {
    const seen: DragCommitDetail[] = [];
    widget.addEventListener("ww-dragcommit", (event) => void seen.push((event as CustomEvent<DragCommitDetail>).detail));
    return seen;
}

check("link: a drag draws a connector from the term to the pointer and commits the pair; nothing is lifted", async () => {
    const widget = await mount<Pairing>(markup());
    const cell = term(widget, "cell");
    const target = definition(widget, "cell");
    const seen = commits(widget);
    const log = events("ww-dragpick", "ww-transactionstart", "ww-dragcommit", "ww-transactionend");
    const places = [...root(widget).querySelectorAll(".term")].map((each) => each.getBoundingClientRect().top);

    await hold(cell, point(target));
    equal([cell.getAnimations().length, cell.style.length], [0, 0], "the term stays where it is");
    const line = connector(widget);
    assert(line, "a connector is drawn");
    assert(line.closest("[data-ww-drag-overlay]")!.matches(":popover-open"), "in the top layer");
    const [x1, y1, x2, y2] = ends(line);
    assert(near(x1, point(cell).x) && near(y1, point(cell).y), "it starts at the term");
    assert(near(x2, point(target).x) && near(y2, point(target).y), "and ends at the pointer");
    equal(candidates(widget), ["enzyme", "cell", "organ", "gene"], "every definition that accepts a term is a candidate");
    assert(cell.hasAttribute("data-ww-dragging") && target.hasAttribute("data-ww-drop-over"), "the term and the definition under the pointer are marked");
    await moveTo(cell, point(target, 0.2, 0.5));
    assert(near(ends(connector(widget)!)[2], point(target, 0.2, 0.5).x), "the connector follows the pointer");
    equal(widget.links, {}, "nothing changes before the release");

    pointer(cell, "pointerup", point(target, 0.2, 0.5));
    await settled(widget);
    equal(widget.links, { cell: "cell" });
    equal(JSON.parse(widget.getAttribute("links")!), { cell: "cell" }, "the links are in the attribute");
    equal(log.stop(), ["ww-dragpick", "ww-transactionstart", "ww-dragcommit", "ww-transactionend"]);
    const [detail] = seen;
    equal([detail.effect, detail.key, detail.kind, detail.index, detail.x, detail.slot], ["link", "cell", "term", null, null, null]);
    assert(detail.item === cell && detail.target === target && detail.source === null && detail.displaced === null, "the commit carries where the link starts and where it ends");
    assert(!root(widget).querySelector(marks), "the connector and every mark are gone");
    equal([root(widget).querySelectorAll(".board > svg line").length, target.getAttribute("data-ww-drop-linked")], [1, "cell"], "the widget draws the link and declares it on the definition");
    equal([...root(widget).querySelectorAll(".term")].map((each) => each.getBoundingClientRect().top), places, "no term moved");
});

check("link: Escape, and a release beside every definition, change nothing", async () => {
    const widget = await mount<Pairing>(markup());
    const log = events("ww-dragcommit", "ww-transactionstart");
    await drag(term(widget, "gene"), definition(widget, "gene"), {
        cancel: true,
        held: () => assert(connector(widget), "the link was being drawn"),
    });
    assert(!root(widget).querySelector(marks), "Escape removes the connector and the marks");
    const box = widget.getBoundingClientRect();
    await drag(term(widget, "gene"), { x: box.right + 60, y: box.bottom + 60 });
    equal([widget.links, log.stop()], [{}, []]);
});

check("capacity: a definition that has a term takes no other; dropping its own term on it is no commit", async () => {
    const widget = await mount<Pairing>(markup({ cell: "cell" }));
    const seen = commits(widget);
    await drag(term(widget, "gene"), definition(widget, "cell"), {
        held: () => equal(candidates(widget), ["enzyme", "organ", "gene"], "the full definition is no candidate"),
    });
    equal([widget.links, seen.length], [{ cell: "cell" }, 0], "a release on it commits nothing");

    const log = events("ww-dragcommit", "ww-transactionstart");
    await drag(term(widget, "cell"), definition(widget, "cell"), {
        held: () => equal(candidates(widget), ["enzyme", "cell", "organ", "gene"], "for the term it holds, the definition is not full"),
    });
    equal([widget.links, log.stop()], [{ cell: "cell" }, []], "the link exists already: no commit and no transaction");
});

check("re-linking: a term dragged to another definition changes its link; with replace a full definition hands its term back", async () => {
    const widget = await mount<Pairing>(markup({ cell: "cell" }));
    const seen = commits(widget);
    await drag(term(widget, "cell"), definition(widget, "organ"));
    equal(widget.links, { cell: "organ" }, "the term has one link, the new one");
    assert(seen[0].displaced === null && !definition(widget, "cell").hasAttribute("data-ww-drop-linked"), "the old definition is free again");

    widget.replace = true;
    await settled(widget);
    await drag(term(widget, "gene"), definition(widget, "organ"), {
        held: () => equal(candidates(widget), ["enzyme", "cell", "organ", "gene"], "with swap a full definition stays a candidate"),
    });
    assert(seen[1].displaced === term(widget, "cell"), "the commit names the term that was linked there");
    equal(widget.links, { gene: "organ" }, "and the widget dropped its link");
});

check("undo: Check and the × of a link are one undo step each, and the step holds the links attribute", async () => {
    const widget = await mount<Pairing>(markup({ cell: "organ", gene: "gene", enzyme: "enzyme" }));
    const steps = transactionSteps(widget, () => Object.keys(JSON.parse(widget.getAttribute("links")!)).join());
    root(widget).querySelector<HTMLButtonElement>("button.check")!.click();
    await until(() => widget.getAttribute("links") === JSON.stringify({ gene: "gene", enzyme: "enzyme" }), "Check did not reach the attribute");
    await settled(widget);
    definition(widget, "gene").querySelector("button")!.click();
    await until(() => widget.getAttribute("links") === JSON.stringify({ enzyme: "enzyme" }), "× did not reach the attribute");
    await settled(widget);
    // Each step starts before Lit wrote the attribute and ends after it: the editor undoes the write as one step.
    equal(steps.stop(), ["start cell,gene,enzyme", "end gene,enzyme", "start gene,enzyme", "end enzyme"]);

    const quiet = transactionSteps(widget, () => widget.getAttribute("links"));
    const writes = mutations(widget);
    widget.check();
    await settled(widget);
    equal([quiet.stop(), writes.stop().length], [[], 0], "a Check that finds nothing wrong writes nothing and is no undo step");
});

check("ww-dragpick: a handler filters the candidates by the dragged term and the model, and can refuse the pick-up", async () => {
    const widget = await mount<Pairing>(markup({ cell: "organ", gene: "gene" }));
    widget.check();
    await settled(widget);
    equal([widget.links, widget.rejected], [{ gene: "gene" }, { cell: ["organ"] }], "Check removed the wrong link and remembers it");
    const seen = commits(widget);
    const picks: DragPickDetail[] = [];
    // In the capture phase: what the module offered, before the widget's handler filtered it.
    const offered = (event: Event) => {
        const { detail } = event as CustomEvent<DragPickDetail>;
        picks.push({ ...detail, candidates: [...detail.candidates] });
    };
    widget.addEventListener("ww-dragpick", offered, { capture: true });

    await drag(term(widget, "cell"), definition(widget, "organ"), {
        held: () => equal(candidates(widget), ["enzyme", "cell"], "the rejected definition is no candidate for this term; the one that is full was never offered"),
    });
    equal([picks.length, seen.length, widget.links], [1, 0, { gene: "gene" }], "one ww-dragpick per pick-up, and a release on the filtered target commits nothing");
    const [pick] = picks;
    equal([pick.key, pick.kind, pick.effect, pick.candidates.map((target) => target.dataset.id)], ["cell", "term", "link", ["enzyme", "cell", "organ"]]);
    assert(pick.item === term(widget, "cell") && pick.source === null, "the event names the item");

    await drag(term(widget, "enzyme"), definition(widget, "organ"));
    equal(widget.links, { gene: "gene", enzyme: "organ" }, "another term may still go there");

    const refuse = (event: Event) => event.preventDefault();
    widget.addEventListener("ww-dragpick", refuse);
    await drag(term(widget, "cell"), definition(widget, "cell"), {
        held: () => assert(!connector(widget) && !root(widget).querySelector(marks), "a cancelled ww-dragpick starts no drag"),
    });
    term(widget, "cell").focus();
    key(" ");
    key("ArrowDown");
    key("Enter");
    click(term(widget, "cell"));
    click(definition(widget, "cell"));
    await settled(widget);
    equal(widget.links, { gene: "gene", enzyme: "organ" }, "nor a pick-up by keyboard or by click");
    widget.removeEventListener("ww-dragpick", refuse);
    widget.removeEventListener("ww-dragpick", offered, { capture: true });
});

check("keyboard: Space on a term, the arrow keys through the definitions it may go to, Enter links", async () => {
    const widget = await mount<Pairing>(markup());
    const cell = term(widget, "cell");
    cell.focus();
    key(" ");
    equal(live(widget), "Linking Cell. Use the arrow keys to choose what to link it to, Enter to link, Escape to cancel.");
    assert(!connector(widget), "no connector before a definition is chosen");
    key("ArrowDown");
    equal(live(widget), "A protein that speeds up a reaction");
    const [x1, y1, x2, y2] = ends(connector(widget)!);
    const target = definition(widget, "enzyme");
    assert(near(x1, point(cell).x) && near(y1, point(cell).y) && near(x2, point(target).x) && near(y2, point(target).y), "the connector runs from the term to the chosen definition");
    assert(target.hasAttribute("data-ww-drop-over"), "which is marked");
    key("ArrowDown");
    equal(live(widget), "The smallest unit of life");
    key("ArrowUp");
    equal(widget.links, {}, "nothing changes before Enter");
    key("Enter");
    await settled(widget);
    equal([widget.links, live(widget)], [{ cell: "enzyme" }, "Linked Cell to A protein that speeds up a reaction."]);
    assert(deepActive() === cell && !root(widget).querySelector(marks), "focus is on the term and the connector is gone");

    term(widget, "gene").focus();
    key("Enter");
    key("ArrowUp");
    equal(live(widget), "A stretch of DNA that codes for a product", "upwards the stepping starts at the last candidate");
    key("ArrowDown");
    equal(live(widget), "The smallest unit of life", "and wraps around past the definition that is full");
    key("Escape");
    equal([widget.links, live(widget), !!connector(widget)], [{ cell: "enzyme" }, "Cancelled.", false]);
});

check("click: a click on a term and then on a definition links them; a button inside a definition keeps its click", async () => {
    const widget = await mount<Pairing>(markup());
    const seen = commits(widget);
    click(term(widget, "cell"));
    assert(term(widget, "cell").hasAttribute("data-ww-dragging") && candidates(widget).length === 4, "the term is picked up");
    assert(/^Selected Cell\./.test(live(widget)), `announced: "${live(widget)}"`);
    click(definition(widget, "cell"));
    await settled(widget);
    equal([widget.links, live(widget)], [{ cell: "cell" }, "Linked Cell to The smallest unit of life."]);

    click(term(widget, "gene"));
    const remove = definition(widget, "cell").querySelector("button")!;
    click(remove);
    await settled(widget);
    equal([widget.links, seen.length], [{}, 1], "the button removed the link, and the click was not taken as a drop");
    assert(!root(widget).querySelector(marks), "the pick-up is over");
});

check("cleanup: a disconnect while a link is drawn removes the connector and every listener", async () => {
    const before = listeners();
    const widget = await mount<Pairing>(markup());
    const log = events("ww-dragcommit", "ww-transactionstart");
    await hold(term(widget, "cell"), point(definition(widget, "cell")));
    assert(connector(widget), "the link was being drawn");
    widget.remove();
    assert(!root(widget).querySelector("[data-ww-drag-overlay], [data-ww-live], [data-ww-dragging]"), "connector, live region and mark are gone");
    pointer(document.body, "pointerup", { x: 5, y: 5 });
    await glided(widget);
    equal(log.stop(), [], "and commits nothing");
    equal(listeners(), before);
});

run();
