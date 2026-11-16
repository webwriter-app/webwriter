import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "ਚਲਾਓ",
  pause: "ਰੋਕੋ",
  step: "ਇੱਕ ਕਦਮ ਅੱਗੇ",
  back: "ਇੱਕ ਕਦਮ ਪਿੱਛੇ",
  reset: "ਰੀਸੈੱਟ ਕਰੋ",
  seek: "ਸਥਿਤੀ",
  rate: (_rate, shown) => `ਰਫ਼ਤਾਰ: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
