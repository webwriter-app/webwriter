import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "再生",
  pause: "一時停止",
  step: "1 ステップ進む",
  back: "1 ステップ戻る",
  reset: "リセット",
  seek: "位置",
  rate: (_rate, shown) => `速度:${shown}×`,
} satisfies Catalog<PlaybackMessages>
