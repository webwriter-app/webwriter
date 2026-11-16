import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Seinn",
  pause: "Cuir ar sos",
  step: "Céim ar aghaidh",
  back: "Céim ar gcúl",
  reset: "Athshocraigh",
  seek: "Suíomh",
  rate: (_rate, shown) => `Luas: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
