import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Zobrazenie",
  zoomOut: "Oddialiť",
  zoomIn: "Priblížiť",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Priblíženie ${percent}\u00a0%. Obnoviť na 100\u00a0%`,
  fit: "Prispôsobiť zobrazeniu",
} satisfies Catalog<ViewportMessages>
