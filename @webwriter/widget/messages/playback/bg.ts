import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Пускане",
  pause: "Пауза",
  step: "Крачка напред",
  back: "Крачка назад",
  reset: "Нулиране",
  seek: "Позиция",
  rate: (_rate, shown) => `Скорост: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
