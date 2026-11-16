import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Reproducir",
  pause: "Pausa",
  step: "Paso adelante",
  back: "Paso atrás",
  reset: "Restablecer",
  seek: "Posición",
  rate: (_rate, shown) => `Velocidad: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
