import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Прайграць",
  pause: "Паўза",
  step: "Крок наперад",
  back: "Крок назад",
  reset: "Скінуць",
  seek: "Пазіцыя",
  rate: (_rate, shown) => `Хуткасць: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
