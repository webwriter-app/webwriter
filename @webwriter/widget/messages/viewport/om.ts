import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Mulʼanni",
  zoomOut: "Xiqqeessi",
  zoomIn: "Guddisi",
  percent: percent => `${percent}%`,
  reset: percent => `Guddisuu ${percent}%. Gara 100% deebisi`,
  fit: "Mulʼannaa waliin walgitsiisi",
} satisfies Catalog<ViewportMessages>
