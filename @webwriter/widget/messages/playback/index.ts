import {defineMessages} from "../../messages.js"
import catalogs from "./catalogs.js"

/** The names of the controls. */
export type PlaybackMessages = {
  play: string
  pause: string
  step: string
  back: string
  reset: string
  /** The name of the scrubber. */
  seek: string
  /** The name of the speed button. It receives the current speed, and the speed as text in the widget's language. */
  rate: (rate: number, shown: string) => string
}

/** The messages of Playback with their catalogs. */
export const playbackMessages = defineMessages<PlaybackMessages>(
  {
    play: "Play",
    pause: "Pause",
    step: "Step forward",
    back: "Step back",
    reset: "Reset",
    seek: "Position",
    rate: (_rate, shown) => `Speed: ${shown}×`,
  },
  catalogs,
)
