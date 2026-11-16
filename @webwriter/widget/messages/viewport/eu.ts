import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Ikuspegia",
  zoomOut: "Txikitu",
  zoomIn: "Handitu",
  percent: percent => `${percent}%`,
  reset: percent => `Zooma ${percent}%. Berrezarri 100%era`,
  fit: "Doitu ikuspegira",
} satisfies Catalog<ViewportMessages>
