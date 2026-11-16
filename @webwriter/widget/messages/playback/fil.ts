import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "I-play",
  pause: "I-pause",
  step: "Isang hakbang pasulong",
  back: "Isang hakbang pabalik",
  reset: "I-reset",
  seek: "Posisyon",
  rate: (_rate, shown) => `Bilis: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
