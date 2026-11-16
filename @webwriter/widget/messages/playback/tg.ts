import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Пахш кардан",
  pause: "Таваққуф",
  step: "Як қадам ба пеш",
  back: "Як қадам ба қафо",
  reset: "Аз нав барқарор кардан",
  seek: "Мавқеъ",
  rate: (_rate, shown) => `Суръат: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
