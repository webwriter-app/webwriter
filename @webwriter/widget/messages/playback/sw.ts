import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Cheza",
  pause: "Simamisha",
  step: "Hatua mbele",
  back: "Hatua nyuma",
  reset: "Weka upya",
  seek: "Nafasi",
  rate: (_rate, shown) => `Kasi: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
