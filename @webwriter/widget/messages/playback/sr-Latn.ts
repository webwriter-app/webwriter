import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Pusti",
  pause: "Pauziraj",
  step: "Korak napred",
  back: "Korak nazad",
  reset: "Vrati",
  seek: "Pozicija",
  rate: (_rate, shown) => `Brzina: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
