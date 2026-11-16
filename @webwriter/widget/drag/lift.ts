import {apply, centreOf, screenMatrix, type Point} from "./geometry.js"

/**
 * A lifted item. It is moved by a paused animation, so no style attribute is
 * written, on an authored element or on any other.
 *
 * Every move measures where the item is and corrects by the difference, in
 * the item's own coordinate space. That keeps it under the pointer while the
 * page or a container scrolls beneath it, and under CSS `zoom` or a
 * transform of anything around it.
 */
export class Lift {
  readonly #item: HTMLElement
  readonly #look: Keyframe
  readonly #animation: Animation
  #x = 0
  #y = 0

  /** `look` is the extra style of the lifted item, as one keyframe. */
  constructor(item: HTMLElement, look: Keyframe = {}) {
    this.#item = item
    this.#look = look
    this.#animation = item.animate([], {duration: 1, fill: "both"})
    this.#animation.pause()
    this.#write()
  }

  /**
   * The centre the item can reach when `wanted` is asked for. With an axis
   * lock it only moves along that axis of its own coordinate space.
   */
  reach(wanted: Point, axis?: "x" | "y"): Point {
    if(!axis) return wanted
    const now = centreOf(this.#item)
    const moved = apply(screenMatrix(this.#item, false), this.#step(wanted, now, axis))
    return {x: now.x + moved.x, y: now.y + moved.y}
  }

  /** Moves the item so that its centre is at this place on the screen, as far as the axis lock allows. */
  moveTo(centre: Point, axis?: "x" | "y"): void {
    const step = this.#step(centre, centreOf(this.#item), axis)
    this.#x += step.x
    this.#y += step.y
    this.#write()
  }

  /** Puts the item back at once. */
  cancel(): void {
    this.#animation.cancel()
  }

  /** The step from `now` to `wanted` in the space the item's `translate` is measured in. */
  #step(wanted: Point, now: Point, axis?: "x" | "y"): Point {
    const step = apply(screenMatrix(this.#item, false).inverse(), {x: wanted.x - now.x, y: wanted.y - now.y})
    if(!Number.isFinite(step.x + step.y)) return {x: 0, y: 0} // a collapsed coordinate space: stay
    if(axis === "x") step.y = 0
    if(axis === "y") step.x = 0
    return step
  }

  #write() {
    const frame = {...this.#look, translate: `${this.#x}px ${this.#y}px`, zIndex: 1000}
    ;(this.#animation.effect as KeyframeEffect).setKeyframes([frame, frame])
  }
}
