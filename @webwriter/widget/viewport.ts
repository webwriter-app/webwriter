import {ModuleCore, warnOnce, type CoreOptions} from "./base.js"
import {PointerGesture} from "./gesture.js"
import {Messages, type MessagesOption} from "./messages.js"
import {viewportMessages, type ViewportMessages} from "./messages/viewport/index.js"
import {adoptStyles, type AdoptedStyles} from "./styles.js"
import {transaction} from "./transaction.js"
import {clickedAction, controlsCss, removeControls, renderControls, type ViewportAction} from "./viewport/controls.js"
import {PinchGesture} from "./viewport/pinch.js"

export {viewportMessages, type ViewportMessages} from "./messages/viewport/index.js"

export type {ViewportAction} from "./viewport/controls.js"

/** A rectangle in world coordinates. */
export type WorldBox = {x: number; y: number; width: number; height: number}
/** A point, in client or in world coordinates. */
export type ViewportPoint = {x: number; y: number}

/**
 * What a library that owns its viewport (vis-network, Cytoscape, Leaflet, …)
 * provides so that the standard buttons and keys can drive it. Create it once
 * per library instance: the module subscribes when it first sees the object.
 */
export type ViewportAdapter = {
  /** The library's current scale. 1 is 100 %. */
  readonly scale: number
  /** The library's zoom limits. */
  readonly min: number
  readonly max: number
  /** Multiplies the scale, about the centre of the library's view. The library applies its own limits. */
  zoomBy(factor: number): void
  /** Shows all of the content. */
  fit(): void
  /** Calls `changed` after every change of the scale or of the limits. Returns the function that stops it. */
  subscribe(changed: () => void): () => void
}

/** What the plain wheel does over the window. Ctrl or Cmd with the wheel (and a pinch on a trackpad) always zooms. */
export type ViewportWheel = "pan" | "zoom" | "page"

/** What a fitted view does when the window or the content changes size. */
export type ViewportFollow = "all" | "window" | "none"

/** Parts of the window that content must keep clear of, in CSS pixels. */
export type ViewportInsets = {top?: number; right?: number; bottom?: number; left?: number}

/** How a fit places the content (canvas form: all of it; scroll form: only `maxScale`, `follow`). */
export type ViewportFitOptions = {
  /** Room kept free around the content on every side, in CSS pixels. Default: 0. */
  padding?: number
  /** A part of the window that something else covers, such as a drawer: the content is fitted into the rest. A number is all four sides. */
  inset?: number | ViewportInsets
  /** The largest scale a fit may choose, for content that is small. Default: the zoom limit. */
  maxScale?: number
  /** The box that is fitted instead of `bounds`, in world coordinates. Null or undefined: `bounds`. The fit button of the controls uses it too. */
  target?: () => WorldBox | null | undefined
  /** When a fitted view fits again by itself. See `ViewportCore`. Default: `"all"`. */
  follow?: ViewportFollow
}

/** The view a window opens with: asked once, when the window first has a size. */
export type ViewportStart =
  /** The fitted view, as if no start view was given. */
  | "fit"
  /** This world point in the centre of the window. `scale` defaults to 1. */
  | {centre: ViewportPoint; scale?: number}
  /** This view: where the world's origin is drawn, in CSS pixels from the window's top-left corner. `scale` defaults to 1. */
  | {x: number; y: number; scale?: number}
  /** This box of the world, fitted like `fit()` does it. The view stays there until something changes it. */
  | {box: WorldBox}

/** Motion of a call that sets the view. Without it the view jumps. */
export type ViewportMotion = {
  /** `true`: 350 ms. A number: that many milliseconds. Never animated under `prefers-reduced-motion: reduce`. `centerOn()` and `setView()` animate in the canvas and scroll forms, `fit()` only in the canvas form. */
  animate?: boolean | number
}

/** Options of `fit()`. */
export type ViewportFitCall = ViewportMotion & {
  /** For this fit only: what the fitted view does afterwards. `"none"` is "fit once, then leave the view alone". */
  follow?: ViewportFollow
  /** Fit this box instead of the content. The view then stays where it is until something changes it. */
  box?: WorldBox
}

/** `detail` of `ww-viewportfit`, dispatched on the host after a fit has been applied. */
export type ViewportFitDetail = ViewportSnapshot & {
  /** `open`: the first view. `request`: `fit()`, the button or the key. `follow`: the content or the window changed size. */
  reason: "open" | "request" | "follow"
}

/** What `autoPan()` and `autoPanWhile()` read: a pointer position that changes, until `ended` aborts. A `PointerGesture` is one. */
export type ViewportPointerSource = {readonly last: {readonly clientX: number; readonly clientY: number}; readonly ended: AbortSignal}

/** Options of `ViewportCore`. */
export type ViewportOptions = CoreOptions & {
  /**
   * Asked before input changes the view: wheel, drag, pinch, keys and buttons,
   * and again while a drag runs and before a view is saved. Return false to
   * lock the view. The methods of the core are the widget's own and not gated.
   */
  can?: () => boolean
  /** Asked, after `can`, before the view is written to the `data-ww-viewport-save` attribute. Default: always. */
  canSave?: () => boolean
  /**
   * Canvas form: the extent of the content in world coordinates. Fit shows it,
   * and panning is limited to it. Without it fit is 100 % at the origin and
   * panning is unlimited. Call `contentChanged()` when the answer changes
   * without a render.
   */
  bounds?: () => WorldBox | null | undefined
  /** Canvas form: how far past each edge of `bounds` the content can be panned, in CSS pixels. Default: 0. */
  margin?: number
  /**
   * What the plain wheel does, for a window without `data-ww-viewport-wheel`.
   * `"pan"` (default) pans. `"zoom"` zooms about the pointer. `"page"` leaves
   * it to the page (canvas form; a scroll container scrolls natively).
   */
  wheel?: ViewportWheel
  /** Padding, inset, largest scale, target and follow of a fit. A function is asked at every fit, for a value that changes. Attributes of the window win. */
  fit?: ViewportFitOptions | (() => ViewportFitOptions)
  /** The first view, for a window without `data-ww-viewport-start`. Asked once, and not while a saved view opens. */
  start?: ViewportStart | (() => ViewportStart | null | undefined)
  /** What a resize of the window keeps still when the view is not fitted: the screen offset of the world (default), or the world point in the centre. Attribute `data-ww-viewport-resize`. */
  resize?: "offset" | "centre"
  /** The view of a library, for a window marked `data-ww-viewport="external"`. Asked after every render. */
  adapter?: () => ViewportAdapter | null | undefined
  /** Resolves when the widget has rendered a change. Lit: `() => host.updateComplete`. Keeps the undo step of a save open until then. */
  rendered?: () => Promise<unknown>
  /** Replaces texts of the module. */
  messages?: MessagesOption<ViewportMessages>
}

/**
 * The view. A world point `w` is drawn at `w * scale + (x, y)`, in CSS pixels
 * from the top-left corner of the window. `width` and `height` are the size of
 * the window. In the external form `x` and `y` stay 0: the library owns them.
 */
export type ViewportSnapshot = {
  readonly x: number
  readonly y: number
  readonly scale: number
  readonly min: number
  readonly max: number
  readonly width: number
  readonly height: number
}

/** How a window is driven: by its scroll position, by the view the module tracks, or by a library. */
export type ViewportForm = "scroll" | "canvas" | "external"

type View = {x: number; y: number; scale: number}
/** The view before an interaction, for a cancel. */
type Origin = {view: View; followed: boolean}

// The two zoom steps are the editor's own (domeditor canvas-viewer.js: navigate() and wheel()).
const BUTTON_STEP = 1.2
const WHEEL_STEP = 0.002
const KEY_PAN = 40
/** The part of the window that a tap of Space scrolls, as browsers do. */
const PAGE = 0.875
const SAVE_DELAY = 200
const EPSILON = 1e-6
/** Default length of an animated change of the view, in ms. */
const GLIDE_MS = 350
/** Autopan: the band at the window's edge where it starts, and the most it moves in one call, in CSS pixels. */
const PAN_EDGE = 64
const PAN_STEP = 16

const SCROLL = `[data-ww-viewport]:not(canvas, [data-ww-viewport="canvas"], [data-ww-viewport="external"])`
const CANVAS = `:is(canvas[data-ww-viewport]:not([data-ww-viewport="external"]), [data-ww-viewport="canvas"])`

// The first three rules are changed through the CSS object model.
const ZOOM_RULE = 0
const SCROLL_RULE = 1
const TOUCH_RULE = 2
const css = `
${SCROLL} > :first-child { zoom: 1; }
${SCROLL} { overflow: auto; }
${CANVAS} { touch-action: none; }
${SCROLL} { scroll-axis-lock: none; }
${SCROLL}[data-ww-viewport-pan="x"] { overflow-y: hidden; }
${SCROLL}[data-ww-viewport-pan="y"] { overflow-x: hidden; }
${controlsCss}`

const KEYS: Record<string, ViewportAction> = {"+": "in", "=": "in", "-": "out", "−": "out", "0": "fit"}
const ARROWS: Record<string, [number, number]> = {ArrowLeft: [KEY_PAN, 0], ArrowRight: [-KEY_PAN, 0], ArrowUp: [0, KEY_PAN], ArrowDown: [0, -KEY_PAN]}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function formOf(win: HTMLElement): ViewportForm {
  const value = win.getAttribute("data-ww-viewport")
  if(value === "external") return "external"
  return value === "canvas" || win instanceof HTMLCanvasElement ? "canvas" : "scroll"
}

/** Client position of the window's top-left corner, inside its border. */
function cornerOf(win: HTMLElement): ViewportPoint {
  const rect = win.getBoundingClientRect()
  return {x: rect.left + win.clientLeft, y: rect.top + win.clientTop}
}

/**
 * Zoom, fit and the zoom buttons for the one window marked `data-ww-viewport`.
 *
 * Scroll form (the default): the window is a native scroll container. Panning
 * is its scroll position, and zoom is the CSS `zoom` of its first child, set
 * in the module's own style sheet, so nothing is written to the template.
 *
 * Canvas form (`<canvas data-ww-viewport>`, or `data-ww-viewport="canvas"` on
 * any element): there is nothing to scroll, so the module keeps `{x, y, scale}`
 * itself and the widget, or its renderer, applies it. A renderer reads the
 * view with `getSnapshot()`, follows it with `subscribe()`, reports the extent
 * of its content with the `bounds` option and `contentChanged()`, and converts
 * pointer positions with `toWorld()`.
 *
 * External form (`data-ww-viewport="external"` with the `adapter` option): a
 * library owns the view and its input. The module binds the standard buttons
 * and the keys `+`, `−` and `0` to it and reports its scale.
 *
 * `can` gates input. The methods of this class are the widget's own code and
 * always work.
 *
 * Attributes on the window (each also has an option, and the attribute wins):
 * - `data-ww-viewport-wheel="pan|zoom|page"`: the plain wheel pans (default),
 *   zooms about the pointer, or is left to the page (canvas form). Ctrl or
 *   Cmd with the wheel zooms in every case.
 * - `data-ww-viewport-start="fit"` or `"x y scale"`: the first view, a world
 *   point for the centre of the window and the scale, as in
 *   `data-ww-viewport-save`. Applied once, when the window first has a size,
 *   and not over a saved view.
 * - `data-ww-viewport-fit-padding="px"`, `data-ww-viewport-fit-max="scale"`,
 *   `data-ww-viewport-fit-inset="top right bottom left"` (one to four numbers,
 *   as CSS margins): the room around fitted content, the largest scale of a
 *   fit, and the part of the window that something else covers.
 * - `data-ww-viewport-follow="all|window|none"`: see below.
 * - `data-ww-viewport-resize="offset|centre"`: see below.
 *
 * When a fitted view fits again. A view is "fitted" from the first view (when
 * there is no saved or start view) or from `fit()`, the fit button and the
 * `0` key, until something else changes it: a zoom, a pan, a pinch, `zoomTo`,
 * `zoomBy`, `panBy`, `setView`, `centerOn` or a start or saved view. While it
 * is fitted and `follow` is `"all"` (default), it fits again whenever the
 * window or the extent of the content (the fit `target`, else `bounds`)
 * changes size; `"window"` follows only the window; `"none"` never fits
 * again: "fit once, then leave the view alone", also as `fit({follow:
 * "none"})` for a single fit. A view that is not fitted is only kept inside
 * the limits. When the window resizes, a view that is not fitted keeps the
 * world's screen offset, or with `resize: "centre"` the world point in the
 * centre of the window.
 *
 * Fits are announced: `ww-viewportfit` on the host (detail `ViewportFitDetail`)
 * after every fit, and `fitted()` is a promise for a settled fitted view.
 * `centerOn()`, `setView()` and `fit()` can animate; `autoPan()` pans a view
 * while a pointer, also one in a drag that began elsewhere, is held at the
 * edge of the window.
 */
export class ViewportCore extends ModuleCore<ViewportSnapshot> {
  #options: ViewportOptions
  #messages: Messages<ViewportMessages>
  #snapshot: ViewportSnapshot = {x: 0, y: 0, scale: 1, min: 0.25, max: 4, width: 0, height: 0}
  #styles: AdoptedStyles | null = null
  #sizes: ResizeObserver | null = null
  /** The window and its world as last observed. Only compared by identity. */
  #watched: Element[] = []
  #field: string | null = null
  #opened = false
  /** True until something else than fit changed the view. The view then follows the window size. */
  #followsFit = true
  /** What the last fit was computed for, so that the module's own scaling does not fit again. */
  #fitted: {window: string; content: string} | null = null
  /** How the last fit, if it was a call, wants the view to follow; null: what the window says. */
  #followCall: ViewportFollow | null = null
  /** The animation of the view that runs, and what ends it. */
  #glide: {frame: number; done: () => void} | null = null
  /** A change of the view asked for before the window had a size: applied right after it opens. */
  #queued: {run: () => void; done: () => void} | null = null
  #waiters: {resolve: (view: ViewportSnapshot) => void; reject: (reason: unknown) => void}[] = []
  #autoFrame = 0
  #fitSerial = 0
  /** The view of a window that the template replaced, as centre and scale, for the new window. */
  #carried: View | null = null
  /** The scroll position the module set itself, to tell its own scroll events from the reader's. */
  #expected: {left: number; top: number} | null = null
  /** Set while Space is held on the window. `used` once a drag made it the hand. */
  #space: {used: boolean} | null = null
  #pivot: (ViewportPoint & {world: ViewportPoint; view: View}) | null = null
  #pan: PointerGesture | null = null
  #pinch: PinchGesture | null = null
  #origin: Origin | null = null
  #timer = 0
  /** Attributes the module wrote on a window, with the values it wrote. */
  #written = new WeakMap<Element, Map<string, string>>()
  #adapter: ViewportAdapter | null = null
  #unsubscribe: (() => void) | null = null

  constructor(host: HTMLElement, options: ViewportOptions = {}) {
    super(host, options)
    this.#options = options
    this.#messages = new Messages(host, viewportMessages, options.messages)
  }

  getSnapshot(): ViewportSnapshot {
    return this.#snapshot
  }

  /** The form of the window, or null while the template has none. */
  get form(): ViewportForm | null {
    const win = this.#win()
    return win ? formOf(win) : null
  }

  /** True in the canvas form, where the module owns the position and every change of it has to be drawn. */
  get tracksView(): boolean {
    return this.form === "canvas"
  }

  /**
   * Converts a client point, such as `event.clientX/Y`, to world coordinates.
   * It is bound, so it can be passed on: `new PointerGesture(surface, event,
   * {convert: viewport.toWorld})` delivers its samples in world coordinates
   * and follows a view that changes during the gesture. In the external form
   * the library converts; the point is returned as it is.
   */
  readonly toWorld = (clientX: number, clientY: number): ViewportPoint => {
    const win = this.#win()
    if(!win || formOf(win) === "external") return {x: clientX, y: clientY}
    const view = this.#view(win)
    const corner = cornerOf(win)
    return {x: (clientX - corner.x - view.x) / view.scale, y: (clientY - corner.y - view.y) / view.scale}
  }

  /** Converts a world point to client coordinates: the inverse of `toWorld()`. Bound, like `toWorld`. */
  readonly toClient = (worldX: number, worldY: number): ViewportPoint => {
    const win = this.#win()
    if(!win || formOf(win) === "external") return {x: worldX, y: worldY}
    const view = this.#view(win)
    const corner = cornerOf(win)
    return {x: worldX * view.scale + view.x + corner.x, y: worldY * view.scale + view.y + corner.y}
  }

  /** Sets the scale. The world point under `about` (a client point, default: the centre) stays where it is. */
  zoomTo(scale: number, about?: ViewportPoint): void {
    const win = this.#win()
    const adapter = this.#external(win)
    if(adapter) adapter.zoomBy(scale / adapter.scale)
    else if(win) this.#zoom(win, scale, about)
  }

  /** Multiplies the scale. See `zoomTo()`. */
  zoomBy(factor: number, about?: ViewportPoint): void {
    this.zoomTo(this.#snapshot.scale * factor, about)
  }

  /** Moves the content by CSS pixels. Does nothing in the external form. */
  panBy(dx: number, dy: number): void {
    const win = this.#win()
    if(win && formOf(win) !== "external") this.#panBy(win, dx, dy)
  }

  /**
   * Returns to the fitted view: the content (the fit `target`, else
   * `bounds`) in the window, with the padding, inset and largest scale of
   * `fit`. Resolves with the view once it is applied, after the animation
   * if `animate` is given. In the external form the library fits.
   */
  fit(call: ViewportFitCall = {}): Promise<ViewportSnapshot> {
    const win = this.#win()
    const adapter = this.#external(win)
    if(adapter) adapter.fit()
    else if(win && formOf(win) !== "external") return this.#refit(win, false, {reason: "request", follow: call.follow, box: call.box, ms: this.#duration(call.animate)}).then(() => this.#snapshot)
    return Promise.resolve(this.#snapshot)
  }

  /**
   * Resolves with the view when the window has a size and the view is a
   * fitted one that is up to date: at once if it is, else after the fit that
   * makes it so (the first one, or the next after the view was changed by
   * something else). Rejects with an `AbortError` if the core disconnects
   * first. For code that has to wait for the first fit, or for the fit after
   * content changed; the same moment is announced by `ww-viewportfit`.
   */
  fitted(): Promise<ViewportSnapshot> {
    if(!this.connected) return Promise.reject(new DOMException("Viewport is not connected", "AbortError"))
    return new Promise((resolve, reject) => {
      this.#waiters.push({resolve, reject})
      this.#flush()
    })
  }

  /**
   * Puts this world point in the centre of the window, and optionally sets
   * the scale (within the limits). The view is then no longer a fitted one.
   * Called before the window has a size, it is applied when it opens.
   * Resolves when the view is there; an animation that something else
   * interrupts resolves at that moment. External form: does nothing.
   */
  centerOn(point: ViewportPoint, scale?: number, motion: ViewportMotion = {}): Promise<void> {
    return this.#set(win => {
      const next = clamp(scale ?? this.#snapshot.scale, ...this.#limits(win))
      return {scale: next, x: win.clientWidth / 2 - point.x * next, y: win.clientHeight / 2 - point.y * next}
    }, motion)
  }

  /**
   * Sets the view: where the world's origin is drawn (`x`, `y`, in CSS pixels
   * from the window's top-left corner) and the scale. With only `scale` the
   * world point in the centre stays there. The view is then no longer a
   * fitted one. Otherwise like `centerOn()`.
   */
  setView(view: {x: number; y: number; scale?: number} | {scale: number}, motion: ViewportMotion = {}): Promise<void> {
    return this.#set(win => {
      const next = clamp(view.scale ?? this.#snapshot.scale, ...this.#limits(win))
      if("x" in view) return {scale: next, x: view.x, y: view.y}
      const centre = this.#centre({...this.#view(win), width: win.clientWidth, height: win.clientHeight})
      return {scale: next, x: win.clientWidth / 2 - centre.x * next, y: win.clientHeight / 2 - centre.y * next}
    }, motion)
  }

  /**
   * One step of panning for a pointer held at the edge of the window: the
   * view moves towards what lies beyond, faster the closer the pointer is to
   * the edge. Call it once per animation frame with the pointer's client
   * position, for a drag that began outside the window (a gate from a
   * sidebar) or inside it. Does nothing for a pointer outside the window.
   * Returns whether the view moved. Panning stops at the limits.
   */
  autoPan(clientX: number, clientY: number): boolean {
    const win = this.#win()
    if(!win || formOf(win) === "external") return false
    const box = win.getBoundingClientRect()
    if(clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return false
    // Towards the edge: depth 1 at the edge, 0 at the inner border of the band.
    const depth = (at: number, start: number, end: number) => {
      const edge = Math.min(PAN_EDGE, (end - start) / 4)
      return at < start + edge ? -(1 - (at - start) / edge) : at > end - edge ? 1 - (end - at) / edge : 0
    }
    const dx = depth(clientX, box.left, box.right)
    const dy = depth(clientY, box.top, box.bottom)
    return !!(dx || dy) && this.#panBy(win, -dx * PAN_STEP, -dy * PAN_STEP, true)
  }

  /** `autoPan()` once per animation frame while `source` (a `PointerGesture`) runs, so that a pointer held still at the edge keeps panning. */
  autoPanWhile(source: ViewportPointerSource): void {
    if(!this.connected) return
    cancelAnimationFrame(this.#autoFrame)
    const step = () => {
      if(source.ended.aborted || !this.connected) return
      this.autoPan(source.last.clientX, source.last.clientY)
      this.#autoFrame = requestAnimationFrame(step)
    }
    this.#autoFrame = requestAnimationFrame(step)
  }

  /**
   * Canvas form: tells the viewport that the extent `bounds()` returns
   * changed. A fitted view fits again, and any other view is brought back
   * inside the limits. A render does the same.
   */
  contentChanged(): void {
    const win = this.#win()
    if(win && this.#opened && formOf(win) === "canvas") this.#settle(win)
  }

  protected onConnect() {
    const root = this.root
    this.#styles = adoptStyles(root, css)
    this.cleanup(this.#styles)
    // Names the module wrote are written again in the new language.
    this.cleanup(this.#messages.follow(() => this.refresh()))
    this.#sizes = new ResizeObserver(() => this.#resized())
    // The saved view, the mode and the permissions change from outside: undo, collaborators, the editor.
    const attributes = new MutationObserver(records => this.#hostChanged(records))
    attributes.observe(this.host, {attributes: true})
    this.listen<WheelEvent>(root, "wheel", event => this.#wheel(event), {passive: false})
    // On the way down, so that the hand (Space or the middle button) and a second finger come before the widget's own handlers.
    this.listen<PointerEvent>(root, "pointerdown", event => this.#claim(event), {capture: true})
    this.listen<PointerEvent>(root, "pointerdown", event => this.#press(event))
    this.listen<KeyboardEvent>(root, "keydown", event => this.#key(event))
    this.listen<KeyboardEvent>(root, "keyup", event => this.#keyup(event))
    this.listen(root, "focusout", () => (this.#space = null))
    this.listen(root, "click", event => this.#click(event))
    // Scroll events do not bubble, but they can be captured on the way down.
    this.listen(root, "scroll", event => this.#scrolled(event), {capture: true})
    this.cleanup(() => {
      this.#sizes?.disconnect()
      attributes.disconnect()
      this.#drop()
      this.#unsubscribe?.()
      clearTimeout(this.#timer)
      cancelAnimationFrame(this.#autoFrame)
      this.#stop()
      this.#queued?.done()
      for(const waiter of this.#waiters.splice(0)) waiter.reject(new DOMException("Viewport disconnected", "AbortError"))
      removeControls(root)
      const win = this.#watched[0]
      for(const [name, value] of (win && this.#written.get(win)) || []) if(win.getAttribute(name) === value) win.removeAttribute(name)
      if(win) this.#written.delete(win)
      this.#styles = this.#sizes = this.#field = this.#expected = this.#pivot = this.#space = this.#origin = this.#carried = this.#adapter = this.#unsubscribe = this.#fitted = this.#followCall = this.#queued = null
      this.#watched = []
      this.#opened = false
      this.#followsFit = true
    })
  }

  protected onRefresh() {
    const wins = this.root.querySelectorAll<HTMLElement>("[data-ww-viewport]")
    if(wins.length > 1) {
      warnOnce(
        this.host.constructor,
        "viewport:many",
        `<${this.host.localName}>: ${wins.length} elements are marked data-ww-viewport. A widget has one viewport; only the first one is used.`,
      )
    }
    const win = wins[0] ?? null
    const form = win && formOf(win)
    const world = win && form === "scroll" ? win.firstElementChild : null
    const watched = win ? (world ? [win, world] : [win]) : []
    if(watched.length !== this.#watched.length || watched.some((element, i) => element !== this.#watched[i])) {
      if(win !== this.#watched[0]) {
        // The view belongs to the widget, not to the element: a window that replaces another one shows the same view.
        if(this.#watched[0] && this.#opened && !this.#followsFit) this.#carried = this.#centre(this.#snapshot)
        this.#opened = false
        this.#drop()
      }
      this.#sizes!.disconnect()
      // The border box: a scrollbar that comes or goes is no resize of the window.
      if(win) this.#sizes!.observe(win, {box: "border-box"})
      if(world) this.#sizes!.observe(world)
      this.#watched = watched
    }
    this.#adapt(!win || form === "external" ? (this.#options.adapter?.() ?? null) : null)
    if(win && form === "external" && !this.#options.adapter) {
      warnOnce(this.host.constructor, "viewport:adapter", `<${this.host.localName}>: data-ww-viewport="external" needs the adapter option of Viewport.`)
    }
    if(win) this.#prepare(win, form!)
    // The widget's conditions change with a render: the extent of the content, the permission.
    if(win && this.#opened && form === "canvas") this.#settle(win)
    this.#lock()
    this.#controls()
  }

  // ── Reading the template ──────────────────────────────────────────────

  #win(): HTMLElement | null {
    return this.connected ? this.root.querySelector<HTMLElement>("[data-ww-viewport]") : null
  }

  #allowed(): boolean {
    return this.#options.can?.() !== false
  }

  /** The adapter, if a library owns the view: an external window, or no window at all. */
  #external(win: HTMLElement | null): ViewportAdapter | null {
    return !win || formOf(win) === "external" ? this.#adapter : null
  }

  #limits(win: HTMLElement | null): [number, number] {
    if(!win || formOf(win) === "external") return this.#adapter ? [this.#adapter.min, this.#adapter.max] : [this.#snapshot.min, this.#snapshot.max]
    const [min, max] = (win.dataset.wwViewportZoom ?? "").trim().split(/\s+/).map(Number)
    return min > 0 && max >= min ? [min, max] : [0.25, 4]
  }

  /** The window is focusable and has a role and a label. What the template sets is kept. */
  #prepare(win: HTMLElement, form: ViewportForm) {
    const written = this.#written.get(win) ?? new Map<string, string>()
    this.#written.set(win, written)
    const want = (name: string, value: string) => {
      // Missing, or still the module's own value, which a new language replaces.
      const current = win.getAttribute(name)
      if(current === value || (current !== null && written.get(name) !== current)) return
      win.setAttribute(name, value)
      written.set(name, value)
    }
    want("tabindex", "0")
    want("role", "group")
    if(!win.hasAttribute("aria-labelledby")) want("aria-label", this.#messages.current.viewport)
    this.#field = (form !== "external" && win.dataset.wwViewportSave) || null
  }

  /** Follows the library's own view while the adapter is this object. */
  #adapt(adapter: ViewportAdapter | null) {
    if(adapter === this.#adapter) return
    this.#unsubscribe?.()
    this.#adapter = adapter
    this.#unsubscribe = adapter?.subscribe(() => this.#commit(this.#win(), this.#snapshot)) ?? null
    this.#commit(this.#win(), this.#snapshot)
  }

  /** The current view. In the scroll form the position is measured, because the browser owns it. */
  #view(win: HTMLElement): View {
    const {x, y, scale} = this.#snapshot
    if(formOf(win) !== "scroll") return {x, y, scale}
    const world = win.firstElementChild
    if(!world) return {x: -win.scrollLeft, y: -win.scrollTop, scale}
    const corner = cornerOf(win)
    const rect = world.getBoundingClientRect()
    return {x: rect.left - corner.x, y: rect.top - corner.y, scale}
  }

  /** The centre of a view in world coordinates, with its scale: the form in which a view is saved. */
  #centre(view: View & {width: number; height: number}): View {
    return {x: (view.width / 2 - view.x) / view.scale, y: (view.height / 2 - view.y) / view.scale, scale: view.scale}
  }

  #commit(win: HTMLElement | null, view: View) {
    const [min, max] = this.#limits(win)
    const adapter = this.#external(win)
    const next: ViewportSnapshot = {
      x: adapter ? 0 : view.x,
      y: adapter ? 0 : view.y,
      scale: adapter ? adapter.scale : view.scale,
      min,
      max,
      width: win?.clientWidth ?? 0,
      height: win?.clientHeight ?? 0,
    }
    const before = this.#snapshot
    if((Object.keys(next) as (keyof ViewportSnapshot)[]).every(key => Math.abs(next[key] - before[key]) < EPSILON)) return
    this.#snapshot = next
    this.#controls()
    this.notify()
  }

  // ── Changing the view ─────────────────────────────────────────────────

  /**
   * Canvas form: the limits of panning. On an axis where the content is larger
   * than the window, its edges stop at the window's edges, as a scroll range
   * does. Where it is smaller, it stays wholly inside the window. `margin`
   * widens both.
   */
  #limited(win: HTMLElement, view: View): View {
    const box = this.#options.bounds?.()
    if(!box) return view
    const margin = this.#options.margin ?? 0
    const within = (value: number, start: number, size: number, room: number) => {
      const leading = -start * view.scale
      const trailing = room - (start + size) * view.scale
      return clamp(value, Math.min(leading, trailing) - margin, Math.max(leading, trailing) + margin)
    }
    return {scale: view.scale, x: within(view.x, box.x, box.width, win.clientWidth), y: within(view.y, box.y, box.height, win.clientHeight)}
  }

  /** `free` ignores `data-ww-viewport-pan`, which restricts input but not fit or a saved view. */
  #move(win: HTMLElement, view: View, free = false) {
    const axis = free ? undefined : win.dataset.wwViewportPan
    if(formOf(win) === "canvas") {
      const now = this.#view(win)
      this.#commit(win, this.#limited(win, {scale: view.scale, x: axis === "y" ? now.x : view.x, y: axis === "x" ? now.y : view.y}))
      return
    }
    ;(this.#styles?.sheet.cssRules[ZOOM_RULE] as CSSStyleRule | undefined)?.style.setProperty("zoom", String(view.scale))
    // Measured after the new scale is laid out. The browser clamps the scroll position.
    const scaled = this.#view(win)
    if(axis !== "y") win.scrollLeft += scaled.x - view.x
    if(axis !== "x") win.scrollTop += scaled.y - view.y
    this.#expected = {left: win.scrollLeft, top: win.scrollTop}
    this.#commit(win, {...this.#view(win), scale: view.scale})
  }

  #zoom(win: HTMLElement, scale: number, about?: ViewportPoint, save = false) {
    this.#stop()
    const [min, max] = this.#limits(win)
    const corner = cornerOf(win)
    const at = about ? {x: about.x - corner.x, y: about.y - corner.y} : {x: win.clientWidth / 2, y: win.clientHeight / 2}
    const view = this.#view(win)
    const next = clamp(scale, min, max)
    // A scroll position is a whole number of pixels, so every step is off by up to half a pixel.
    // While a gesture continues at the same point, the first world point is kept and the error cannot add up.
    const pivot = this.#pivot
    const continued = pivot && pivot.x === at.x && pivot.y === at.y && (["x", "y", "scale"] as const).every(key => Math.abs(pivot.view[key] - view[key]) < 0.01)
    const world = continued ? pivot.world : {x: (at.x - view.x) / view.scale, y: (at.y - view.y) / view.scale}
    this.#followsFit = false
    this.#move(win, {scale: next, x: at.x - world.x * next, y: at.y - world.y * next})
    this.#pivot = {...at, world, view: this.#view(win)}
    if(save) this.#scheduleSave()
  }

  /** Returns false if the view could not move: it is at its limit. */
  #panBy(win: HTMLElement, dx: number, dy: number, save = false): boolean {
    this.#stop()
    const view = this.#view(win)
    const before = this.#snapshot
    this.#move(win, {scale: view.scale, x: view.x + dx, y: view.y + dy})
    if(this.#snapshot === before) return false
    this.#followsFit = false
    if(save) this.#scheduleSave()
    return true
  }

  /** What a key or a standard button does, in every form. */
  #act(action: ViewportAction, save: boolean) {
    const win = this.#win()
    const adapter = this.#external(win)
    if(adapter) {
      if(action === "fit") adapter.fit()
      else adapter.zoomBy(action === "in" ? BUTTON_STEP : action === "out" ? 1 / BUTTON_STEP : 1 / adapter.scale)
    } else if(!win || formOf(win) === "external") return
    else if(action === "fit") void this.#refit(win, save, {reason: "request"})
    else this.#zoom(win, action === "reset" ? 1 : this.#snapshot.scale * (action === "in" ? BUTTON_STEP : 1 / BUTTON_STEP), undefined, save)
  }

  // ── Setting the view ──────────────────────────────────────────────────

  /** Length of an animation in ms: 0 for none, and always 0 where the reader asked for less motion. */
  #duration(animate: boolean | number | undefined): number {
    const ms = animate === true ? GLIDE_MS : typeof animate === "number" && animate > 0 ? animate : 0
    return ms > 0 && !matchMedia("(prefers-reduced-motion: reduce)").matches ? ms : 0
  }

  /** Ends a running animation where it is. */
  #stop() {
    const glide = this.#glide
    if(!glide) return
    this.#glide = null
    cancelAnimationFrame(glide.frame)
    glide.done()
  }

  /** Moves to a view, at once or over `ms`. Resolves when it is there, or when something else interrupts. */
  #goTo(win: HTMLElement, target: View, ms: number): Promise<void> {
    this.#stop()
    if(ms <= 0) {
      this.#move(win, target, true)
      return Promise.resolve()
    }
    const size = {width: win.clientWidth, height: win.clientHeight}
    const from = this.#centre({...this.#view(win), ...size})
    const to = this.#centre({...target, ...size})
    return new Promise<void>(resolve => {
      const glide = {frame: 0, done: resolve}
      this.#glide = glide
      let start: number | undefined
      const step = (now: number) => {
        if(this.#glide !== glide) return
        const current = this.#win()
        if(current !== win) return this.#stop()
        start ??= now
        const done = clamp((now - start) / ms, 0, 1)
        const eased = 1 - (1 - done) ** 3
        // The scale changes by a constant factor, so that a zoom does not seem to speed up, and the centre moves in a straight line.
        const scale = from.scale * (to.scale / from.scale) ** eased
        const centre = {x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased}
        this.#move(win, done === 1 ? target : {scale, x: size.width / 2 - centre.x * scale, y: size.height / 2 - centre.y * scale}, true)
        if(done < 1) glide.frame = requestAnimationFrame(step)
        else this.#stop()
      }
      glide.frame = requestAnimationFrame(step)
    })
  }

  /** `centerOn()` and `setView()`: the view is a view of the widget's own choosing from now on. */
  #set(view: (win: HTMLElement) => View, motion: ViewportMotion): Promise<void> {
    const first = this.#win()
    if(!first || formOf(first) === "external") return Promise.resolve()
    return new Promise<void>(resolve => {
      const run = () => {
        this.#queued = null
        const win = this.#win()
        if(!win) return resolve()
        this.#followsFit = false
        void this.#goTo(win, view(win), this.#duration(motion.animate)).then(resolve)
      }
      if(this.#opened) return run()
      // Until the window has a size there is nothing to place the view in. The last call wins.
      this.#queued?.done()
      this.#queued = {run, done: resolve}
    })
  }

  // ── Fitting ───────────────────────────────────────────────────────────

  /** What the window and the options say about fitting. The attributes win. */
  #fitting(win: HTMLElement) {
    const given = this.#options.fit
    const options = (typeof given === "function" ? given() : given) ?? {}
    const number = (value: string | undefined) => (value === undefined || value.trim() === "" || !Number.isFinite(Number(value)) ? undefined : Number(value))
    const inset = (): Required<ViewportInsets> => {
      const attribute = win.dataset.wwViewportFitInset?.trim().split(/\s+/).map(Number)
      if(attribute?.length && attribute.length <= 4 && attribute.every(Number.isFinite)) {
        const [top, right = top, bottom = top, left = right] = attribute
        return {top, right, bottom, left}
      }
      const value = options.inset
      const sides = typeof value === "number" ? {top: value, right: value, bottom: value, left: value} : (value ?? {})
      return {top: sides.top ?? 0, right: sides.right ?? 0, bottom: sides.bottom ?? 0, left: sides.left ?? 0}
    }
    const follow = win.dataset.wwViewportFollow
    return {
      padding: Math.max(0, number(win.dataset.wwViewportFitPadding) ?? options.padding ?? 0),
      inset: inset(),
      max: number(win.dataset.wwViewportFitMax) ?? options.maxScale ?? Infinity,
      target: options.target,
      follow: (follow === "all" || follow === "window" || follow === "none" ? follow : options.follow) ?? "all",
    }
  }

  /** The room for content: the window without padding and without the scrollbars it shows now. In the canvas form also without the inset and the fit padding. */
  #room(win: HTMLElement, set = this.#fitting(win)): {width: number; height: number; left: number; top: number} {
    const style = getComputedStyle(win)
    if(formOf(win) !== "scroll") {
      const {inset, padding} = set
      const left = inset.left + padding
      const top = inset.top + padding
      return {left, top, width: Math.max(1, win.clientWidth - left - inset.right - padding), height: Math.max(1, win.clientHeight - top - inset.bottom - padding)}
    }
    const padded = (a: string, b: string) => parseFloat(a) + parseFloat(b)
    return {left: 0, top: 0, width: win.clientWidth - padded(style.paddingLeft, style.paddingRight), height: win.clientHeight - padded(style.paddingTop, style.paddingBottom)}
  }

  /** The unscaled extent of the content: the world element, or what the widget names (the fit target, else `bounds`). */
  #content(win: HTMLElement, set = this.#fitting(win)): WorldBox | null {
    if(formOf(win) === "canvas") return set.target?.() ?? this.#options.bounds?.() ?? null
    const rect = win.firstElementChild?.getBoundingClientRect()
    const scale = this.#snapshot.scale
    return rect ? {x: 0, y: 0, width: rect.width / scale, height: rect.height / scale} : null
  }

  /** What the fitted view depends on: the window and how it is fitted, and the unscaled extent of the content. */
  #fitKey(win: HTMLElement): {window: string; content: string} {
    const set = this.#fitting(win)
    const box = this.#content(win, set)
    const key = (numbers: (number | undefined)[]) => numbers.map(value => Math.round(value ?? 0)).join(" ")
    const {top, right, bottom, left} = set.inset
    return {
      window: key([win.offsetWidth, win.offsetHeight, set.padding, top, right, bottom, left]) + ` ${set.max}`,
      content: key([box?.x, box?.y, box?.width, box?.height]),
    }
  }

  /** True if a fitted view has to fit again: what it depends on changed, and `follow` says to follow it. */
  #stale(win: HTMLElement): boolean {
    const mode = this.#followCall ?? this.#fitting(win).follow
    if(mode === "none") return false
    const key = this.#fitKey(win)
    const before = this.#fitted
    return !before || key.window !== before.window || (mode === "all" && key.content !== before.content)
  }

  /**
   * Fits the content into the window. A pass can make a scrollbar come or go,
   * which changes the room; the scroll form then fits again for the new room.
   * Resolves when the view is there (after the animation), and tells the host.
   */
  #refit(win: HTMLElement, save = false, how: {reason: ViewportFitDetail["reason"]; follow?: ViewportFollow; box?: WorldBox; ms?: number} = {reason: "request"}): Promise<void> {
    this.#stop()
    const serial = ++this.#fitSerial
    this.#followsFit = true
    // A call decides for its own fit; a fit the module makes by itself goes on under what the call decided.
    if(how.reason !== "follow") this.#followCall = how.box ? "none" : (how.follow ?? null)
    const set = this.#fitting(win)
    const mode = win.dataset.wwViewportFit ?? "content"
    const [min, max] = this.#limits(win)
    const top = Math.max(min, Math.min(max, set.max))
    const canvas = formOf(win) === "canvas"
    const fitted = (box: WorldBox | null, room: {width: number; height: number; left: number; top: number}, whole: boolean): View => {
      let scale = 1
      if(box && box.width > 0 && box.height > 0 && mode !== "none") {
        scale = mode === "width" && !whole ? room.width / box.width : Math.min(room.width / box.width, room.height / box.height)
      }
      // Rounded down so that the fitted content never overflows by a fraction of a pixel.
      scale = clamp(Math.floor(scale * 1000) / 1000, min, top)
      const view = {scale, x: 0, y: 0}
      if(canvas && box && mode !== "none") {
        view.x = room.left + (room.width - box.width * scale) / 2 - box.x * scale
        view.y = mode === "width" ? room.top - box.y * scale : room.top + (room.height - box.height * scale) / 2 - box.y * scale
      }
      return view
    }
    const finish = () => {
      this.#fitted = this.#fitKey(win)
      if(save) this.#scheduleSave()
      this.host.dispatchEvent(new CustomEvent<ViewportFitDetail>("ww-viewportfit", {detail: {...this.#snapshot, reason: how.reason}, bubbles: true, composed: true}))
      this.#flush()
    }
    const content = () => how.box ?? this.#content(win, set)
    if(canvas && how.ms) {
      // The fit is the key of the view that is being moved to, so that the animation is not cut short by a fit of its own.
      const target = fitted(content(), this.#room(win, set), false)
      this.#fitted = this.#fitKey(win)
      return this.#goTo(win, target, how.ms).then(() => {
        if(this.#followsFit && this.#fitSerial === serial) finish()
      })
    }
    const seen: {width: number; height: number}[] = []
    for(let pass = 0; pass < 4; pass++) {
      const room = this.#room(win, set)
      this.#move(win, fitted(content(), room, false), true)
      const after = this.#room(win, set)
      if(after.width === room.width && after.height === room.height) break
      if(seen.some(earlier => earlier.width === after.width && earlier.height === after.height)) {
        // The scrollbar comes with one scale and goes with the other, so neither settles.
        // The largest scale that needs no scrollbar does: the content as high as the room without one.
        const open = {left: 0, top: 0, width: Math.max(room.width, after.width), height: Math.max(room.height, after.height)}
        this.#move(win, fitted(content(), open, true), true)
        break
      }
      seen.push(room)
    }
    finish()
    return Promise.resolve()
  }

  /** Settles the promises of `fitted()` when the view is a fitted one that is up to date. */
  #flush() {
    if(this.#waiters.length === 0) return
    const win = this.#win()
    const external = !!win && formOf(win) === "external"
    if(!external && (!win || !this.#opened || !this.#followsFit || this.#glide || this.#stale(win))) return
    for(const waiter of this.#waiters.splice(0)) waiter.resolve(this.#snapshot)
  }

  // ── Opening, resizing, saving ─────────────────────────────────────────

  #resized() {
    const win = this.#win()
    if(!win) return
    if(formOf(win) === "external") return this.#commit(win, this.#snapshot)
    if(win.clientWidth === 0) return
    if(this.#opened) return this.#settle(win)
    this.#opened = true
    // A view carried over from a replaced window, then the saved view, then the start view, then the fitted view.
    const view = this.#carried ?? this.#saved()
    this.#carried = null
    const start = view ? null : this.#start(win)
    if(view) this.#show(win, view)
    else if(start && start !== "fit") this.#begin(win, start)
    else void this.#refit(win, false, {reason: "open"})
    // What the widget asked for while there was no window overrides what the window opened with.
    const queued = this.#queued
    if(queued) queued.run()
    this.#flush()
  }

  /** The start view: the window's attribute, else the option. Null for none. */
  #start(win: HTMLElement): ViewportStart | null {
    const attribute = win.dataset.wwViewportStart?.trim()
    if(attribute !== undefined) {
      if(attribute === "fit") return "fit"
      const [x, y, scale, ...rest] = attribute.split(/\s+/).map(Number)
      if(rest.length === 0 && [x, y].every(Number.isFinite) && (scale === undefined || scale > 0)) return {centre: {x, y}, scale}
      warnOnce(this.host.constructor, "viewport:start", `<${this.host.localName}>: data-ww-viewport-start="${attribute}" is neither "fit" nor "x y scale". It is ignored.`)
    }
    const given = this.#options.start
    return (typeof given === "function" ? given() : given) ?? null
  }

  /** Shows a start view that is not the fit. */
  #begin(win: HTMLElement, start: Exclude<ViewportStart, "fit">) {
    if("box" in start) return void this.#refit(win, false, {reason: "open", box: start.box})
    if("centre" in start) return this.#show(win, {x: start.centre.x, y: start.centre.y, scale: start.scale ?? 1})
    const [min, max] = this.#limits(win)
    this.#followsFit = false
    this.#move(win, {scale: clamp(start.scale ?? 1, min, max), x: start.x, y: start.y}, true)
  }

  /**
   * After the window or the content changed size: a fitted view fits again as
   * `follow` says, any other view stays, within its limits. With `resize:
   * "centre"` a view that stays keeps the world point in the centre of the window.
   */
  #settle(win: HTMLElement) {
    if(this.#followsFit && this.#stale(win)) void this.#refit(win, false, {reason: "follow"})
    else {
      const view = this.#view(win)
      const before = this.#snapshot
      const centred = (win.dataset.wwViewportResize ?? this.#options.resize) === "centre" && before.width > 0
      if(centred) {
        view.x += (win.clientWidth - before.width) / 2
        view.y += (win.clientHeight - before.height) / 2
      }
      if(formOf(win) === "canvas" || centred) this.#move(win, view, true)
      else this.#commit(win, view)
      this.#flush()
    }
  }

  /** Shows a view given as the world point in the centre of the window, and the scale. */
  #show(win: HTMLElement, centre: View) {
    this.#stop()
    const [min, max] = this.#limits(win)
    const scale = clamp(centre.scale, min, max)
    this.#followsFit = false
    this.#move(win, {scale, x: win.clientWidth / 2 - centre.x * scale, y: win.clientHeight / 2 - centre.y * scale}, true)
  }

  /** The view in the `data-ww-viewport-save` attribute, if it holds one. */
  #saved(): View | null {
    const [x, y, scale, ...rest] = (this.#field && this.host.getAttribute(this.#field)?.trim().split(/\s+/).map(Number)) || []
    return rest.length === 0 && [x, y, scale].every(Number.isFinite) && scale > 0 ? {x, y, scale} : null
  }

  /** The saved form: the world point in the centre of the window, and the scale. Null for the fitted view. */
  #serialize(win: HTMLElement): string | null {
    if(this.#followsFit) return null
    const centre = this.#centre({...this.#view(win), width: win.clientWidth, height: win.clientHeight})
    return `${Math.round(centre.x * 10) / 10} ${Math.round(centre.y * 10) / 10} ${Math.round(centre.scale * 1000) / 1000}`
  }

  #hostChanged(records: MutationRecord[]) {
    const win = this.#win()
    // Not the module's own write: undo or a collaborator changed the saved view.
    if(win && this.#opened && this.#field && records.some(record => record.attributeName === this.#field) && this.host.getAttribute(this.#field) !== this.#serialize(win)) {
      clearTimeout(this.#timer)
      this.#drop()
      const view = this.#saved()
      if(view) this.#show(win, view)
      else void this.#refit(win)
    }
    this.#lock()
    this.#controls()
  }

  /** Writes once the view has been still for a moment, so that a gesture is one write. */
  #scheduleSave() {
    if(!this.#field) return
    clearTimeout(this.#timer)
    this.#timer = window.setTimeout(() => this.#save(), SAVE_DELAY)
  }

  #save() {
    const win = this.#win()
    const field = this.#field
    // Asked again now: the answer may have changed since the gesture.
    if(!win || !field || !this.#allowed() || this.#options.canSave?.() === false) return
    const value = this.#serialize(win)
    if(this.host.getAttribute(field) === value) return
    void transaction(this.host, () => {
      if(value === null) this.host.removeAttribute(field)
      else this.host.setAttribute(field, value)
      return this.#options.rendered?.()
    })
  }

  // ── Input ─────────────────────────────────────────────────────────────

  #wheel(event: WheelEvent) {
    const win = this.#win()
    if(!win || !event.composedPath().includes(win)) return
    const form = formOf(win)
    if(form === "external" || !this.#allowed()) return
    const modifier = event.ctrlKey || event.metaKey
    const mode = win.dataset.wwViewportWheel ?? this.#options.wheel
    // A sideways wheel is not a zoom: it stays what the mode says.
    const zooms = modifier || (mode === "zoom" && event.deltaY !== 0)
    // A scroll container pans natively; its scroll event reports the change. In the canvas form `"page"` leaves the plain wheel alone.
    if(!zooms && (form === "scroll" || mode === "page")) return
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? win.clientHeight : 1
    if(zooms) {
      event.preventDefault()
      return this.#zoom(win, this.#snapshot.scale * Math.exp(-event.deltaY * unit * WHEEL_STEP), {x: event.clientX, y: event.clientY}, true)
    }
    const sideways = event.shiftKey && event.deltaX === 0
    // At the limit the wheel goes on to the page, as it does from a scroll container.
    if(this.#panBy(win, -(sideways ? event.deltaY : event.deltaX) * unit, sideways ? 0 : -event.deltaY * unit, true)) event.preventDefault()
  }

  #scrolled(event: Event) {
    const win = this.#win()
    if(!win || event.target !== win || formOf(win) !== "scroll") return
    const expected = this.#expected
    const own = !!expected && Math.abs(win.scrollLeft - expected.left) < 1 && Math.abs(win.scrollTop - expected.top) < 1
    this.#expected = null
    this.#commit(win, this.#view(win))
    if(own) return
    this.#followsFit = false
    this.#scheduleSave()
  }

  #key(event: KeyboardEvent) {
    const win = this.#win()
    if(!win || event.target !== win || event.ctrlKey || event.metaKey || event.altKey || !this.#allowed()) return
    const form = formOf(win)
    if(Object.hasOwn(KEYS, event.key)) this.#act(KEYS[event.key], true)
    else if(form === "external") return
    // Space is the hand while it is held. Its own scrolling waits for the release.
    else if(event.key === " ") this.#space ??= {used: false}
    // A scroll container handles the arrow keys natively.
    else if(form === "canvas" && Object.hasOwn(ARROWS, event.key)) this.#panBy(win, ...ARROWS[event.key], true)
    else return
    event.preventDefault()
  }

  #keyup(event: KeyboardEvent) {
    if(event.key !== " ") return
    const space = this.#space
    this.#space = null
    const win = this.#win()
    if(!space || space.used || !win || event.target !== win || formOf(win) !== "scroll" || !this.#allowed()) return
    // No drag followed, so this was the browser's page-down (Shift: page-up) after all.
    if(win.dataset.wwViewportPan !== "x") win.scrollBy({top: (event.shiftKey ? -1 : 1) * win.clientHeight * PAGE})
  }

  #click(event: Event) {
    const action = clickedAction(event, this.root)
    if(action && this.#allowed()) this.#act(action, true)
  }

  /** Presses the module takes before the widget: the hand (Space held, or the middle button) and the second finger of a pinch. */
  #claim(event: PointerEvent) {
    const win = this.#win()
    if(!win || !event.composedPath().includes(win)) return
    const form = formOf(win)
    if(form === "external" || !this.#allowed()) return
    const pan = this.#pan
    if(form === "canvas" && pan && event.pointerType === "touch" && pan.down.pointerType === "touch" && event.pointerId !== pan.down.pointerId) {
      event.preventDefault()
      return this.#startPinch(win, pan, event)
    }
    const hand = event.button === 1 || (event.button === 0 && this.#space !== null)
    // A scroll container pans natively on touch, with momentum.
    if(!hand || (form === "scroll" && event.pointerType === "touch")) return
    // Claimed, as a widget claims a press: no autoscroll, and handlers that respect it leave the press alone.
    event.preventDefault()
    if(this.#space) this.#space.used = true
    this.#startPan(win, event)
  }

  /** A drag on empty background pans: a press on the window or on the world element itself, which nobody claimed. */
  #press(event: PointerEvent) {
    const win = this.#win()
    if(!win || event.defaultPrevented || event.button !== 0 || !event.composedPath().includes(win)) return
    const form = formOf(win)
    if(form === "external" || (form === "scroll" && event.pointerType === "touch") || !this.#allowed()) return
    if(event.target === win || event.target === win.firstElementChild) this.#startPan(win, event)
  }

  /** Ends running gestures without returning to the view before them. */
  #drop() {
    const [pan, pinch] = [this.#pan, this.#pinch]
    this.#pan = this.#pinch = null
    pan?.cancel()
    pinch?.cancel()
  }

  #restore(win: HTMLElement, origin: Origin) {
    this.#move(win, origin.view, true)
    this.#followsFit = origin.followed
  }

  /** `origin` is passed when the pan goes on from a pinch: a cancel then returns to the view before the pinch. */
  #startPan(win: HTMLElement, down: PointerEvent, origin?: Origin) {
    this.#stop()
    this.#drop()
    const gesture = (this.#pan = new PointerGesture(win, down))
    const base = this.#view(win)
    const before = (this.#origin = origin ?? {view: base, followed: this.#followsFit})
    this.whileAllowed(() => this.#allowed(), gesture.ended).addEventListener("abort", () => gesture.cancel())
    void (async () => {
      for await (const sample of gesture) {
        if(this.#pan !== gesture) return
        this.#followsFit = false
        this.#move(win, {scale: base.scale, x: base.x + sample.dx, y: base.y + sample.dy})
      }
      // Dropped, or handed over to a pinch: nothing to finish.
      if(this.#pan !== gesture) return
      this.#pan = null
      if(!gesture.moved && !origin) return
      // A cancelled drag changes nothing.
      if(gesture.cancelled) this.#restore(win, before)
      else this.#scheduleSave()
    })()
  }

  /** Canvas form: a second finger turns the pan into a pinch about the point between the two. */
  #startPinch(win: HTMLElement, pan: PointerGesture, second: PointerEvent) {
    this.#stop()
    const origin = this.#origin!
    this.#pan = null
    pan.cancel()
    const first = new PointerEvent("pointermove", {pointerId: pan.down.pointerId, pointerType: "touch", clientX: pan.last.clientX, clientY: pan.last.clientY})
    const start = this.#view(win)
    const corner = cornerOf(win)
    const world = {x: ((first.clientX + second.clientX) / 2 - corner.x - start.x) / start.scale, y: ((first.clientY + second.clientY) / 2 - corner.y - start.y) / start.scale}
    const pinch = (this.#pinch = new PinchGesture(first, second, sample => {
      if(this.#pinch !== pinch) return
      const [min, max] = this.#limits(win)
      const scale = clamp(start.scale * sample.ratio, min, max)
      const now = cornerOf(win)
      this.#followsFit = false
      this.#move(win, {scale, x: sample.x - now.x - world.x * scale, y: sample.y - now.y - world.y * scale})
    }))
    this.whileAllowed(() => this.#allowed(), pinch.ended).addEventListener("abort", () => pinch.cancel())
    pinch.ended.addEventListener("abort", () => {
      if(this.#pinch !== pinch) return
      this.#pinch = null
      if(pinch.cancelled) this.#restore(win, origin)
      else if(pinch.remaining) this.#startPan(win, pinch.remaining, origin)
      else this.#scheduleSave()
    })
  }

  // ── What the module renders ───────────────────────────────────────────

  /** A reader who may not change the view gets no native panning either. */
  #lock() {
    const sheet = this.#styles?.sheet
    if(!sheet) return
    const locked = !this.#allowed()
    const set = (index: number, name: string, value: string) => {
      const style = (sheet.cssRules[index] as CSSStyleRule).style
      if(style.getPropertyValue(name) !== value) style.setProperty(name, value)
    }
    set(SCROLL_RULE, "overflow", locked ? "hidden" : "auto")
    set(TOUCH_RULE, "touch-action", locked ? "auto" : "none")
  }

  #controls() {
    if(!this.connected) return
    const {scale, min, max} = this.#snapshot
    const win = this.#win()
    const idle = (!win || formOf(win) === "external") && !this.#adapter
    renderControls(this.root, {scale, min, max, locked: idle || !this.#allowed(), messages: this.#messages.current})
  }
}
