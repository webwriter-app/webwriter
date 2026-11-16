import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Görünüm",
  zoomOut: "Uzaklaştır",
  zoomIn: "Yakınlaştır",
  percent: percent => `%${percent}`,
  reset: percent => `Yakınlaştırma %${percent}. %100'e sıfırla`,
  fit: "Görünüme sığdır",
} satisfies Catalog<ViewportMessages>
