import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Riproduci",
  pause: "Pausa",
  step: "Passo avanti",
  back: "Passo indietro",
  reset: "Reimposta",
  seek: "Posizione",
  rate: (_rate, shown) => `Velocità: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
