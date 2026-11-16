import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Abspielen",
  pause: "Pausieren",
  step: "Einen Schritt vor",
  back: "Einen Schritt zurück",
  reset: "Zurücksetzen",
  seek: "Position",
  rate: (_rate, shown) => `Geschwindigkeit: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
