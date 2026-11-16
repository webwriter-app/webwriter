import {PlaybackCore, type PlaybackCommand, type PlaybackOptions} from "@webwriter/widget/playback"
import {CoreController, type BindingOptions, type CoreHost} from "./base.js"

export type {PlaybackCommand, PlaybackMessages, PlaybackSnapshot} from "@webwriter/widget/playback"

/**
 * Lit binding of Playback. The buttons are marked in the template with
 * `data-ww-playback`; the host re-renders when the run state changes, so
 * `render()` can read `paused`, `ended` and `currentStep`. Time that passes
 * while playing does not re-render: the module updates the time output and
 * the scrubber itself.
 */
export class Playback extends CoreController<PlaybackCore> {
  constructor(host: CoreHost, options: BindingOptions<PlaybackOptions> = {}) {
    super(host, root => new PlaybackCore(host, {...options, root}))
  }

  /** As on a media element. */
  get paused(): boolean {
    return this.core.paused
  }
  /** True on the last step of a discrete run and at the end of the media. Never for a continuous run. */
  get ended(): boolean {
    return this.core.ended
  }
  /** The speed: simulated seconds per second. */
  get playbackRate(): number {
    return this.core.playbackRate
  }
  set playbackRate(rate: number) {
    this.core.playbackRate = rate
  }
  /** Seconds: the position of the media, the step index times the interval, or the simulated time since the last reset. */
  get currentTime(): number {
    return this.core.currentTime
  }
  set currentTime(seconds: number) {
    this.core.currentTime = seconds
  }
  /** Seconds. Infinite for a continuous run. */
  get duration(): number {
    return this.core.duration
  }
  /** The index of the current step of a discrete run. */
  get currentStep(): number {
    return this.core.currentStep
  }
  /** The number of steps of a discrete run, otherwise 0. */
  get steps(): number {
    return this.core.steps
  }

  /** Starts the run. The promise rejects if it could not start; the state then stays paused. */
  play(): Promise<void> {
    return this.core.play()
  }
  /** Stops the run where it is. */
  pause(): void {
    this.core.pause()
  }
  /** Plays if paused, pauses if playing. */
  toggle(): void {
    this.core.toggle()
  }
  /** One step forward, paused. */
  step(): void {
    this.core.step()
  }
  /** One step back, paused. */
  back(): void {
    this.core.back()
  }
  /** Jumps to a step index of a discrete run, or to a time in seconds of the media. */
  seek(position: number): void {
    this.core.seek(position)
  }
  /** Pauses and returns to the start. */
  reset(): void {
    this.core.reset()
  }
  /** A command as a marked button gives it: refused while `can(command)` is false. */
  run(command: PlaybackCommand, position?: number): boolean {
    return this.core.run(command, position)
  }
}
