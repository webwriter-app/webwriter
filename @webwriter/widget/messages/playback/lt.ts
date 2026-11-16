import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Leisti",
  pause: "Pristabdyti",
  step: "Žingsnis pirmyn",
  back: "Žingsnis atgal",
  reset: "Nustatyti iš naujo",
  seek: "Padėtis",
  rate: (_rate, shown) => `Greitis: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
