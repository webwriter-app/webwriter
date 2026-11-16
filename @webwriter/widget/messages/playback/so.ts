import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Daar",
  pause: "Hakad",
  step: "Tallaabo hore",
  back: "Tallaabo dambe",
  reset: "Dib u dhig",
  seek: "Booska",
  rate: (_rate, shown) => `Xawaare: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
