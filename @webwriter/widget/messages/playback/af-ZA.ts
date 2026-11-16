import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Speel",
  pause: "Onderbreek",
  step: "Een stap vorentoe",
  back: "Een stap terug",
  reset: "Stel terug",
  seek: "Posisie",
  rate: (_rate, shown) => `Spoed: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
