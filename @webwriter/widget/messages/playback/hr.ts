import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Pokreni",
  pause: "Pauziraj",
  step: "Korak naprijed",
  back: "Korak natrag",
  reset: "Vrati",
  seek: "Položaj",
  rate: (_rate, shown) => `Brzina: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
