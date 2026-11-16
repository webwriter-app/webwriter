import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "دیمەن",
  zoomOut: "بچووککردنەوە",
  zoomIn: "گەورەکردن",
  percent: percent => `${percent}%`,
  reset: percent => `زووم ${percent}%. گەڕانەوە بۆ 100%`,
  fit: "گونجاندن لەگەڵ دیمەن",
} satisfies Catalog<ViewportMessages>
