import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "چلائیں",
  pause: "روکیں",
  step: "ایک قدم آگے",
  back: "ایک قدم پیچھے",
  reset: "ری سیٹ کریں",
  seek: "مقام",
  rate: (_rate, shown) => `رفتار: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
