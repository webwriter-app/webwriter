import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Putar",
  pause: "Jeda",
  step: "Langkah maju",
  back: "Langkah mundur",
  reset: "Atur ulang",
  seek: "Posisi",
  rate: (_rate, shown) => `Kecepatan: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
