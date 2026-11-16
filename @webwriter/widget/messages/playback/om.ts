import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Taphisi",
  pause: "Dhaabi",
  step: "Tarkaanfii tokko gara fuulduraa",
  back: "Tarkaanfii tokko duubatti",
  reset: "Deebisii qopheessi",
  seek: "Iddoo",
  rate: (_rate, shown) => `Saffisa: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
