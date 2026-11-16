import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Esita",
  pause: "Peata",
  step: "Samm edasi",
  back: "Samm tagasi",
  reset: "Lähtesta",
  seek: "Asukoht",
  rate: (_rate, shown) => `Kiirus: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
