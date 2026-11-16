import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "لێدان",
  pause: "وەستاندنی کاتی",
  step: "هەنگاوێک بۆ پێش",
  back: "هەنگاوێک بۆ دواوە",
  reset: "دووبارە ڕێکخستنەوە",
  seek: "شوێن",
  rate: (_rate, shown) => `خێرایی: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
