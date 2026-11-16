import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Vy",
  zoomOut: "Zooma ut",
  zoomIn: "Zooma in",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Zoom ${percent}\u00a0%. Återställ till 100\u00a0%`,
  fit: "Anpassa till vyn",
} satisfies Catalog<ViewportMessages>
