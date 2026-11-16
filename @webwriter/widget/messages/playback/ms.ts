import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Main",
  pause: "Jeda",
  step: "Langkah ke hadapan",
  back: "Langkah ke belakang",
  reset: "Set semula",
  seek: "Kedudukan",
  rate: (_rate, shown) => `Kelajuan: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
