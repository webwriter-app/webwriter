import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "ኣጻውት",
  pause: "ጠጠው ኣብል",
  step: "ሓደ ስጉምቲ ንቕድሚት",
  back: "ሓደ ስጉምቲ ንድሕሪት",
  reset: "ዳግማይ ኣጽሪ",
  seek: "ቦታ",
  rate: (_rate, shown) => `ቅልጣፈ፦ ${shown}×`,
} satisfies Catalog<PlaybackMessages>
