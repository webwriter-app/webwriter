import type {Signal} from "@angular/core"
import type {PlaybackCommand, PlaybackCore, PlaybackOptions} from "@webwriter/widget/playback"
import type {BindingOptions, ModuleRef} from "./base.js"

export type {PlaybackCommand, PlaybackMessages, PlaybackSnapshot} from "@webwriter/widget/playback"

export type PlaybackBinding = {
  readonly core: PlaybackCore
  readonly snapshot: ModuleRef<PlaybackCore>
  readonly paused: Signal<boolean>
  /** True on the last step of a discrete run and at the end of the media. */
  readonly ended: Signal<boolean>
  /** Simulated seconds per second. */
  readonly playbackRate: Signal<number>
  /** The index of the current step of a discrete run. */
  readonly currentStep: Signal<number>
  /** The number of steps of a discrete run, otherwise 0. */
  readonly steps: Signal<number>
  readonly duration: Signal<number>
  /** The running time in seconds. Not a signal: time that passes while playing does not render. */
  currentTime(): number
  setPlaybackRate(rate: number): void
  /** Jumps to a time in seconds. */
  seekTime(seconds: number): void
  play(): Promise<void>
  pause(): void
  toggle(): void
  step(): void
  back(): void
  seek(position: number): void
  reset(): void
  run(command: PlaybackCommand, position?: number): boolean
}

/** Binds Playback. Mark the buttons `data-ww-playback`. */
export function injectPlayback(options?: BindingOptions<PlaybackOptions>): PlaybackBinding
