import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Відтворити",
  pause: "Пауза",
  step: "Крок уперед",
  back: "Крок назад",
  reset: "Скинути",
  seek: "Позиція",
  rate: (_rate, shown) => `Швидкість: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
