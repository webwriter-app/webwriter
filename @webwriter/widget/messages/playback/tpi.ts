import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Pilai",
  pause: "Stop liklik",
  step: "Go het wanpela step",
  back: "Go bek wanpela step",
  reset: "Statim gen",
  seek: "Ples",
  rate: (_rate, shown) => `Spid: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
