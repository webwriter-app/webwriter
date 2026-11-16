import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Spela upp",
  pause: "Pausa",
  step: "Ett steg framåt",
  back: "Ett steg bakåt",
  reset: "Återställ",
  seek: "Position",
  rate: (_rate, shown) => `Hastighet: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
