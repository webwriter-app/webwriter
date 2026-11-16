import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "Тоглуулах",
  pause: "Түр зогсоох",
  step: "Нэг алхам урагш",
  back: "Нэг алхам хойш",
  reset: "Дахин тохируулах",
  seek: "Байрлал",
  rate: (_rate, shown) => `Хурд: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
