import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "播放",
  pause: "暫停",
  step: "前進一步",
  back: "後退一步",
  reset: "重設",
  seek: "位置",
  rate: (_rate, shown) => `速度:${shown}×`,
} satisfies Catalog<PlaybackMessages>
