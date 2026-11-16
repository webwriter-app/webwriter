import type {PlaybackCommand, PlaybackCore, PlaybackOptions} from "@webwriter/widget/playback"
import type {BindingOptions} from "./base.js"

export type {PlaybackCommand, PlaybackMessages, PlaybackSnapshot} from "@webwriter/widget/playback"

export type UsePlayback = {
  readonly core: PlaybackCore
  readonly paused: boolean
  readonly ended: boolean
  readonly steps: number
  /** The index of the current step of a discrete run. */
  readonly currentStep: number
  /** Seconds. Infinite for a continuous run. */
  readonly duration: number
  playbackRate: number
  /** The running value: reading it in a render does not subscribe, time that passes does not render. */
  currentTime: number
  play(): Promise<void>
  pause(): void
  toggle(): void
  step(): void
  back(): void
  seek(position: number): void
  reset(): void
  run(command: PlaybackCommand, position?: number): boolean
}

/** Playback. Mark the buttons `data-ww-playback` and leave them empty: the module fills them. */
export function usePlayback(options?: BindingOptions<PlaybackOptions>): UsePlayback
