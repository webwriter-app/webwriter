import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Afspil",
  pause: "Pause",
  step: "Ét trin frem",
  back: "Ét trin tilbage",
  reset: "Nulstil",
  seek: "Position",
  rate: (_rate, shown) => `Hastighed: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
