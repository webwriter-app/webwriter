import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "הפעלה",
  pause: "השהיה",
  step: "צעד קדימה",
  back: "צעד אחורה",
  reset: "איפוס",
  seek: "מיקום",
  rate: (_rate, shown) => `מהירות: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
