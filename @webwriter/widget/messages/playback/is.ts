import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Spila",
  pause: "Hlé",
  step: "Eitt skref áfram",
  back: "Eitt skref til baka",
  reset: "Endurstilla",
  seek: "Staða",
  rate: (_rate, shown) => `Hraði: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
