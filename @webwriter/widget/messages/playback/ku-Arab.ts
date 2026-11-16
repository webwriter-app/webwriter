import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "ببەزینە",
  pause: "ڕاوەستینە",
  step: "گاڤەک ب پێش ڤە",
  back: "گاڤەک ب پاش ڤە",
  reset: "ڤەگێڕە",
  seek: "جه",
  rate: (_rate, shown) => `لەز: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
