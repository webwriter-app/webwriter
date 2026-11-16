import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Vizualizare",
  zoomOut: "Micșorează",
  zoomIn: "Mărește",
  percent: percent => `${percent}%`,
  reset: percent => `Zoom ${percent}%. Resetează la 100%`,
  fit: "Potrivește în vizualizare",
} satisfies Catalog<ViewportMessages>
