import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Lejátszás",
  pause: "Szünet",
  step: "Lépés előre",
  back: "Lépés vissza",
  reset: "Visszaállítás",
  seek: "Pozíció",
  rate: (_rate, shown) => `Sebesség: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
