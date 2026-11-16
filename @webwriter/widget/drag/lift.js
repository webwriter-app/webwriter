import { apply, centreOf, screenMatrix } from "./geometry.js";
class Lift {
  #item;
  #look;
  #animation;
  #x = 0;
  #y = 0;
  /** `look` is the extra style of the lifted item, as one keyframe. */
  constructor(item, look = {}) {
    this.#item = item;
    this.#look = look;
    this.#animation = item.animate([], { duration: 1, fill: "both" });
    this.#animation.pause();
    this.#write();
  }
  /**
   * The centre the item can reach when `wanted` is asked for. With an axis
   * lock it only moves along that axis of its own coordinate space.
   */
  reach(wanted, axis) {
    if (!axis) return wanted;
    const now = centreOf(this.#item);
    const moved = apply(screenMatrix(this.#item, false), this.#step(wanted, now, axis));
    return { x: now.x + moved.x, y: now.y + moved.y };
  }
  /** Moves the item so that its centre is at this place on the screen, as far as the axis lock allows. */
  moveTo(centre, axis) {
    const step = this.#step(centre, centreOf(this.#item), axis);
    this.#x += step.x;
    this.#y += step.y;
    this.#write();
  }
  /** Puts the item back at once. */
  cancel() {
    this.#animation.cancel();
  }
  /** The step from `now` to `wanted` in the space the item's `translate` is measured in. */
  #step(wanted, now, axis) {
    const step = apply(screenMatrix(this.#item, false).inverse(), { x: wanted.x - now.x, y: wanted.y - now.y });
    if (!Number.isFinite(step.x + step.y)) return { x: 0, y: 0 };
    if (axis === "x") step.y = 0;
    if (axis === "y") step.x = 0;
    return step;
  }
  #write() {
    const frame = { ...this.#look, translate: `${this.#x}px ${this.#y}px`, zIndex: 1e3 };
    this.#animation.effect.setKeyframes([frame, frame]);
  }
}
export {
  Lift
};
