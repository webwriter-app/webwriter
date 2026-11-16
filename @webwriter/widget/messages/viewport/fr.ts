import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Vue",
  zoomOut: "Zoom arrière",
  zoomIn: "Zoom avant",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Zoom ${percent}\u00a0%. Rétablir à 100\u00a0%`,
  fit: "Ajuster à la vue",
} satisfies Catalog<ViewportMessages>
