import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Bilîze",
  pause: "Rawestîne",
  step: "Gavek bi pêş ve",
  back: "Gavek bi paş ve",
  reset: "Vegerîne",
  seek: "Cih",
  rate: (_rate, shown) => `Lez: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
