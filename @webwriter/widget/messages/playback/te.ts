import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "ప్లే చేయండి",
  pause: "పాజ్ చేయండి",
  step: "ఒక అడుగు ముందుకు",
  back: "ఒక అడుగు వెనక్కి",
  reset: "రీసెట్ చేయండి",
  seek: "స్థానం",
  rate: (_rate, shown) => `వేగం: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
