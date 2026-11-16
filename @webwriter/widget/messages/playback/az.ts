import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Oxut",
  pause: "Fasilə",
  step: "Bir addım irəli",
  back: "Bir addım geri",
  reset: "Sıfırla",
  seek: "Mövqe",
  rate: (_rate, shown) => `Sürət: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
