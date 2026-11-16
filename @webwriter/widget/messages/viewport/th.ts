import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "มุมมอง",
  zoomOut: "ย่อ",
  zoomIn: "ขยาย",
  percent: percent => `${percent}%`,
  reset: percent => `ซูม ${percent}% รีเซ็ตเป็น 100%`,
  fit: "พอดีกับมุมมอง",
} satisfies Catalog<ViewportMessages>
