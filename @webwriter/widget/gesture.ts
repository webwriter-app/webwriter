/** One position of a gesture. */
export type GestureSample = {
  /** Position relative to the surface's top-left corner in CSS pixels, or in the coordinates of `convert`. */
  x: number
  y: number
  /** Movement since the press, in the same coordinates as `x` and `y`. */
  dx: number
  dy: number
  clientX: number
  clientY: number
}

/** Options of a `PointerGesture`. */
export type GestureOptions = {
  /** Movement in CSS pixels on the screen before the gesture starts. Below it the press stays a click. */
  threshold?: number
  /**
   * Converts a client position into the coordinates the samples are delivered
   * in, for example `(x, y) => viewport.toWorld(x, y)`. It is asked for every
   * sample, so a view that moves during the gesture is followed; `dx` and `dy`
   * are measured from the converted position of the press.
   * Default: relative to the surface's top-left corner.
   */
  convert?: (clientX: number, clientY: number) => {x: number; y: number}
}

/**
 * One pointer sequence, from press to release. Iterate it to receive at most one
 * sample per animation frame. The loop ends on release or cancel. The gesture owns
 * all listeners and removes them when it ends.
 */
export class PointerGesture implements AsyncIterable<GestureSample> {
  /** True once the pointer moved past the threshold. */
  moved = false
  /** True if the gesture ended by Escape, pointercancel, lost capture, blur or cancel(). */
  cancelled = false
  /** The most recent sample. */
  last: GestureSample

  #pending: GestureSample | null = null
  #frame: number | null = null
  #ended = false
  #wake: (() => void) | null = null
  #abort = new AbortController()
  #convert: GestureOptions["convert"]
  #start: {x: number; y: number} | null = null

  constructor(
    readonly surface: HTMLElement,
    readonly down: PointerEvent,
    options: GestureOptions = {},
  ) {
    const threshold = options.threshold ?? 4
    this.#convert = options.convert
    this.last = this.#sample(down)

    const signal = this.#abort.signal
    const own = (event: PointerEvent) => event.pointerId === down.pointerId
    // Listen on the window: before the threshold there is no capture yet, and a
    // release outside the surface must still end the gesture.
    window.addEventListener(
      "pointermove",
      event => {
        if(!own(event)) return
        const sample = this.#sample(event)
        if(!this.moved) {
          if(Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) < threshold) return
          this.moved = true
          try {
            surface.setPointerCapture(down.pointerId)
          } catch {
            // The pointer is no longer active (or is synthetic). The gesture still works without capture.
          }
        }
        event.preventDefault()
        this.last = sample
        this.#pending = sample
        this.#frame ??= requestAnimationFrame(() => {
          this.#frame = null
          this.#wake?.()
        })
      },
      {signal, capture: true},
    )
    window.addEventListener("pointerup", event => own(event) && this.#end(false, event), {signal, capture: true})
    window.addEventListener("pointercancel", event => own(event) && this.#end(true), {signal, capture: true})
    surface.addEventListener("lostpointercapture", event => own(event) && this.#end(true), {signal})
    window.addEventListener("keydown", event => event.key === "Escape" && this.#end(true), {signal, capture: true})
    window.addEventListener("blur", () => this.#end(true), {signal})
  }

  /** Aborts when the gesture is over, by release or by cancel. */
  get ended(): AbortSignal {
    return this.#abort.signal
  }

  /** Ends the gesture as cancelled. */
  cancel() {
    this.#end(true)
  }

  #sample(event: PointerEvent): GestureSample {
    const {clientX, clientY} = event
    if(this.#convert) {
      const at = this.#convert(clientX, clientY)
      this.#start ??= at // the first sample is the press
      return {x: at.x, y: at.y, dx: at.x - this.#start.x, dy: at.y - this.#start.y, clientX, clientY}
    }
    const rect = this.surface.getBoundingClientRect()
    return {x: clientX - rect.left, y: clientY - rect.top, dx: clientX - this.down.clientX, dy: clientY - this.down.clientY, clientX, clientY}
  }

  #end(cancelled: boolean, event?: PointerEvent) {
    if(this.#ended) return
    this.#ended = true
    this.cancelled = cancelled
    if(event) this.last = this.#sample(event)
    this.#abort.abort()
    if(this.#frame !== null) cancelAnimationFrame(this.#frame)
    if(this.surface.hasPointerCapture(this.down.pointerId)) this.surface.releasePointerCapture(this.down.pointerId)
    this.#wake?.()
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<GestureSample> {
    while(true) {
      if(this.#pending) {
        const sample = this.#pending
        this.#pending = null
        yield sample
        continue
      }
      if(this.#ended) return
      await new Promise<void>(resolve => (this.#wake = resolve))
      this.#wake = null
    }
  }
}
