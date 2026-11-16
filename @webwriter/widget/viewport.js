import { ModuleCore, warnOnce } from "./base.js";
import { PointerGesture } from "./gesture.js";
import { Messages } from "./messages.js";
import { viewportMessages } from "./messages/viewport/index.js";
import { adoptStyles } from "./styles.js";
import { transaction } from "./transaction.js";
import { clickedAction, controlsCss, removeControls, renderControls } from "./viewport/controls.js";
import { PinchGesture } from "./viewport/pinch.js";
import { viewportMessages as viewportMessages2 } from "./messages/viewport/index.js";
const BUTTON_STEP = 1.2;
const WHEEL_STEP = 2e-3;
const KEY_PAN = 40;
const PAGE = 0.875;
const SAVE_DELAY = 200;
const EPSILON = 1e-6;
const GLIDE_MS = 350;
const PAN_EDGE = 64;
const PAN_STEP = 16;
const SCROLL = `[data-ww-viewport]:not(canvas, [data-ww-viewport="canvas"], [data-ww-viewport="external"])`;
const CANVAS = `:is(canvas[data-ww-viewport]:not([data-ww-viewport="external"]), [data-ww-viewport="canvas"])`;
const ZOOM_RULE = 0;
const SCROLL_RULE = 1;
const TOUCH_RULE = 2;
const css = `
${SCROLL} > :first-child { zoom: 1; }
${SCROLL} { overflow: auto; }
${CANVAS} { touch-action: none; }
${SCROLL} { scroll-axis-lock: none; }
${SCROLL}[data-ww-viewport-pan="x"] { overflow-y: hidden; }
${SCROLL}[data-ww-viewport-pan="y"] { overflow-x: hidden; }
${controlsCss}`;
const KEYS = { "+": "in", "=": "in", "-": "out", "−": "out", "0": "fit" };
const ARROWS = { ArrowLeft: [KEY_PAN, 0], ArrowRight: [-KEY_PAN, 0], ArrowUp: [0, KEY_PAN], ArrowDown: [0, -KEY_PAN] };
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
function formOf(win) {
  const value = win.getAttribute("data-ww-viewport");
  if (value === "external") return "external";
  return value === "canvas" || win instanceof HTMLCanvasElement ? "canvas" : "scroll";
}
function cornerOf(win) {
  const rect = win.getBoundingClientRect();
  return { x: rect.left + win.clientLeft, y: rect.top + win.clientTop };
}
class ViewportCore extends ModuleCore {
  #options;
  #messages;
  #snapshot = { x: 0, y: 0, scale: 1, min: 0.25, max: 4, width: 0, height: 0 };
  #styles = null;
  #sizes = null;
  /** The window and its world as last observed. Only compared by identity. */
  #watched = [];
  #field = null;
  #opened = false;
  /** True until something else than fit changed the view. The view then follows the window size. */
  #followsFit = true;
  /** What the last fit was computed for, so that the module's own scaling does not fit again. */
  #fitted = null;
  /** How the last fit, if it was a call, wants the view to follow; null: what the window says. */
  #followCall = null;
  /** The animation of the view that runs, and what ends it. */
  #glide = null;
  /** A change of the view asked for before the window had a size: applied right after it opens. */
  #queued = null;
  #waiters = [];
  #autoFrame = 0;
  #fitSerial = 0;
  /** The view of a window that the template replaced, as centre and scale, for the new window. */
  #carried = null;
  /** The scroll position the module set itself, to tell its own scroll events from the reader's. */
  #expected = null;
  /** Set while Space is held on the window. `used` once a drag made it the hand. */
  #space = null;
  #pivot = null;
  #pan = null;
  #pinch = null;
  #origin = null;
  #timer = 0;
  /** Attributes the module wrote on a window, with the values it wrote. */
  #written = /* @__PURE__ */ new WeakMap();
  #adapter = null;
  #unsubscribe = null;
  constructor(host, options = {}) {
    super(host, options);
    this.#options = options;
    this.#messages = new Messages(host, viewportMessages, options.messages);
  }
  getSnapshot() {
    return this.#snapshot;
  }
  /** The form of the window, or null while the template has none. */
  get form() {
    const win = this.#win();
    return win ? formOf(win) : null;
  }
  /** True in the canvas form, where the module owns the position and every change of it has to be drawn. */
  get tracksView() {
    return this.form === "canvas";
  }
  /**
   * Converts a client point, such as `event.clientX/Y`, to world coordinates.
   * It is bound, so it can be passed on: `new PointerGesture(surface, event,
   * {convert: viewport.toWorld})` delivers its samples in world coordinates
   * and follows a view that changes during the gesture. In the external form
   * the library converts; the point is returned as it is.
   */
  toWorld = (clientX, clientY) => {
    const win = this.#win();
    if (!win || formOf(win) === "external") return { x: clientX, y: clientY };
    const view = this.#view(win);
    const corner = cornerOf(win);
    return { x: (clientX - corner.x - view.x) / view.scale, y: (clientY - corner.y - view.y) / view.scale };
  };
  /** Converts a world point to client coordinates: the inverse of `toWorld()`. Bound, like `toWorld`. */
  toClient = (worldX, worldY) => {
    const win = this.#win();
    if (!win || formOf(win) === "external") return { x: worldX, y: worldY };
    const view = this.#view(win);
    const corner = cornerOf(win);
    return { x: worldX * view.scale + view.x + corner.x, y: worldY * view.scale + view.y + corner.y };
  };
  /** Sets the scale. The world point under `about` (a client point, default: the centre) stays where it is. */
  zoomTo(scale, about) {
    const win = this.#win();
    const adapter = this.#external(win);
    if (adapter) adapter.zoomBy(scale / adapter.scale);
    else if (win) this.#zoom(win, scale, about);
  }
  /** Multiplies the scale. See `zoomTo()`. */
  zoomBy(factor, about) {
    this.zoomTo(this.#snapshot.scale * factor, about);
  }
  /** Moves the content by CSS pixels. Does nothing in the external form. */
  panBy(dx, dy) {
    const win = this.#win();
    if (win && formOf(win) !== "external") this.#panBy(win, dx, dy);
  }
  /**
   * Returns to the fitted view: the content (the fit `target`, else
   * `bounds`) in the window, with the padding, inset and largest scale of
   * `fit`. Resolves with the view once it is applied, after the animation
   * if `animate` is given. In the external form the library fits.
   */
  fit(call = {}) {
    const win = this.#win();
    const adapter = this.#external(win);
    if (adapter) adapter.fit();
    else if (win && formOf(win) !== "external") return this.#refit(win, false, { reason: "request", follow: call.follow, box: call.box, ms: this.#duration(call.animate) }).then(() => this.#snapshot);
    return Promise.resolve(this.#snapshot);
  }
  /**
   * Resolves with the view when the window has a size and the view is a
   * fitted one that is up to date: at once if it is, else after the fit that
   * makes it so (the first one, or the next after the view was changed by
   * something else). Rejects with an `AbortError` if the core disconnects
   * first. For code that has to wait for the first fit, or for the fit after
   * content changed; the same moment is announced by `ww-viewportfit`.
   */
  fitted() {
    if (!this.connected) return Promise.reject(new DOMException("Viewport is not connected", "AbortError"));
    return new Promise((resolve, reject) => {
      this.#waiters.push({ resolve, reject });
      this.#flush();
    });
  }
  /**
   * Puts this world point in the centre of the window, and optionally sets
   * the scale (within the limits). The view is then no longer a fitted one.
   * Called before the window has a size, it is applied when it opens.
   * Resolves when the view is there; an animation that something else
   * interrupts resolves at that moment. External form: does nothing.
   */
  centerOn(point, scale, motion = {}) {
    return this.#set((win) => {
      const next = clamp(scale ?? this.#snapshot.scale, ...this.#limits(win));
      return { scale: next, x: win.clientWidth / 2 - point.x * next, y: win.clientHeight / 2 - point.y * next };
    }, motion);
  }
  /**
   * Sets the view: where the world's origin is drawn (`x`, `y`, in CSS pixels
   * from the window's top-left corner) and the scale. With only `scale` the
   * world point in the centre stays there. The view is then no longer a
   * fitted one. Otherwise like `centerOn()`.
   */
  setView(view, motion = {}) {
    return this.#set((win) => {
      const next = clamp(view.scale ?? this.#snapshot.scale, ...this.#limits(win));
      if ("x" in view) return { scale: next, x: view.x, y: view.y };
      const centre = this.#centre({ ...this.#view(win), width: win.clientWidth, height: win.clientHeight });
      return { scale: next, x: win.clientWidth / 2 - centre.x * next, y: win.clientHeight / 2 - centre.y * next };
    }, motion);
  }
  /**
   * One step of panning for a pointer held at the edge of the window: the
   * view moves towards what lies beyond, faster the closer the pointer is to
   * the edge. Call it once per animation frame with the pointer's client
   * position, for a drag that began outside the window (a gate from a
   * sidebar) or inside it. Does nothing for a pointer outside the window.
   * Returns whether the view moved. Panning stops at the limits.
   */
  autoPan(clientX, clientY) {
    const win = this.#win();
    if (!win || formOf(win) === "external") return false;
    const box = win.getBoundingClientRect();
    if (clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return false;
    const depth = (at, start, end) => {
      const edge = Math.min(PAN_EDGE, (end - start) / 4);
      return at < start + edge ? -(1 - (at - start) / edge) : at > end - edge ? 1 - (end - at) / edge : 0;
    };
    const dx = depth(clientX, box.left, box.right);
    const dy = depth(clientY, box.top, box.bottom);
    return !!(dx || dy) && this.#panBy(win, -dx * PAN_STEP, -dy * PAN_STEP, true);
  }
  /** `autoPan()` once per animation frame while `source` (a `PointerGesture`) runs, so that a pointer held still at the edge keeps panning. */
  autoPanWhile(source) {
    if (!this.connected) return;
    cancelAnimationFrame(this.#autoFrame);
    const step = () => {
      if (source.ended.aborted || !this.connected) return;
      this.autoPan(source.last.clientX, source.last.clientY);
      this.#autoFrame = requestAnimationFrame(step);
    };
    this.#autoFrame = requestAnimationFrame(step);
  }
  /**
   * Canvas form: tells the viewport that the extent `bounds()` returns
   * changed. A fitted view fits again, and any other view is brought back
   * inside the limits. A render does the same.
   */
  contentChanged() {
    const win = this.#win();
    if (win && this.#opened && formOf(win) === "canvas") this.#settle(win);
  }
  onConnect() {
    const root = this.root;
    this.#styles = adoptStyles(root, css);
    this.cleanup(this.#styles);
    this.cleanup(this.#messages.follow(() => this.refresh()));
    this.#sizes = new ResizeObserver(() => this.#resized());
    const attributes = new MutationObserver((records) => this.#hostChanged(records));
    attributes.observe(this.host, { attributes: true });
    this.listen(root, "wheel", (event) => this.#wheel(event), { passive: false });
    this.listen(root, "pointerdown", (event) => this.#claim(event), { capture: true });
    this.listen(root, "pointerdown", (event) => this.#press(event));
    this.listen(root, "keydown", (event) => this.#key(event));
    this.listen(root, "keyup", (event) => this.#keyup(event));
    this.listen(root, "focusout", () => this.#space = null);
    this.listen(root, "click", (event) => this.#click(event));
    this.listen(root, "scroll", (event) => this.#scrolled(event), { capture: true });
    this.cleanup(() => {
      this.#sizes?.disconnect();
      attributes.disconnect();
      this.#drop();
      this.#unsubscribe?.();
      clearTimeout(this.#timer);
      cancelAnimationFrame(this.#autoFrame);
      this.#stop();
      this.#queued?.done();
      for (const waiter of this.#waiters.splice(0)) waiter.reject(new DOMException("Viewport disconnected", "AbortError"));
      removeControls(root);
      const win = this.#watched[0];
      for (const [name, value] of win && this.#written.get(win) || []) if (win.getAttribute(name) === value) win.removeAttribute(name);
      if (win) this.#written.delete(win);
      this.#styles = this.#sizes = this.#field = this.#expected = this.#pivot = this.#space = this.#origin = this.#carried = this.#adapter = this.#unsubscribe = this.#fitted = this.#followCall = this.#queued = null;
      this.#watched = [];
      this.#opened = false;
      this.#followsFit = true;
    });
  }
  onRefresh() {
    const wins = this.root.querySelectorAll("[data-ww-viewport]");
    if (wins.length > 1) {
      warnOnce(
        this.host.constructor,
        "viewport:many",
        `<${this.host.localName}>: ${wins.length} elements are marked data-ww-viewport. A widget has one viewport; only the first one is used.`
      );
    }
    const win = wins[0] ?? null;
    const form = win && formOf(win);
    const world = win && form === "scroll" ? win.firstElementChild : null;
    const watched = win ? world ? [win, world] : [win] : [];
    if (watched.length !== this.#watched.length || watched.some((element, i) => element !== this.#watched[i])) {
      if (win !== this.#watched[0]) {
        if (this.#watched[0] && this.#opened && !this.#followsFit) this.#carried = this.#centre(this.#snapshot);
        this.#opened = false;
        this.#drop();
      }
      this.#sizes.disconnect();
      if (win) this.#sizes.observe(win, { box: "border-box" });
      if (world) this.#sizes.observe(world);
      this.#watched = watched;
    }
    this.#adapt(!win || form === "external" ? this.#options.adapter?.() ?? null : null);
    if (win && form === "external" && !this.#options.adapter) {
      warnOnce(this.host.constructor, "viewport:adapter", `<${this.host.localName}>: data-ww-viewport="external" needs the adapter option of Viewport.`);
    }
    if (win) this.#prepare(win, form);
    if (win && this.#opened && form === "canvas") this.#settle(win);
    this.#lock();
    this.#controls();
  }
  // ── Reading the template ──────────────────────────────────────────────
  #win() {
    return this.connected ? this.root.querySelector("[data-ww-viewport]") : null;
  }
  #allowed() {
    return this.#options.can?.() !== false;
  }
  /** The adapter, if a library owns the view: an external window, or no window at all. */
  #external(win) {
    return !win || formOf(win) === "external" ? this.#adapter : null;
  }
  #limits(win) {
    if (!win || formOf(win) === "external") return this.#adapter ? [this.#adapter.min, this.#adapter.max] : [this.#snapshot.min, this.#snapshot.max];
    const [min, max] = (win.dataset.wwViewportZoom ?? "").trim().split(/\s+/).map(Number);
    return min > 0 && max >= min ? [min, max] : [0.25, 4];
  }
  /** The window is focusable and has a role and a label. What the template sets is kept. */
  #prepare(win, form) {
    const written = this.#written.get(win) ?? /* @__PURE__ */ new Map();
    this.#written.set(win, written);
    const want = (name, value) => {
      const current = win.getAttribute(name);
      if (current === value || current !== null && written.get(name) !== current) return;
      win.setAttribute(name, value);
      written.set(name, value);
    };
    want("tabindex", "0");
    want("role", "group");
    if (!win.hasAttribute("aria-labelledby")) want("aria-label", this.#messages.current.viewport);
    this.#field = form !== "external" && win.dataset.wwViewportSave || null;
  }
  /** Follows the library's own view while the adapter is this object. */
  #adapt(adapter) {
    if (adapter === this.#adapter) return;
    this.#unsubscribe?.();
    this.#adapter = adapter;
    this.#unsubscribe = adapter?.subscribe(() => this.#commit(this.#win(), this.#snapshot)) ?? null;
    this.#commit(this.#win(), this.#snapshot);
  }
  /** The current view. In the scroll form the position is measured, because the browser owns it. */
  #view(win) {
    const { x, y, scale } = this.#snapshot;
    if (formOf(win) !== "scroll") return { x, y, scale };
    const world = win.firstElementChild;
    if (!world) return { x: -win.scrollLeft, y: -win.scrollTop, scale };
    const corner = cornerOf(win);
    const rect = world.getBoundingClientRect();
    return { x: rect.left - corner.x, y: rect.top - corner.y, scale };
  }
  /** The centre of a view in world coordinates, with its scale: the form in which a view is saved. */
  #centre(view) {
    return { x: (view.width / 2 - view.x) / view.scale, y: (view.height / 2 - view.y) / view.scale, scale: view.scale };
  }
  #commit(win, view) {
    const [min, max] = this.#limits(win);
    const adapter = this.#external(win);
    const next = {
      x: adapter ? 0 : view.x,
      y: adapter ? 0 : view.y,
      scale: adapter ? adapter.scale : view.scale,
      min,
      max,
      width: win?.clientWidth ?? 0,
      height: win?.clientHeight ?? 0
    };
    const before = this.#snapshot;
    if (Object.keys(next).every((key) => Math.abs(next[key] - before[key]) < EPSILON)) return;
    this.#snapshot = next;
    this.#controls();
    this.notify();
  }
  // ── Changing the view ─────────────────────────────────────────────────
  /**
   * Canvas form: the limits of panning. On an axis where the content is larger
   * than the window, its edges stop at the window's edges, as a scroll range
   * does. Where it is smaller, it stays wholly inside the window. `margin`
   * widens both.
   */
  #limited(win, view) {
    const box = this.#options.bounds?.();
    if (!box) return view;
    const margin = this.#options.margin ?? 0;
    const within = (value, start, size, room) => {
      const leading = -start * view.scale;
      const trailing = room - (start + size) * view.scale;
      return clamp(value, Math.min(leading, trailing) - margin, Math.max(leading, trailing) + margin);
    };
    return { scale: view.scale, x: within(view.x, box.x, box.width, win.clientWidth), y: within(view.y, box.y, box.height, win.clientHeight) };
  }
  /** `free` ignores `data-ww-viewport-pan`, which restricts input but not fit or a saved view. */
  #move(win, view, free = false) {
    const axis = free ? void 0 : win.dataset.wwViewportPan;
    if (formOf(win) === "canvas") {
      const now = this.#view(win);
      this.#commit(win, this.#limited(win, { scale: view.scale, x: axis === "y" ? now.x : view.x, y: axis === "x" ? now.y : view.y }));
      return;
    }
    ;
    this.#styles?.sheet.cssRules[ZOOM_RULE]?.style.setProperty("zoom", String(view.scale));
    const scaled = this.#view(win);
    if (axis !== "y") win.scrollLeft += scaled.x - view.x;
    if (axis !== "x") win.scrollTop += scaled.y - view.y;
    this.#expected = { left: win.scrollLeft, top: win.scrollTop };
    this.#commit(win, { ...this.#view(win), scale: view.scale });
  }
  #zoom(win, scale, about, save = false) {
    this.#stop();
    const [min, max] = this.#limits(win);
    const corner = cornerOf(win);
    const at = about ? { x: about.x - corner.x, y: about.y - corner.y } : { x: win.clientWidth / 2, y: win.clientHeight / 2 };
    const view = this.#view(win);
    const next = clamp(scale, min, max);
    const pivot = this.#pivot;
    const continued = pivot && pivot.x === at.x && pivot.y === at.y && ["x", "y", "scale"].every((key) => Math.abs(pivot.view[key] - view[key]) < 0.01);
    const world = continued ? pivot.world : { x: (at.x - view.x) / view.scale, y: (at.y - view.y) / view.scale };
    this.#followsFit = false;
    this.#move(win, { scale: next, x: at.x - world.x * next, y: at.y - world.y * next });
    this.#pivot = { ...at, world, view: this.#view(win) };
    if (save) this.#scheduleSave();
  }
  /** Returns false if the view could not move: it is at its limit. */
  #panBy(win, dx, dy, save = false) {
    this.#stop();
    const view = this.#view(win);
    const before = this.#snapshot;
    this.#move(win, { scale: view.scale, x: view.x + dx, y: view.y + dy });
    if (this.#snapshot === before) return false;
    this.#followsFit = false;
    if (save) this.#scheduleSave();
    return true;
  }
  /** What a key or a standard button does, in every form. */
  #act(action, save) {
    const win = this.#win();
    const adapter = this.#external(win);
    if (adapter) {
      if (action === "fit") adapter.fit();
      else adapter.zoomBy(action === "in" ? BUTTON_STEP : action === "out" ? 1 / BUTTON_STEP : 1 / adapter.scale);
    } else if (!win || formOf(win) === "external") return;
    else if (action === "fit") void this.#refit(win, save, { reason: "request" });
    else this.#zoom(win, action === "reset" ? 1 : this.#snapshot.scale * (action === "in" ? BUTTON_STEP : 1 / BUTTON_STEP), void 0, save);
  }
  // ── Setting the view ──────────────────────────────────────────────────
  /** Length of an animation in ms: 0 for none, and always 0 where the reader asked for less motion. */
  #duration(animate) {
    const ms = animate === true ? GLIDE_MS : typeof animate === "number" && animate > 0 ? animate : 0;
    return ms > 0 && !matchMedia("(prefers-reduced-motion: reduce)").matches ? ms : 0;
  }
  /** Ends a running animation where it is. */
  #stop() {
    const glide = this.#glide;
    if (!glide) return;
    this.#glide = null;
    cancelAnimationFrame(glide.frame);
    glide.done();
  }
  /** Moves to a view, at once or over `ms`. Resolves when it is there, or when something else interrupts. */
  #goTo(win, target, ms) {
    this.#stop();
    if (ms <= 0) {
      this.#move(win, target, true);
      return Promise.resolve();
    }
    const size = { width: win.clientWidth, height: win.clientHeight };
    const from = this.#centre({ ...this.#view(win), ...size });
    const to = this.#centre({ ...target, ...size });
    return new Promise((resolve) => {
      const glide = { frame: 0, done: resolve };
      this.#glide = glide;
      let start;
      const step = (now) => {
        if (this.#glide !== glide) return;
        const current = this.#win();
        if (current !== win) return this.#stop();
        start ??= now;
        const done = clamp((now - start) / ms, 0, 1);
        const eased = 1 - (1 - done) ** 3;
        const scale = from.scale * (to.scale / from.scale) ** eased;
        const centre = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
        this.#move(win, done === 1 ? target : { scale, x: size.width / 2 - centre.x * scale, y: size.height / 2 - centre.y * scale }, true);
        if (done < 1) glide.frame = requestAnimationFrame(step);
        else this.#stop();
      };
      glide.frame = requestAnimationFrame(step);
    });
  }
  /** `centerOn()` and `setView()`: the view is a view of the widget's own choosing from now on. */
  #set(view, motion) {
    const first = this.#win();
    if (!first || formOf(first) === "external") return Promise.resolve();
    return new Promise((resolve) => {
      const run = () => {
        this.#queued = null;
        const win = this.#win();
        if (!win) return resolve();
        this.#followsFit = false;
        void this.#goTo(win, view(win), this.#duration(motion.animate)).then(resolve);
      };
      if (this.#opened) return run();
      this.#queued?.done();
      this.#queued = { run, done: resolve };
    });
  }
  // ── Fitting ───────────────────────────────────────────────────────────
  /** What the window and the options say about fitting. The attributes win. */
  #fitting(win) {
    const given = this.#options.fit;
    const options = (typeof given === "function" ? given() : given) ?? {};
    const number = (value) => value === void 0 || value.trim() === "" || !Number.isFinite(Number(value)) ? void 0 : Number(value);
    const inset = () => {
      const attribute = win.dataset.wwViewportFitInset?.trim().split(/\s+/).map(Number);
      if (attribute?.length && attribute.length <= 4 && attribute.every(Number.isFinite)) {
        const [top, right = top, bottom = top, left = right] = attribute;
        return { top, right, bottom, left };
      }
      const value = options.inset;
      const sides = typeof value === "number" ? { top: value, right: value, bottom: value, left: value } : value ?? {};
      return { top: sides.top ?? 0, right: sides.right ?? 0, bottom: sides.bottom ?? 0, left: sides.left ?? 0 };
    };
    const follow = win.dataset.wwViewportFollow;
    return {
      padding: Math.max(0, number(win.dataset.wwViewportFitPadding) ?? options.padding ?? 0),
      inset: inset(),
      max: number(win.dataset.wwViewportFitMax) ?? options.maxScale ?? Infinity,
      target: options.target,
      follow: (follow === "all" || follow === "window" || follow === "none" ? follow : options.follow) ?? "all"
    };
  }
  /** The room for content: the window without padding and without the scrollbars it shows now. In the canvas form also without the inset and the fit padding. */
  #room(win, set = this.#fitting(win)) {
    const style = getComputedStyle(win);
    if (formOf(win) !== "scroll") {
      const { inset, padding } = set;
      const left = inset.left + padding;
      const top = inset.top + padding;
      return { left, top, width: Math.max(1, win.clientWidth - left - inset.right - padding), height: Math.max(1, win.clientHeight - top - inset.bottom - padding) };
    }
    const padded = (a, b) => parseFloat(a) + parseFloat(b);
    return { left: 0, top: 0, width: win.clientWidth - padded(style.paddingLeft, style.paddingRight), height: win.clientHeight - padded(style.paddingTop, style.paddingBottom) };
  }
  /** The unscaled extent of the content: the world element, or what the widget names (the fit target, else `bounds`). */
  #content(win, set = this.#fitting(win)) {
    if (formOf(win) === "canvas") return set.target?.() ?? this.#options.bounds?.() ?? null;
    const rect = win.firstElementChild?.getBoundingClientRect();
    const scale = this.#snapshot.scale;
    return rect ? { x: 0, y: 0, width: rect.width / scale, height: rect.height / scale } : null;
  }
  /** What the fitted view depends on: the window and how it is fitted, and the unscaled extent of the content. */
  #fitKey(win) {
    const set = this.#fitting(win);
    const box = this.#content(win, set);
    const key = (numbers) => numbers.map((value) => Math.round(value ?? 0)).join(" ");
    const { top, right, bottom, left } = set.inset;
    return {
      window: key([win.offsetWidth, win.offsetHeight, set.padding, top, right, bottom, left]) + ` ${set.max}`,
      content: key([box?.x, box?.y, box?.width, box?.height])
    };
  }
  /** True if a fitted view has to fit again: what it depends on changed, and `follow` says to follow it. */
  #stale(win) {
    const mode = this.#followCall ?? this.#fitting(win).follow;
    if (mode === "none") return false;
    const key = this.#fitKey(win);
    const before = this.#fitted;
    return !before || key.window !== before.window || mode === "all" && key.content !== before.content;
  }
  /**
   * Fits the content into the window. A pass can make a scrollbar come or go,
   * which changes the room; the scroll form then fits again for the new room.
   * Resolves when the view is there (after the animation), and tells the host.
   */
  #refit(win, save = false, how = { reason: "request" }) {
    this.#stop();
    const serial = ++this.#fitSerial;
    this.#followsFit = true;
    if (how.reason !== "follow") this.#followCall = how.box ? "none" : how.follow ?? null;
    const set = this.#fitting(win);
    const mode = win.dataset.wwViewportFit ?? "content";
    const [min, max] = this.#limits(win);
    const top = Math.max(min, Math.min(max, set.max));
    const canvas = formOf(win) === "canvas";
    const fitted = (box, room, whole) => {
      let scale = 1;
      if (box && box.width > 0 && box.height > 0 && mode !== "none") {
        scale = mode === "width" && !whole ? room.width / box.width : Math.min(room.width / box.width, room.height / box.height);
      }
      scale = clamp(Math.floor(scale * 1e3) / 1e3, min, top);
      const view = { scale, x: 0, y: 0 };
      if (canvas && box && mode !== "none") {
        view.x = room.left + (room.width - box.width * scale) / 2 - box.x * scale;
        view.y = mode === "width" ? room.top - box.y * scale : room.top + (room.height - box.height * scale) / 2 - box.y * scale;
      }
      return view;
    };
    const finish = () => {
      this.#fitted = this.#fitKey(win);
      if (save) this.#scheduleSave();
      this.host.dispatchEvent(new CustomEvent("ww-viewportfit", { detail: { ...this.#snapshot, reason: how.reason }, bubbles: true, composed: true }));
      this.#flush();
    };
    const content = () => how.box ?? this.#content(win, set);
    if (canvas && how.ms) {
      const target = fitted(content(), this.#room(win, set), false);
      this.#fitted = this.#fitKey(win);
      return this.#goTo(win, target, how.ms).then(() => {
        if (this.#followsFit && this.#fitSerial === serial) finish();
      });
    }
    const seen = [];
    for (let pass = 0; pass < 4; pass++) {
      const room = this.#room(win, set);
      this.#move(win, fitted(content(), room, false), true);
      const after = this.#room(win, set);
      if (after.width === room.width && after.height === room.height) break;
      if (seen.some((earlier) => earlier.width === after.width && earlier.height === after.height)) {
        const open = { left: 0, top: 0, width: Math.max(room.width, after.width), height: Math.max(room.height, after.height) };
        this.#move(win, fitted(content(), open, true), true);
        break;
      }
      seen.push(room);
    }
    finish();
    return Promise.resolve();
  }
  /** Settles the promises of `fitted()` when the view is a fitted one that is up to date. */
  #flush() {
    if (this.#waiters.length === 0) return;
    const win = this.#win();
    const external = !!win && formOf(win) === "external";
    if (!external && (!win || !this.#opened || !this.#followsFit || this.#glide || this.#stale(win))) return;
    for (const waiter of this.#waiters.splice(0)) waiter.resolve(this.#snapshot);
  }
  // ── Opening, resizing, saving ─────────────────────────────────────────
  #resized() {
    const win = this.#win();
    if (!win) return;
    if (formOf(win) === "external") return this.#commit(win, this.#snapshot);
    if (win.clientWidth === 0) return;
    if (this.#opened) return this.#settle(win);
    this.#opened = true;
    const view = this.#carried ?? this.#saved();
    this.#carried = null;
    const start = view ? null : this.#start(win);
    if (view) this.#show(win, view);
    else if (start && start !== "fit") this.#begin(win, start);
    else void this.#refit(win, false, { reason: "open" });
    const queued = this.#queued;
    if (queued) queued.run();
    this.#flush();
  }
  /** The start view: the window's attribute, else the option. Null for none. */
  #start(win) {
    const attribute = win.dataset.wwViewportStart?.trim();
    if (attribute !== void 0) {
      if (attribute === "fit") return "fit";
      const [x, y, scale, ...rest] = attribute.split(/\s+/).map(Number);
      if (rest.length === 0 && [x, y].every(Number.isFinite) && (scale === void 0 || scale > 0)) return { centre: { x, y }, scale };
      warnOnce(this.host.constructor, "viewport:start", `<${this.host.localName}>: data-ww-viewport-start="${attribute}" is neither "fit" nor "x y scale". It is ignored.`);
    }
    const given = this.#options.start;
    return (typeof given === "function" ? given() : given) ?? null;
  }
  /** Shows a start view that is not the fit. */
  #begin(win, start) {
    if ("box" in start) return void this.#refit(win, false, { reason: "open", box: start.box });
    if ("centre" in start) return this.#show(win, { x: start.centre.x, y: start.centre.y, scale: start.scale ?? 1 });
    const [min, max] = this.#limits(win);
    this.#followsFit = false;
    this.#move(win, { scale: clamp(start.scale ?? 1, min, max), x: start.x, y: start.y }, true);
  }
  /**
   * After the window or the content changed size: a fitted view fits again as
   * `follow` says, any other view stays, within its limits. With `resize:
   * "centre"` a view that stays keeps the world point in the centre of the window.
   */
  #settle(win) {
    if (this.#followsFit && this.#stale(win)) void this.#refit(win, false, { reason: "follow" });
    else {
      const view = this.#view(win);
      const before = this.#snapshot;
      const centred = (win.dataset.wwViewportResize ?? this.#options.resize) === "centre" && before.width > 0;
      if (centred) {
        view.x += (win.clientWidth - before.width) / 2;
        view.y += (win.clientHeight - before.height) / 2;
      }
      if (formOf(win) === "canvas" || centred) this.#move(win, view, true);
      else this.#commit(win, view);
      this.#flush();
    }
  }
  /** Shows a view given as the world point in the centre of the window, and the scale. */
  #show(win, centre) {
    this.#stop();
    const [min, max] = this.#limits(win);
    const scale = clamp(centre.scale, min, max);
    this.#followsFit = false;
    this.#move(win, { scale, x: win.clientWidth / 2 - centre.x * scale, y: win.clientHeight / 2 - centre.y * scale }, true);
  }
  /** The view in the `data-ww-viewport-save` attribute, if it holds one. */
  #saved() {
    const [x, y, scale, ...rest] = this.#field && this.host.getAttribute(this.#field)?.trim().split(/\s+/).map(Number) || [];
    return rest.length === 0 && [x, y, scale].every(Number.isFinite) && scale > 0 ? { x, y, scale } : null;
  }
  /** The saved form: the world point in the centre of the window, and the scale. Null for the fitted view. */
  #serialize(win) {
    if (this.#followsFit) return null;
    const centre = this.#centre({ ...this.#view(win), width: win.clientWidth, height: win.clientHeight });
    return `${Math.round(centre.x * 10) / 10} ${Math.round(centre.y * 10) / 10} ${Math.round(centre.scale * 1e3) / 1e3}`;
  }
  #hostChanged(records) {
    const win = this.#win();
    if (win && this.#opened && this.#field && records.some((record) => record.attributeName === this.#field) && this.host.getAttribute(this.#field) !== this.#serialize(win)) {
      clearTimeout(this.#timer);
      this.#drop();
      const view = this.#saved();
      if (view) this.#show(win, view);
      else void this.#refit(win);
    }
    this.#lock();
    this.#controls();
  }
  /** Writes once the view has been still for a moment, so that a gesture is one write. */
  #scheduleSave() {
    if (!this.#field) return;
    clearTimeout(this.#timer);
    this.#timer = window.setTimeout(() => this.#save(), SAVE_DELAY);
  }
  #save() {
    const win = this.#win();
    const field = this.#field;
    if (!win || !field || !this.#allowed() || this.#options.canSave?.() === false) return;
    const value = this.#serialize(win);
    if (this.host.getAttribute(field) === value) return;
    void transaction(this.host, () => {
      if (value === null) this.host.removeAttribute(field);
      else this.host.setAttribute(field, value);
      return this.#options.rendered?.();
    });
  }
  // ── Input ─────────────────────────────────────────────────────────────
  #wheel(event) {
    const win = this.#win();
    if (!win || !event.composedPath().includes(win)) return;
    const form = formOf(win);
    if (form === "external" || !this.#allowed()) return;
    const modifier = event.ctrlKey || event.metaKey;
    const mode = win.dataset.wwViewportWheel ?? this.#options.wheel;
    const zooms = modifier || mode === "zoom" && event.deltaY !== 0;
    if (!zooms && (form === "scroll" || mode === "page")) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? win.clientHeight : 1;
    if (zooms) {
      event.preventDefault();
      return this.#zoom(win, this.#snapshot.scale * Math.exp(-event.deltaY * unit * WHEEL_STEP), { x: event.clientX, y: event.clientY }, true);
    }
    const sideways = event.shiftKey && event.deltaX === 0;
    if (this.#panBy(win, -(sideways ? event.deltaY : event.deltaX) * unit, sideways ? 0 : -event.deltaY * unit, true)) event.preventDefault();
  }
  #scrolled(event) {
    const win = this.#win();
    if (!win || event.target !== win || formOf(win) !== "scroll") return;
    const expected = this.#expected;
    const own = !!expected && Math.abs(win.scrollLeft - expected.left) < 1 && Math.abs(win.scrollTop - expected.top) < 1;
    this.#expected = null;
    this.#commit(win, this.#view(win));
    if (own) return;
    this.#followsFit = false;
    this.#scheduleSave();
  }
  #key(event) {
    const win = this.#win();
    if (!win || event.target !== win || event.ctrlKey || event.metaKey || event.altKey || !this.#allowed()) return;
    const form = formOf(win);
    if (Object.hasOwn(KEYS, event.key)) this.#act(KEYS[event.key], true);
    else if (form === "external") return;
    else if (event.key === " ") this.#space ??= { used: false };
    else if (form === "canvas" && Object.hasOwn(ARROWS, event.key)) this.#panBy(win, ...ARROWS[event.key], true);
    else return;
    event.preventDefault();
  }
  #keyup(event) {
    if (event.key !== " ") return;
    const space = this.#space;
    this.#space = null;
    const win = this.#win();
    if (!space || space.used || !win || event.target !== win || formOf(win) !== "scroll" || !this.#allowed()) return;
    if (win.dataset.wwViewportPan !== "x") win.scrollBy({ top: (event.shiftKey ? -1 : 1) * win.clientHeight * PAGE });
  }
  #click(event) {
    const action = clickedAction(event, this.root);
    if (action && this.#allowed()) this.#act(action, true);
  }
  /** Presses the module takes before the widget: the hand (Space held, or the middle button) and the second finger of a pinch. */
  #claim(event) {
    const win = this.#win();
    if (!win || !event.composedPath().includes(win)) return;
    const form = formOf(win);
    if (form === "external" || !this.#allowed()) return;
    const pan = this.#pan;
    if (form === "canvas" && pan && event.pointerType === "touch" && pan.down.pointerType === "touch" && event.pointerId !== pan.down.pointerId) {
      event.preventDefault();
      return this.#startPinch(win, pan, event);
    }
    const hand = event.button === 1 || event.button === 0 && this.#space !== null;
    if (!hand || form === "scroll" && event.pointerType === "touch") return;
    event.preventDefault();
    if (this.#space) this.#space.used = true;
    this.#startPan(win, event);
  }
  /** A drag on empty background pans: a press on the window or on the world element itself, which nobody claimed. */
  #press(event) {
    const win = this.#win();
    if (!win || event.defaultPrevented || event.button !== 0 || !event.composedPath().includes(win)) return;
    const form = formOf(win);
    if (form === "external" || form === "scroll" && event.pointerType === "touch" || !this.#allowed()) return;
    if (event.target === win || event.target === win.firstElementChild) this.#startPan(win, event);
  }
  /** Ends running gestures without returning to the view before them. */
  #drop() {
    const [pan, pinch] = [this.#pan, this.#pinch];
    this.#pan = this.#pinch = null;
    pan?.cancel();
    pinch?.cancel();
  }
  #restore(win, origin) {
    this.#move(win, origin.view, true);
    this.#followsFit = origin.followed;
  }
  /** `origin` is passed when the pan goes on from a pinch: a cancel then returns to the view before the pinch. */
  #startPan(win, down, origin) {
    this.#stop();
    this.#drop();
    const gesture = this.#pan = new PointerGesture(win, down);
    const base = this.#view(win);
    const before = this.#origin = origin ?? { view: base, followed: this.#followsFit };
    this.whileAllowed(() => this.#allowed(), gesture.ended).addEventListener("abort", () => gesture.cancel());
    void (async () => {
      for await (const sample of gesture) {
        if (this.#pan !== gesture) return;
        this.#followsFit = false;
        this.#move(win, { scale: base.scale, x: base.x + sample.dx, y: base.y + sample.dy });
      }
      if (this.#pan !== gesture) return;
      this.#pan = null;
      if (!gesture.moved && !origin) return;
      if (gesture.cancelled) this.#restore(win, before);
      else this.#scheduleSave();
    })();
  }
  /** Canvas form: a second finger turns the pan into a pinch about the point between the two. */
  #startPinch(win, pan, second) {
    this.#stop();
    const origin = this.#origin;
    this.#pan = null;
    pan.cancel();
    const first = new PointerEvent("pointermove", { pointerId: pan.down.pointerId, pointerType: "touch", clientX: pan.last.clientX, clientY: pan.last.clientY });
    const start = this.#view(win);
    const corner = cornerOf(win);
    const world = { x: ((first.clientX + second.clientX) / 2 - corner.x - start.x) / start.scale, y: ((first.clientY + second.clientY) / 2 - corner.y - start.y) / start.scale };
    const pinch = this.#pinch = new PinchGesture(first, second, (sample) => {
      if (this.#pinch !== pinch) return;
      const [min, max] = this.#limits(win);
      const scale = clamp(start.scale * sample.ratio, min, max);
      const now = cornerOf(win);
      this.#followsFit = false;
      this.#move(win, { scale, x: sample.x - now.x - world.x * scale, y: sample.y - now.y - world.y * scale });
    });
    this.whileAllowed(() => this.#allowed(), pinch.ended).addEventListener("abort", () => pinch.cancel());
    pinch.ended.addEventListener("abort", () => {
      if (this.#pinch !== pinch) return;
      this.#pinch = null;
      if (pinch.cancelled) this.#restore(win, origin);
      else if (pinch.remaining) this.#startPan(win, pinch.remaining, origin);
      else this.#scheduleSave();
    });
  }
  // ── What the module renders ───────────────────────────────────────────
  /** A reader who may not change the view gets no native panning either. */
  #lock() {
    const sheet = this.#styles?.sheet;
    if (!sheet) return;
    const locked = !this.#allowed();
    const set = (index, name, value) => {
      const style = sheet.cssRules[index].style;
      if (style.getPropertyValue(name) !== value) style.setProperty(name, value);
    };
    set(SCROLL_RULE, "overflow", locked ? "hidden" : "auto");
    set(TOUCH_RULE, "touch-action", locked ? "auto" : "none");
  }
  #controls() {
    if (!this.connected) return;
    const { scale, min, max } = this.#snapshot;
    const win = this.#win();
    const idle = (!win || formOf(win) === "external") && !this.#adapter;
    renderControls(this.root, { scale, min, max, locked: idle || !this.#allowed(), messages: this.#messages.current });
  }
}
export {
  ViewportCore,
  viewportMessages2 as viewportMessages
};
