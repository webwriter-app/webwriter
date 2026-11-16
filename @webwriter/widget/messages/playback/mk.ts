import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Пушти",
  pause: "Пауза",
  step: "Чекор напред",
  back: "Чекор назад",
  reset: "Врати",
  seek: "Позиција",
  rate: (_rate, shown) => `Брзина: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
