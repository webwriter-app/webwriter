import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Ijro etish",
  pause: "To‘xtatib turish",
  step: "Bir qadam oldinga",
  back: "Bir qadam orqaga",
  reset: "Asl holatiga qaytarish",
  seek: "Joylashuv",
  rate: (_rate, shown) => `Tezlik: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
