import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Kunna",
  pause: "Dakata",
  step: "Mataki gaba",
  back: "Mataki baya",
  reset: "Sake saita",
  seek: "Matsayi",
  rate: (_rate, shown) => `Gudu: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
