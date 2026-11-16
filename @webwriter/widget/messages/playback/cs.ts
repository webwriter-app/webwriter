import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Přehrát",
  pause: "Pozastavit",
  step: "Krok vpřed",
  back: "Krok zpět",
  reset: "Obnovit",
  seek: "Pozice",
  rate: (_rate, shown) => `Rychlost: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
