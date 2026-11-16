import { ModuleCore, type CoreOptions } from "./base.js";
import { type World } from "./drag/geometry.js";
import { type DragMessages } from "./messages/drag/index.js";
import { type MessagesOption } from "./messages.js";
export { dragMessages, type DragMessages } from "./messages/drag/index.js";
/** What a drag does with its item: move it, leave it and create another, or connect it to the target. */
export type DragEffect = "move" | "copy" | "link";
/** `detail` of `ww-dragcommit`, dispatched on the target. */
export type DragCommitDetail = {
    /** The dragged element. For a link, where the link starts. Read its data in the handler; do not keep the element. */
    item: HTMLElement;
    /** The item's `data-ww-key`. */
    key: string | undefined;
    kind: string;
    /** `move`: the item goes to the target. `copy`: it stays, and the widget creates what the target receives. `link`: nothing moves, the widget records the connection. */
    effect: DragEffect;
    /** The target the item sits in, if it sits in one. */
    source: HTMLElement | null;
    target: HTMLElement;
    /** With `data-ww-drop-full="swap"`: the item that a full target hands back. */
    displaced: HTMLElement | null;
    /** With `data-ww-drop-position="index"`: the item's new index among the target's other items. */
    index: number | null;
    /** With `data-ww-drop-position="index"`: the item it lands in front of, or null at the end. */
    before: HTMLElement | null;
    /**
     * With `data-ww-drop-position="point"`: where the item's top-left corner
     * lands, in the target's own coordinates, the ones `left` and `top` of an
     * absolutely positioned child are measured in. Snapped to `data-ww-drop-grid`.
     * With `data-ww-drop-space="world"`: world coordinates of the viewport the
     * target is the window of, under the view's pan and zoom, with the grid in
     * world units.
     */
    x: number | null;
    y: number | null;
    /** For a slotted item that moves: the name of the target's slot, which the module writes to the item's `slot` attribute. */
    slot: string | null;
};
/** `detail` of `ww-dragpick`, dispatched on the item when it is picked up. */
export type DragPickDetail = {
    item: HTMLElement;
    key: string | undefined;
    kind: string;
    effect: DragEffect;
    source: HTMLElement | null;
    /**
     * The targets the item may go to. A handler removes entries or assigns a
     * shorter list. Targets it adds are ignored.
     */
    candidates: HTMLElement[];
};
/**
 * The viewport of a point target in world coordinates
 * (`data-ww-drop-space="world"`): `viewport.core` of the Lit binding, or a
 * `ViewportCore`. `autoPan` is optional: if it is there, the view pans while
 * the pointer is held at the edge of the window during a drag to such a target.
 */
export type DragViewport = World & {
    autoPan?(clientX: number, clientY: number): boolean;
};
/** Options of `DragCore`. */
export type DragOptions = CoreOptions & {
    /** The viewport that a target marked `data-ww-drop-space="world"` is the window of. */
    viewport?: DragViewport;
    /** Asked before a drag starts, while it runs and before it commits. Return false to refuse. */
    can?: () => boolean;
    /** Resolves when the widget has rendered a model change. Lit: `() => host.updateComplete`. */
    rendered?: () => Promise<unknown>;
    /** Entries that replace the module's texts in every language. */
    messages?: MessagesOption<DragMessages>;
    /** Extra style of the lifted item, as one keyframe. */
    lift?: Keyframe;
    /** Duration of the settle animation in ms. Default 200. */
    duration?: number;
    /** Easing of the settle animation. */
    easing?: string;
};
/** The state of `DragCore`. */
export type DragSnapshot = {
    /** The item being dragged, or picked up with the keyboard or a click. */
    readonly item: HTMLElement | null;
    readonly via: "pointer" | "keyboard" | "click" | null;
};
/**
 * Dragging, declared in the shadow template:
 *
 * - `data-ww-drag="kind"` on an item, with `data-ww-key` as its identity, or on
 *   a `<slot>`, which makes the assigned (authored) elements the items
 * - `data-ww-drag-handle` on a part of an item: only this part starts the drag.
 *   On a `<slot data-ww-drag>` it says that the assigned elements carry their own
 *   handle, marked the same way in their light DOM or open shadow root.
 * - `data-ww-drag-effect="move|copy|link"` on an item (or its slot). `copy`
 *   leaves the item where it is: the commit tells the widget what to create
 *   and where. `link` lifts nothing: a connector is drawn from the item to the
 *   pointer, and the commit names the item and the target.
 * - `data-ww-drag-axis="x|y"` on an item: it only moves along this axis
 * - `data-ww-drag-via="pointer keyboard click"` on an item (or its slot): the
 *   ways it is picked up, for an item whose click or keys mean something else.
 *   Without it: all three. An item that leaves out `keyboard` needs another
 *   way to be moved without a pointer.
 * - `data-ww-drop="kind …"` on a target
 * - `data-ww-drop-position="index"`: the target also resolves a place among its
 *   items. `"point"`: it resolves a point on its surface, snapped to
 *   `data-ww-drop-grid="step"`. With `data-ww-drop-space="world"` on a target
 *   that is the window of a canvas viewport (the `viewport` option), the
 *   point is in the viewport's world coordinates, and the view pans while the
 *   pointer is held at the edge of the window.
 * - `data-ww-drop-max="n"` for capacity; `data-ww-drop-full="swap"` to accept an
 *   item when full and report the occupant as `displaced`
 * - `data-ww-drop-linked="key …"` on a target of links: the keys of the items
 *   linked to it, so that capacity, swap and "already there" hold for links too
 * - `data-ww-label` on an item or target: its name in announcements (optional)
 *
 * At pick-up the module dispatches a cancelable `ww-dragpick` on the item,
 * whose handler may filter the candidates. On release it dispatches a
 * cancelable `ww-dragcommit` on the target, inside one undo transaction. A
 * slotted item is then moved by the module. For a shadow-rendered item the
 * widget updates its model in the handler and the module animates every item
 * from where it was to where the new render put it. Nothing is committed on
 * Escape, pointercancel or a release outside a target.
 *
 * An item is picked up by dragging it, by Space or Enter, or by a click; a
 * click on a target, or arrow keys and Enter, drop it.
 *
 * Styling hooks, set on shadow elements only: `data-ww-dragging` (shadow-rendered
 * items), `data-ww-drop-candidate`, `data-ww-drop-over`, and the module's own
 * elements `[data-ww-drop-marker]` (`part="ww-drop-marker"`) and
 * `[data-ww-drag-connector]` (`part="ww-drag-connector"`).
 */
export declare class DragCore extends ModuleCore<DragSnapshot> {
    #private;
    constructor(host: HTMLElement, options?: DragOptions);
    getSnapshot(): DragSnapshot;
    protected onConnect(): void;
    protected onRefresh(): void;
}
