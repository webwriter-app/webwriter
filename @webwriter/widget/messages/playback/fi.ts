import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Toista",
  pause: "Keskeytä",
  step: "Askel eteenpäin",
  back: "Askel taaksepäin",
  reset: "Nollaa",
  seek: "Sijainti",
  rate: (_rate, shown) => `Nopeus: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
