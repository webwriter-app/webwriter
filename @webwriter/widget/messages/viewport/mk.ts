import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Преглед",
  zoomOut: "Намали",
  zoomIn: "Зголеми",
  percent: percent => `${percent}%`,
  reset: percent => `Зумирање ${percent}%. Врати на 100%`,
  fit: "Прилагоди на прегледот",
} satisfies Catalog<ViewportMessages>
