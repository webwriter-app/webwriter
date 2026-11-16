import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "ଚଲାନ୍ତୁ",
  pause: "ବିରତି",
  step: "ଏକ ପାଦ ଆଗକୁ",
  back: "ଏକ ପାଦ ପଛକୁ",
  reset: "ରିସେଟ୍ କରନ୍ତୁ",
  seek: "ସ୍ଥିତି",
  rate: (_rate, shown) => `ଗତି: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
