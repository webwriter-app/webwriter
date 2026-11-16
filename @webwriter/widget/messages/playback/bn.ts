import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "চালান",
  pause: "বিরতি দিন",
  step: "এক ধাপ এগিয়ে",
  back: "এক ধাপ পিছনে",
  reset: "রিসেট করুন",
  seek: "অবস্থান",
  rate: (_rate, shown) => `গতি: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
