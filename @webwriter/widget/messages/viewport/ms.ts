import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Paparan",
  zoomOut: "Zum keluar",
  zoomIn: "Zum masuk",
  percent: percent => `${percent}%`,
  reset: percent => `Zum ${percent}%. Set semula kepada 100%`,
  fit: "Muat dalam paparan",
} satisfies Catalog<ViewportMessages>
