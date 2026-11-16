import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Reproduzir",
  pause: "Pausar",
  step: "Avançar um passo",
  back: "Voltar um passo",
  reset: "Redefinir",
  seek: "Posição",
  rate: (_rate, shown) => `Velocidade: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
