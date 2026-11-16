import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Приказ",
  zoomOut: "Умањи",
  zoomIn: "Увећај",
  percent: percent => `${percent}%`,
  reset: percent => `Зум ${percent}%. Врати на 100%`,
  fit: "Прилагоди приказу",
} satisfies Catalog<ViewportMessages>
