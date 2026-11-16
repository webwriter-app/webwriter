import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Rodinys",
  zoomOut: "Sumažinti",
  zoomIn: "Padidinti",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Mastelis ${percent}\u00a0%. Atstatyti į 100\u00a0%`,
  fit: "Pritaikyti rodiniui",
} satisfies Catalog<ViewportMessages>
