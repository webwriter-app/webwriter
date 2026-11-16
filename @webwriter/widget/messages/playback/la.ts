import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Lude",
  pause: "Siste",
  step: "Unum gradum ante",
  back: "Unum gradum retro",
  reset: "Restituere",
  seek: "Locus",
  rate: (_rate, shown) => `Celeritas: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
