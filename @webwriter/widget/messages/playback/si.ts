import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "වාදනය කරන්න",
  pause: "විරාම කරන්න",
  step: "එක පියවරක් ඉදිරියට",
  back: "එක පියවරක් පසුපසට",
  reset: "යළි සකසන්න",
  seek: "ස්ථානය",
  rate: (_rate, shown) => `වේගය: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
