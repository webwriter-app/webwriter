import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Phát",
  pause: "Tạm dừng",
  step: "Tiến một bước",
  back: "Lùi một bước",
  reset: "Đặt lại",
  seek: "Vị trí",
  rate: (_rate, shown) => `Tốc độ: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
