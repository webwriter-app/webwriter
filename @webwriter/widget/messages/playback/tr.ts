import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Oynat",
  pause: "Duraklat",
  step: "Bir adım ileri",
  back: "Bir adım geri",
  reset: "Sıfırla",
  seek: "Konum",
  rate: (_rate, shown) => `Hız: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
