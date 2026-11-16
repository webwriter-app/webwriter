import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "പ്ലേ ചെയ്യുക",
  pause: "താൽക്കാലികമായി നിർത്തുക",
  step: "ഒരു ചുവട് മുന്നോട്ട്",
  back: "ഒരു ചുവട് പിന്നോട്ട്",
  reset: "പുനഃസജ്ജമാക്കുക",
  seek: "സ്ഥാനം",
  rate: (_rate, shown) => `വേഗത: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
