// Input for the Drag checks that the harness does not have: a mouse click, a
// drag that is held, and a plain element that runs Drag on a shadow tree
// written in the page.
import { animations, frame, point, pointer, type Point } from "../../test/harness";
import { DragCore, type DragCommitDetail, type DragMessages, type DragOptions, type DragPickDetail } from "@webwriter/widget/drag";
import type { MessagesOption } from "@webwriter/widget/messages";

/** A click as a mouse makes it: press, release and click at one point of `target`. */
export function click(target: Element, at: Point = point(target), init: MouseEventInit = {}): boolean {
    pointer(target, "pointerdown", at);
    pointer(target, "pointerup", at);
    return target.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, cancelable: true, detail: 1, clientX: at.x, clientY: at.y, ...init }));
}

/** Presses on `from`, passes the threshold and moves to `to`. The drag is then held there. */
export async function hold(from: Element, to: Point): Promise<void> {
    const start = point(from);
    pointer(from, "pointerdown", start);
    pointer(from, "pointermove", { x: start.x + 6, y: start.y + 6 });
    await frame(2);
    pointer(from, "pointermove", to);
    await frame(2);
}

/** Moves a held drag. */
export async function moveTo(from: Element, to: Point): Promise<void> {
    pointer(from, "pointermove", to);
    await frame(2);
}

/**
 * Waits like `animations()` of the harness, and also for the animations in the
 * shadow tree of `widget`: `document.getAnimations()` does not list those, so
 * the settle animation of a shadow-rendered item would still be running.
 */
export async function glided(widget: Element): Promise<void> {
    await animations();
    const running = widget.shadowRoot?.getAnimations().filter((animation) => animation.playState === "running") ?? [];
    await Promise.all(running.map((animation) => animation.finished.catch(() => {})));
    await frame(2);
}

/**
 * `<ww-drag-fixture>`: Drag on whatever shadow tree the check writes with
 * `<template shadowrootmode="open">`. It stands in for a widget without a
 * framework: on a commit it moves a shadow-rendered item itself, the way a
 * widget would change its model, and it records what the module reported.
 */
export class DragFixture extends HTMLElement {
    /** The answer of `can`. `asked` counts the questions. */
    can: () => boolean = () => true;
    asked = 0;
    duration = 60;
    lift: Keyframe | undefined;
    messages: MessagesOption<DragMessages> | undefined;
    /** Called with every pick-up, before the module reads `detail.candidates` back. */
    onpick: ((event: CustomEvent<DragPickDetail>) => void) | undefined;
    readonly commits: DragCommitDetail[] = [];
    readonly picks: DragPickDetail[] = [];
    readonly drag: DragCore;

    constructor() {
        super();
        const fixture = this;
        const options: DragOptions = {
            can: () => (fixture.asked++, fixture.can()),
            messages: () => (typeof fixture.messages === "function" ? fixture.messages() : (fixture.messages ?? {})),
            get duration() {
                return fixture.duration;
            },
            get lift() {
                return fixture.lift;
            },
        };
        this.drag = new DragCore(this, options);
        this.addEventListener("ww-dragpick", (event) => {
            const pick = event as CustomEvent<DragPickDetail>;
            this.picks.push({ ...pick.detail, candidates: [...pick.detail.candidates] });
            this.onpick?.(pick);
        });
        this.addEventListener("ww-dragcommit", (event) => {
            if (event.defaultPrevented) return;
            const { detail } = event as CustomEvent<DragCommitDetail>;
            this.commits.push(detail);
            const { item, target, before, effect, x, y } = detail;
            if (item.getRootNode() !== this.shadowRoot || effect === "link") return;
            // The "model" of the fixture is its shadow tree.
            const moved = effect === "copy" ? (item.cloneNode(true) as HTMLElement) : item;
            if (effect === "copy") moved.setAttribute("data-ww-key", `${item.dataset.wwKey}-copy${this.commits.length}`);
            if (x !== null && y !== null) moved.setAttribute("style", `left:${x}px;top:${y}px`);
            if (detail.index !== null || moved.parentNode !== target) target.insertBefore(moved, before);
            this.drag.refresh();
        });
    }

    connectedCallback() {
        this.drag.connect();
    }

    disconnectedCallback() {
        this.drag.disconnect();
    }

    /** Renders the whole shadow tree anew, as a framework without keyed updates does: every node is another one afterwards. */
    rerender() {
        const root = this.shadowRoot!;
        const fresh = document.createElement("template");
        fresh.innerHTML = root.innerHTML;
        // A framework renders its own template: nothing the module added or marked is in it.
        for (const added of fresh.content.querySelectorAll("[data-ww-live], [data-ww-drag-overlay]")) added.remove();
        for (const element of fresh.content.querySelectorAll("*")) {
            for (const name of ["data-ww-dragging", "data-ww-drop-candidate", "data-ww-drop-over", "tabindex"]) element.removeAttribute(name);
        }
        root.replaceChildren(fresh.content);
        this.drag.refresh();
    }
}
if (!customElements.get("ww-drag-fixture")) customElements.define("ww-drag-fixture", DragFixture);
