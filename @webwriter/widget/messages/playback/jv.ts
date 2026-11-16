import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Setel",
  pause: "Rerén",
  step: "Langkah maju",
  back: "Langkah mundur",
  reset: "Setel ulang",
  seek: "Posisi",
  rate: (_rate, shown) => `Kacepetan: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
