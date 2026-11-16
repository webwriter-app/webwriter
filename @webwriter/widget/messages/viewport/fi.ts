import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Näkymä",
  zoomOut: "Loitonna",
  zoomIn: "Lähennä",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Zoomaus ${percent}\u00a0%. Palauta 100\u00a0%`,
  fit: "Sovita näkymään",
} satisfies Catalog<ViewportMessages>
