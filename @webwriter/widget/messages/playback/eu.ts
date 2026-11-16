import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Erreproduzitu",
  pause: "Pausatu",
  step: "Urrats bat aurrera",
  back: "Urrats bat atzera",
  reset: "Berrezarri",
  seek: "Posizioa",
  rate: (_rate, shown) => `Abiadura: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
