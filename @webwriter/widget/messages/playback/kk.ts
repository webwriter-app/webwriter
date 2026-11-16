import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Ойнату",
  pause: "Кідірту",
  step: "Бір қадам алға",
  back: "Бір қадам артқа",
  reset: "Бастапқы күйге қайтару",
  seek: "Орын",
  rate: (_rate, shown) => `Жылдамдық: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
