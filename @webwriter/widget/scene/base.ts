// What a reader does in a `ww-scene`, whichever renderer draws it: selecting,
// moving, resizing and wiring, by pointer, by touch and by keyboard. Nothing
// here changes the document: every interaction previews, then ends in one
// cancelable event, and the widget applies it. That commit event (`ww-select`,
// `ww-move`, `ww-resize`, `ww-connect`, `ww-reconnect`, `ww-disconnect`) is the
// place to change the model.
//
// Besides it a scene reports, with events that change nothing and cannot be
// cancelled (except `ww-connecting` and `ww-context`, see below):
//
// - `ww-moving`, for every step of a move by pointer or by keyboard and once more
//   when it is over, with the previewed positions: a widget updates what depends on
//   a dragged item (a drawing that follows it) from this, and never writes the model.
//   `ww-move` and `ww-moving` carry where the pointer is (`pointer`, in scene and client
//   coordinates; null for the keyboard), so that a drop outside the model can be decided.
// - `ww-activate`, for every click or press of Enter or Space on an item, also on one that
//   is selected already, with the item, the scene item that was pressed inside a group and
//   the modifier keys. `ww-select` stays as it is: it reports what the selection becomes.
// - `ww-connecting`, while a wire is held: which port it is over. It is cancelable: a
//   widget that draws the pending wire itself cancels it and the scene draws none.
// - `ww-context` for a context menu, the menu key or a long press by touch: what was hit
//   (item, kind, groups around it) and where. Cancel it to keep the browser's menu away.
// - `ww-background`: a click, a double click or a long press on the background.
//
// Constraints are attributes of the item, read while it is moved or resized (see
// elements.ts); the keyboard step of a move is `move-step` of the scene.
import {announcer} from "../announce.js"
import {PointerGesture, type GestureSample} from "../gesture.js"
import {Messages, type MessagesOption} from "../messages.js"
import {sharedMessages} from "../messages/shared/index.js"
import {transaction} from "../transaction.js"
import {handlesOf, SceneGroup, SceneImage, SceneItem, SceneNode, ScenePath, SceneShape, SceneSprites, SceneText} from "./elements.js"
import {bounds, outlineContains, polyline, polylineHitsRect, rectsIntersect, snap, type Point, type Rect} from "./geometry.js"
import {sceneMessages, type SceneMessages} from "../messages/scene/index.js"
import {SceneMirror} from "./mirror.js"

export type {Drawing, Frame, PathLabel, PortEnd, SceneErrorDetail, SceneView, Style, TextFont, TextSize} from "./mirror.js"

/** What a reader can do in a scene. `can` is asked with one of these. */
export type SceneAction = "select" | "move" | "resize" | "connect"
/** `detail` of `ww-select`: the items that should now be selected. */
export type SelectDetail = {keys: string[]; items: SceneItem[]}
/** Where the pointer was: in scene coordinates (`x`, `y`) and in client coordinates. */
export type PointerPoint = {x: number; y: number; clientX: number; clientY: number}
/**
 * `detail` of `ww-move`: every moved item with its new position, and the movement of the item the event is dispatched on.
 * `pointer` is where the pointer was at the end of a move by pointer, and null for a move by keyboard.
 */
export type MoveDetail = {items: {key: string; item: SceneItem; x: number; y: number}[]; dx: number; dy: number; pointer: PointerPoint | null}
/**
 * `detail` of `ww-moving`, which is sent on the item that leads a move, for every step of it (`state` is `move`) and
 * once more after it, when the preview is gone (`end`). It writes nothing and cannot be cancelled. `items` are
 * where the items are shown now: previewed during the move, where the attributes put them at its end.
 * `committed` is true at its end if the widget took the move (`ww-move`).
 */
export type MovingDetail = MoveDetail & {state: "move" | "end"; committed: boolean}
/** `detail` of `ww-resize`: the item with its new position and size. A node, or a rect or an image that is `resizable`. */
export type ResizeDetail = {key: string; item: SceneNode | SceneShape | SceneImage; x: number; y: number; width: number; height: number}
/** `detail` of `ww-resizing`, which is sent on the item for every step of a resize (`state` is `resize`) and once after it (`end`): the sizes are previewed, then the ones the attributes give. It writes nothing. */
export type ResizingDetail = ResizeDetail & {state: "resize" | "end"; committed: boolean}
/** `detail` of `ww-connect`: both ends as `node:port` (a bare `node` for a whole node), the kind of the wire and the two port elements. `pointer` is null for a wire made by keyboard. */
export type ConnectDetail = {from: string; to: string; kind: string; source: HTMLElement; target: HTMLElement; pointer: PointerPoint | null}
/**
 * `detail` of `ww-reconnect`: an end of an attached `rewire` path was taken to another port. `from` and `to`
 * are the ends the path should have now, `previous` the ones it has, `end` the end that moved. `source` and `target`
 * are the elements at `from` and at `to`.
 */
export type ReconnectDetail = {
  path: ScenePath
  end: "from" | "to"
  from: string
  to: string
  previous: {from: string; to: string}
  kind: string
  source: HTMLElement
  target: HTMLElement
  pointer: PointerPoint | null
}
/** `detail` of `ww-disconnect`: an end of an attached `rewire` path was dropped where no port is. `from` and `to` are the ends it has, `end` the one that was pulled off. */
export type DisconnectDetail = {path: ScenePath; end: "from" | "to"; from: string; to: string; kind: string; pointer: PointerPoint | null}
/**
 * `detail` of `ww-connecting`, which is sent on the port a wire is held at, for every step while it is held (`state` is `move`)
 * and once when it is put down (`end`). `from` and `to` are the ends the wire has if it is dropped now: the end
 * that has no port under it is null. `source` is the element the wire is held at, `target` the port it is over, or null.
 * `path` and `end` are set for an end of an existing path that is moved. The event of `move` is cancelable: if a listener
 * cancels it, the scene draws no pending wire and the widget draws its own.
 */
export type ConnectingDetail = {
  from: string | null
  to: string | null
  kind: string
  source: HTMLElement
  target: HTMLElement | null
  state: "move" | "end"
  via: "pointer" | "click" | "keyboard"
  pointer: PointerPoint | null
  path: ScenePath | null
  end: "from" | "to" | null
}
/**
 * `detail` of `ww-activate` and the part of `ww-context` that says what was hit. `item` is the item that a click acts on, as
 * `ww-select` would report it: the nearest of the pressed item and the groups around it that is selectable or movable (or the
 * pressed item itself); `hit` is the item that was pressed, which is inside the group if the press was; `groups` are the
 * groups around it, the nearest first; `target` is the element that was pressed, inside a node's content for example.
 */
export type HitDetail = {key: string; item: SceneItem; hit: SceneItem; groups: SceneGroup[]; target: Element | null}
/** `detail` of `ww-activate`. `count` is 2 for a double click. */
export type ActivateDetail = HitDetail & {via: "pointer" | "keyboard"; count: number; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; pointer: PointerPoint | null}
/** What an item is, as `ww-context` names it. */
export type HitKind = "node" | "path" | "shape" | "text" | "image" | "group" | "sprites"
/**
 * `detail` of `ww-context`, for a context menu on an item (`kind` says what, `hit` is the one that was hit, `item` the one a click would act on and
 * `groups` the groups around it) or on the background (`kind` is `background`, `hit` and `item` are null). `point` is where, and for the keyboard the middle of the item.
 */
export type ContextDetail = {
  kind: HitKind | "background"
  key: string
  item: SceneItem | null
  hit: SceneItem | null
  groups: SceneGroup[]
  target: Element | null
  point: PointerPoint
  via: "pointer" | "keyboard" | "touch"
}
/** `detail` of `ww-background`: a `click`, `dblclick` or `longpress` on a background that nothing is on. */
export type BackgroundDetail = {gesture: "click" | "dblclick" | "longpress"; point: PointerPoint; pointerType: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean}
/** What the widget gives a scene as its undo host: an element, `outermost` for the outermost host above the scene, or a function. */
export type UndoHost = Element | "outermost" | (() => Element | null)

type Move = {lead: SceneItem; items: SceneItem[]; delta: Point; clamped: {x: boolean; y: boolean}; announced: boolean; boxes: Map<SceneItem, Rect | null>}
type KeyMove = {move: Move; sum: Point; held: Set<string>; timer: number; stop: AbortController}
/** `contains` is where a whole node takes a wire: its outline. A port takes it within reach of its middle. */
type Candidate = {node: SceneNode; element: HTMLElement; to: string; at: Point; kind: string; contains: ((point: Point) => boolean) | null}
type Wire = {
  node: SceneNode
  port: HTMLElement
  kind: string
  /** The end that stays where it is. */
  from: string
  start: Point
  candidates: Candidate[]
  /** The path whose end is moved, and which end, for a wire that is taken from a port. A new wire has none and takes its `to`. */
  path: ScenePath | null
  end: "from" | "to"
  announced: boolean
}
type KeyWire = {wire: Wire; index: number; stop: AbortController}
type Armed = {wire: Wire; stop: AbortController}
type Prepared = {state: string; added: Map<HTMLElement, string[]>}

const TYPING = "input, textarea, select, [contenteditable]"
const CONTROLS = `${TYPING}, button, a[href]`
const ARROWS: Record<string, Point> = {ArrowLeft: {x: -1, y: 0}, ArrowRight: {x: 1, y: 0}, ArrowUp: {x: 0, y: -1}, ArrowDown: {x: 0, y: 1}}
const isArrow = (key: string) => Object.hasOwn(ARROWS, key)
/** A reference without the colon of a port that has no name: `node:` and `node` are one place. */
const bare = (reference: string | null): string => (reference?.endsWith(":") ? reference.slice(0, -1) : (reference ?? ""))
/** How close, in scene pixels, a wire must come to a port to attach to it. */
const REACH = 24
/** How long a touch rests before it counts as a long press, in ms. */
const LONG_PRESS = 500
/** How long the arrow keys rest before a move by keyboard is committed, in ms. */
const KEY_REST = 600

/**
 * Base class of `ww-scene`: the description (`SceneMirror`) plus everything a
 * reader does with it. A renderer extends it.
 */
export abstract class SceneBase extends SceneMirror {
  /**
   * Asked before a reader's selection, move, resize or connection, during it and before it commits. Set by the module core.
   * For a connection that starts or ends at a port it gets the port element as a third argument.
   */
  can: ((action: SceneAction, item: Element, port?: Element) => boolean) | null = null
  /**
   * The element an undo step is opened on: the widget that the editor knows. Without it the host of the shadow root the
   * scene is in, which is not that widget if the scene is in a component inside the widget. Set by the module core.
   */
  undoHost: UndoHost | null = null
  /** Resolves when the widget has rendered a model change. Set by the module core. */
  rendered: (() => Promise<unknown>) | null = null
  /** Watches an answer for the length of an interaction (`ModuleCore.whileAllowed`). Set by the module core. */
  whileAllowed: ((can: () => boolean, until: AbortSignal) => AbortSignal) | null = null
  /** Entries that replace the module's own texts. Set by the module core. */
  messages: MessagesOption<SceneMessages> | undefined
  /** Called when `marquee` changes. Set by the module core. */
  changed: (() => void) | null = null

  #texts = new Messages<SceneMessages>(this, sceneMessages, () => {
    const override = this.messages
    return (typeof override === "function" ? override() : override) ?? {}
  })
  #shared = new Messages(this, sharedMessages)
  #say: (text: string) => void = () => {}
  #gesture: PointerGesture | null = null
  #marquee = false
  #keyMove: KeyMove | null = null
  #keyWire: KeyWire | null = null
  #prepared = new Map<SceneNode, Prepared>()
  #disconnected: AbortSignal | null = null
  #armed: Armed | null = null
  #lastTap: {time: number; x: number; y: number; item: SceneItem | null; count: number} | null = null
  /** When a long press by touch last sent `ww-context`: the browser's own `contextmenu` that follows it is not sent again. */
  #contextAt = -Infinity
  /** The scene item that a handle of the overlay resizes. */
  #handleItems = new WeakMap<Element, SceneShape | SceneImage>()
  #handleKey = ""
  #convert = (clientX: number, clientY: number) => this.toScene(clientX, clientY)

  protected override connected(signal: AbortSignal) {
    this.#disconnected = signal
    // The widget's one live region. A scene outside a shadow root stays silent.
    const root = this.getRootNode()
    if(root instanceof ShadowRoot) {
      const live = announcer(root)
      this.#say = live.announce
      signal.addEventListener("abort", live.release)
    }
    // The names of ports are written again in the new language.
    const unfollow = this.#texts.follow(() => this.refreshed())
    // Nothing shows the shared texts: following them only loads their catalog before it is needed.
    const unfollowShared = this.#shared.follow(() => {})
    this.addEventListener("pointerdown", this.#down, {signal})
    this.addEventListener("contextmenu", this.#context, {signal})
    this.addEventListener("click", this.#click, {signal})
    this.addEventListener("keydown", this.#key, {signal})
    this.addEventListener("keyup", this.#keyUp, {signal})
    this.addEventListener("focusout", this.#blur, {signal})
    // By touch the browser would pan or open its menu in the middle of a gesture the scene has claimed.
    const whileClaimed = (event: Event) => {
      if(this.#gesture?.down.pointerType === "touch" && event.cancelable) event.preventDefault()
    }
    this.addEventListener("touchmove", whileClaimed, {signal, passive: false})
    this.addEventListener("contextmenu", whileClaimed, {signal})
    signal.addEventListener("abort", () => {
      unfollow()
      unfollowShared()
      this.#gesture?.cancel()
      void this.#endKeyMove(false, true)
      this.#endKeyWire(false, true)
      this.#disarm()
      this.overlay.handles.replaceChildren()
      this.#handleKey = ""
      for(const node of [...this.#prepared.keys()]) this.#unprepare(node)
      this.#say = () => {}
    })
  }

  #allowed(action: SceneAction, item: Element, port?: Element): boolean {
    return this.can?.(action, item, port) !== false
  }

  /** Cancels a running interaction, and says so, when the reader may no longer do it. */
  #watch(can: () => boolean, until: AbortSignal, cancel: () => void) {
    const lost = this.whileAllowed?.(can, until)
    const stop = () => {
      this.#say(this.#shared.current.notAllowed)
      cancel()
    }
    if(lost?.aborted) stop()
    else lost?.addEventListener("abort", stop, {once: true})
  }

  /**
   * One undo step around a commit event. It stays open until the widget rendered,
   * because that render is where the document changes. `restore` then removes the
   * preview: the item is already where the preview showed it. Resolves to true
   * if the event was fired and no listener cancelled it.
   */
  async #commit(fire: (() => boolean) | null, restore: () => void): Promise<boolean> {
    const host = this.#undoHost()
    let accepted = false
    try {
      if(fire) {
        await transaction(host, async () => {
          accepted = fire()
          if(accepted) await this.rendered?.()
        })
      }
    } finally {
      restore()
      this.flush()
    }
    return accepted
  }

  /** The element the undo step is opened on (`undoHost`). */
  #undoHost(): Element {
    const own = (this.getRootNode() as ShadowRoot).host ?? this
    const wanted = this.undoHost
    if(wanted === "outermost") {
      let host: Element = own
      for(let root = host.getRootNode(); root instanceof ShadowRoot; root = host.getRootNode()) host = root.host
      return host
    }
    return (typeof wanted === "function" ? wanted() : wanted) ?? own
  }

  // ── Selection ─────────────────────────────────────────────────────────

  get #mode(): "none" | "single" | "multiple" {
    const value = this.getAttribute("select")
    return value === "single" || value === "multiple" ? value : "none"
  }

  /** The `grid` attribute: moves and resizes snap to its multiples. 0 without a grid. */
  get grid(): number {
    return parseFloat(this.getAttribute("grid") ?? "") || 0
  }

  /** The `move-step` attribute: how far an arrow key moves an item, in scene pixels (with Shift, five times as far). 0 without it: the grid, or 1 without a grid, and 10 with Shift. */
  get moveStep(): number {
    const value = parseFloat(this.getAttribute("move-step") ?? "")
    return value > 0 ? value : 0
  }

  /** True while a marquee is drawn. A widget keeps its viewport still meanwhile: `can: () => !scene.marquee`. */
  get marquee(): boolean {
    return this.#marquee
  }

  /** The items the widget currently renders as `selected`. The scene keeps no selection of its own. */
  selection(): SceneItem[] {
    return this.items.filter(item => item.hasAttribute("selected"))
  }

  /** Asks the widget to select exactly these items. False if the widget refused. */
  #select(items: SceneItem[]): boolean {
    const now = this.selection()
    if(now.length === items.length && items.every(item => now.includes(item))) return true
    return this.fire(this, "ww-select", {keys: items.map(item => item.key), items} satisfies SelectDetail)
  }

  #toggled(item: SceneItem): SceneItem[] {
    const now = this.selection()
    return now.includes(item) ? now.filter(other => other !== item) : [...now, item]
  }

  #selectable(): SceneItem[] {
    return this.items.filter(item => item.hasAttribute("selectable") && this.#allowed("select", item))
  }

  /** True for an item that has a position of its own and may be moved now. */
  #movable(item: SceneItem): boolean {
    if(!item.hasAttribute("movable") || item instanceof SceneSprites || (item instanceof ScenePath && item.attached)) return false
    return this.#allowed("move", item)
  }

  /** The item a press on `hit` acts on: the nearest of the item and the groups around it that is selectable or movable. */
  #acting(hit: SceneItem): SceneItem | null {
    for(let item: SceneItem | null = hit; item; item = this.groupOf(item)) {
      if(item.hasAttribute("selectable") || item.hasAttribute("movable")) return item
    }
    return null
  }

  /** Gives the keyboard to an item: a node itself, or the stand-in of a drawn item. */
  #focus(item: SceneItem) {
    const target = item instanceof SceneNode ? item : this.standInOf(item)
    if(target && target.tabIndex >= 0) target.focus({preventScroll: true})
  }

  /** What an event went to: the elements it passed, innermost first, the scene item among them and the elements in front of it. */
  #target(event: Event) {
    const path = event.composedPath()
    const inside = path.slice(0, path.indexOf(this)).filter((node): node is HTMLElement => node instanceof Element)
    const hit = inside.find((element): element is SceneItem => element instanceof SceneItem) ?? null
    const within = hit ? inside.slice(0, inside.indexOf(hit)) : inside
    return {inside, hit, within, control: within.some(element => element.matches(CONTROLS))}
  }

  /** A pointer position, in scene and in client coordinates. */
  #pointerOf(at: {clientX: number; clientY: number}): PointerPoint {
    return {...this.toScene(at.clientX, at.clientY), clientX: at.clientX, clientY: at.clientY}
  }

  /** A sample of a gesture, as a pointer position: its scene coordinates are the ones it was converted to. */
  #sampled(sample: GestureSample): PointerPoint {
    return {x: sample.x, y: sample.y, clientX: sample.clientX, clientY: sample.clientY}
  }

  #down = (event: PointerEvent) => {
    // A press that someone claimed before it came here is theirs, as the hand of a viewport is.
    if(event.button !== 0 || event.defaultPrevented || this.#gesture) return
    // A press ends what the keyboard was doing.
    void this.#endKeyMove(true)
    this.#endKeyWire(false)
    const {inside, hit, within, control} = this.#target(event)
    // The handles of a rect or an image that can be resized are in the scene's own tree.
    const grip = hit ? undefined : inside.find(element => this.#handleItems.has(element))
    if(grip) return void this.#resize(event, this.#handleItems.get(grip)!, (grip as unknown as SVGElement).dataset.wwHandle!)
    if(hit instanceof SceneNode) {
      const handle = within.find(element => element.hasAttribute("data-ww-handle"))
      if(handle) return void this.#resize(event, hit, handle.dataset.wwHandle!)
      if(this.#wired(event, hit, within, control)) return
    } else if(hit instanceof ScenePath && !control && this.#rewired(event, hit)) return
    const item = hit && this.#acting(hit)
    const selectable = !!item && item.hasAttribute("selectable") && this.#mode !== "none" && this.#allowed("select", item)
    const movable = !!item && !control && this.#movable(item)
    if(item && (selectable || movable)) {
      if(!control) this.#tap(event, hit)
      return void this.#press(event, item, selectable, movable, control)
    }
    // Nothing here claims the press. On a control it is the control's. On a drawn shape in a viewport it falls
    // through and arrives once more, as a press on the scene itself.
    if(!control && !(this.forwarding && this.windowed)) {
      this.#tap(event, hit)
      this.#background(event)
    }
  }

  /**
   * A press on a port or on a node that starts wires: a wire is drawn from it. It is a wire end that is grabbed instead
   * where the port starts none (it has no `data-ww-link`, or it is full) and a path with `rewire` ends there.
   * True if the press was taken.
   */
  #wired(event: PointerEvent, node: SceneNode, within: HTMLElement[], control: boolean): boolean {
    const port = within.find(element => element.hasAttribute("data-ww-link"))
    const element = port ?? (!control && node.hasAttribute("data-ww-link") ? node : null)
    if(element && !this.#full(node, element)) {
      void this.#connect(event, node, element)
      return true
    }
    const held = within.find(other => other.hasAttribute("data-ww-port")) ?? (!control && (node.hasAttribute("data-ww-link") || node.hasAttribute("data-ww-accept")) ? node : null)
    if(!held) return false
    const reference = bare(this.#refOf(node, held))
    // The path that was drawn last is the topmost one.
    for(const path of this.wiresAt(reference).reverse()) {
      const end = path.rewire.find(name => bare(path.getAttribute(name)) === reference)
      if(!end) continue
      void this.#rewire(event, path, end)
      return true
    }
    return false
  }

  /** A press on a path that may be rewired, near one of the ends it may be taken by. True if the press was taken. */
  #rewired(event: PointerEvent, path: ScenePath): boolean {
    const ends = path.rewire
    if(!ends.length || !path.attached) return false
    const line = this.outline(path)
    if(line.length < 2) return false
    const at = this.toScene(event.clientX, event.clientY)
    const reach = 16 / this.view.k
    const distance = (end: "from" | "to") => {
      const point = end === "from" ? line[0] : line[line.length - 1]
      return Math.hypot(point.x - at.x, point.y - at.y)
    }
    const end = ends.filter(name => distance(name) <= reach).sort((a, b) => distance(a) - distance(b))[0]
    if(!end) return false
    void this.#rewire(event, path, end)
    return true
  }

  // ── Clicks, double clicks, long presses and context menus ─────────────

  #hitDetail(hit: SceneItem, target: Element | null): HitDetail {
    const item = this.#acting(hit) ?? hit
    const groups: SceneGroup[] = []
    for(let group = this.groupOf(hit); group; group = this.groupOf(group)) groups.push(group)
    return {key: item.key, item, hit, groups, target}
  }

  /** Sends `ww-activate` for an item: a click, or Enter or Space. */
  #activate(hit: SceneItem, target: Element | null, via: "pointer" | "keyboard", count: number, event: {shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean}, pointer: PointerPoint | null) {
    const detail = this.#hitDetail(hit, target)
    const {shiftKey, ctrlKey, altKey, metaKey} = event
    this.tell(detail.item, "ww-activate", {...detail, via, count, shiftKey, ctrlKey, altKey, metaKey, pointer} satisfies ActivateDetail)
  }

  #backgroundGesture(gesture: BackgroundDetail["gesture"], down: PointerEvent, point: PointerPoint) {
    const {shiftKey, ctrlKey, altKey, metaKey, pointerType} = down
    this.tell(this, "ww-background", {gesture, point, pointerType, shiftKey, ctrlKey, altKey, metaKey} satisfies BackgroundDetail)
  }

  /**
   * Watches a press that is no drag: its release is a click, and a second one soon after is a
   * double click (`count` of `ww-activate`, `dblclick` of `ww-background`). A press that rests is a long
   * press: of the background (`ww-background`), and by touch also of an item or of the background (`ww-context`),
   * except where a long press by touch means something else: adding to the selection and drawing a marquee.
   */
  #tap(down: PointerEvent, hit: SceneItem | null) {
    const watch = new AbortController()
    const signal = AbortSignal.any([watch.signal, this.#disconnected!])
    const own = (other: PointerEvent) => other.pointerId === down.pointerId
    const far = (other: PointerEvent) => Math.hypot(other.clientX - down.clientX, other.clientY - down.clientY) >= 4
    const touch = down.pointerType === "touch"
    // Read now: the path of an event is empty once it has been dispatched.
    const target = this.#innermost(down)
    const acting = hit && (this.#acting(hit) ?? hit)
    const taken = touch && this.#mode === "multiple" && (!acting || acting.hasAttribute("selectable"))
    let long = false
    const held = window.setTimeout(() => {
      // A long press by touch is no click.
      if(touch) long = true
      if(!hit && !taken) {
        long = true
        this.#backgroundGesture("longpress", down, this.#pointerOf(down))
      }
      if(touch && !taken) {
        this.#contextAt = performance.now()
        this.#reportContext(hit, target, "touch", down)
      }
    }, LONG_PRESS)
    signal.addEventListener("abort", () => clearTimeout(held))
    window.addEventListener("pointermove", move => own(move) && far(move) && watch.abort(), {signal})
    window.addEventListener("pointercancel", cancel => own(cancel) && watch.abort(), {signal})
    window.addEventListener(
      "pointerup",
      up => {
        if(!own(up)) return
        watch.abort()
        // After the press has done what it does, so that `ww-select` comes first.
        if(!far(up) && !long) setTimeout(() => this.#tapped(down, up, hit, target), 0)
      },
      {signal},
    )
  }

  #tapped(down: PointerEvent, up: PointerEvent, hit: SceneItem | null, target: Element | null) {
    if(!this.isConnected || (hit && !this.has(hit))) return
    const last = this.#lastTap
    const again = !!last && up.timeStamp - last.time < 450 && last.item === hit && Math.hypot(up.clientX - last.x, up.clientY - last.y) < 8
    const count = again ? last.count + 1 : 1
    this.#lastTap = {time: up.timeStamp, x: up.clientX, y: up.clientY, item: hit, count}
    const point = this.#pointerOf(up)
    if(hit) return this.#activate(hit, target, "pointer", count, up, point)
    this.#backgroundGesture("click", up, point)
    if(count === 2) this.#backgroundGesture("dblclick", up, point)
  }

  /** The element a press went to, through the shadow roots of nested components. */
  #innermost(event: Event): Element | null {
    const origin = event.composedPath()[0]
    return origin instanceof Element ? origin : null
  }

  /** The click that assistive technology makes on the element that has focus. A click of a pointer is a press and a release, which are seen as such. */
  #click = (event: MouseEvent) => {
    if(event.detail !== 0) return
    const {hit, control} = this.#target(event)
    if(!hit || control) return
    this.#activate(hit, this.#innermost(event), "keyboard", 1, event, null)
  }

  /** Sends `ww-context`. False if a listener cancelled it. */
  #reportContext(hit: SceneItem | null, target: Element | null, via: ContextDetail["via"], at: {clientX: number; clientY: number}): boolean {
    let point = this.#pointerOf(at)
    const box = hit && via === "keyboard" ? bounds(this.outline(hit)) : null
    if(box) {
      const middle = {x: box.x + box.width / 2, y: box.y + box.height / 2}
      const client = this.toClient(middle.x, middle.y)
      point = {...middle, clientX: client.x, clientY: client.y}
    }
    const kind: ContextDetail["kind"] = !hit
      ? "background"
      : hit instanceof SceneNode
        ? "node"
        : hit instanceof ScenePath
          ? "path"
          : hit instanceof SceneShape
            ? "shape"
            : hit instanceof SceneText
              ? "text"
              : hit instanceof SceneImage
                ? "image"
                : hit instanceof SceneGroup
                  ? "group"
                  : "sprites"
    const detail: ContextDetail = hit ? {kind, ...this.#hitDetail(hit, target), point, via} : {kind, key: "", item: null, hit: null, groups: [], target, point, via}
    return this.fire(hit ?? this, "ww-context", detail)
  }

  #context = (event: MouseEvent) => {
    // The browser's own menu after a long press that was reported already.
    if(performance.now() - this.#contextAt < 1000) return void event.preventDefault()
    const {inside, hit} = this.#target(event)
    const type = (event as PointerEvent).pointerType
    if(!this.#reportContext(hit, inside[0] ?? null, type === "" ? "keyboard" : type === "touch" ? "touch" : "pointer", event)) event.preventDefault()
  }

  /**
   * A press on a selectable or movable item. It is claimed with preventDefault(),
   * which is how a viewport knows not to pan. With a mouse the press selects at
   * once. By touch the choice waits: a tap selects, a long press adds or removes
   * the item, and a drag moves it.
   */
  async #press(event: PointerEvent, item: SceneItem, selectable: boolean, movable: boolean, control: boolean) {
    const multiple = this.#mode === "multiple"
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    let collapse = false
    /** Applies the selection the press asks for. False if the widget refused it. */
    const choose = (toggle: boolean): boolean => {
      const selected = item.hasAttribute("selected")
      if(toggle) return this.#select(multiple ? this.#toggled(item) : selected ? [] : [item])
      if(!selected) return this.#select([item])
      // A press on one of several selected items may start a move of all of them.
      collapse = this.selection().length > 1
      return true
    }
    // A control inside a node keeps its own touch handling, so there the press selects at once.
    let waiting = selectable && multiple && !additive && !control && event.pointerType === "touch"
    if(selectable && !waiting && !choose(additive)) return
    if(!control) {
      event.preventDefault()
      this.#focus(item)
    }
    if(!movable && !collapse && !waiting) return
    const gesture = (this.#gesture = new PointerGesture(this, event, {convert: this.#convert}))
    if(waiting) {
      const held = window.setTimeout(() => {
        if(!waiting || gesture.moved) return
        waiting = false
        if(!choose(true)) gesture.cancel()
        collapse = false
      }, LONG_PRESS)
      gesture.ended.addEventListener("abort", () => clearTimeout(held))
    }
    if(movable)
      this.#watch(
        () => this.#allowed("move", item),
        gesture.ended,
        () => gesture.cancel(),
      )
    let move: Move | null = null
    for await (const sample of gesture) {
      if(waiting) {
        waiting = false
        if(!choose(false)) gesture.cancel()
      }
      if(!movable || gesture.cancelled) continue
      // Read the selection now: the widget rendered it after the press.
      move ??= this.#startMove(item)
      this.#shift(move, sample.dx, sample.dy, this.#sampled(sample))
    }
    this.#gesture = null
    if(waiting && !gesture.cancelled) choose(false)
    if(move) await this.#finishMove(move, gesture.moved && !gesture.cancelled, this.#sampled(gesture.last))
    else if(collapse && !gesture.cancelled && !gesture.moved) this.#select([item])
  }

  #background(event: PointerEvent) {
    if(this.#mode === "none") return
    const multiple = this.#mode === "multiple"
    if(multiple && event.shiftKey) return void this.#drawMarquee(event)
    // A click clears. A plain drag is left alone: it pans, if a viewport is there.
    // By touch, a long press and then a drag draws the marquee.
    const watch = new AbortController()
    const signal = AbortSignal.any([watch.signal, this.#disconnected!])
    const own = (other: PointerEvent) => other.pointerId === event.pointerId
    const far = (other: PointerEvent) => Math.hypot(other.clientX - event.clientX, other.clientY - event.clientY) >= 4
    const held = multiple && event.pointerType === "touch" ? window.setTimeout(() => (watch.abort(), void this.#drawMarquee(event)), LONG_PRESS) : 0
    signal.addEventListener("abort", () => clearTimeout(held))
    window.addEventListener("pointermove", move => own(move) && far(move) && watch.abort(), {signal})
    window.addEventListener("pointercancel", cancel => own(cancel) && watch.abort(), {signal})
    window.addEventListener(
      "pointerup",
      up => {
        if(!own(up)) return
        watch.abort()
        if(!far(up)) this.#select([])
      },
      {signal},
    )
  }

  /** A box drawn over the background. On release, everything it touches is added to the selection. */
  async #drawMarquee(event: PointerEvent) {
    event.preventDefault()
    const gesture = (this.#gesture = new PointerGesture(this, event, {convert: this.#convert}))
    const {marquee} = this.overlay
    const start = this.toScene(event.clientX, event.clientY)
    let box: Rect | null = null
    this.#setMarquee(true)
    for await (const sample of gesture) {
      box = {x: Math.min(start.x, sample.x), y: Math.min(start.y, sample.y), width: Math.abs(sample.x - start.x), height: Math.abs(sample.y - start.y)}
      for(const [name, value] of Object.entries(box)) marquee.setAttribute(name, String(value))
      marquee.classList.add("shown")
    }
    this.#gesture = null
    marquee.classList.remove("shown")
    this.#setMarquee(false)
    if(gesture.cancelled || !box) return
    const area = box
    const hit = this.#selectable().filter(item => {
      const outline = this.outline(item)
      const around = bounds(outline)
      // The markers and the labels of a path are part of it.
      if(item instanceof ScenePath) {
        return (
          polylineHitsRect(outline, area) ||
          this.extras(item).some(shape => {
            const box = bounds(shape)
            return !!box && rectsIntersect(box, area)
          })
        )
      }
      return !!around && rectsIntersect(around, area)
    })
    this.#select([...new Set([...this.selection(), ...hit])])
  }

  #setMarquee(on: boolean) {
    if(on === this.#marquee) return
    this.#marquee = on
    this.setState("marquee", on)
    this.changed?.()
  }

  // ── Moving ────────────────────────────────────────────────────────────

  /** What moves with an item: the whole selection if the item is part of it, without what sits in a group that moves anyway. */
  #startMove(lead: SceneItem): Move {
    const chosen = lead.hasAttribute("selected") ? this.selection().filter(item => item === lead || this.#movable(item)) : [lead]
    const carried = (item: SceneItem) => {
      for(let group = this.groupOf(item); group; group = this.groupOf(group)) if(chosen.includes(group)) return true
      return false
    }
    const items = chosen.filter(item => !carried(item))
    // Where each item is now, for the `bounds` it has to stay in.
    const boxes = new Map(items.map(item => [item, item.hasAttribute("bounds") ? this.#localBox(item) : null]))
    return {lead, items, delta: {x: 0, y: 0}, clamped: {x: false, y: false}, announced: false, boxes}
  }

  /** The `bounds` of an item: the box its own box has to stay in, as `x y width height` in the coordinates of its group. */
  #room(item: SceneItem): Rect | null {
    const [x, y, width, height] = (item.getAttribute("bounds") ?? "").trim().split(/[\s,]+/).map(Number)
    return [x, y, width, height].every(Number.isFinite) && width >= 0 && height >= 0 ? {x, y, width, height} : null
  }

  /** The box an item takes now, in the coordinates of its group (no preview is in it): a node's box, the outline of what is drawn. */
  #localBox(item: SceneItem): Rect | null {
    if(item instanceof SceneNode) return {x: item.num("x"), y: item.num("y"), width: item.offsetWidth, height: item.offsetHeight}
    const box = bounds(this.outline(item))
    if(!box) return null
    const {x, y, k} = this.transformOf(item)
    return {x: (box.x - x) / k, y: (box.y - y) / k, width: box.width / k, height: box.height / k}
  }

  /** The grid an item snaps to: its own `grid`, or the scene's. */
  #gridOf(item: SceneItem): number {
    return Math.max(0, item.num("grid", this.grid))
  }

  /**
   * The movement that the constraints of the items allow, as close to `delta` as they let it be. `delta` is in the
   * coordinates of the lead; every item has its limits in its own: `axis`, `min-x`, `max-x`, `min-y`, `max-y` and `bounds`.
   * The most restrictive item decides for all that move together.
   */
  #limit(move: Move, delta: Point): Point {
    const k = this.transformOf(move.lead).k
    const low = {x: -Infinity, y: -Infinity}
    const high = {x: Infinity, y: Infinity}
    for(const item of move.items) {
      // The same distance on screen is `ratio` as far in the item's own coordinates.
      const ratio = k / this.transformOf(item).k
      const axis = item.getAttribute("axis")
      for(const name of ["x", "y"] as const) {
        const position = item.num(name)
        if(axis === (name === "x" ? "y" : "x")) low[name] = high[name] = 0
        const [least, most] = [item.num(`min-${name}`, -Infinity), item.num(`max-${name}`, Infinity)]
        low[name] = Math.max(low[name], (least - position) / ratio)
        high[name] = Math.min(high[name], (most - position) / ratio)
      }
      const room = this.#room(item)
      const box = move.boxes.get(item)
      if(room && box) {
        low.x = Math.max(low.x, (room.x - box.x) / ratio)
        high.x = Math.min(high.x, (room.x + room.width - box.x - box.width) / ratio)
        low.y = Math.max(low.y, (room.y - box.y) / ratio)
        high.y = Math.min(high.y, (room.y + room.height - box.y - box.height) / ratio)
      }
    }
    const fit = (name: "x" | "y") => (low[name] > high[name] ? 0 : Math.min(high[name], Math.max(low[name], delta[name])))
    return {x: fit("x"), y: fit("y")}
  }

  /**
   * Previews a move by `dx`, `dy` scene pixels from where it began, snapped so that the lead lands on the grid
   * and kept within the limits of the items. Tells `ww-moving`, with the pointer if there is one.
   */
  #shift(move: Move, dx: number, dy: number, pointer: PointerPoint | null = null) {
    const {lead} = move
    const k = this.transformOf(lead).k
    const grid = this.#gridOf(lead)
    const [x, y] = [lead.num("x"), lead.num("y")]
    const wanted = {x: snap(x + dx / k, grid) - x, y: snap(y + dy / k, grid) - y}
    move.delta = this.#limit(move, wanted)
    move.clamped = {x: move.delta.x !== wanted.x, y: move.delta.y !== wanted.y}
    for(const item of move.items) {
      // The same distance on screen, in the coordinates of each item's own group.
      const ratio = k / this.transformOf(item).k
      item.preview = {x: item.num("x") + move.delta.x * ratio, y: item.num("y") + move.delta.y * ratio}
      item.changed()
    }
    this.#moving(move, pointer, "move", false)
  }

  /** Tells `ww-moving`. The end of a move is told only if a step of it was. */
  #moving(move: Move, pointer: PointerPoint | null, state: "move" | "end", committed: boolean) {
    if(state === "move") move.announced = true
    else if(!move.announced) return
    const items = move.items.map(item => ({key: item.key, item, x: item.at.x, y: item.at.y}))
    this.tell(move.lead, "ww-moving", {items, dx: move.delta.x, dy: move.delta.y, pointer, state, committed} satisfies MovingDetail)
  }

  /** Ends a move: one cancelable `ww-move` inside one transaction, or nothing. Resolves to true if the widget took it. */
  async #finishMove(move: Move, commit: boolean, pointer: PointerPoint | null = null): Promise<boolean> {
    const {lead, items, delta} = move
    const moved = commit && (delta.x !== 0 || delta.y !== 0) && items.every(item => item.isConnected) && this.#allowed("move", lead)
    const detail: MoveDetail = {items: items.map(item => ({key: item.key, item, x: item.at.x, y: item.at.y})), dx: delta.x, dy: delta.y, pointer}
    const accepted = await this.#commit(moved ? () => this.fire(lead, "ww-move", detail) : null, () => {
      for(const item of items) {
        item.preview = null
        item.changed()
      }
    })
    this.#moving(move, null, "end", accepted)
    return accepted
  }

  /**
   * An arrow key on a focused item. A movable item that is selected moves, and
   * the selection with it; one that cannot be selected moves alone. A step is
   * the grid, or one pixel without a grid; with Shift it is five grid steps,
   * or ten pixels. The presses are one move until it is committed.
   */
  #arrow(event: KeyboardEvent, item: SceneItem): boolean {
    let state = this.#keyMove
    if(!state) {
      if(!this.#movable(item)) return false
      if(item.hasAttribute("selectable") && this.#mode !== "none" && !item.hasAttribute("selected")) return false
      const stop = new AbortController()
      state = this.#keyMove = {move: this.#startMove(item), sum: {x: 0, y: 0}, held: new Set(), timer: 0, stop}
      this.#watch(
        () => this.#allowed("move", item),
        stop.signal,
        () => void this.#endKeyMove(false, true),
      )
      if(!this.#keyMove) return true
    }
    clearTimeout(state.timer)
    state.held.add(event.key)
    const grid = this.#gridOf(item)
    const custom = this.moveStep
    const step = event.shiftKey ? (custom ? 5 * custom : grid ? 5 * grid : 10) : custom || grid || 1
    const direction = ARROWS[event.key]
    const k = this.transformOf(item).k
    state.sum = {x: state.sum.x + direction.x * step, y: state.sum.y + direction.y * step}
    this.#shift(state.move, state.sum.x * k, state.sum.y * k)
    // A key pressed against a limit does not go on counting: the way back starts at the limit.
    const {clamped, delta} = state.move
    state.sum = {x: clamped.x ? delta.x : state.sum.x, y: clamped.y ? delta.y : state.sum.y}
    this.#say(this.#texts.current.moving(item.at.x, item.at.y))
    return true
  }

  #keyUp = (event: KeyboardEvent) => {
    const state = this.#keyMove
    if(!state || !isArrow(event.key)) return
    state.held.delete(event.key)
    clearTimeout(state.timer)
    // Committed once the arrow keys have rested, so that a run of presses is one undo step.
    if(state.held.size === 0) state.timer = window.setTimeout(() => void this.#endKeyMove(true), KEY_REST)
  }

  async #endKeyMove(commit: boolean, silent = false) {
    const state = this.#keyMove
    if(!state) return
    this.#keyMove = null
    clearTimeout(state.timer)
    state.stop.abort()
    const {move} = state
    const changed = move.delta.x !== 0 || move.delta.y !== 0
    const accepted = await this.#finishMove(move, commit)
    if(silent || !changed) return
    const texts = this.#texts.current
    this.#say(!commit ? this.#shared.current.cancelled : accepted ? texts.moved(move.items.length) : texts.notMoved)
  }

  // ── Keyboard ──────────────────────────────────────────────────────────

  #key = (event: KeyboardEvent) => {
    const origin = event.composedPath()[0]
    if(!(origin instanceof Element)) return
    // A key the scene acts on is taken: it does not go on to the browser, to a viewport or to a shortcut.
    const taken = () => {
      event.preventDefault()
      event.stopPropagation()
    }
    if(this.#keyWire && this.#wireKey(event.key, this.#keyWire)) return taken()
    const start = event.key === "Enter" || event.key === " " ? this.#linkPort(origin) : null
    if(start) {
      taken()
      return this.#startKeyWire(start.node, start.port)
    }
    if(origin.matches(TYPING)) return
    const item = origin instanceof SceneItem ? origin : this.standInItem(origin)
    const moving = this.#keyMove
    if(moving && !(isArrow(event.key) && item === moving.move.lead)) {
      // Escape takes the move back and Enter commits it. Any other key commits it too, and then does what it does.
      void this.#endKeyMove(event.key !== "Escape")
      if(event.key === "Escape" || event.key === "Enter") return taken()
    }
    if(isArrow(event.key)) {
      if(item && this.has(item) && !event.ctrlKey && !event.metaKey && !event.altKey && this.#arrow(event, item)) taken()
      return
    }
    if((event.key === "Enter" || event.key === " ") && item && this.has(item) && !event.repeat) {
      // After the selection, so that `ww-select` comes first, as it does for a click.
      queueMicrotask(() => this.has(item) && this.#activate(item, origin, "keyboard", 1, event, null))
    }
    if(this.#mode === "none") return
    const selected = (items: SceneItem[]) => {
      if(this.#select(items)) this.#say(this.#texts.current.selection(items.length))
    }
    if(event.key === "Escape") {
      // During a gesture Escape cancels the gesture, not the selection.
      if(!this.#gesture && this.selection().length) selected([])
    } else if(event.key === "a" && (event.ctrlKey || event.metaKey)) {
      if(this.#mode !== "multiple") return
      taken()
      selected(this.#selectable())
    } else if(event.key === " " || event.key === "Enter") {
      if(!item?.hasAttribute("selectable") || !this.#allowed("select", item)) return
      taken()
      const additive = (event.shiftKey || event.ctrlKey || event.metaKey) && this.#mode === "multiple"
      selected(additive ? this.#toggled(item) : [item])
    }
  }

  /** Focus left: a move by keyboard is committed, and a wire that was picked up is put down. */
  #blur = (event: FocusEvent) => {
    const origin = event.composedPath()[0]
    const lead = this.#keyMove?.move.lead
    if(lead && (origin === lead || origin === this.standInOf(lead))) void this.#endKeyMove(true)
    if(origin === this.#keyWire?.wire.port) this.#endKeyWire(false)
  }

  // ── Resizing ──────────────────────────────────────────────────────────

  /** Where a node, a rect or an image is and how large, in the coordinates of its group. Null for what has no box. */
  #boxOf(item: SceneNode | SceneShape | SceneImage): Rect | null {
    if(item instanceof SceneNode) return {x: item.num("x"), y: item.num("y"), width: item.offsetWidth, height: item.offsetHeight}
    const drawing = this.recorded(item)
    return drawing?.type === "rect" || drawing?.type === "image" ? {x: item.num("x"), y: item.num("y"), width: drawing.width, height: drawing.height} : null
  }

  async #resize(event: PointerEvent, node: SceneNode | SceneShape | SceneImage, handle: string) {
    if(!this.#allowed("resize", node) || !handlesOf(node.getAttribute("resizable")).includes(handle)) return
    const start = this.#boxOf(node)
    if(!start) return
    event.preventDefault()
    const k = this.transformOf(node).k
    const min = {width: node.num("min-width", 16), height: node.num("min-height", 16)}
    const max = {width: node.num("max-width", Infinity), height: node.num("max-height", Infinity)}
    const ratio = node.hasAttribute("keep-ratio") ? start.width / start.height : 0
    const grid = this.#gridOf(node)
    const room = this.#room(node)
    const [lowX, highX, lowY, highY] = room ? [room.x, room.x + room.width, room.y, room.y + room.height] : [-Infinity, Infinity, -Infinity, Infinity]
    const gesture = (this.#gesture = new PointerGesture(this, event, {threshold: 1, convert: this.#convert}))
    this.#watch(
      () => this.#allowed("resize", node),
      gesture.ended,
      () => gesture.cancel(),
    )
    let box = start
    let announced = false
    for await (const sample of gesture) {
      let left = start.x
      let top = start.y
      let right = start.x + start.width
      let bottom = start.y + start.height
      // The size stays between its limits and the edge inside its bounds: the dragged edge stops there.
      if(handle.includes("w")) left = Math.min(Math.max(snap(left + sample.dx / k, grid), right - max.width, lowX), right - min.width)
      if(handle.includes("e")) right = Math.max(Math.min(snap(right + sample.dx / k, grid), left + max.width, highX), left + min.width)
      if(handle.includes("n")) top = Math.min(Math.max(snap(top + sample.dy / k, grid), bottom - max.height, lowY), bottom - min.height)
      if(handle.includes("s")) bottom = Math.max(Math.min(snap(bottom + sample.dy / k, grid), top + max.height, highY), top + min.height)
      let width = right - left
      let height = bottom - top
      if(ratio) {
        // The dragged edge decides one dimension. The other follows, anchored at the opposite side.
        if(handle === "n" || handle === "s") width = height * ratio
        else height = width / ratio
        const grow = Math.max(1, min.width / width, min.height / height)
        width *= grow
        height *= grow
        if(handle.includes("w")) left = right - width
        if(handle.includes("n")) top = bottom - height
      }
      box = {x: left, y: top, width, height}
      node.preview = box
      node.changed()
      announced = true
      this.tell(node, "ww-resizing", {key: node.key, item: node, ...box, state: "resize", committed: false} satisfies ResizingDetail)
    }
    this.#gesture = null
    const result = box
    const changed = (Object.keys(start) as (keyof Rect)[]).some(name => start[name] !== result[name])
    const commit = !gesture.cancelled && changed && node.isConnected && this.#allowed("resize", node)
    const detail: ResizeDetail = {key: node.key, item: node, ...result}
    const accepted = await this.#commit(commit ? () => this.fire(node, "ww-resize", detail) : null, () => {
      node.preview = null
      node.changed()
    })
    const now = announced ? this.#boxOf(node) : null
    if(now) this.tell(node, "ww-resizing", {key: node.key, item: node, ...now, state: "end", committed: accepted} satisfies ResizingDetail)
  }

  // ── Handles of a rect or an image that can be resized ─────────────────

  /**
   * A selected rect or image with `resizable` has handles, which are in the overlay of the scene: a node
   * has its own, in its own tree. They are as large on the screen at any zoom, and follow the preview of a resize.
   */
  #syncHandles() {
    const k = this.view.k
    const wanted: {item: SceneShape | SceneImage; names: string[]; box: Rect}[] = []
    for(const item of this.items) {
      if(!(item instanceof SceneShape || item instanceof SceneImage) || !item.hasAttribute("resizable") || !item.hasAttribute("selected")) continue
      const drawing = this.recorded(item)
      if(!drawing || (drawing.type !== "rect" && drawing.type !== "image") || (drawing.type === "rect" && drawing.rotate)) continue
      const box = bounds(this.outline(item))
      if(box) wanted.push({item, names: handlesOf(item.getAttribute("resizable")), box})
    }
    // The elements stay while the same items have the same handles, so that a press on one that is held is not lost.
    const key = `${k}|${wanted.map(({item, names}) => `${this.items.indexOf(item)}:${names.join(" ")}`).join(";")}`
    const size = 8 / k
    const SVG = "http://www.w3.org/2000/svg"
    const places = wanted.flatMap(({item, names, box}) =>
      names.map(name => ({
        item,
        name,
        x: (name.includes("w") ? box.x : name.includes("e") ? box.x + box.width : box.x + box.width / 2) - size / 2,
        y: (name.includes("n") ? box.y : name.includes("s") ? box.y + box.height : box.y + box.height / 2) - size / 2,
      })),
    )
    if(key !== this.#handleKey) {
      this.#handleKey = key
      this.overlay.handles.replaceChildren(
        ...places.map(({item, name}) => {
          const handle = document.createElementNS(SVG, "rect")
          handle.setAttribute("part", "resize")
          handle.setAttribute("data-ww-handle", name)
          handle.style.vectorEffect = "non-scaling-stroke"
          this.#handleItems.set(handle, item)
          return handle
        }),
      )
    }
    places.forEach(({x, y}, index) => {
      const handle = this.overlay.handles.children[index]
      for(const [attribute, value] of Object.entries({x, y, width: size, height: size})) if(handle.getAttribute(attribute) !== String(value)) handle.setAttribute(attribute, String(value))
    })
  }

  protected override synced() {
    this.#syncHandles()
  }

  protected override zoomed() {
    this.#syncHandles()
  }

  // ── Wiring ────────────────────────────────────────────────────────────

  /** The reference of a port, `node:port`, or of a whole node, which is its bare key. */
  #refOf(node: SceneNode, element: HTMLElement): string {
    return element === node ? node.key : `${node.key}:${element.dataset.wwPort ?? ""}`
  }

  /** True if a port, or a whole node, has as many wires as its `data-ww-capacity` allows. The path that is being moved does not count. */
  #full(node: SceneNode, element: HTMLElement, moving: ScenePath | null = null): boolean {
    const capacity = parseInt(element.dataset.wwCapacity ?? "", 10)
    if(!(capacity >= 0)) return false
    return this.wiresAt(this.#refOf(node, element)).filter(path => path !== moving).length >= capacity
  }

  /**
   * Picks a wire up at a port, or at a whole node that starts wires: marks the places that accept it. Nothing
   * moves while a wire is drawn, so they are found once. A full port accepts none. With `moving`, an end of
   * that path is held, and `port` is the other end: a `to` end can go to the ports that accept the kind of
   * `port`, a `from` end to the ports of a kind that `port` accepts.
   */
  #wire(node: SceneNode, port: HTMLElement, moving: {path: ScenePath; end: "from" | "to"} | null = null): Wire | null {
    const from = this.#refOf(node, port)
    const start = this.portPosition(from)
    if(!start) return null
    const end = moving?.end ?? "to"
    const link = port.dataset.wwLink
    const accepted = (port.dataset.wwAccept ?? "").split(/\s+/).filter(Boolean)
    if(end === "to" && link === undefined) return null
    const kind = end === "to" ? link! : (this.resolve(moving!.path.getAttribute("from"))?.element.dataset.wwLink ?? "")
    const candidates: Candidate[] = []
    const consider = (other: SceneNode, element: HTMLElement, to: string, at: Point, contains: Candidate["contains"]) => {
      if(element === port) return
      const found = end === "to" ? ((element.dataset.wwAccept ?? "").split(/\s+/).includes(link!) ? link! : null) : accepted.includes(element.dataset.wwLink ?? "\0") ? element.dataset.wwLink! : null
      if(found === null || this.#full(other, element, moving?.path ?? null)) return
      candidates.push({node: other, element, to, at, kind: found, contains})
    }
    for(const other of this.items) {
      if(!(other instanceof SceneNode)) continue
      for(const accepting of this.portsOf(other)?.list ?? []) consider(other, accepting.element!, `${other.key}:${accepting.name}`, this.portAt(other, accepting), null)
      if(other !== node && (other.hasAttribute("data-ww-link") || other.hasAttribute("data-ww-accept"))) {
        const outline = this.nodeOutline(other)
        consider(other, other, other.key, {x: outline.x + outline.width / 2, y: outline.y + outline.height / 2}, point => outlineContains(outline, point))
      }
    }
    for(const {element} of candidates) element.setAttribute("data-ww-port-candidate", "")
    return {node, port, kind, from, start, candidates, path: moving?.path ?? null, end, announced: false}
  }

  /** The place that takes a wire let go at a point: a whole node within its outline, a port within reach of its middle. */
  #over(wire: Wire, point: Point): Candidate | null {
    const distance = (candidate: Candidate) => Math.hypot(candidate.at.x - point.x, candidate.at.y - point.y)
    const inside = wire.candidates.filter(candidate => candidate.contains?.(point))
    const pool = inside.length ? inside : wire.candidates.filter(candidate => distance(candidate) <= REACH)
    return pool.sort((a, b) => distance(a) - distance(b))[0] ?? null
  }

  #connecting(wire: Wire, target: Candidate | null, pointer: PointerPoint | null, via: ConnectingDetail["via"], state: ConnectingDetail["state"]): ConnectingDetail {
    const loose = state === "end" ? null : (target?.to ?? null)
    const [from, to] = wire.end === "to" ? [wire.from, loose] : [loose, wire.from]
    return {from, to, kind: target?.kind ?? wire.kind, source: wire.port, target: state === "end" ? null : (target?.element ?? null), state, via, pointer, path: wire.path, end: wire.path ? wire.end : null}
  }

  /** Draws the wire to a port, or to a loose end, and tells `ww-connecting`: a listener that cancels it draws the wire itself. */
  #aim(wire: Wire, target: Candidate | null, loose?: Point, pointer: PointerPoint | null = null, via: ConnectingDetail["via"] = "pointer") {
    for(const {element} of wire.candidates) element.toggleAttribute("data-ww-port-over", element === target?.element)
    this.setState("wiring", true)
    wire.announced = true
    const drawn = this.fire(wire.port, "ww-connecting", this.#connecting(wire, target, pointer, via, "move"))
    const {link} = this.overlay
    link.setAttribute("d", polyline([wire.start, target?.at ?? loose ?? wire.start]))
    link.classList.toggle("shown", drawn)
  }

  #unwire(wire: Wire, pointer: PointerPoint | null = null, via: ConnectingDetail["via"] = "pointer") {
    this.overlay.link.classList.remove("shown")
    this.setState("wiring", false)
    for(const {element} of wire.candidates) {
      element.removeAttribute("data-ww-port-candidate")
      element.removeAttribute("data-ww-port-over")
    }
    if(!wire.announced) return
    wire.announced = false
    this.tell(wire.port, "ww-connecting", this.#connecting(wire, null, pointer, via, "end"))
  }

  /**
   * Ends a wire at a port: one cancelable `ww-connect` inside one transaction, or `ww-reconnect` for an end of a path
   * that was moved. The widget decides whether the connection is allowed. A path put back where it was is no change.
   */
  async #join(wire: Wire, target: Candidate, pointer: PointerPoint | null = null): Promise<boolean> {
    if(!target.element.isConnected || !this.#allowed("connect", wire.node, wire.port)) return false
    const to = wire.end === "to"
    const ends = {from: to ? wire.from : target.to, to: to ? target.to : wire.from}
    const elements = {source: to ? wire.port : target.element, target: to ? target.element : wire.port}
    const {path} = wire
    if(!path) {
      const detail: ConnectDetail = {...ends, kind: wire.kind, ...elements, pointer}
      return this.#commit(
        () => this.fire(target.element, "ww-connect", detail),
        () => {},
      )
    }
    const previous = {from: path.getAttribute("from") ?? "", to: path.getAttribute("to") ?? ""}
    if(bare(previous[wire.end]) === bare(target.to)) return false
    const detail: ReconnectDetail = {path, end: wire.end, ...ends, previous, kind: target.kind, ...elements, pointer}
    return this.#commit(
      () => this.fire(path, "ww-reconnect", detail),
      () => {},
    )
  }

  /** Ends a held end of a path where no port is: one cancelable `ww-disconnect` inside one transaction. */
  #detach(wire: Wire, pointer: PointerPoint | null): Promise<boolean> {
    const path = wire.path!
    const detail: DisconnectDetail = {path, end: wire.end, from: path.getAttribute("from") ?? "", to: path.getAttribute("to") ?? "", kind: wire.kind, pointer}
    return this.#commit(
      () => this.fire(path, "ww-disconnect", detail),
      () => {},
    )
  }

  /**
   * A wire from a port, by pointer. Dragged to a port it is connected there. Where the scene says `connect-click`, a
   * press that does not move picks the wire up instead, and the next click puts it down: on a port to connect, elsewhere to cancel.
   */
  async #connect(event: PointerEvent, node: SceneNode, port: HTMLElement) {
    if(!this.#allowed("connect", node, port)) return
    const wire = this.#wire(node, port)
    if(!wire) return
    event.preventDefault()
    this.#disarm()
    const gesture = (this.#gesture = new PointerGesture(this, event, {threshold: 2, convert: this.#convert}))
    this.#watch(
      () => this.#allowed("connect", node, port),
      gesture.ended,
      () => gesture.cancel(),
    )
    let target: Candidate | null = null
    for await (const sample of gesture) {
      target = this.#over(wire, sample)
      this.#aim(wire, target, sample, this.#sampled(sample))
    }
    this.#gesture = null
    const pointer = this.#sampled(gesture.last)
    if(!gesture.moved && !gesture.cancelled && this.hasAttribute("connect-click")) return this.#arm(wire, pointer)
    this.#unwire(wire, pointer)
    if(!gesture.cancelled && target) await this.#join(wire, target, pointer)
  }

  /** The wire is held without a button: the pointer moves it, a click puts it down and Escape cancels. */
  #arm(wire: Wire, at: PointerPoint) {
    const stop = new AbortController()
    const signal = AbortSignal.any([stop.signal, this.#disconnected!])
    const armed: Armed = (this.#armed = {wire, stop})
    const scene = (move: PointerEvent) => this.#pointerOf(move)
    const aim = (pointer: PointerPoint) => this.#aim(wire, this.#over(wire, pointer), pointer, pointer, "click")
    signal.addEventListener("abort", () => {
      if(this.#armed === armed) this.#armed = null
      this.#unwire(wire, null, "click")
    })
    aim(at)
    window.addEventListener("pointermove", move => aim(scene(move)), {signal})
    window.addEventListener(
      "pointerdown",
      down => {
        if(down.button !== 0) return
        // This press is the wire's: it neither selects nor pans.
        down.preventDefault()
        down.stopPropagation()
        const pointer = scene(down)
        const target = this.#over(wire, pointer)
        stop.abort()
        if(target) void this.#join(wire, target, pointer)
      },
      {signal, capture: true},
    )
    window.addEventListener(
      "keydown",
      key => {
        if(key.key !== "Escape") return
        stop.abort()
        this.#say(this.#shared.current.cancelled)
      },
      {signal},
    )
    this.#watch(
      () => this.#allowed("connect", wire.node, wire.port),
      signal,
      () => stop.abort(),
    )
  }

  /** Puts a wire that was picked up by a click down. */
  #disarm() {
    this.#armed?.stop.abort()
  }

  /** An end of a path is taken: it can be put on another port (`ww-reconnect`) or let go in the open (`ww-disconnect`). */
  async #rewire(event: PointerEvent, path: ScenePath, end: "from" | "to") {
    const fixed = this.resolve(path.getAttribute(end === "to" ? "from" : "to"))
    if(!fixed || !this.#allowed("connect", fixed.node, fixed.element)) return
    const wire = this.#wire(fixed.node, fixed.element, {path, end})
    if(!wire) return
    event.preventDefault()
    this.#disarm()
    // The path stays where it is meanwhile: a widget dims it with `ww-path:state(rewiring)`.
    path.setState("rewiring", true)
    path.changed()
    const gesture = (this.#gesture = new PointerGesture(this, event, {threshold: 2, convert: this.#convert}))
    this.#watch(
      () => this.#allowed("connect", fixed.node, fixed.element),
      gesture.ended,
      () => gesture.cancel(),
    )
    let target: Candidate | null = null
    try {
      for await (const sample of gesture) {
        target = this.#over(wire, sample)
        this.#aim(wire, target, sample, this.#sampled(sample))
      }
      this.#gesture = null
      const pointer = this.#sampled(gesture.last)
      this.#unwire(wire, pointer)
      if(gesture.cancelled) return
      if(!gesture.moved) {
        // A click on the end is a click on the path.
        if(path.hasAttribute("selectable") && this.#mode !== "none" && this.#allowed("select", path)) {
          const additive = (event.shiftKey || event.ctrlKey || event.metaKey) && this.#mode === "multiple"
          this.#select(additive ? this.#toggled(path) : [path])
        }
        this.#activate(path, null, "pointer", 1, event, pointer)
        return
      }
      if(target) await this.#join(wire, target, pointer)
      else await this.#detach(wire, pointer)
    } finally {
      this.#gesture = null
      path.setState("rewiring", false)
      path.changed()
    }
  }

  /** The port a key event started at, if a wire can start there. */
  #linkPort(origin: Element): {node: SceneNode; port: HTMLElement} | null {
    if(!(origin instanceof HTMLElement) || origin.dataset.wwLink === undefined) return null
    const node = this.ownerOf(origin)
    return node instanceof SceneNode ? {node, port: origin} : null
  }

  #nameOf(node: SceneNode, port: HTMLElement, texts = this.#texts.current): string {
    return texts.port(port.dataset.wwPort || port.dataset.wwLink || "", node.getAttribute("aria-label") ?? node.key)
  }

  /**
   * Enter or Space on a focused port picks a wire up. The arrow keys then step
   * through the ports that accept it, in template order and starting at the
   * nearest; Enter or Space connects, and Escape or leaving the port cancels.
   */
  #startKeyWire(node: SceneNode, port: HTMLElement) {
    if(!this.#allowed("connect", node, port)) return
    const texts = this.#texts.current
    this.#disarm()
    // A full port starts no wire.
    if(this.#full(node, port)) return this.#say(texts.noTarget)
    const wire = this.#wire(node, port)
    if(!wire) return
    const count = wire.candidates.length
    if(count === 0) return this.#say(texts.noTarget)
    const distances = wire.candidates.map(candidate => Math.hypot(candidate.at.x - wire.start.x, candidate.at.y - wire.start.y))
    const state: KeyWire = (this.#keyWire = {wire, index: distances.indexOf(Math.min(...distances)), stop: new AbortController()})
    this.#watch(
      () => this.#allowed("connect", node, port),
      state.stop.signal,
      () => this.#endKeyWire(false, true),
    )
    if(this.#keyWire !== state) return
    const target = wire.candidates[state.index]
    this.#aim(wire, target, undefined, null, "keyboard")
    this.#say(`${texts.wiring(this.#nameOf(node, port), count)} ${texts.target(this.#nameOf(target.node, target.element), state.index + 1, count)}`)
  }

  /** A key while a wire is held. True if the key was the wire's. */
  #wireKey(key: string, state: KeyWire): boolean {
    const {wire} = state
    const count = wire.candidates.length
    if(key === "Escape") this.#endKeyWire(false)
    else if(key === "Enter" || key === " ") this.#endKeyWire(true)
    else if(isArrow(key)) {
      const forward = key === "ArrowRight" || key === "ArrowDown"
      state.index = (state.index + (forward ? 1 : count - 1)) % count
      const target = wire.candidates[state.index]
      this.#aim(wire, target, undefined, null, "keyboard")
      this.#say(this.#texts.current.target(this.#nameOf(target.node, target.element), state.index + 1, count))
    } else return false
    return true
  }

  #endKeyWire(connect: boolean, silent = false) {
    const state = this.#keyWire
    if(!state) return
    this.#keyWire = null
    state.stop.abort()
    const {wire} = state
    const target = wire.candidates[state.index]
    this.#unwire(wire, null, "keyboard")
    if(!connect) {
      if(!silent) this.#say(this.#shared.current.cancelled)
      return
    }
    void this.#join(wire, target).then(accepted => {
      const texts = this.#texts.current
      this.#say(accepted ? texts.connected(this.#nameOf(wire.node, wire.port), this.#nameOf(target.node, target.element)) : texts.notConnected)
    })
  }

  // ── Ports that take the keyboard ──────────────────────────────────────

  protected override measured(nodes: readonly SceneNode[]) {
    this.#prepare(nodes, true)
  }

  /** A render is when the mode and the permissions change, and with them what a port offers. */
  protected override refreshed() {
    this.#prepare([...this.#prepared.keys()], false)
  }

  protected override dropped(item: SceneItem) {
    if(item instanceof SceneNode) this.#unprepare(item)
  }

  /**
   * A port that starts a wire becomes a button for the keyboard while the
   * reader may connect: `tabindex`, `role` and an accessible name, each only
   * where the template sets none. What was added is taken back again.
   */
  #prepare(nodes: readonly SceneNode[], measured: boolean) {
    if(!nodes.length) return
    const texts = this.#texts.current
    // The names are English until the catalog of the locale has arrived.
    const locale = `${this.#texts.locale}:${this.#texts.loaded}`
    for(const node of nodes) {
      const allowed = this.#allowed("connect", node)
      // The ports that start a wire, and the node itself where it starts wires as a whole.
      const starts = allowed ? [...(node.hasAttribute("data-ww-link") ? [node] : []), ...(this.portsOf(node)?.list ?? []).flatMap(port => (port.element!.dataset.wwLink === undefined ? [] : [port.element!]))] : []
      const links = starts.filter(element => this.#allowed("connect", node, element))
      const state = `${allowed}|${links.map(element => starts.indexOf(element)).join(",")}|${locale}`
      const known = this.#prepared.get(node)
      if(!measured && known?.state === state) continue
      const entry: Prepared = known ?? {state, added: new Map()}
      entry.state = state
      for(const [element, names] of entry.added) {
        if(links.includes(element)) continue
        for(const name of names) element.removeAttribute(name)
        entry.added.delete(element)
      }
      for(const element of links) {
        const names = entry.added.get(element) ?? []
        // A node that starts wires keeps its own role and name.
        const wanted = element === node ? {tabindex: "0"} : {tabindex: "0", role: "button", "aria-label": texts.linkPort(this.#nameOf(node, element, texts))}
        for(const [name, value] of Object.entries(wanted)) {
          if(names.includes(name)) {
            if(element.getAttribute(name) !== value) element.setAttribute(name, value)
          } else if(!element.hasAttribute(name) && !(name === "tabindex" && element.tabIndex >= 0) && !(name === "aria-label" && element.hasAttribute("aria-labelledby"))) {
            element.setAttribute(name, value)
            names.push(name)
          }
        }
        entry.added.set(element, names)
      }
      // A node is kept while its ports could start a wire, so that a new permission or language reaches them.
      if(entry.added.size || !allowed) this.#prepared.set(node, entry)
      else this.#prepared.delete(node)
    }
  }

  #unprepare(node: SceneNode) {
    for(const [element, names] of this.#prepared.get(node)?.added ?? []) for(const name of names) element.removeAttribute(name)
    this.#prepared.delete(node)
  }
}
