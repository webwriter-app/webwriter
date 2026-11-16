import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Reprodueix",
  pause: "Pausa",
  step: "Pas endavant",
  back: "Pas enrere",
  reset: "Restableix",
  seek: "Posició",
  rate: (_rate, shown) => `Velocitat: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
