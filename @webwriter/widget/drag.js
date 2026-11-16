import { announcer } from "./announce.js";
import { ModuleCore, warnOnce } from "./base.js";
import { activeElement, assign, capacity, label, linked, relocate } from "./drag/dom.js";
import { centreOf, composedContains, flowOf, indexAt, markerBox, surfaceOf, worldSurfaceOf } from "./drag/geometry.js";
import { Lift } from "./drag/lift.js";
import { dragMessages } from "./messages/drag/index.js";
import { Overlay, overlayStyles } from "./drag/overlay.js";
import { AutoScroll } from "./drag/scroll.js";
import { PointerGesture } from "./gesture.js";
import { Messages } from "./messages.js";
import { adoptStyles } from "./styles.js";
import { transaction } from "./transaction.js";
import { dragMessages as dragMessages2 } from "./messages/drag/index.js";
const IDLE = { item: null, via: null };
const ARROWS = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }
};
const NUDGE = 10;
const FIELDS = "input, textarea, select";
const CONTROLS = `a[href], button, summary, label, ${FIELDS}`;
const NO_POINTER = `[data-ww-drag-via]:not([data-ww-drag-via~="pointer"])`;
const touchStyles = `
[data-ww-drag]:not(slot, ${NO_POINTER}, :has([data-ww-drag-handle])), [data-ww-drag-handle]:not(slot, ${NO_POINTER} *) { touch-action: none; }
slot[data-ww-drag]:not([data-ww-drag-handle], ${NO_POINTER})::slotted(*) { touch-action: none; }
`;
const isSlot = (element) => element.localName === "slot";
class DragCore extends ModuleCore {
  #options;
  #messages;
  #announce = () => {
  };
  #state = IDLE;
  /** A commit is being dispatched and rendered. */
  #busy = false;
  #held = null;
  /** The press that is down, from its start to its release. */
  #gesture = null;
  #overlay = null;
  /** The sheet that switches touch scrolling off, adopted while `can` holds. */
  #touch = null;
  /** Settle animations that still run. */
  #settling = /* @__PURE__ */ new Set();
  /** The current press became a drag, so its click is not a pick-up. */
  #dragged = false;
  /** A pointer is down inside the widget while an item is picked up: focus it moves does not put the item back. */
  #pressed = false;
  constructor(host, options = {}) {
    super(host, options);
    this.#options = options;
    this.#messages = new Messages(host, dragMessages, options.messages);
  }
  getSnapshot() {
    return this.#state;
  }
  onConnect() {
    const root = this.root;
    const styles = adoptStyles(root, overlayStyles);
    this.cleanup(styles);
    this.#overlay = new Overlay(() => this.root, styles.sheet);
    const live = announcer(root);
    this.cleanup(live.release);
    this.#announce = live.announce;
    this.cleanup(this.#messages.follow(() => {
    }));
    this.listen(root, "pointerdown", this.#down);
    this.listen(root, "click", this.#click);
    this.listen(root, "keydown", this.#keydown);
    this.listen(root, "focusout", this.#focusout);
    const attributes = new MutationObserver(() => this.#gate());
    attributes.observe(this.host, { attributes: true });
    this.cleanup(() => {
      attributes.disconnect();
      this.#gesture?.cancel();
      if (this.#held) this.#release(this.#held);
      for (const animation of this.#settling) animation.cancel();
      this.#settling.clear();
      this.#overlay?.remove();
      this.#overlay = null;
      this.#touch?.();
      this.#touch = null;
      this.#announce = () => {
      };
    });
    this.onRefresh();
  }
  onRefresh() {
    for (const item of this.root.querySelectorAll("[data-ww-drag]:not(slot):not([tabindex])")) {
      if (this.#takes(item, "keyboard")) item.tabIndex = 0;
    }
    this.#gate();
    const held = this.#held;
    if (!held || this.#busy) return;
    if (!this.#current(held)) return this.#cancel(held);
    if (held.via === "pointer") return;
    this.#replace(held);
    this.#display(held);
  }
  #allowed() {
    return this.#options.can ? this.#options.can() : true;
  }
  /** Touch scrolling is off on what starts a drag only while a drag may start. */
  #gate() {
    const allowed = this.#allowed();
    if (allowed && !this.#touch) this.#touch = adoptStyles(this.root, touchStyles);
    else if (!allowed && this.#touch) {
      this.#touch();
      this.#touch = null;
    }
  }
  #set(item, via = null) {
    if (item === this.#state.item) return;
    this.#state = item ? { item, via } : IDLE;
    this.notify();
  }
  // ── Items and targets ─────────────────────────────────────────────────
  /** The element that carries an item's declaration: the item, or its slot for an authored child. Null if it is no item (any more). */
  #declared(item) {
    const holder = item.getRootNode() === this.root ? item : item.assignedSlot;
    return holder?.hasAttribute("data-ww-drag") && holder.getRootNode() === this.root ? holder : null;
  }
  #slotted(item) {
    return item.getRootNode() !== this.root;
  }
  /** Whether an item is picked up this way: every way, or the ones its `data-ww-drag-via` lists. */
  #takes(item, via) {
    const ways = this.#declared(item)?.dataset.wwDragVia;
    return ways === void 0 || ways.split(/\s+/).includes(via);
  }
  #items(scope) {
    return Array.from(scope.querySelectorAll("[data-ww-drag]")).flatMap(
      (element) => isSlot(element) ? element.assignedElements({ flatten: true }) : [element]
    );
  }
  #byKey(key, kind) {
    return this.#items(this.root).find((item) => item.dataset.wwKey === key && (kind === void 0 || this.#declared(item)?.dataset.wwDrag === kind)) ?? null;
  }
  /** The item an event started in, and the handle it started in, if any. */
  #find(event) {
    const root = this.root;
    let handle = null;
    for (const node of event.composedPath()) {
      if (node === root) break;
      if (!(node instanceof HTMLElement) || isSlot(node)) continue;
      if (!handle && node.hasAttribute("data-ww-drag-handle")) handle = node;
      if (node.hasAttribute("data-ww-drag") && node.getRootNode() === root) {
        return { item: node, handle, needsHandle: !!node.querySelector("[data-ww-drag-handle]") };
      }
      const slot = node.assignedSlot;
      if (slot?.hasAttribute("data-ww-drag") && slot.getRootNode() === root) {
        return { item: node, handle, needsHandle: slot.hasAttribute("data-ww-drag-handle") };
      }
    }
    return null;
  }
  /**
   * Whether a press or click at this place may pick the item up: on the
   * handle if the item has one, otherwise anywhere on it except in a text
   * field or in editable text, which keep their own pointer behaviour.
   */
  #startsAt(found, event) {
    if (found.handle) return true;
    if (found.needsHandle) return false;
    for (const node of event.composedPath()) {
      if (node instanceof HTMLElement && (node.matches(FIELDS) || this.#editableText(node))) return false;
      if (node === found.item) break;
    }
    return true;
  }
  /**
   * Whether text in this element is edited by typing. `isContentEditable` alone does not say so:
   * the editor puts the whole document in design mode, which makes every node of a widget's
   * shadow tree report true. Template elements count only when they ask for it themselves;
   * authored content counts whenever the author can edit it.
   */
  #editableText(node) {
    if (node.hasAttribute("contenteditable")) return node.contentEditable !== "false";
    return node !== this.host && this.host.contains(node) && node.isContentEditable;
  }
  #source(item) {
    return this.#declared(item)?.closest("[data-ww-drop]") ?? null;
  }
  /** What a target resolves beyond membership. A link only ever names the target. */
  #mode(held, target) {
    const position = target.dataset.wwDropPosition;
    return held.effect !== "link" && (position === "index" || position === "point") ? position : null;
  }
  /** The target's items among which an index is counted: all but the held one. */
  #others(held, target) {
    return this.#items(target).filter((other) => other !== held.item);
  }
  /** The items that count towards a target's capacity once the held one is dropped there. */
  #occupants(held, target) {
    if (held.effect === "copy") return this.#items(target);
    if (held.effect === "move") return this.#others(held, target);
    return linked(target).filter((key) => key !== held.key).flatMap((key) => this.#byKey(key) ?? []);
  }
  #candidates(held) {
    const source = this.#source(held.item);
    return Array.from(this.root.querySelectorAll("[data-ww-drop]")).filter((target) => {
      if (!target.dataset.wwDrop.split(/\s+/).includes(held.kind)) return false;
      if (target === source && held.effect !== "copy") return this.#mode(held, target) !== null;
      const max = capacity(target);
      return max === null || this.#occupants(held, target).length < max || target.dataset.wwDropFull === "swap";
    });
  }
  /** Every place the keyboard can step to, in document order. Includes the item's current place. */
  #places(held) {
    return held.candidates.flatMap((target) => {
      const place = { target, index: null, before: null, trailing: false, x: null, y: null };
      if (this.#mode(held, target) !== "index") return [place];
      return [...this.#others(held, target), null].map((before, index) => ({ ...place, index, before }));
    });
  }
  /** True for the place the item is at. */
  #home(held, place) {
    if (held.effect !== "move" || place.target !== this.#source(held.item)) return false;
    return place.index === null || place.index === this.#items(place.target).indexOf(held.item);
  }
  /** True if a drop at `place` would change nothing. */
  #unchanged(held, place) {
    if (held.effect === "link") return held.key !== void 0 && linked(place.target).includes(held.key);
    if (!this.#home(held, place)) return false;
    return place.x === null || place.x === held.home?.x && place.y === held.home.y;
  }
  #surface(held, target) {
    if (target.dataset.wwDropSpace === "world") {
      const world = this.#options.viewport;
      if (world) return worldSurfaceOf(world, held.item, Number(target.dataset.wwDropGrid) || 0);
      warnOnce(this.host.constructor, "drag:world", `<${this.host.localName}>: data-ww-drop-space="world" needs the viewport option of Drag. The target is measured as an ordinary point target.`);
    }
    const extent = held.extents.get(target) ?? { width: target.scrollWidth, height: target.scrollHeight };
    return surfaceOf(target, held.item, extent, Number(target.dataset.wwDropGrid) || 0);
  }
  /** The place under a point: hit testing picks the target, the siblings' layout picks the index. */
  #placeAt(held, x, y) {
    for (const hit of this.root.elementsFromPoint(x, y)) {
      if (held.lift && held.item.contains(hit)) continue;
      let target = hit.closest("[data-ww-drop]");
      while (target && !held.candidates.includes(target)) target = target.parentElement?.closest("[data-ww-drop]") ?? null;
      if (target) return this.#placeIn(held, target, { x, y });
    }
    return null;
  }
  /** The place in one target for a pointer position. Without a position: the end of an index target. A point is filled in by the caller. */
  #placeIn(held, target, at) {
    const place = { target, index: null, before: null, trailing: false, x: null, y: null };
    if (this.#mode(held, target) !== "index") return place;
    const others = this.#others(held, target);
    if (!at) return { ...place, index: others.length };
    const rects = others.map((other) => other.getBoundingClientRect());
    const { index, trailing } = indexAt(flowOf(target, rects), rects, at.x, at.y);
    return { ...place, index, before: others[index] ?? null, trailing };
  }
  /** Mark the candidates and the target under the item, and draw the marker of an index or the connector of a link. */
  #show(held, place, pointer) {
    for (const target of this.root.querySelectorAll("[data-ww-drop]")) {
      target.toggleAttribute("data-ww-drop-candidate", !!held?.candidates.includes(target));
      target.toggleAttribute("data-ww-drop-over", target === place?.target);
    }
    const overlay = this.#overlay;
    if (!overlay) return;
    if (held && place && place.index !== null) {
      const rects = this.#others(held, place.target).map((other) => other.getBoundingClientRect());
      overlay.marker(markerBox(flowOf(place.target, rects), rects, place.index, place.trailing, place.target.getBoundingClientRect()));
    } else overlay.marker(null);
    const end = held?.effect === "link" ? pointer ?? (place ? centreOf(place.target) : void 0) : void 0;
    overlay.connector(held && end ? centreOf(held.item) : null, end);
  }
  /** Shows the place chosen with the keyboard. The place the item is at already is not marked. */
  #display(held) {
    const place = held.places[held.index];
    this.#show(held, place && (held.index !== held.origin || held.lift) ? place : null);
  }
  #describe(held, place) {
    const mode = this.#mode(held, place.target);
    const name = mode ? place.target.dataset.wwLabel ?? place.target.getAttribute("aria-label") ?? "" : label(place.target);
    const messages = this.#messages.current;
    if (place.index !== null) return messages.over(name, { index: place.index + 1, count: this.#others(held, place.target).length + 1 });
    if (place.x !== null && place.y !== null) return messages.at(name, place.x, place.y);
    return messages.over(name);
  }
  // ── Pick-up and its end ───────────────────────────────────────────────
  /** Starts an interaction with an item, if `can` and the `ww-dragpick` handler agree. */
  #begin(item, via) {
    const declared = this.#declared(item);
    const kind = declared?.dataset.wwDrag;
    if (!declared || !kind || this.#busy || !this.#allowed() || !this.#takes(item, via)) return null;
    for (const animation of this.#settling) animation.finish();
    this.#settling.clear();
    const { wwDragEffect: effect, wwDragAxis: axis } = declared.dataset;
    const active = activeElement(item.ownerDocument);
    const held = {
      item,
      key: item.dataset.wwKey,
      kind,
      effect: effect === "copy" || effect === "link" ? effect : "move",
      axis: axis === "x" || axis === "y" ? axis : void 0,
      via,
      over: new AbortController(),
      candidates: [],
      extents: /* @__PURE__ */ new Map(),
      home: null,
      lift: null,
      places: [],
      index: -1,
      origin: -1,
      focus: active instanceof HTMLElement && composedContains(item, active) ? active : null
    };
    if (!this.#pick(held)) return null;
    const source = this.#source(item);
    if (source && held.candidates.includes(source) && this.#mode(held, source) === "point") {
      held.home = this.#surface(held, source).pointFor(centreOf(item));
    }
    if (via !== "pointer") {
      held.places = this.#places(held);
      held.index = held.origin = held.places.findIndex((place) => this.#home(held, place));
    }
    this.#held = held;
    if (!this.#slotted(item)) item.setAttribute("data-ww-dragging", "");
    this.#set(item, via);
    this.whileAllowed(() => this.#allowed(), held.over.signal).addEventListener("abort", () => this.#cancel(held, true), { once: true });
    if (via === "pointer") return held;
    const options = { capture: true, signal: held.over.signal };
    const escape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.#cancel(held);
    };
    const outside = (event) => {
      if (!event.composedPath().includes(this.root)) this.#cancel(held);
    };
    window.addEventListener("keydown", escape, options);
    window.addEventListener("click", outside, options);
    return held;
  }
  /** Reads the candidates and lets a `ww-dragpick` handler filter them. False if the handler refused the pick-up. */
  #pick(held) {
    const offered = this.#candidates(held);
    const detail = {
      item: held.item,
      key: held.key,
      kind: held.kind,
      effect: held.effect,
      source: this.#source(held.item),
      candidates: [...offered]
    };
    if (!held.item.dispatchEvent(new CustomEvent("ww-dragpick", { detail, bubbles: true, composed: true, cancelable: true }))) return false;
    const kept = detail.candidates;
    held.candidates = offered.filter((target) => Array.isArray(kept) && kept.includes(target));
    held.extents = new Map(held.candidates.filter((target) => this.#mode(held, target) === "point").map((target) => [target, { width: target.scrollWidth, height: target.scrollHeight }]));
    return true;
  }
  /**
   * Checks that what the interaction holds is still in the template. A
   * framework may render the shadow root anew at any time: a keyed item is
   * then found again by its key and the interaction goes on with the new
   * element, with fresh candidates. False if the item is gone.
   */
  #current(held) {
    const { item, key } = held;
    const stale = !item.isConnected || item.dataset.wwKey !== key || this.#declared(item)?.dataset.wwDrag !== held.kind;
    if (stale) {
      const next = key === void 0 ? null : this.#byKey(key, held.kind);
      if (!next) return false;
      const refocus = held.via !== "pointer" && held.focus !== null;
      held.lift?.cancel();
      item.removeAttribute("data-ww-dragging");
      held.item = next;
      held.focus = refocus ? next : null;
      if (!this.#slotted(next)) next.setAttribute("data-ww-dragging", "");
      if (held.lift) held.lift = new Lift(next, this.#options.lift);
      if (refocus) next.focus();
      this.#set(next, held.via);
    }
    if (stale || held.candidates.some((target) => !target.isConnected)) return this.#pick(held);
    return true;
  }
  /**
   * Reads the places again after a render. The chosen one is kept where its
   * target is still there, or, after a render that replaced every element,
   * where the places are as many as before.
   */
  #replace(held) {
    const chosen = held.places[held.index];
    const count = held.places.length;
    held.places = this.#places(held);
    held.origin = held.places.findIndex((place) => this.#home(held, place));
    if (!chosen) return;
    const same = held.places.findIndex((place) => place.target === chosen.target && place.index === chosen.index);
    const index = same < 0 && !chosen.target.isConnected && held.places.length === count ? held.index : same;
    held.index = index < 0 ? held.origin : index;
    if (index >= 0) Object.assign(held.places[index], { x: chosen.x, y: chosen.y });
    else this.#unlift(held);
  }
  #unlift(held) {
    held.lift?.cancel();
    held.lift = null;
  }
  /** Ends an interaction and removes everything it showed. Changes nothing in the document. */
  #release(held) {
    held.over.abort();
    this.#unlift(held);
    held.item.removeAttribute("data-ww-dragging");
    if (this.#held !== held) return;
    this.#held = null;
    this.#pressed = false;
    this.#show(null, null);
    this.#set(null);
  }
  /** Ends an interaction without a commit. `refused`: because `can` turned false. */
  #cancel(held, refused = false) {
    if (this.#held !== held) return;
    const first = this.#layout();
    this.#release(held);
    if (held.via === "pointer") this.#gesture?.cancel();
    const messages = this.#messages.current;
    if (refused) this.#announce(messages.notAllowed);
    else if (held.via !== "pointer") this.#announce(messages.cancelled());
    void Promise.resolve(this.#options.rendered?.()).then(() => {
      if (this.connected) this.#play(first);
    });
  }
  // ── Pointer ───────────────────────────────────────────────────────────
  #down = (event) => {
    this.#dragged = false;
    const picked = this.#held;
    if (picked && picked.via !== "pointer") this.#press(picked);
    if (this.#busy || this.#gesture || event.button !== 0) return;
    const found = this.#find(event);
    if (!found || !this.#startsAt(found, event) || !this.#allowed() || !this.#takes(found.item, "pointer")) return;
    void this.#track(found.item, event);
  };
  /** While this press lasts, the focus it moves does not end the pick-up: the click that follows decides. */
  #press(held) {
    this.#pressed = true;
    const press = new AbortController();
    const options = { capture: true, signal: AbortSignal.any([press.signal, held.over.signal]) };
    const up = () => {
      this.#pressed = false;
      press.abort();
    };
    window.addEventListener("pointerup", up, options);
    window.addEventListener("pointercancel", up, options);
  }
  async #track(item, down) {
    const gesture = this.#gesture = new PointerGesture(item, down);
    const guard = { capture: true, signal: gesture.ended };
    window.addEventListener("selectstart", (event) => event.preventDefault(), guard);
    window.addEventListener("dragstart", (event) => event.preventDefault(), guard);
    let held = null;
    let scroll = null;
    let panning = false;
    const pressed = centreOf(item);
    const grab = { x: down.clientX - pressed.x, y: down.clientY - pressed.y };
    let request = 0;
    gesture.ended.addEventListener("abort", () => {
      cancelAnimationFrame(request);
      if (this.#gesture === gesture) this.#gesture = null;
    });
    const frame = () => {
      if (!held || this.#held !== held) return;
      if (!this.#allowed()) return this.#cancel(held, true);
      if (!this.#current(held)) return this.#cancel(held);
      const pointer = { x: gesture.last.clientX, y: gesture.last.clientY };
      scroll?.step(pointer.x, pointer.y);
      if (panning) this.#options.viewport.autoPan(pointer.x, pointer.y);
      this.#show(held, this.#follow(held, pointer, grab), pointer);
      request = requestAnimationFrame(frame);
    };
    for await (const _ of gesture) {
      if (held) continue;
      this.#dragged = true;
      if (this.#held) this.#cancel(this.#held);
      held = this.#begin(item, "pointer");
      if (!held) {
        gesture.cancel();
        break;
      }
      panning = !!this.#options.viewport?.autoPan && held.candidates.some((target) => this.#mode(held, target) === "point" && target.dataset.wwDropSpace === "world");
      scroll = new AutoScroll(held.candidates);
      if (held.effect !== "link") held.lift = new Lift(item, this.#options.lift);
      frame();
    }
    if (!held || this.#held !== held) return;
    if (gesture.cancelled || !this.connected) return this.#cancel(held);
    await this.#drop(held, this.#follow(held, { x: gesture.last.clientX, y: gesture.last.clientY }, grab));
  }
  /** Moves the lifted item with the pointer, within its axis and the grid of a point target, and returns the place it is over. */
  #follow(held, pointer, grab) {
    const place = this.#placeAt(held, pointer.x, pointer.y);
    const lift = held.lift;
    if (!lift) return place;
    const wanted = lift.reach({ x: pointer.x - grab.x, y: pointer.y - grab.y }, held.axis);
    if (!place || this.#mode(held, place.target) !== "point") {
      lift.moveTo(wanted, held.axis);
      return place;
    }
    const surface = this.#surface(held, place.target);
    const point = surface.fit(surface.pointFor(wanted), held.axis && (held.axis === "x" ? "y" : "x"));
    lift.moveTo(surface.centreFor(point), held.axis);
    return { ...place, ...point };
  }
  // ── Click, then click ─────────────────────────────────────────────────
  #click = (event) => {
    const afterDrag = this.#dragged && event.detail !== 0;
    this.#dragged = false;
    if (afterDrag || event.defaultPrevented || this.#busy) return;
    const held = this.#held;
    if (!held) {
      const found2 = this.#clicked(event);
      if (found2) this.#select(found2.item);
      return;
    }
    if (held.via === "pointer" || held.via === "keyboard" && event.detail === 0) return;
    const path = event.composedPath();
    if (path.includes(held.item)) return this.#cancel(held);
    const target = path.find((node) => node instanceof HTMLElement && held.candidates.includes(node));
    if (target && !this.#inControl(event, target)) {
      const at = event.detail === 0 ? null : { x: event.clientX, y: event.clientY };
      const place = this.#placeIn(held, target, at);
      if (this.#mode(held, target) === "point") {
        const surface = this.#surface(held, target);
        Object.assign(place, surface.fit(surface.pointFor(at ?? centreOf(target))));
      }
      return void this.#drop(held, place);
    }
    const found = this.#clicked(event);
    this.#cancel(held);
    if (found) this.#select(found.item);
  };
  /** The item a click picks up: clicked where a drag would start, and not in a control inside it. */
  #clicked(event) {
    const found = this.#find(event);
    return found && this.#startsAt(found, event) && !this.#inControl(event, found.handle ?? found.item) ? found : null;
  }
  /** True if a click landed in a link, a button or a field below `until`. Such a click is the control's own. Items and handles are no such controls. */
  #inControl(event, until) {
    for (const node of event.composedPath()) {
      if (node === until) break;
      if (node instanceof HTMLElement && node.matches(CONTROLS) && !node.hasAttribute("data-ww-drag-handle") && !this.#declared(node)) return true;
    }
    return false;
  }
  #select(item) {
    const held = this.#begin(item, "click");
    if (!held) return;
    if (held.places.length === 0) return this.#release(held);
    this.#show(held, null);
    this.#announce(this.#messages.current.selected(label(item)));
  }
  // ── Keyboard ──────────────────────────────────────────────────────────
  #keydown = (event) => {
    if (this.#busy || this.#gesture) return;
    const held = this.#held;
    if (!held) {
      if (event.key === " " || event.key === "Enter") this.#pickUp(event);
      return;
    }
    if (!event.composedPath().includes(held.item)) return;
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      this.#step(held, arrow, event.shiftKey);
    } else if (event.key === "Tab" && new Set(held.places.map((place) => place.target)).size > 1) {
      event.preventDefault();
      this.#jump(held, event.shiftKey ? -1 : 1);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      void this.#drop(held, held.places[held.index] ?? null);
    }
  };
  #pickUp(event) {
    const found = this.#find(event);
    if (!found) return;
    const { item } = found;
    if (event.composedPath()[0] !== item && !found.handle) return;
    if (!found.handle && this.#slotted(item) && item.isContentEditable) return;
    const held = this.#begin(item, "keyboard");
    if (!held) return;
    event.preventDefault();
    if (held.places.length - (held.origin < 0 ? 0 : 1) === 0 && !held.home) return this.#release(held);
    this.#show(held, null);
    const messages = this.#messages.current;
    const targets = new Set(held.places.map((place) => place.target));
    const hint = targets.size > 1 && [...targets].some((target) => this.#mode(held, target) === "point") ? ` ${messages.nextTarget}` : "";
    this.#announce((held.effect === "link" ? messages.pickedLink : messages.picked)(label(item)) + hint);
  }
  /** An arrow key: inside a point target it moves the item, elsewhere it steps to the next place. */
  #step(held, arrow, fine) {
    const place = held.places[held.index];
    if (place && this.#mode(held, place.target) === "point") return this.#nudge(held, place, arrow, fine);
    const count = held.places.length;
    if (count === 0) return;
    const by = arrow.x + arrow.y;
    this.#choose(held, held.index < 0 ? by > 0 ? 0 : count - 1 : (held.index + by + count) % count);
  }
  /** Tab: the first place of the next candidate target. */
  #jump(held, by) {
    const targets = [...new Set(held.places.map((place) => place.target))];
    const now = targets.indexOf(held.places[held.index]?.target);
    const next = targets[now < 0 ? by > 0 ? 0 : targets.length - 1 : (now + by + targets.length) % targets.length];
    this.#choose(
      held,
      held.places.findIndex((place) => place.target === next)
    );
  }
  #choose(held, index) {
    held.index = index;
    const place = held.places[index];
    if (this.#mode(held, place.target) === "point") this.#preview(held, place);
    else this.#unlift(held);
    this.#display(held);
    const shown = place.index !== null ? place.before ?? this.#others(held, place.target).at(-1) : held.lift ? held.item : void 0;
    (shown ?? place.target).scrollIntoView({ block: "nearest", inline: "nearest" });
    this.#announce(this.#describe(held, place));
  }
  /** Lifts the item to its point in a point target. A place entered for the first time starts where the item is, or in the middle of the target. */
  #preview(held, place) {
    const surface = this.#surface(held, place.target);
    if (place.x === null || place.y === null) {
      const start = this.#home(held, place) && held.home || surface.fit(surface.pointFor(centreOf(place.target)));
      Object.assign(place, start);
    }
    held.lift ??= new Lift(held.item, this.#options.lift);
    held.lift.moveTo(surface.centreFor({ x: place.x, y: place.y }));
  }
  /** Moves the item inside a point target by one grid step, or by ten pixels (with Shift: one) where there is no grid. */
  #nudge(held, place, arrow, fine) {
    if (held.axis === "x" && arrow.y || held.axis === "y" && arrow.x) return;
    if (place.x === null || place.y === null) this.#preview(held, place);
    const step = Number(place.target.dataset.wwDropGrid) || (fine ? 1 : NUDGE);
    const point = this.#surface(held, place.target).fit({ x: place.x + arrow.x * step, y: place.y + arrow.y * step }, held.axis && (held.axis === "x" ? "y" : "x"));
    Object.assign(place, point);
    this.#preview(held, place);
    held.item.scrollIntoView({ block: "nearest", inline: "nearest" });
    this.#preview(held, place);
    this.#display(held);
    this.#announce(this.#describe(held, place));
  }
  #focusout = (event) => {
    const held = this.#held;
    if (!held || held.via === "pointer" || this.#pressed || !event.composedPath().includes(held.item)) return;
    const next = event.relatedTarget;
    if (next instanceof Node) {
      if (!composedContains(held.item, next)) this.#cancel(held);
      return;
    }
    queueMicrotask(() => {
      const { item } = held;
      if (this.#held === held && item.isConnected && !composedContains(item, activeElement(item.ownerDocument))) this.#cancel(held);
    });
  };
  // ── Commit ────────────────────────────────────────────────────────────
  /** Commits the item to `place`, or puts it back if there is none. Resolves to whether it committed. */
  async #drop(held, place) {
    const allowed = this.#allowed();
    const valid = place && allowed && this.#current(held) && held.candidates.includes(place.target) && (!place.before || place.before.isConnected);
    if (!valid || this.#unchanged(held, place)) {
      this.#cancel(held, !!place && !allowed);
      return false;
    }
    this.#busy = true;
    try {
      const { item, effect } = held;
      const detail = this.#detail(held, place);
      const names = [label(item), this.#describe(held, place)];
      const first = this.#layout();
      this.#release(held);
      let committed = false;
      await transaction(this.host, async () => {
        committed = place.target.dispatchEvent(new CustomEvent("ww-dragcommit", { detail, bubbles: true, composed: true, cancelable: true }));
        if (committed && detail.slot !== null) this.#move(detail);
        await this.#options.rendered?.();
      });
      if (!this.connected) return committed;
      if (held.via !== "pointer") {
        const messages = this.#messages.current;
        const done = effect === "link" ? messages.linked : effect === "copy" ? messages.copied : messages.dropped;
        this.#announce(committed ? done(...names) : messages.cancelled());
        this.#refocus(held);
      }
      if (committed && effect === "copy") first.items = first.items.filter((entry) => entry.element !== item);
      this.#play(first);
      return committed;
    } finally {
      this.#busy = false;
    }
  }
  #detail(held, place) {
    const { item, key, kind, effect } = held;
    const { target, index, before, x, y } = place;
    const max = capacity(target);
    const occupants = this.#occupants(held, target);
    const displaced = max !== null && occupants.length >= max ? (index !== null ? before ?? occupants.at(-1) : occupants[max - 1]) ?? null : null;
    const slot = effect === "move" && this.#slotted(item) ? Array.from(target.querySelectorAll("slot[data-ww-drag]")).find((each) => each.dataset.wwDrag === kind) : void 0;
    return { item, key, kind, effect, source: this.#source(item), target, displaced, index, before, x, y, slot: slot ? slot.name : null };
  }
  /**
   * The default action for an authored child: move it among its siblings
   * and into the target's slot. An item the target hands back takes the
   * place and the slot the moved one had.
   */
  #move({ item, target, before, displaced, slot }) {
    const home = { parent: item.parentNode, next: item.nextSibling === displaced ? displaced?.nextSibling ?? null : item.nextSibling, slot: item.getAttribute("slot") ?? "" };
    const neighbour = before ?? this.#items(target).filter((other) => other !== item).at(-1);
    if (neighbour?.parentNode) relocate(item, neighbour.parentNode, before ?? neighbour.nextSibling);
    assign(item, slot ?? "");
    if (!displaced || displaced === item || !home.parent) return;
    relocate(displaced, home.parent, home.next);
    assign(displaced, home.slot);
  }
  /** Focus returns to the item, or to what had it inside the item, as soon as it is dropped. */
  #refocus(held) {
    if (held.via === "click" && !held.focus) return;
    const item = held.key === void 0 ? held.item : this.#byKey(held.key, held.kind);
    if (!item) return;
    const target = held.focus?.isConnected && composedContains(item, held.focus) ? held.focus : item;
    if (activeElement(item.ownerDocument) !== target) target.focus();
  }
  #layout() {
    const items = this.#items(this.root).map((element) => ({
      element,
      key: element.dataset.wwKey,
      rect: element.getBoundingClientRect()
    }));
    const heights = /* @__PURE__ */ new Map();
    for (const target of this.root.querySelectorAll("[data-ww-drop]")) {
      heights.set(target, target.getBoundingClientRect().height);
    }
    return { items, heights };
  }
  /** Animate from an earlier layout to the current one. Web Animations write no style attributes. */
  #play(first) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timing = {
      duration: this.#options.duration ?? 200,
      easing: this.#options.easing ?? "cubic-bezier(0.2, 0, 0, 1)"
    };
    const run = (element, keyframes) => {
      const animation = element.animate(keyframes, timing);
      this.#settling.add(animation);
      const done = () => this.#settling.delete(animation);
      animation.finished.then(done, done);
    };
    for (const [target, height] of first.heights) {
      const now = target.getBoundingClientRect().height;
      if (target.isConnected && Math.abs(height - now) >= 0.5) run(target, [{ height: `${height}px` }, { height: `${now}px` }]);
    }
    for (const item of this.#items(this.root)) {
      const key = item.dataset.wwKey;
      const before = first.items.find((entry) => key !== void 0 ? entry.key === key : entry.element === item)?.rect;
      if (!before) continue;
      const now = item.getBoundingClientRect();
      const dx = before.left - now.left;
      const dy = before.top - now.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      run(item, [
        { translate: `${dx}px ${dy}px`, zIndex: 1e3 },
        { translate: "0 0", zIndex: 1e3 }
      ]);
    }
  }
}
export {
  DragCore,
  dragMessages2 as dragMessages
};
