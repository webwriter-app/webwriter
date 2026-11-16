import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "غږول",
  pause: "ځنډول",
  step: "یو ګام مخکې",
  back: "یو ګام شاته",
  reset: "بیا تنظیمول",
  seek: "موقعیت",
  rate: (_rate, shown) => `چټکتیا: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
