import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "پخش",
  pause: "توقف",
  step: "یک گام جلو",
  back: "یک گام عقب",
  reset: "بازنشانی",
  seek: "جایگاه",
  rate: (_rate, shown) => `سرعت: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
