import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Redă",
  pause: "Pauză",
  step: "Un pas înainte",
  back: "Un pas înapoi",
  reset: "Resetează",
  seek: "Poziție",
  rate: (_rate, shown) => `Viteză: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
