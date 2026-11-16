import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Atskaņot",
  pause: "Pauzēt",
  step: "Solis uz priekšu",
  back: "Solis atpakaļ",
  reset: "Atiestatīt",
  seek: "Pozīcija",
  rate: (_rate, shown) => `Ātrums: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
