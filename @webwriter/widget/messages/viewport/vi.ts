import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Khung nhìn",
  zoomOut: "Thu nhỏ",
  zoomIn: "Phóng to",
  percent: percent => `${percent}%`,
  reset: percent => `Thu phóng ${percent}%. Đặt lại về 100%`,
  fit: "Vừa khung nhìn",
} satisfies Catalog<ViewportMessages>
