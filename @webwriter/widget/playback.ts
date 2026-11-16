import {ModuleCore, type CoreOptions} from "./base.js"
import {Messages, type MessagesOption} from "./messages.js"
import {playbackMessages, type PlaybackMessages} from "./messages/playback/index.js"
import {isEditing} from "./permissions.js"
import {adoptStyles} from "./styles.js"
import {whileVisible, type VisibleLoop} from "./visible.js"

export {playbackMessages, type PlaybackMessages} from "./messages/playback/index.js"

/** What a marked control or `run()` can ask for. */
export type PlaybackCommand = "toggle" | "play" | "pause" | "step" | "back" | "reset" | "rate" | "seek"

/** Options of `PlaybackCore`. Give `step`, or `steps`, or `play` and `pause`, or `media`. */
export type PlaybackOptions = CoreOptions & {
  /** A continuous run: advance the simulation by `dt` seconds of simulated time. */
  step?: (dt: number) => void
  /** A discrete run: how many steps there are. Enables `back` and `seek`. */
  steps?: () => number
  /** A discrete run: display the step with this index. A template can read `currentStep` instead. */
  show?: (index: number) => void
  /** Seconds per step: the length of a discrete step (default 1), the fixed timestep of a continuous run, or what `step` and `back` move a media element by (default 1). */
  interval?: number | (() => number)
  /** The speeds the `rate` button cycles through. Default `[0.5, 1, 2, 4]`. */
  rates?: readonly number[]
  /** Return the widget to its initial state. Default: go to step 0. */
  reset?: () => void
  /** For a run that lives elsewhere, such as a worker: called when it should start. If it throws, the run stays paused. */
  play?: () => void
  /** For a run that lives elsewhere: called when it should stop. */
  pause?: () => void
  /** A `<video>` or `<audio>` element of the template to control instead. Asked after every render. */
  media?: () => HTMLMediaElement | null | undefined
  /** Called once per animation frame after the run advanced, and after a step or a reset: paint the canvas here. */
  draw?: () => void
  /**
   * Start when the widget is first shown, unless it is being edited. With
   * `true` the run also stays paused for a reader who prefers reduced
   * motion; `"always"` starts for them too, for a run that is the content.
   */
  autoplay?: boolean | "always"
  /** Asked before a command from a marked control or `run()`. Return false to refuse. */
  can?: (command: PlaybackCommand) => boolean
  /** Other names for the controls. */
  messages?: MessagesOption<PlaybackMessages>
}

/** The state of `PlaybackCore`, as of its last change. */
export type PlaybackSnapshot = {
  readonly paused: boolean
  readonly ended: boolean
  readonly playbackRate: number
  /** The index of a discrete run. */
  readonly step: number
  readonly steps: number
  /** The time at the last state change. Read `currentTime` on the core for the running value. */
  readonly currentTime: number
  readonly duration: number
}

const icons: Readonly<Record<string, string>> = {
  play: "M4 2l10 6-10 6z",
  pause: "M3 2h4v12H3zM9 2h4v12H9z",
  step: "M3 2l8 6-8 6zM12 2h2v12h-2z",
  back: "M13 2L5 8l8 6zM2 2h2v12H2z",
  reset: "M8 3V0L3.5 3.5 8 7V4.5A3.5 3.5 0 1 1 4.5 8H3a5 5 0 1 0 5-5z",
}

const styles = `
[data-ww-icon] { width: 1em; height: 1em; fill: currentColor; vertical-align: -0.125em; pointer-events: none; }
[data-ww-playback][aria-disabled="true"] { opacity: 0.5; cursor: default; }
`

const buttons: readonly PlaybackCommand[] = ["toggle", "play", "pause", "step", "back", "reset", "rate"]
const EPSILON = 1e-9

// ── Numbers and times in the widget's language ────────────────────────────

type Numerals = {separator: string; plain: Intl.NumberFormat; padded: Intl.NumberFormat}
type DurationFormat = new (
  locale: string,
  options: {style: "digital"},
) => {formatToParts(duration: {hours: number; minutes: number; seconds: number}): {type: string; value: string}[]}

const numerals = new Map<string, Numerals>()

function numeralsOf(language: string): Numerals {
  let known = numerals.get(language)
  if(!known) {
    let locale = language || "en"
    try {
      Intl.getCanonicalLocales(locale)
    } catch {
      locale = "en" // not a language tag
    }
    // The separator of a clock differs by language ("1.05" in Finnish). Where the browser cannot say, it is a colon.
    const Duration = (Intl as {DurationFormat?: DurationFormat}).DurationFormat
    const parts = Duration ? new Duration(locale, {style: "digital"}).formatToParts({hours: 1, minutes: 1, seconds: 1}) : []
    known = {
      separator: parts.find(part => part.type === "literal")?.value ?? ":",
      plain: new Intl.NumberFormat(locale, {useGrouping: false, maximumFractionDigits: 2}),
      padded: new Intl.NumberFormat(locale, {useGrouping: false, minimumIntegerDigits: 2, maximumFractionDigits: 0}),
    }
    numerals.set(language, known)
  }
  return known
}

/**
 * Seconds as a clock in a language: `m:ss`, or `h:mm:ss` with `hours`. The
 * digits and the separator are those of the language (`Intl`). Pass `hours`
 * for every time that is shown next to one of an hour or more.
 */
export function formatTime(seconds: number, hours = seconds >= 3600, language = "en"): string {
  const {separator, plain, padded} = numeralsOf(language)
  // A sum of timesteps may end a hair below the whole second it stands for.
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds + EPSILON)) : 0
  const minutes = Math.floor(total / 60)
  const tail = `${separator}${padded.format(total % 60)}`
  return hours ? `${plain.format(Math.floor(minutes / 60))}${separator}${padded.format(minutes % 60)}${tail}` : `${plain.format(minutes)}${tail}`
}

/**
 * The run state and the loop of a widget that plays over time, with the
 * interface of a media element. Configure it with `step` (continuous), with
 * `steps` and `show` (discrete), with `play` and `pause` (a run elsewhere), or
 * give it a `<video>` or `<audio>` element.
 *
 * In the shadow template, `data-ww-playback="toggle|play|pause|step|back|reset|rate"`
 * marks a button, `"seek"` a range input and `"time"` an `<output>`.
 * `ww-playbackchange` on the host reports state changes.
 */
export class PlaybackCore extends ModuleCore<PlaybackSnapshot> {
  #options: PlaybackOptions
  #messages: Messages<PlaybackMessages>
  #media: HTMLMediaElement | null = null
  #mediaScope: AbortController | null = null
  #loop: VisibleLoop | null = null
  #paused = true
  #rate = 1
  #index = 0
  /** Simulated time that has passed but was not yet turned into a step. */
  #pending = 0
  /** Simulated time of a continuous run. */
  #time = 0
  /** Whether autoplay was decided. It is decided once, when the widget is first shown. */
  #autoplayed = false
  /** Waits for the widget to be shown before a media element or a run elsewhere starts by itself. */
  #shown: IntersectionObserver | null = null
  #snapshot: PlaybackSnapshot = {paused: true, ended: false, playbackRate: 1, step: 0, steps: 0, currentTime: 0, duration: 0}

  /** Takes the options, or a media element in their place. */
  constructor(host: HTMLElement, options: PlaybackOptions | HTMLMediaElement = {}) {
    const given = options instanceof HTMLMediaElement ? {media: () => options} : options
    super(host, given)
    this.#options = given
    this.#messages = new Messages(host, playbackMessages, given.messages)
  }

  // ── The media interface ───────────────────────────────────────────────

  /** As on a media element. */
  get paused(): boolean {
    return this.#media ? this.#media.paused : this.#paused
  }

  /** A discrete run ends on its last step. A continuous run never ends. */
  get ended(): boolean {
    if(this.#media) return this.#media.ended
    return this.#discrete && this.steps > 0 && this.#index >= this.steps - 1
  }

  /** The speed: simulated seconds per second. */
  get playbackRate(): number {
    return this.#media ? this.#media.playbackRate : this.#rate
  }

  set playbackRate(rate: number) {
    if(!(rate > 0)) return
    if(this.#media) this.#media.playbackRate = rate
    else this.#rate = rate
    this.#changed()
  }

  /** Seconds: the position of the media, the step index times the interval, or the simulated time since the last reset. */
  get currentTime(): number {
    if(this.#media) return this.#media.currentTime
    return this.#discrete ? this.#index * this.interval : this.#time
  }

  /** Seeks a discrete run or the media. A continuous run cannot be sought. */
  set currentTime(seconds: number) {
    if(this.#media) this.#media.currentTime = seconds
    else if(this.#discrete) this.#goTo(Math.round(seconds / this.interval))
    this.#changed(true)
  }

  /** Seconds. Infinite for a continuous run, as for a live stream. */
  get duration(): number {
    if(this.#media) return this.#media.duration
    return this.#discrete ? Math.max(0, this.steps - 1) * this.interval : Infinity
  }

  /**
   * Starts the run. As on a media element, the promise rejects if the run
   * could not start: the browser refused to play the media, or the `play`
   * callback threw. The state then stays paused.
   */
  play(): Promise<void> {
    this.#settleAutoplay()
    if(this.#media) return this.#media.play()
    if(!this.#paused) return Promise.resolve()
    try {
      this.#options.play?.()
    } catch(error) {
      return Promise.reject(error)
    }
    if(this.ended) this.#goTo(0)
    this.#paused = false
    this.#pending = 0
    this.#startLoop()
    this.#changed()
    return Promise.resolve()
  }

  /** Stops the run where it is. */
  pause(): void {
    this.#settleAutoplay()
    if(this.#halt()) this.#changed()
  }

  // ── Beyond a media element ────────────────────────────────────────────

  /** The index of the current step of a discrete run. */
  get currentStep(): number {
    return this.#index
  }

  /** The number of steps of a discrete run, otherwise 0. */
  get steps(): number {
    return Math.max(0, Math.floor(this.#options.steps?.() ?? 0))
  }

  /** Seconds per step. A discrete run and a media element without one take a second; a continuous run without one steps every frame (0). */
  get interval(): number {
    const {interval} = this.#options
    const seconds = typeof interval === "function" ? interval() : interval
    return seconds && seconds > 0 ? seconds : this.#discrete || this.#media ? 1 : 0
  }

  /** The speeds a reader can choose. */
  get rates(): readonly number[] {
    return this.#options.rates ?? [0.5, 1, 2, 4]
  }

  /** Whether the run can go backwards and be sought: a discrete run, or media of a known length. */
  get seekable(): boolean {
    return this.#discrete || (!!this.#media && Number.isFinite(this.#media.duration))
  }

  /** Whether the run can advance by single steps: not a run that lives elsewhere. */
  get steppable(): boolean {
    return !!this.#media || this.#discrete || !!this.#options.step
  }

  /** Plays if paused, pauses if playing. At the end of a discrete run it starts over. */
  toggle(): void {
    // A media element may refuse to play, for example without a user gesture. It then stays paused.
    if(this.paused) this.play().catch(() => {})
    else this.pause()
  }

  /** One step forward, paused. A continuous run advances by one timestep (1/60 s without an interval), media by the interval. */
  step(): void {
    this.#settleAutoplay()
    if(!this.steppable) return
    this.#halt()
    if(this.#media) this.#media.currentTime = Math.min(this.#media.currentTime + this.interval, this.#media.duration || Infinity)
    else if(this.#discrete) this.#goTo(this.#index + 1)
    else if(this.#options.step) {
      const dt = this.interval || 1 / 60
      this.#options.step(dt)
      this.#time += dt
    }
    this.#options.draw?.()
    this.#changed(true)
  }

  /** One step back, paused. Does nothing in a continuous run. */
  back(): void {
    this.#settleAutoplay()
    if(!this.seekable) return
    this.#halt()
    if(this.#media) this.#media.currentTime = Math.max(0, this.#media.currentTime - this.interval)
    else this.#goTo(this.#index - 1)
    this.#changed(true)
  }

  /** Jumps to a step index of a discrete run, or to a time in seconds of the media. */
  seek(position: number): void {
    if(!this.seekable || !Number.isFinite(position)) return
    if(this.#media) this.#media.currentTime = position
    else this.#goTo(Math.round(position))
    this.#changed(true)
  }

  /** Pauses and returns to the start: the `reset` callback, then step 0 and time 0. */
  reset(): void {
    this.#settleAutoplay()
    this.#halt()
    this.#options.reset?.()
    this.#pending = this.#time = 0
    if(this.#media) this.#media.currentTime = 0
    this.#index = 0
    if(this.#discrete) this.#options.show?.(0)
    this.#options.draw?.()
    this.#changed(true)
  }

  /** The next speed in `rates`, starting over after the last. */
  nextRate(): void {
    const {rates} = this
    if(rates.length) this.playbackRate = rates[(rates.indexOf(this.playbackRate) + 1) % rates.length]
  }

  /** A command as a marked control gives it: refused while `can(command)` is false. Returns whether it ran. */
  run(command: PlaybackCommand, position?: number): boolean {
    if(this.#options.can?.(command) === false) return false
    if(command === "rate") this.nextRate()
    else if(command === "seek") this.seek(position ?? 0)
    else if(command === "play") this.play().catch(() => {})
    else this[command]()
    return true
  }

  /**
   * Advances the run by `dt` seconds of real time, as the loop does on every
   * frame. With an interval, whole steps of exactly that length are taken
   * and the rest is kept for the next frame.
   */
  advance(dt: number): void {
    const elapsed = dt * this.#rate
    const every = this.interval
    if(this.#discrete) {
      const last = this.steps - 1
      this.#pending += elapsed
      const due = Math.floor((this.#pending + EPSILON) / every)
      this.#pending -= due * every
      if(due > 0) this.#goTo(this.#index + due)
      const stopped = this.#index >= last && this.#halt()
      if(due === 0 && !stopped) return
      this.#changed()
    } else if(this.#options.step) {
      if(every) {
        this.#pending += elapsed
        const running = !this.#paused
        for(; this.#pending + EPSILON >= every; this.#pending -= every) {
          this.#options.step(every)
          this.#time += every
          // The step may pause the run. The steps still due are then dropped.
          if(running && this.#paused) { this.#pending = 0; break }
        }
      } else {
        this.#options.step(elapsed)
        this.#time += elapsed
      }
    }
    this.#options.draw?.()
    this.#showTime()
  }

  getSnapshot(): PlaybackSnapshot {
    return this.#snapshot
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  protected onConnect() {
    const {root} = this
    this.cleanup(adoptStyles(root, styles))
    // The names of the controls are written again in the new language.
    this.cleanup(this.#messages.follow(() => this.refresh()))
    this.listen(root, "click", event => {
      const control = (event.target as Element).closest?.<HTMLElement>("[data-ww-playback]")
      const command = control?.dataset.wwPlayback as PlaybackCommand
      if(control && buttons.includes(command) && control.getAttribute("aria-disabled") !== "true") this.run(command)
    })
    this.listen(root, "input", event => {
      const control = event.target as HTMLInputElement
      if(control.dataset?.wwPlayback !== "seek") return
      // A refused position is taken back at once.
      if(!this.run("seek", control.valueAsNumber)) this.#showTime()
    })
    this.cleanup(() => {
      this.#stopLoop()
      this.#attach(null)
      this.#shown?.disconnect()
      this.#shown = null
    })
    this.#snapshot = this.#read()
    // A run that was playing when the widget was moved continues where it was.
    if(!this.#paused) this.#startLoop()
    if(this.#options.autoplay && !this.#autoplayed) this.#autoplay()
  }

  protected onRefresh() {
    this.#attach(this.#options.media?.() ?? null)
    if(this.#discrete && this.#index > Math.max(0, this.steps - 1)) this.#goTo(this.steps - 1)
    this.#changed()
  }

  // ── Internals ─────────────────────────────────────────────────────────

  get #discrete(): boolean {
    return !!this.#options.steps
  }

  /**
   * A run the module drives starts at once: its loop waits by itself until
   * the widget is on screen. A media element and a run that lives elsewhere
   * do not wait, so they are started when the widget is first shown.
   */
  #autoplay() {
    const start = () => {
      this.#autoplayed = true
      const reduced = this.#options.autoplay !== "always" && matchMedia("(prefers-reduced-motion: reduce)").matches
      if(reduced || isEditing(this.host)) return
      this.#attach(this.#options.media?.() ?? null)
      // The browser may refuse media that plays by itself. It then stays paused.
      this.play().catch(() => {})
    }
    if(this.#discrete || this.#options.step) return start()
    this.#shown = new IntersectionObserver(entries => {
      if(!entries.some(entry => entry.isIntersecting)) return
      this.#shown?.disconnect()
      this.#shown = null
      start()
    })
    this.#shown.observe(this.host)
  }

  /** A command came first: the run no longer starts by itself. */
  #settleAutoplay() {
    if(!this.#shown) return
    this.#shown.disconnect()
    this.#shown = null
    this.#autoplayed = true
  }

  /** Stops the run without publishing. Returns whether it was running. */
  #halt(): boolean {
    if(this.#media) {
      this.#media.pause()
      return false // the element reports it with its own event
    }
    if(this.#paused) return false
    this.#paused = true
    this.#stopLoop()
    this.#options.pause?.()
    return true
  }

  #goTo(index: number) {
    const next = Math.min(Math.max(0, index), Math.max(0, this.steps - 1))
    if(next === this.#index) return
    this.#index = next
    this.#options.show?.(next)
  }

  #startLoop() {
    const looping = this.#discrete || !!this.#options.step
    if(looping && this.connected) this.#loop ??= whileVisible(this.host, dt => this.advance(dt))
  }

  #stopLoop() {
    this.#loop?.stop()
    this.#loop = null
  }

  #attach(media: HTMLMediaElement | null) {
    if(media === this.#media) return
    this.#mediaScope?.abort()
    this.#media = media
    this.#mediaScope = media ? new AbortController() : null
    if(!media) return
    const signal = this.#mediaScope!.signal
    for(const type of ["play", "pause", "ended", "ratechange", "durationchange", "emptied"]) {
      media.addEventListener(type, () => this.#changed(), {signal})
    }
    media.addEventListener("seeked", () => this.#changed(true), {signal})
    media.addEventListener("timeupdate", () => this.#showTime(), {signal})
  }

  #read(): PlaybackSnapshot {
    const {paused, ended, playbackRate, currentTime, duration, steps} = this
    return {paused, ended, playbackRate, step: this.#index, steps, currentTime, duration}
  }

  /**
   * Publishes the state if it changed and brings the marked controls up to
   * date. Time that only passed while playing is no change of state, unless
   * `moved` says that the position was set.
   */
  #changed(moved = false) {
    const next = this.#read()
    const keys = (Object.keys(next) as (keyof PlaybackSnapshot)[]).filter(key => key !== "currentTime" || moved || next.paused)
    const same = keys.every(key => Object.is(next[key], this.#snapshot[key]))
    if(!same) this.#snapshot = next
    if(this.connected) this.#showControls()
    if(same) return
    this.notify()
    this.host.dispatchEvent(new CustomEvent("ww-playbackchange", {detail: next, bubbles: true, composed: true}))
  }

  #timeText(): string {
    const language = this.#messages.language
    if(this.#discrete) {
      const {plain} = numeralsOf(language)
      return `${plain.format(this.steps ? this.#index + 1 : 0)} / ${plain.format(this.steps)}`
    }
    const {currentTime, duration} = this
    // Both times take the form of the longer one.
    const hours = (Number.isFinite(duration) ? duration : currentTime) >= 3600
    const now = formatTime(currentTime, hours, language)
    return Number.isFinite(duration) ? `${now} / ${formatTime(duration, hours, language)}` : now
  }

  /** The parts that change on every frame. */
  #showTime() {
    if(!this.connected) return
    const text = this.#timeText()
    for(const output of this.root.querySelectorAll('[data-ww-playback="time"]')) {
      if(output.textContent !== text) output.textContent = text
    }
    const position = String(this.#discrete ? this.#index : this.currentTime)
    for(const range of this.root.querySelectorAll<HTMLInputElement>('[data-ww-playback="seek"]')) {
      if(range.value !== position) range.value = position
      if(range.getAttribute("aria-valuetext") !== text) range.setAttribute("aria-valuetext", text)
    }
  }

  /** Icon, accessible name and availability of every marked control. */
  #showControls() {
    const messages = this.#messages.current
    const {paused, ended, seekable} = this
    const atStart = this.#discrete ? this.#index === 0 : this.currentTime === 0
    const speed = numeralsOf(this.#messages.language).plain.format(this.playbackRate)
    for(const control of this.root.querySelectorAll<HTMLElement>("[data-ww-playback]")) {
      const command = control.dataset.wwPlayback as PlaybackCommand | "time"
      if(command === "time") continue
      const allowed = this.#options.can?.(command) !== false
      if(command === "seek") {
        const range = control as HTMLInputElement
        const max = this.#discrete ? Math.max(0, this.steps - 1) : seekable ? this.duration : 0
        for(const [name, value] of [
          ["min", "0"],
          ["max", String(max)],
          ["step", this.#discrete ? "1" : "any"],
        ]) {
          if(range.getAttribute(name) !== value) range.setAttribute(name, value)
        }
        range.disabled = !allowed || !seekable
        if(!range.labels?.length && !range.hasAttribute("aria-labelledby") && range.getAttribute("aria-label") !== messages.seek) range.setAttribute("aria-label", messages.seek)
        continue
      }
      const icon = command === "toggle" ? (paused ? "play" : "pause") : command
      const name = command === "rate" ? messages.rate(this.playbackRate, speed) : messages[icon as "play"]
      const off =
        !allowed ||
        (command === "play" && !paused) ||
        (command === "pause" && paused) ||
        (command === "step" && (ended || !this.steppable)) ||
        (command === "back" && (!seekable || atStart)) ||
        (command === "rate" && this.rates.length < 2)
      setIcon(control, icon, command === "rate" ? `${speed}×` : null)
      if(control.getAttribute("aria-label") !== name) control.setAttribute("aria-label", name)
      if(control.title !== name) control.title = name
      // Not the `disabled` attribute: a focused button would lose the focus, and with it the widget its keys.
      if(off) control.setAttribute("aria-disabled", "true")
      else control.removeAttribute("aria-disabled")
    }
    this.#showTime()
  }
}

/** Puts the module's icon (or the speed as text) into a control that has no content of its own. */
function setIcon(control: HTMLElement, icon: string, text: string | null) {
  let mark = control.querySelector(":scope > [data-ww-icon]")
  if(!mark && control.childNodes.length) return
  if(mark?.getAttribute("data-ww-icon") !== icon) {
    const document = control.ownerDocument
    const next = text === null ? document.createElementNS("http://www.w3.org/2000/svg", "svg") : document.createElement("span")
    next.setAttribute("data-ww-icon", icon)
    next.setAttribute("aria-hidden", "true")
    if(text === null) {
      next.setAttribute("viewBox", "0 0 16 16")
      next.append(document.createElementNS("http://www.w3.org/2000/svg", "path"))
      next.firstElementChild!.setAttribute("d", icons[icon])
    }
    control.replaceChildren(next)
    mark = next
  }
  if(text !== null && mark.textContent !== text) mark.textContent = text
}
