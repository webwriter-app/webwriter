import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "تشغيل",
  pause: "إيقاف مؤقت",
  step: "خطوة إلى الأمام",
  back: "خطوة إلى الخلف",
  reset: "إعادة تعيين",
  seek: "الموضع",
  rate: (_rate, shown) => `السرعة: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
