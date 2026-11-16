import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "نمای نمایش",
  zoomOut: "کوچک‌نمایی",
  zoomIn: "بزرگ‌نمایی",
  percent: percent => `${percent}%`,
  reset: percent => `بزرگ‌نمایی ${percent}%. بازگشت به 100%`,
  fit: "جاگیری در نما",
} satisfies Catalog<ViewportMessages>
