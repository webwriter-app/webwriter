import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Lecture",
  pause: "Pause",
  step: "Étape suivante",
  back: "Étape précédente",
  reset: "Réinitialiser",
  seek: "Position",
  rate: (_rate, shown) => `Vitesse\u00a0: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
