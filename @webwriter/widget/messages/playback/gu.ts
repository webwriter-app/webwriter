import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "ચલાવો",
  pause: "થોભાવો",
  step: "એક પગલું આગળ",
  back: "એક પગલું પાછળ",
  reset: "રીસેટ કરો",
  seek: "સ્થાન",
  rate: (_rate, shown) => `ઝડપ: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
