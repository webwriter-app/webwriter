import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Skats",
  zoomOut: "Attālināt",
  zoomIn: "Pietuvināt",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Mērogs ${percent}\u00a0%. Atiestatīt uz 100\u00a0%`,
  fit: "Pielāgot skatam",
} satisfies Catalog<ViewportMessages>
