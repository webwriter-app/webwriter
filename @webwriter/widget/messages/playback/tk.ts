import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Oýnat",
  pause: "Duruz",
  step: "Bir ädim ileri",
  back: "Bir ädim yza",
  reset: "Başlangyja gaýtar",
  seek: "Orun",
  rate: (_rate, shown) => `Tizlik: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
