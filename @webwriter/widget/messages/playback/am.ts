import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "አጫውት",
  pause: "ለአፍታ አቁም",
  step: "አንድ እርምጃ ወደፊት",
  back: "አንድ እርምጃ ወደኋላ",
  reset: "እንደገና አስጀምር",
  seek: "ቦታ",
  rate: (_rate, shown) => `ፍጥነት፦ ${shown}×`,
} satisfies Catalog<PlaybackMessages>
