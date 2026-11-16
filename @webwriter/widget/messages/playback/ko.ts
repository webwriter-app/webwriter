import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "재생",
  pause: "일시 정지",
  step: "한 단계 앞으로",
  back: "한 단계 뒤로",
  reset: "초기화",
  seek: "위치",
  rate: (_rate, shown) => `속도: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
