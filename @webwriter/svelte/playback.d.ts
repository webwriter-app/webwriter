import type {PlaybackCore, PlaybackOptions} from "@webwriter/widget/playback"
import type {CoreStore} from "./base.js"

export type {PlaybackCommand, PlaybackMessages, PlaybackOptions, PlaybackSnapshot} from "@webwriter/widget/playback"

export type PlaybackStore = CoreStore<PlaybackCore> &
  Pick<PlaybackCore, "play" | "pause" | "toggle" | "step" | "back" | "seek" | "reset" | "run"> & {
    /** As on a media element, read from the core when asked. */
    readonly paused: boolean
    /** True on the last step of a discrete run and at the end of the media. Never for a continuous run. */
    readonly ended: boolean
    /** The speed: simulated seconds per second. */
    playbackRate: number
    /** Seconds: the position of the media, the step index times the interval, or the simulated time since the last reset. */
    currentTime: number
    /** Seconds. Infinite for a continuous run. */
    readonly duration: number
    /** The index of the current step of a discrete run. */
    readonly currentStep: number
    /** The number of steps of a discrete run, otherwise 0. */
    readonly steps: number
  }

export function playbackStore(host: HTMLElement, options?: PlaybackOptions): PlaybackStore
