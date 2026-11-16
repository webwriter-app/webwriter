import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Prospectus",
  zoomOut: "Minuere",
  zoomIn: "Augere",
  percent: percent => `${percent}%`,
  reset: percent => `Magnitudo ${percent}%. Ad 100% restituere`,
  fit: "Aptare ad prospectum",
} satisfies Catalog<ViewportMessages>
