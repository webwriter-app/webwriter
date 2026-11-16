import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Նվագարկել",
  pause: "Դադար",
  step: "Մեկ քայլ առաջ",
  back: "Մեկ քայլ հետ",
  reset: "Վերականգնել",
  seek: "Դիրք",
  rate: (_rate, shown) => `Արագություն՝ ${shown}×`,
} satisfies Catalog<PlaybackMessages>
