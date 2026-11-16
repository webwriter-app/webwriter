import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "منطقة العرض",
  zoomOut: "تصغير",
  zoomIn: "تكبير",
  percent: percent => `${percent}%`,
  reset: percent => `التكبير ${percent}%. إعادة الضبط إلى 100%`,
  fit: "ملاءمة العرض",
} satisfies Catalog<ViewportMessages>
