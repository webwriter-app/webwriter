import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Ħaddem",
  pause: "Waqqaf",
  step: "Pass 'il quddiem",
  back: "Pass 'il wara",
  reset: "Irrisettja",
  seek: "Pożizzjoni",
  rate: (_rate, shown) => `Veloċità: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
