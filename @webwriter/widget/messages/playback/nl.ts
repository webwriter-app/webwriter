import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Afspelen",
  pause: "Pauzeren",
  step: "Eén stap vooruit",
  back: "Eén stap terug",
  reset: "Opnieuw instellen",
  seek: "Positie",
  rate: (_rate, shown) => `Snelheid: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
