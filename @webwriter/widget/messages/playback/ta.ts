import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "இயக்கவும்",
  pause: "இடைநிறுத்தவும்",
  step: "ஒரு படி முன்னே",
  back: "ஒரு படி பின்னே",
  reset: "மீட்டமைக்கவும்",
  seek: "நிலை",
  rate: (_rate, shown) => `வேகம்: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
