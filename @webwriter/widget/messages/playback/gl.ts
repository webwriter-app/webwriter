import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Reproducir",
  pause: "Pausa",
  step: "Paso adiante",
  back: "Paso atrás",
  reset: "Restablecer",
  seek: "Posición",
  rate: (_rate, shown) => `Velocidade: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
