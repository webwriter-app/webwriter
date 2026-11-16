class PointerGesture {
  constructor(surface, down, options = {}) {
    this.surface = surface;
    this.down = down;
    const threshold = options.threshold ?? 4;
    this.#convert = options.convert;
    this.last = this.#sample(down);
    const signal = this.#abort.signal;
    const own = (event) => event.pointerId === down.pointerId;
    window.addEventListener(
      "pointermove",
      (event) => {
        if (!own(event)) return;
        const sample = this.#sample(event);
        if (!this.moved) {
          if (Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) < threshold) return;
          this.moved = true;
          try {
            surface.setPointerCapture(down.pointerId);
          } catch {
          }
        }
        event.preventDefault();
        this.last = sample;
        this.#pending = sample;
        this.#frame ??= requestAnimationFrame(() => {
          this.#frame = null;
          this.#wake?.();
        });
      },
      { signal, capture: true }
    );
    window.addEventListener("pointerup", (event) => own(event) && this.#end(false, event), { signal, capture: true });
    window.addEventListener("pointercancel", (event) => own(event) && this.#end(true), { signal, capture: true });
    surface.addEventListener("lostpointercapture", (event) => own(event) && this.#end(true), { signal });
    window.addEventListener("keydown", (event) => event.key === "Escape" && this.#end(true), { signal, capture: true });
    window.addEventListener("blur", () => this.#end(true), { signal });
  }
  /** True once the pointer moved past the threshold. */
  moved = false;
  /** True if the gesture ended by Escape, pointercancel, lost capture, blur or cancel(). */
  cancelled = false;
  /** The most recent sample. */
  last;
  #pending = null;
  #frame = null;
  #ended = false;
  #wake = null;
  #abort = new AbortController();
  #convert;
  #start = null;
  /** Aborts when the gesture is over, by release or by cancel. */
  get ended() {
    return this.#abort.signal;
  }
  /** Ends the gesture as cancelled. */
  cancel() {
    this.#end(true);
  }
  #sample(event) {
    const { clientX, clientY } = event;
    if (this.#convert) {
      const at = this.#convert(clientX, clientY);
      this.#start ??= at;
      return { x: at.x, y: at.y, dx: at.x - this.#start.x, dy: at.y - this.#start.y, clientX, clientY };
    }
    const rect = this.surface.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top, dx: clientX - this.down.clientX, dy: clientY - this.down.clientY, clientX, clientY };
  }
  #end(cancelled, event) {
    if (this.#ended) return;
    this.#ended = true;
    this.cancelled = cancelled;
    if (event) this.last = this.#sample(event);
    this.#abort.abort();
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    if (this.surface.hasPointerCapture(this.down.pointerId)) this.surface.releasePointerCapture(this.down.pointerId);
    this.#wake?.();
  }
  async *[Symbol.asyncIterator]() {
    while (true) {
      if (this.#pending) {
        const sample = this.#pending;
        this.#pending = null;
        yield sample;
        continue;
      }
      if (this.#ended) return;
      await new Promise((resolve) => this.#wake = resolve);
      this.#wake = null;
    }
  }
}
export {
  PointerGesture
};
