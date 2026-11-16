import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Prehrať",
  pause: "Pozastaviť",
  step: "Krok vpred",
  back: "Krok späť",
  reset: "Obnoviť",
  seek: "Pozícia",
  rate: (_rate, shown) => `Rýchlosť: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
