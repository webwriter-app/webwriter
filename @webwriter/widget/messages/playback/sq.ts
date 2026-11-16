import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Luaj",
  pause: "Pusho",
  step: "Hap përpara",
  back: "Hap prapa",
  reset: "Rivendos",
  seek: "Pozicioni",
  rate: (_rate, shown) => `Shpejtësia: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
