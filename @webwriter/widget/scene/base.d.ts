import { type MessagesOption } from "../messages.js";
import { SceneGroup, SceneImage, SceneItem, SceneNode, ScenePath, SceneShape } from "./elements.js";
import { type SceneMessages } from "../messages/scene/index.js";
import { SceneMirror } from "./mirror.js";
export type { Drawing, Frame, PathLabel, PortEnd, SceneErrorDetail, SceneView, Style, TextFont, TextSize } from "./mirror.js";
/** What a reader can do in a scene. `can` is asked with one of these. */
export type SceneAction = "select" | "move" | "resize" | "connect";
/** `detail` of `ww-select`: the items that should now be selected. */
export type SelectDetail = {
    keys: string[];
    items: SceneItem[];
};
/** Where the pointer was: in scene coordinates (`x`, `y`) and in client coordinates. */
export type PointerPoint = {
    x: number;
    y: number;
    clientX: number;
    clientY: number;
};
/**
 * `detail` of `ww-move`: every moved item with its new position, and the movement of the item the event is dispatched on.
 * `pointer` is where the pointer was at the end of a move by pointer, and null for a move by keyboard.
 */
export type MoveDetail = {
    items: {
        key: string;
        item: SceneItem;
        x: number;
        y: number;
    }[];
    dx: number;
    dy: number;
    pointer: PointerPoint | null;
};
/**
 * `detail` of `ww-moving`, which is sent on the item that leads a move, for every step of it (`state` is `move`) and
 * once more after it, when the preview is gone (`end`). It writes nothing and cannot be cancelled. `items` are
 * where the items are shown now: previewed during the move, where the attributes put them at its end.
 * `committed` is true at its end if the widget took the move (`ww-move`).
 */
export type MovingDetail = MoveDetail & {
    state: "move" | "end";
    committed: boolean;
};
/** `detail` of `ww-resize`: the item with its new position and size. A node, or a rect or an image that is `resizable`. */
export type ResizeDetail = {
    key: string;
    item: SceneNode | SceneShape | SceneImage;
    x: number;
    y: number;
    width: number;
    height: number;
};
/** `detail` of `ww-resizing`, which is sent on the item for every step of a resize (`state` is `resize`) and once after it (`end`): the sizes are previewed, then the ones the attributes give. It writes nothing. */
export type ResizingDetail = ResizeDetail & {
    state: "resize" | "end";
    committed: boolean;
};
/** `detail` of `ww-connect`: both ends as `node:port` (a bare `node` for a whole node), the kind of the wire and the two port elements. `pointer` is null for a wire made by keyboard. */
export type ConnectDetail = {
    from: string;
    to: string;
    kind: string;
    source: HTMLElement;
    target: HTMLElement;
    pointer: PointerPoint | null;
};
/**
 * `detail` of `ww-reconnect`: an end of an attached `rewire` path was taken to another port. `from` and `to`
 * are the ends the path should have now, `previous` the ones it has, `end` the end that moved. `source` and `target`
 * are the elements at `from` and at `to`.
 */
export type ReconnectDetail = {
    path: ScenePath;
    end: "from" | "to";
    from: string;
    to: string;
    previous: {
        from: string;
        to: string;
    };
    kind: string;
    source: HTMLElement;
    target: HTMLElement;
    pointer: PointerPoint | null;
};
/** `detail` of `ww-disconnect`: an end of an attached `rewire` path was dropped where no port is, or put down by a click on empty scene background. `from` and `to` are the ends it has, `end` the one that was pulled off. */
export type DisconnectDetail = {
    path: ScenePath;
    end: "from" | "to";
    from: string;
    to: string;
    kind: string;
    pointer: PointerPoint | null;
};
/**
 * `detail` of `ww-connecting`, which is sent on the port a wire is held at, for every step while it is held (`state` is `move`)
 * and once when it is put down (`end`). `from` and `to` are the ends the wire has if it is dropped now: the end
 * that has no port under it is null. `source` is the element the wire is held at, `target` the port it is over, or null.
 * `path` and `end` are set for an end of an existing path that is moved. The event of `move` is cancelable: if a listener
 * cancels it, the scene draws no pending wire and the widget draws its own.
 */
export type ConnectingDetail = {
    from: string | null;
    to: string | null;
    kind: string;
    source: HTMLElement;
    target: HTMLElement | null;
    state: "move" | "end";
    via: "pointer" | "click" | "keyboard";
    pointer: PointerPoint | null;
    path: ScenePath | null;
    end: "from" | "to" | null;
};
/**
 * `detail` of `ww-activate` and the part of `ww-context` that says what was hit. `item` is the item that a click acts on, as
 * `ww-select` would report it: the nearest of the pressed item and the groups around it that is selectable or movable (or the
 * pressed item itself); `hit` is the item that was pressed, which is inside the group if the press was; `groups` are the
 * groups around it, the nearest first; `target` is the element that was pressed, inside a node's content for example.
 */
export type HitDetail = {
    key: string;
    item: SceneItem;
    hit: SceneItem;
    groups: SceneGroup[];
    target: Element | null;
};
/** `detail` of `ww-activate`. `count` is 2 for a double click. */
export type ActivateDetail = HitDetail & {
    via: "pointer" | "keyboard";
    count: number;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    pointer: PointerPoint | null;
};
/** What an item is, as `ww-context` names it. */
export type HitKind = "node" | "path" | "shape" | "text" | "image" | "group" | "sprites";
/**
 * `detail` of `ww-context`, for a context menu on an item (`kind` says what, `hit` is the one that was hit, `item` the one a click would act on and
 * `groups` the groups around it) or on the background (`kind` is `background`, `hit` and `item` are null). `point` is where, and for the keyboard the middle of the item.
 */
export type ContextDetail = {
    kind: HitKind | "background";
    key: string;
    item: SceneItem | null;
    hit: SceneItem | null;
    groups: SceneGroup[];
    target: Element | null;
    point: PointerPoint;
    via: "pointer" | "keyboard" | "touch";
};
/** `detail` of `ww-background`: a `click`, `dblclick` or `longpress` on a background that nothing is on. */
export type BackgroundDetail = {
    gesture: "click" | "dblclick" | "longpress";
    point: PointerPoint;
    pointerType: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
};
/** What the widget gives a scene as its undo host: an element, `outermost` for the outermost host above the scene, or a function. */
export type UndoHost = Element | "outermost" | (() => Element | null);
/**
 * Base class of `ww-scene`: the description (`SceneMirror`) plus everything a
 * reader does with it. A renderer extends it.
 */
export declare abstract class SceneBase extends SceneMirror {
    #private;
    /**
     * Asked before a reader's selection, move, resize or connection, during it and before it commits. Set by the module core.
     * For a connection that starts or ends at a port it gets the port element as a third argument.
     */
    can: ((action: SceneAction, item: Element, port?: Element) => boolean) | null;
    /**
     * The element an undo step is opened on: the widget that the editor knows. Without it the host of the shadow root the
     * scene is in, which is not that widget if the scene is in a component inside the widget. Set by the module core.
     */
    undoHost: UndoHost | null;
    /** Resolves when the widget has rendered a model change. Set by the module core. */
    rendered: (() => Promise<unknown>) | null;
    /** Watches an answer for the length of an interaction (`ModuleCore.whileAllowed`). Set by the module core. */
    whileAllowed: ((can: () => boolean, until: AbortSignal) => AbortSignal) | null;
    /** Entries that replace the module's own texts. Set by the module core. */
    messages: MessagesOption<SceneMessages> | undefined;
    /** Called when `marquee` changes. Set by the module core. */
    changed: (() => void) | null;
    protected connected(signal: AbortSignal): void;
    /** The `grid` attribute: moves and resizes snap to its multiples. 0 without a grid. */
    get grid(): number;
    /** The `move-step` attribute: how far an arrow key moves an item, in scene pixels (with Shift, five times as far). 0 without it: the grid, or 1 without a grid, and 10 with Shift. */
    get moveStep(): number;
    /** True while a marquee is drawn. A widget keeps its viewport still meanwhile: `can: () => !scene.marquee`. */
    get marquee(): boolean;
    /** The items the widget currently renders as `selected`. The scene keeps no selection of its own. */
    selection(): SceneItem[];
    protected synced(): void;
    protected zoomed(): void;
    protected measured(nodes: readonly SceneNode[]): void;
    /** A render is when the mode and the permissions change, and with them what a port offers. */
    protected refreshed(): void;
    protected dropped(item: SceneItem): void;
}
