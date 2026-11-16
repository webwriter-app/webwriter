import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Chwarae",
  pause: "Oedi",
  step: "Cam ymlaen",
  back: "Cam yn ôl",
  reset: "Ailosod",
  seek: "Safle",
  rate: (_rate, shown) => `Cyflymder: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
