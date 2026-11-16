import type {PlaybackCommand, PlaybackOptions} from "@webwriter/widget/playback"
import type {BindingOptions} from "./base.js"

export type {PlaybackCommand, PlaybackMessages, PlaybackSnapshot} from "@webwriter/widget/playback"

/**
 * React binding of Playback: buttons marked `data-ww-playback="play"` and so
 * on. The component renders when the run state changes, not while time passes.
 */
export function usePlayback(host: HTMLElement, options?: BindingOptions<PlaybackOptions>): {
  readonly paused: boolean
  /** True on the last step of a discrete run and at the end of the media. */
  readonly ended: boolean
  readonly playbackRate: number
  /** Seconds, read when the component rendered. */
  readonly currentTime: number
  readonly duration: number
  /** The index of the current step of a discrete run. */
  readonly currentStep: number
  /** The number of steps of a discrete run, otherwise 0. */
  readonly steps: number
  play(): Promise<void>
  pause(): void
  toggle(): void
  /** One step forward, paused. */
  step(): void
  back(): void
  /** Jumps to a step index of a discrete run, or to a time in seconds of the media. */
  seek(position: number): void
  reset(): void
  /** A command as a marked button gives it: refused while `can(command)` is false. */
  run(command: PlaybackCommand, position?: number): boolean
  setPlaybackRate(rate: number): void
  setCurrentTime(seconds: number): void
}
