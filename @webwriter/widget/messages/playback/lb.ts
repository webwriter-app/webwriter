import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Ofspillen",
  pause: "Paus",
  step: "Ee Schrëtt vir",
  back: "Ee Schrëtt zréck",
  reset: "Zrécksetzen",
  seek: "Positioun",
  rate: (_rate, shown) => `Geschwindegkeet: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
