import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Ойнотуу",
  pause: "Токтото туруу",
  step: "Бир кадам алдыга",
  back: "Бир кадам артка",
  reset: "Баштапкы абалга келтирүү",
  seek: "Орун",
  rate: (_rate, shown) => `Ылдамдык: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
