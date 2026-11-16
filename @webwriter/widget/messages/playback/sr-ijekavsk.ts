import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Пусти",
  pause: "Паузирај",
  step: "Корак напријед",
  back: "Корак назад",
  reset: "Врати",
  seek: "Позиција",
  rate: (_rate, shown) => `Брзина: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
