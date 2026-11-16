import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Воспроизвести",
  pause: "Пауза",
  step: "Шаг вперёд",
  back: "Шаг назад",
  reset: "Сбросить",
  seek: "Позиция",
  rate: (_rate, shown) => `Скорость: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
