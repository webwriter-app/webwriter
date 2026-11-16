import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Odtwórz",
  pause: "Wstrzymaj",
  step: "Krok naprzód",
  back: "Krok wstecz",
  reset: "Resetuj",
  seek: "Pozycja",
  rate: (_rate, shown) => `Prędkość: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
