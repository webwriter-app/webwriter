import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Widok",
  zoomOut: "Pomniejsz",
  zoomIn: "Powiększ",
  percent: percent => `${percent}%`,
  reset: percent => `Powiększenie ${percent}%. Przywróć 100%`,
  fit: "Dopasuj do widoku",
} satisfies Catalog<ViewportMessages>
