import {ModuleCore, type CoreOptions} from "../base.js"
import type {MessagesOption} from "../messages.js"
import {can as allowed} from "../permissions.js"
import type {PortEnd, SceneAction, SceneBase, SceneView, TextFont, TextSize, UndoHost} from "./base.js"
import type {SceneItem, ScenePath} from "./elements.js"
import type {Point, Rect} from "./geometry.js"
import type {SceneMessages} from "../messages/scene/index.js"

/** A permission per action, by the name it has in the widget's `static permissions`. An action without a name is allowed. */
export type ScenePermissions = Partial<Record<SceneAction, string>>

/** Options of `SceneCore`. */
export type SceneOptions = CoreOptions & {
  /**
   * Asked before a selection, a move, a resize or a connection, during it and
   * before it commits. A function returns false to refuse. A map names the
   * permission each action needs: `{move: "allowEditing", connect: "allowEditing"}`.
   * A function that is asked about a connection that starts at a port also gets the port element as its third argument,
   * so that it can refuse one port and not the whole node.
   */
  can?: ((action: SceneAction, item: Element, port?: Element) => boolean) | ScenePermissions
  /** Resolves when the widget has rendered a model change. Lit: `() => host.updateComplete`. */
  rendered?: () => Promise<unknown>
  /**
   * The viewport whose view the scene follows, for a scene that is the window
   * of a viewport which tracks its view: `<ww-scene data-ww-viewport="canvas">`.
   * Pass `viewport.core` of the Lit binding, or the `ViewportCore`. Leave it
   * out for a scene that is wrapped in a scrolling `data-ww-viewport`.
   */
  viewport?: SceneView
  /** Entries that replace the module's own texts, in every language. */
  messages?: MessagesOption<SceneMessages>
  /**
   * The element an undo step is opened on, for a controller that lives in a component inside the widget: the
   * editor knows the widget, and ignores a step that starts on anything else. `"outermost"` is the host at the top of the
   * shadow roots above the scene, which is the widget in the document; or give the element, or a function that returns it.
   * Without it the step is opened on the host of the shadow root the scene is in.
   */
  undoHost?: UndoHost
}

/** The state of `SceneCore`. The selection is not in it: that is the widget's. */
export type SceneSnapshot = {
  /** True while the reader draws a marquee. A viewport stays still meanwhile: `can: () => !scene.marquee`. */
  readonly marquee: boolean
}

const RESTING: SceneSnapshot = Object.freeze({marquee: false})
const DRAWING: SceneSnapshot = Object.freeze({marquee: true})
const THEME = {attributeFilter: ["class", "style", "data-theme"]}

/**
 * The widget's side of Scene. The scene elements do the work themselves; this
 * core tells every `ww-scene` in the widget's shadow root what only the widget
 * knows: that it rendered (`refresh()`), that the theme changed, what a reader
 * may do, which viewport shows it and when a model change has reached the
 * template.
 */
export class SceneCore extends ModuleCore<SceneSnapshot> {
  #options: SceneOptions
  #snapshot = RESTING
  #themes: MutationObserver | null = null
  /** The elements whose class, style and data-theme are watched. Only compared by identity. */
  #watched: Element[] = []
  /** Answers for named permissions, kept until the current task ends: a scene asks once per node. */
  #answers: Map<string, boolean> | null = null

  constructor(host: HTMLElement, options: SceneOptions = {}) {
    super(host, options)
    this.#options = options
  }

  getSnapshot(): SceneSnapshot {
    return this.#snapshot
  }

  /** Every `ww-scene` in the widget's template. */
  get scenes(): SceneBase[] {
    return [...this.root.querySelectorAll<SceneBase>("ww-scene")].filter(scene => "refresh" in scene)
  }

  /** The box around everything in the widget's first scene, in scene coordinates: the `bounds` of a Viewport. */
  extent(): Rect | null {
    return this.scenes[0]?.extent() ?? null
  }

  /**
   * The size a text takes in the widget's first scene: the widest line and the
   * height of its lines, in scene pixels. `\n` breaks lines. `source` is an
   * element whose font is used, such as a `ww-text`, or some entries of a font.
   * A text need not be drawn: size a node to its label before rendering it.
   */
  measureText(text: string, source?: Element | Partial<TextFont>): TextSize {
    const scene = this.scenes[0]
    return scene ? scene.measureText(text, source) : {width: 0, height: 0, lines: text.split("\n").length, lineHeight: 0}
  }

  /** Resolves when the first layout of the widget's first scene has settled: the fonts are loaded, the nodes are measured and the paths drawn, so that `extent()` is what it will stay. Also `ww-ready` on the scene. */
  get ready(): Promise<void> {
    return this.scenes[0]?.ready ?? Promise.resolve()
  }

  /** Client coordinates to scene coordinates of the widget's first scene, through its view. */
  toScene(clientX: number, clientY: number): Point {
    return this.scenes[0]?.toScene(clientX, clientY) ?? {x: clientX, y: clientY}
  }

  /** Scene coordinates of the widget's first scene to client coordinates. */
  toClient(x: number, y: number): Point {
    return this.scenes[0]?.toClient(x, y) ?? {x, y}
  }

  /** The topmost item of the widget's first scene at a point, or null: see `itemsAt` of the scene. `point` is in scene coordinates, or client coordinates with `{client: true}`. */
  itemAt(point: Point, options?: {client?: boolean}): SceneItem | null {
    return this.scenes[0]?.itemAt(point, options) ?? null
  }

  /** The items of the widget's first scene at a point, the topmost first. */
  itemsAt(point: Point, options?: {client?: boolean}): SceneItem[] {
    return this.scenes[0]?.itemsAt(point, options) ?? []
  }

  /** The ends of an attached path in the widget's first scene as what they name: the node, the port name and the port element. */
  endsOf(path: ScenePath): {from: PortEnd | null; to: PortEnd | null} {
    return this.scenes[0]?.endsOf(path) ?? {from: null, to: null}
  }

  /** The paths in the widget's first scene that end at exactly this reference: at a port (`node:port`), or at a node as a whole (`node`), which does not count the wires at its ports. */
  wiresAt(reference: string): ScenePath[] {
    return this.scenes[0]?.wiresAt(reference) ?? []
  }

  /** Reads every computed style again, for a change of style that no observer sees, such as a new style rule. */
  restyle(): void {
    for(const scene of this.scenes) scene.restyle()
  }

  /** Measures every port again, for ports that moved without any change of the document. */
  remeasure(): void {
    for(const scene of this.scenes) scene.remeasure()
  }

  protected onConnect() {
    // The browser reports no change of a computed style. These are the places a theme is switched.
    const themed = () => {
      this.restyle()
      this.remeasure()
    }
    this.listen(matchMedia("(prefers-color-scheme: dark)"), "change", themed)
    this.#themes = new MutationObserver(themed)
    this.cleanup(() => {
      this.#themes?.disconnect()
      this.#themes = null
      this.#watched = []
      this.#answers = null
      this.#snapshot = RESTING
    })
  }

  protected onRefresh() {
    const {can, rendered, viewport, messages, undoHost} = this.#options
    const scenes = this.scenes
    for(const scene of scenes) {
      scene.can = typeof can === "function" ? can : can ? action => this.#granted(can[action]) : null
      scene.rendered = rendered ?? null
      scene.whileAllowed = (answer, until) => this.whileAllowed(answer, until)
      scene.messages = messages
      scene.undoHost = undoHost ?? null
      scene.viewport = viewport ?? null
      scene.changed = () => this.#changed()
      scene.refresh()
    }
    this.#watch(scenes)
  }

  /** Watches the host, the page and everything between the host and each scene for a switch of theme. */
  #watch(scenes: SceneBase[]) {
    const document = this.host.ownerDocument
    const watched = new Set<Element>([this.host, document.documentElement, document.body])
    for(const scene of scenes) for(let parent = scene.parentElement; parent; parent = parent.parentElement) watched.add(parent)
    const list = [...watched]
    if(list.length === this.#watched.length && list.every((element, index) => element === this.#watched[index])) return
    this.#themes!.disconnect()
    for(const element of list) this.#themes!.observe(element, THEME)
    this.#watched = list
  }

  /** The answer for a permission by its name. An action that names none is allowed. */
  #granted(name: string | undefined): boolean {
    if(!name) return true
    if(!this.#answers) {
      this.#answers = new Map()
      queueMicrotask(() => (this.#answers = null))
    }
    let answer = this.#answers.get(name)
    if(answer === undefined) this.#answers.set(name, (answer = allowed(this.host, name)))
    return answer
  }

  #changed() {
    const next = this.scenes.some(scene => scene.marquee) ? DRAWING : RESTING
    if(next === this.#snapshot) return
    this.#snapshot = next
    this.notify()
  }
}
