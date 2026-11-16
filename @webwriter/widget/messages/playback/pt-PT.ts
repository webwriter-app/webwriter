import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Reproduzir",
  pause: "Pausa",
  step: "Avançar um passo",
  back: "Recuar um passo",
  reset: "Repor",
  seek: "Posição",
  rate: (_rate, shown) => `Velocidade: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
