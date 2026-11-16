/** One position of a pinch. */
export type PinchSample = {
  /** The point halfway between the two pointers, in client coordinates. */
  x: number
  y: number
  /** Their distance, divided by the distance when the second pointer was pressed. */
  ratio: number
}

type Position = {x: number; y: number}

/**
 * Two pointers on a surface, from the press of the second one until one of
 * them is released. `change` is called for every movement. The gesture owns
 * its listeners and removes them when it ends.
 */
export class PinchGesture {
  /** True if the gesture ended by Escape, pointercancel, blur or cancel(). */
  cancelled = false
  /** After a release: the last event of the pointer that is still down. A pan can go on from it. */
  remaining: PointerEvent | null = null
  /** The state at the press of the second pointer. */
  readonly start: PinchSample

  #abort = new AbortController()
  #positions = new Map<number, Position>()
  #events = new Map<number, PointerEvent>()
  #distance: number

  constructor(first: PointerEvent, second: PointerEvent, change: (sample: PinchSample) => void) {
    for(const event of [first, second]) {
      this.#positions.set(event.pointerId, {x: event.clientX, y: event.clientY})
      this.#events.set(event.pointerId, event)
    }
    this.#distance = Math.max(this.#spread(), 1)
    this.start = this.#sample()

    const signal = this.#abort.signal
    const own = (event: PointerEvent) => this.#positions.has(event.pointerId)
    window.addEventListener(
      "pointermove",
      event => {
        if(!own(event)) return
        event.preventDefault()
        this.#positions.set(event.pointerId, {x: event.clientX, y: event.clientY})
        this.#events.set(event.pointerId, event)
        change(this.#sample())
      },
      {signal, capture: true},
    )
    window.addEventListener(
      "pointerup",
      event => {
        if(!own(event)) return
        this.#events.delete(event.pointerId)
        this.remaining = [...this.#events.values()][0] ?? null
        this.#end(false)
      },
      {signal, capture: true},
    )
    window.addEventListener("pointercancel", event => own(event) && this.#end(true), {signal, capture: true})
    window.addEventListener("keydown", event => event.key === "Escape" && this.#end(true), {signal, capture: true})
    window.addEventListener("blur", () => this.#end(true), {signal})
  }

  /** Aborts when the gesture is over, by release or by cancel. */
  get ended(): AbortSignal {
    return this.#abort.signal
  }

  /** Ends the gesture as cancelled. */
  cancel(): void {
    this.#end(true)
  }

  #spread(): number {
    const [a, b] = [...this.#positions.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  #sample(): PinchSample {
    const [a, b] = [...this.#positions.values()]
    return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, ratio: Math.max(this.#spread(), 1) / this.#distance}
  }

  #end(cancelled: boolean) {
    if(this.#abort.signal.aborted) return
    this.cancelled = cancelled
    if(cancelled) this.remaining = null
    this.#abort.abort()
  }
}
