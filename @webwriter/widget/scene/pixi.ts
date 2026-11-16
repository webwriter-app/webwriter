// The Pixi renderer. This is the only file that imports pixi.js: a widget that
// draws with SVG never bundles it.
import {Container, EventBoundary, Graphics, GraphicsPath, Particle, ParticleContainer, Sprite, Text, Texture, TilingSprite, WebGLRenderer} from "pixi.js"
import {SceneBase, type Drawing, type Style} from "./base.js"
import {SceneGrid, SceneGroup, SceneImage, SceneItem, ScenePath, SceneSprites, SceneText} from "./elements.js"
import {distanceToPolyline, markerPolygon, type Marker, type Point, type Rect, type Transform} from "./geometry.js"
import type {Frame, PathLabel} from "./mirror.js"

type Paint = {color: number; alpha: number}

const paints = new Map<string, Paint | null>()
let probe: CanvasRenderingContext2D | null = null

/**
 * A computed colour for Pixi. Computed values keep the notation they were written
 * in (`oklch()`, `color-mix()`, `color(display-p3 …)`), which Pixi does not parse,
 * so a 2D canvas resolves each new value to sRGB once.
 */
function paint(css: string): Paint | null {
  if(css === "none") return null
  let found = paints.get(css)
  if(found === undefined) {
    probe ??= Object.assign(document.createElement("canvas"), {width: 1, height: 1}).getContext("2d", {willReadFrequently: true})!
    probe.clearRect(0, 0, 1, 1)
    probe.fillStyle = "#000"
    probe.fillStyle = css
    probe.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
    found = a ? {color: (r << 16) | (g << 8) | b, alpha: a / 255} : null
    if(paints.size > 500) paints.clear() // an animated colour produces many values
    paints.set(css, found)
  }
  return found
}

/** The outline of a shape as a polyline, for dashes, which Pixi does not draw itself. */
function outline(drawing: Drawing): Point[] {
  if(drawing.type === "path") return drawing.points
  if(drawing.type === "polygon") return [...drawing.points, drawing.points[0]]
  if(drawing.type === "rect" && drawing.radius > 0) {
    // The corners are arcs: eight steps each.
    const {x, y, width, height} = drawing
    const r = Math.min(drawing.radius, width / 2, height / 2)
    const corner = (cx: number, cy: number, start: number) => Array.from({length: 9}, (_, i) => ({x: cx + r * Math.cos(start + (i / 8) * (Math.PI / 2)), y: cy + r * Math.sin(start + (i / 8) * (Math.PI / 2))}))
    const points = [...corner(x + width - r, y + r, -Math.PI / 2), ...corner(x + width - r, y + height - r, 0), ...corner(x + r, y + height - r, Math.PI / 2), ...corner(x + r, y + r, Math.PI)]
    return [...points, points[0]]
  }
  if(drawing.type === "rect") {
    const {x, y, width, height} = drawing
    return [
      {x, y},
      {x: x + width, y},
      {x: x + width, y: y + height},
      {x, y: y + height},
      {x, y},
    ]
  }
  if(drawing.type !== "circle") return []
  return Array.from({length: 49}, (_, i) => ({x: drawing.x + drawing.r * Math.cos((i / 48) * 2 * Math.PI), y: drawing.y + drawing.r * Math.sin((i / 48) * 2 * Math.PI)}))
}

/** True if a point lies in a polygon (even-odd rule). */
function inside(polygon: Point[], x: number, y: number): boolean {
  let result = false
  for(let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [a, b] = [polygon[i], polygon[j]]
    if(a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) result = !result
  }
  return result
}

/** Cuts a polyline into the visible pieces of a dash pattern. */
function dashes(points: Point[], pattern: number[]): [Point, Point][] {
  const pieces: [Point, Point][] = []
  let index = 0
  let left = pattern[0]
  for(let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    let done = 0
    while(done < length) {
      const step = Math.min(left, length - done)
      const at = (t: number) => ({x: a.x + ((b.x - a.x) * t) / length, y: a.y + ((b.y - a.y) * t) / length})
      if(index % 2 === 0) pieces.push([at(done), at(done + step)])
      done += step
      left -= step
      if(left <= 0) left = pattern[++index % pattern.length]
    }
  }
  return pieces
}

/**
 * The Pixi renderer: `ww-scene` for simulations with thousands of moving objects.
 *
 * It needs WebGL. Without it the scene reports `ww-sceneerror` (`detail.code`
 * is `webgl`) on itself, sets `ww-scene:state(failed)` and draws nothing; the
 * HTML nodes stay where they are and stay usable. A widget that wants a
 * drawing in that case chooses the renderer when it registers its elements:
 *
 *     static scopedElements = {...sceneElements, "ww-scene": webglAvailable() ? PixiScene : Scene}
 *
 * The template is the same for both. The SVG renderer refuses only
 * `<ww-sprites>`, with the same event.
 *
 * Where Pixi does the nearest thing instead of the exact one:
 *
 * - A text with `dominant-baseline: alphabetic` puts its first baseline about 0.8 em below the top of the line. The other baselines are exact.
 * - Without a `line-height` of its own a text has Pixi's natural line height; the SVG renderer and `measureText()` use 1.2 times the font size.
 * - A dashed rounded rect is dashed along its rounded outline in eight steps per corner.
 * - The marks of the `background` are drawn from one small texture at the resolution of the view, so a dot of a pixel or two is a little softer than in SVG.
 */
export class PixiScene extends SceneBase {
  #canvas: HTMLCanvasElement | null = null
  #renderer: WebGLRenderer | null = null
  #stage = new Container()
  #boundary = new EventBoundary(this.#stage)
  #objects = new Map<SceneItem, Container>()
  #items = new WeakMap<Container, SceneItem>()
  #textures = new Map<CanvasImageSource, Texture>()
  #frame: number | null = null
  #visible = true
  #zoom = 1
  #hover: SceneItem | null = null
  #scope: AbortController | null = null
  /** The box behind a text, drawn right below it. */
  #backs = new Map<SceneItem, Graphics>()
  /** The frame of a group, drawn first. */
  #frames = new Map<SceneItem, Graphics>()
  /** The labels of a path: one container each, with the box and the text. Kept for the next draw. */
  #labels = new Map<SceneItem, Container[]>()
  /** The texture of a grid, and what it was made from. */
  #tiles = new Map<SceneItem, {key: string; texture: Texture}>()
  /** What the last style of each text was made from: Pixi renders a text again when its style is set. */
  #styles = new WeakMap<Text, string>()
  /** The children of each group, as they were arranged, so that a box that appears later can be put in its place. */
  #arranged = new Map<SceneGroup | null, SceneItem[]>()
  #homes = new Map<SceneItem, SceneGroup | null>()

  protected mount(surface: HTMLElement) {
    const {signal} = (this.#scope = new AbortController())
    const canvas = (this.#canvas = document.createElement("canvas"))
    canvas.part.add("drawing")
    surface.prepend(canvas)
    for(const type of ["pointerdown", "pointerup", "pointermove", "click", "dblclick", "contextmenu"]) canvas.addEventListener(type, this.#pointer, {signal})
    canvas.addEventListener("pointerleave", event => this.#hovering(null, event), {signal})
    canvas.addEventListener("webglcontextrestored", () => this.#paint(), {signal})
    // A page may hold only a limited number of WebGL contexts, so an off-screen scene gives its own back.
    const watcher = new IntersectionObserver(entries => this.#show(entries.at(-1)!.isIntersecting))
    watcher.observe(this)
    signal.addEventListener("abort", () => watcher.disconnect())
    this.viewed(this.view)
    void this.#start(canvas)
  }

  async #start(canvas: HTMLCanvasElement) {
    const renderer = new WebGLRenderer()
    try {
      await renderer.init({
        canvas,
        width: this.clientWidth || 1,
        height: this.clientHeight || 1,
        resolution: devicePixelRatio,
        autoDensity: true,
        backgroundAlpha: 0,
        antialias: true,
        accessibilityOptions: {activateOnTab: false},
      })
    } catch(error) {
      if(this.#canvas !== canvas) return
      this.setState("failed", true)
      const reason = error instanceof Error ? error.message : String(error)
      return this.report(
        "webgl",
        `The Pixi renderer got no WebGL context (${reason}). Nothing is drawn; the HTML nodes stay usable. Register Scene, the SVG renderer, as ww-scene where WebGL is missing.`,
        null,
      )
    }
    // Pixi's own event system would hit-test on every pointer move of the page. The scene forwards events itself.
    renderer.events?.setTargetElement(null as never)
    if(this.#canvas !== canvas) return renderer.destroy()
    this.#renderer = renderer
    if(!this.#visible) this.#release(true)
    this.#paint()
  }

  protected unmount() {
    this.#scope?.abort()
    if(this.#frame !== null) cancelAnimationFrame(this.#frame)
    this.#frame = null
    this.#renderer?.destroy()
    this.#renderer = null
    for(const texture of this.#textures.values()) texture.destroy(true)
    this.#textures.clear()
    this.#canvas?.remove()
    this.#canvas = null
    this.#hover = null
    this.setState("failed", false)
  }

  // ── The WebGL context ─────────────────────────────────────────────────

  /** True while the scene has given its WebGL context back, or has none yet. */
  get contextLost(): boolean {
    return !this.#renderer || this.#renderer.gl.isContextLost()
  }

  #show(visible: boolean) {
    if(visible === this.#visible) return
    this.#visible = visible
    this.#release(!visible)
  }

  #release(lose: boolean) {
    const renderer = this.#renderer
    const extension = renderer?.context.extensions.loseContext
    if(!renderer || !extension) return
    // Pixi rebuilds its GPU resources when the context comes back, and the scene then draws again.
    if(lose && !renderer.gl.isContextLost()) extension.loseContext()
    else if(!lose && renderer.gl.isContextLost()) extension.restoreContext()
  }

  #paint() {
    this.#frame ??= requestAnimationFrame(() => {
      this.#frame = null
      this.render()
    })
  }

  /** Draws now. False if there is no context to draw with. Runs by itself in the frame after a change. */
  render(): boolean {
    if(!this.#renderer || !this.#visible || this.contextLost) return false
    this.#renderer.render(this.#stage)
    return true
  }

  protected painted() {
    this.#paint()
  }

  protected resized(width: number, height: number) {
    if(!width || !height) return
    this.#renderer?.resize(width, height)
    this.#paint()
  }

  protected viewed(view: Transform) {
    this.#stage.position.set(view.x, view.y)
    this.#stage.scale.set(view.k)
    if(view.k !== this.#zoom) {
      this.#zoom = view.k
      // Text is a picture of its glyphs. It is made again at the size it is now shown in.
      for(const object of this.#objects.values()) if(object instanceof Text) object.resolution = this.#resolution
    }
    this.#paint()
  }

  get #resolution(): number {
    return devicePixelRatio * Math.max(1, this.#zoom)
  }

  // ── Mirroring ─────────────────────────────────────────────────────────

  protected create(item: SceneItem) {
    const object =
      item instanceof SceneGroup
        ? new Container()
        : item instanceof SceneSprites
          ? new ParticleContainer({dynamicProperties: {position: true, rotation: true, vertex: true, color: true}})
          : item instanceof SceneText
            ? new Text({text: ""})
            : item instanceof SceneImage
              ? new Sprite()
              : item instanceof SceneGrid
                ? new TilingSprite({texture: Texture.EMPTY, width: 1, height: 1})
                : new Graphics()
    // Drawn shapes take part in hit testing. Sprites of a batch do not: there are thousands. A grid is only a background.
    if(!(item instanceof SceneGroup || item instanceof SceneSprites || item instanceof SceneGrid)) object.eventMode = "static"
    else if(item instanceof SceneGrid) object.eventMode = "none"
    this.#objects.set(item, object)
    this.#items.set(object, item)
  }

  protected destroy(item: SceneItem) {
    // A path's labels are its children.
    this.#objects.get(item)?.destroy(item instanceof ScenePath ? {children: true} : undefined)
    this.#objects.delete(item)
    for(const extra of [this.#backs, this.#frames]) {
      extra.get(item)?.destroy({children: true})
      extra.delete(item)
    }
    this.#labels.delete(item)
    this.#tiles.get(item)?.texture.destroy(true)
    this.#tiles.delete(item)
    this.#homes.delete(item)
    if(this.#hover === item) this.#hover = null
  }

  protected arrange(group: SceneGroup | null, children: SceneItem[]) {
    const container = group ? this.#objects.get(group) : this.#stage
    this.#arranged.set(group, children)
    if(!container) return
    // A frame is a group's first child, and the box of a text is right below it.
    let index = 0
    const place = (object: Container) => {
      if(container.children[index] !== object) container.addChildAt(object, index)
      index++
    }
    const frame = group && this.#frames.get(group)
    if(frame) place(frame)
    for(const child of children) {
      this.#homes.set(child, group)
      const back = this.#backs.get(child)
      if(back) place(back)
      place(this.#objects.get(child)!)
    }
  }

  /** Puts the boxes that a group's members and the group have now in their place. */
  #rearrange(group: SceneGroup | null) {
    const children = this.#arranged.get(group)
    if(children) this.arrange(group, children)
  }

  protected draw(item: SceneItem, drawing: Drawing, style: Style) {
    const object = this.#objects.get(item)!
    object.alpha = style.opacity
    if(drawing.type === "group") {
      object.position.set(drawing.x, drawing.y)
      object.scale.set(drawing.scale)
      this.#groupFrame(item, drawing.frame, style)
    } else if(drawing.type === "sprites") this.#sprites(object as ParticleContainer, drawing)
    else if(drawing.type === "grid") this.#grid(item, object as TilingSprite, drawing, style)
    else if(drawing.type === "text") {
      const text = object as Text
      this.#text(text, drawing.text, style)
      text.resolution = this.#resolution
      text.position.set(drawing.x, drawing.y)
      text.anchor.x = style.textAnchor === "middle" ? 0.5 : style.textAnchor === "end" ? 1 : 0
      text.anchor.y = this.#anchorY(style, drawing.text.split("\n").length)
      text.rotation = (drawing.rotate * Math.PI) / 180
      text.visible = !!paint(style.fill)
      this.#back(item, text, style)
    } else if(drawing.type === "image") {
      const sprite = object as Sprite
      // Nothing is shown until the picture has loaded.
      sprite.visible = !!drawing.picture
      if(!drawing.picture) return
      sprite.texture = this.#texture(drawing.picture)
      sprite.position.set(drawing.x, drawing.y)
      sprite.setSize(drawing.width, drawing.height)
    } else {
      const graphics = object as Graphics
      this.#shape(graphics, drawing, style)
      // A shape that is turned is drawn where it is and turned about its pivot.
      const [origin, rotate] =
        drawing.type === "rect" ? [{x: drawing.x + drawing.width / 2, y: drawing.y + drawing.height / 2}, drawing.rotate] : drawing.type === "polygon" ? [drawing.origin, drawing.rotate] : [{x: 0, y: 0}, 0]
      graphics.pivot.set(rotate ? origin.x : 0, rotate ? origin.y : 0)
      graphics.position.set(rotate ? origin.x : 0, rotate ? origin.y : 0)
      graphics.rotation = (rotate * Math.PI) / 180
      // A selectable or movable line takes the pointer in a band around it, and so do its markers. Pixi tests objects from the top, so a shape above the line still covers it.
      if(drawing.type === "path") {
        const reach = (drawing.hit || (drawing.markers.length ? style.strokeWidth : 0)) / 2
        const markers = drawing.markers.map(markerPolygon)
        const band = drawing.hit || drawing.markers.length ? {points: drawing.points, reach} : null
        graphics.hitArea = band && {contains: (x: number, y: number) => (reach > 0 && distanceToPolyline(band.points, x, y) <= band.reach) || markers.some(polygon => inside(polygon, x, y))}
        this.#decorate(item, graphics, drawing.labels)
      } else graphics.hitArea = null
    }
  }

  /** The y anchor of a text for its baseline. The alphabetic one is the nearest: Pixi puts a line's baseline about 0.8 em below its top. */
  #anchorY(style: Style, lines: number): number {
    if(style.baseline === "middle") return 0.5
    if(style.baseline === "bottom") return 1
    if(style.baseline !== "alphabetic") return 0
    return ((style.lineHeight - style.fontSize) / 2 + 0.8 * style.fontSize) / (lines * style.lineHeight)
  }

  /** Sets the text and its style; the style only if it changed, because Pixi renders a text again for every style it gets. */
  #text(text: Text, content: string, style: Style) {
    const fill = paint(style.fill)
    const stroke = style.strokeWidth > 0 ? paint(style.stroke) : null
    const key = [style.fontFamily, style.fontSize, style.fontWeight, style.fontStyle, style.lineHeight, style.lineSet, content.includes("\n"), style.textAnchor, style.fill, style.stroke, style.strokeWidth].join("|")
    text.text = content
    if(this.#styles.get(text) === key) return
    this.#styles.set(text, key)
    text.style = {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight as never,
      fontStyle: style.fontStyle as never,
      fill: fill ?? 0,
      // Without a `line-height` of its own the text has Pixi's natural lines.
      ...(style.lineSet || content.includes("\n") ? {lineHeight: style.lineHeight} : {lineHeight: 0}),
      align: style.textAnchor === "middle" ? "center" : style.textAnchor === "end" ? "right" : "left",
      // A halo: Pixi draws the stroke under the letters.
      ...(stroke ? {stroke: {color: stroke.color, alpha: stroke.alpha, width: style.strokeWidth, join: "round" as const}} : {stroke: undefined}),
    }
  }

  /** The box behind a text: a sibling right below it, with the text's position and turn. */
  #back(item: SceneItem, text: Text, style: Style) {
    const colour = style.background === "none" ? null : paint(style.background)
    let back = this.#backs.get(item)
    if(!colour) {
      if(back) {
        back.destroy()
        this.#backs.delete(item)
      }
      return
    }
    if(!back) {
      back = new Graphics()
      back.eventMode = "static"
      this.#backs.set(item, back)
      this.#items.set(back, item)
      this.#rearrange(this.#homes.get(item) ?? null)
    }
    const [top, right, bottom, left] = style.padding.split(" ").map(Number)
    const box = text.getLocalBounds()
    back.clear().roundRect(box.x - left, box.y - top, box.width + left + right, box.height + top + bottom, style.radius).fill(colour)
    back.position.copyFrom(text.position)
    back.rotation = text.rotation
  }

  /** The box of a framed group, drawn first in the group, with its label. */
  #groupFrame(item: SceneItem, frame: Frame | null, style: Style) {
    let box = this.#frames.get(item)
    if(!frame) {
      if(box) {
        box.destroy({children: true})
        this.#frames.delete(item)
      }
      return
    }
    if(!box) {
      box = new Graphics()
      this.#frames.set(item, box)
      this.#items.set(box, item)
      this.#rearrange(item as SceneGroup)
    }
    box.clear().roundRect(frame.x, frame.y, frame.width, frame.height, frame.radius)
    const fill = paint(style.fill)
    const stroke = style.strokeWidth > 0 ? paint(style.stroke) : null
    if(fill) box.fill(fill)
    if(stroke) {
      const pattern = style.dash === "none" ? [] : style.dash.split(/[\s,]+/).map(parseFloat).filter(length => length >= 0)
      if(pattern.length && pattern.some(length => length > 0)) {
        box.clear()
        if(fill) box.roundRect(frame.x, frame.y, frame.width, frame.height, frame.radius).fill(fill)
        const [x, y, width, height] = [frame.x, frame.y, frame.width, frame.height]
        const around = [{x, y}, {x: x + width, y}, {x: x + width, y: y + height}, {x, y: y + height}, {x, y}]
        for(const [a, b] of dashes(around, pattern.length % 2 ? [...pattern, ...pattern] : pattern)) box.moveTo(a.x, a.y).lineTo(b.x, b.y)
      } else box.roundRect(frame.x, frame.y, frame.width, frame.height, frame.radius)
      box.stroke({...stroke, width: style.strokeWidth})
    }
    // The whole box takes the pointer where the group does; otherwise it is only drawn.
    box.eventMode = frame.interactive ? "static" : "none"
    box.hitArea = frame.interactive ? {contains: (x: number, y: number) => x >= frame.x && x <= frame.x + frame.width && y >= frame.y && y <= frame.y + frame.height} : null
    let label = box.children[0] as Text | undefined
    if(!frame.label) {
      label?.destroy()
      return
    }
    label ??= box.addChild(new Text({text: ""}))
    const colour = paint(style.color)
    this.#text(label, frame.label.text, {...style, fill: style.color, stroke: "none", strokeWidth: 0, textAnchor: "start"})
    label.resolution = this.#resolution
    label.position.set(frame.label.x, frame.label.y)
    label.anchor.set(0, 0)
    label.visible = !!colour
    label.eventMode = "none"
  }

  /** The labels of a path, as children of its graphics: a box and a text each, kept from one draw to the next. */
  #decorate(item: SceneItem, graphics: Graphics, labels: PathLabel[]) {
    const containers = this.#labels.get(item) ?? []
    this.#labels.set(item, containers)
    while(containers.length > labels.length) containers.pop()!.destroy({children: true})
    labels.forEach((label, index) => {
      let container = containers[index]
      if(!container) {
        container = containers[index] = new Container()
        container.addChild(new Graphics(), new Text({text: ""}))
        for(const child of container.children) child.eventMode = "static"
        graphics.addChild(container)
      }
      const [back, text] = container.children as [Graphics, Text]
      container.position.set(label.x, label.y)
      container.rotation = (label.rotate * Math.PI) / 180
      const colour = label.style.background === "none" ? null : paint(label.style.background)
      back.clear()
      if(colour) back.roundRect(-label.width / 2, -label.height / 2, label.width, label.height, label.style.radius).fill(colour)
      this.#text(text, label.lines.join("\n"), {...label.style, textAnchor: "middle"})
      text.resolution = this.#resolution
      text.anchor.set(0.5, 0.5)
      text.position.set(label.shift.x, label.shift.y)
      text.visible = !!paint(label.style.fill)
    })
  }

  /** A grid is a tiling sprite over the visible part of the scene, with one small texture. */
  #grid(item: SceneItem, sprite: TilingSprite, drawing: Extract<Drawing, {type: "grid"}>, style: Style) {
    const {spacing, kind, r, area} = drawing
    const colour = paint(kind === "dots" ? style.fill : style.stroke)
    sprite.visible = !!colour && (kind === "dots" || style.strokeWidth > 0)
    if(!sprite.visible) return
    // The tile has a whole number of pixels at the resolution the view is shown in.
    const resolution = Math.min(this.#resolution, 1024 / spacing)
    const size = Math.max(2, Math.round(spacing * resolution))
    const key = [kind, size, r, style.strokeWidth, colour!.color, colour!.alpha].join("|")
    let tile = this.#tiles.get(item)
    if(tile?.key !== key) {
      tile?.texture.destroy(true)
      const canvas = Object.assign(document.createElement("canvas"), {width: size, height: size})
      const context = canvas.getContext("2d")!
      const css = `rgb(${(colour!.color >> 16) & 255} ${(colour!.color >> 8) & 255} ${colour!.color & 255} / ${colour!.alpha})`
      const scale = size / spacing
      if(kind === "dots") {
        context.fillStyle = css
        context.beginPath()
        context.arc(size / 2, size / 2, r * scale, 0, 2 * Math.PI)
        context.fill()
      } else {
        context.strokeStyle = css
        context.lineWidth = style.strokeWidth * scale
        context.beginPath()
        context.moveTo(size / 2, 0)
        context.lineTo(size / 2, size)
        context.moveTo(0, size / 2)
        context.lineTo(size, size / 2)
        context.stroke()
      }
      tile = {key, texture: Texture.from(canvas, true)}
      this.#tiles.set(item, tile)
      sprite.texture = tile.texture
    }
    sprite.tileScale.set(spacing / size)
    sprite.position.set(area.x, area.y)
    sprite.width = area.width
    sprite.height = area.height
    // The marks are in the middle of a tile, and the origin of the tiles is half a cell before the origin of the grid.
    sprite.tilePosition.set(spacing / 2, spacing / 2)
  }

  #shape(graphics: Graphics, drawing: Extract<Drawing, {type: "rect" | "circle" | "polygon" | "path"}>, style: Style) {
    graphics.clear()
    const outlineOnly = () => {
      if(drawing.type === "rect") {
        if(drawing.radius > 0) graphics.roundRect(drawing.x, drawing.y, drawing.width, drawing.height, drawing.radius)
        else graphics.rect(drawing.x, drawing.y, drawing.width, drawing.height)
      } else if(drawing.type === "circle") graphics.circle(drawing.x, drawing.y, drawing.r)
      else if(drawing.type === "polygon") graphics.poly(drawing.points, true)
      else if(drawing.d) graphics.path(new GraphicsPath(drawing.d))
    }
    const fill = paint(style.fill)
    const stroke = style.strokeWidth > 0 ? paint(style.stroke) : null
    const pattern =
      style.dash === "none"
        ? []
        : style.dash
            .split(/[\s,]+/)
            .map(parseFloat)
            .filter(length => length >= 0)
    if(fill) {
      outlineOnly()
      graphics.fill(fill)
    }
    if(!stroke) return
    if(pattern.length && pattern.some(length => length > 0)) {
      // SVG repeats an odd pattern to make it even.
      for(const [a, b] of dashes(outline(drawing), pattern.length % 2 ? [...pattern, ...pattern] : pattern)) graphics.moveTo(a.x, a.y).lineTo(b.x, b.y)
    } else outlineOnly()
    graphics.stroke({...stroke, width: style.strokeWidth})
    if(drawing.type === "path") this.#markers(graphics, drawing.markers, style, stroke)
  }

  /** The markers of a path: filled in the stroke colour, or outlined and filled with `--ww-scene-marker-fill`. A marker is never dashed. */
  #markers(graphics: Graphics, markers: Marker[], style: Style, stroke: Paint) {
    const hollow = style.markerFill === "none" ? null : paint(style.markerFill)
    for(const marker of markers) {
      const shape = () => {
        if(marker.polygon) graphics.poly(marker.polygon, true)
        else if(marker.line) graphics.poly(marker.line, false)
        else graphics.circle(marker.circle!.x, marker.circle!.y, marker.circle!.r)
      }
      if(marker.filled) {
        shape()
        graphics.fill(stroke)
        continue
      }
      if(hollow && !marker.line) {
        shape()
        graphics.fill(hollow)
      }
      shape()
      graphics.stroke({...stroke, width: style.strokeWidth, join: "round"})
    }
  }

  #sprites(container: ParticleContainer, drawing: Extract<Drawing, {type: "sprites"}>) {
    // A batch without a texture is white squares. One whose texture is still loading is not shown.
    container.visible = drawing.ready
    const texture = drawing.texture ? this.#texture(drawing.texture) : Texture.WHITE
    // A batch draws all its particles with one texture.
    container.texture = texture
    const particles = container.particleChildren as Particle[]
    const {items} = drawing
    for(let i = 0; i < items.length; i++) {
      const source = items[i]
      const particle = (particles[i] ??= new Particle({texture, anchorX: 0.5, anchorY: 0.5}))
      particle.texture = texture
      particle.x = source.x
      particle.y = source.y
      particle.rotation = source.rotation ?? 0
      particle.scaleX = particle.scaleY = source.scale ?? 1
      if(source.tint !== undefined) particle.tint = source.tint
      if(source.alpha !== undefined) particle.alpha = source.alpha
    }
    particles.length = items.length
    container.update()
  }

  /** The texture of an image source. The module has loaded it already. */
  #texture(source: CanvasImageSource): Texture {
    let texture = this.#textures.get(source)
    if(!texture) {
      texture = Texture.from(source as HTMLCanvasElement, true)
      this.#textures.set(source, texture)
    }
    return texture
  }

  protected measure(item: SceneItem): Rect | null {
    const object = this.#objects.get(item)
    if(!object) return null
    const {x, y, width, height} = object.getLocalBounds()
    return {x: x + object.position.x, y: y + object.position.y, width, height}
  }

  rendering(item: SceneItem): Container | undefined {
    return this.#objects.get(item)
  }

  // ── Events ────────────────────────────────────────────────────────────

  #pointer = (event: Event) => {
    const {clientX, clientY} = event as MouseEvent
    // The stage carries the view, so Pixi is asked in the pixels of the canvas.
    const at = this.toSurface(clientX, clientY)
    let object: Container | null = this.#boundary.hitTest(at.x, at.y)
    while(object && !this.#items.has(object)) object = object.parent
    const item = object ? this.#items.get(object)! : null
    if(event.type === "pointermove") this.#hovering(item, event)
    if(item) this.forward(event, item)
  }

  /** Pixi has no hover of its own that CSS could see: derive pointerover and pointerout from the hit test. */
  #hovering(item: SceneItem | null, event: Event) {
    if(item === this.#hover) return
    if(this.#hover) this.forward(event, this.#hover, "pointerout")
    this.#hover = item
    if(item) this.forward(event, item, "pointerover")
  }
}
