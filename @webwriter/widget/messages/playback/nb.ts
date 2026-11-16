import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Spill av",
  pause: "Pause",
  step: "Ett steg frem",
  back: "Ett steg tilbake",
  reset: "Tilbakestill",
  seek: "Posisjon",
  rate: (_rate, shown) => `Hastighet: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
