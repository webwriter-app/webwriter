import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "चालवा",
  pause: "थांबवा",
  step: "एक पाऊल पुढे",
  back: "एक पाऊल मागे",
  reset: "रीसेट करा",
  seek: "स्थान",
  rate: (_rate, shown) => `गती: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
