import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Predvajaj",
  pause: "Premor",
  step: "Korak naprej",
  back: "Korak nazaj",
  reset: "Ponastavi",
  seek: "Položaj",
  rate: (_rate, shown) => `Hitrost: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
