import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Αναπαραγωγή",
  pause: "Παύση",
  step: "Ένα βήμα μπροστά",
  back: "Ένα βήμα πίσω",
  reset: "Επαναφορά",
  seek: "Θέση",
  rate: (_rate, shown) => `Ταχύτητα: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
