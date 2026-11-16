import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "เล่น",
  pause: "หยุดชั่วคราว",
  step: "ถัดไปหนึ่งขั้น",
  back: "ย้อนกลับหนึ่งขั้น",
  reset: "รีเซ็ต",
  seek: "ตำแหน่ง",
  rate: (_rate, shown) => `ความเร็ว: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
