import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "播放",
  pause: "暂停",
  step: "前进一步",
  back: "后退一步",
  reset: "重置",
  seek: "位置",
  rate: (_rate, shown) => `速度:${shown}×`,
} satisfies Catalog<PlaybackMessages>
