import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Vista",
  zoomOut: "Reduzir",
  zoomIn: "Ampliar",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Zoom ${percent}\u00a0%. Repor para 100\u00a0%`,
  fit: "Ajustar à vista",
} satisfies Catalog<ViewportMessages>
