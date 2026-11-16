import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Көрініс",
  zoomOut: "Кішірейту",
  zoomIn: "Үлкейту",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Масштаб ${percent}\u00a0%. 100\u00a0% мәніне қайтару`,
  fit: "Көрініске сыйғызу",
} satisfies Catalog<ViewportMessages>
