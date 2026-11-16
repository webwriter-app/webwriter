import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Spel av",
  pause: "Pause",
  step: "Eitt steg fram",
  back: "Eitt steg tilbake",
  reset: "Tilbakestill",
  seek: "Posisjon",
  rate: (_rate, shown) => `Fart: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
