import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "चलाएँ",
  pause: "रोकें",
  step: "एक चरण आगे",
  back: "एक चरण पीछे",
  reset: "रीसेट करें",
  seek: "स्थिति",
  rate: (_rate, shown) => `गति: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
