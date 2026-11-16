/** Options of `whileVisible()`. */
export type VisibleOptions = {
  /** The longest time one frame may report, in seconds. A stall is cut down to this. Default 0.1. */
  maxDelta?: number
}

/** What `whileVisible()` returns. */
export type VisibleLoop = {
  /** True while frames are being delivered: the host is connected, on screen and in a visible tab. */
  readonly running: boolean
  /** Ends the loop for good and releases the observer and the listeners. Safe to call twice. */
  stop(): void
}

/**
 * Calls `step(dt)` once per animation frame, with the seconds since the last
 * frame, while the host is connected, on screen and in a visible tab. The
 * first frame after a pause reports no time, so nothing jumps.
 *
 * The loop waits while the host is off screen, removed from the document or
 * in a hidden tab, and goes on by itself when that ends, until `stop()` is
 * called. Create it when the run starts and stop it when the run pauses.
 *
 * Three signals are combined: an `IntersectionObserver` on the host (which
 * also reports that it was removed or inserted), the host's
 * `contentvisibilityautostatechange` event (fired only if the widget's own CSS
 * sets `content-visibility: auto`) and the page visibility state. A host with
 * `display: contents` has no box to observe and counts as on screen.
 */
export function whileVisible(host: HTMLElement, step: (dt: number) => unknown, options: VisibleOptions = {}): VisibleLoop {
  const maxDelta = options.maxDelta ?? 0.1
  const scope = new AbortController()
  const view = host.ownerDocument.defaultView
  let onScreen = false
  let skipped = false
  let frame = 0
  let last: number | undefined

  const tick = (now: number) => {
    frame = 0
    // The observer reports the removal a frame late; it also restarts the loop after a reconnect.
    if(!host.isConnected) return
    const dt = last === undefined ? 0 : Math.min((now - last) / 1000, maxDelta)
    last = now
    frame = requestAnimationFrame(tick) // before step(), so that step() may stop the loop
    if(dt > 0) step(dt)
  }

  const update = () => {
    const shown = onScreen || (host.isConnected && view?.getComputedStyle(host).display === "contents")
    const visible = !scope.signal.aborted && shown && !skipped && host.isConnected && host.ownerDocument.visibilityState === "visible"
    if(visible && !frame) {
      last = undefined // the clock starts again, so the time away is not counted
      frame = requestAnimationFrame(tick)
    } else if(!visible && frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }

  const observer = new IntersectionObserver(entries => {
    onScreen = entries[entries.length - 1].isIntersecting
    update()
  })
  observer.observe(host)
  host.addEventListener(
    "contentvisibilityautostatechange",
    event => {
      skipped = (event as ContentVisibilityAutoStateChangeEvent).skipped
      update()
    },
    {signal: scope.signal},
  )
  host.ownerDocument.addEventListener("visibilitychange", update, {signal: scope.signal})

  return {
    get running() {
      return frame !== 0
    },
    stop() {
      observer.disconnect()
      scope.abort()
      update()
    },
  }
}
