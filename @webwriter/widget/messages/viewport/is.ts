import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Sýn",
  zoomOut: "Þysja út",
  zoomIn: "Þysja inn",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Aðdráttur ${percent}\u00a0%. Endurstilla á 100\u00a0%`,
  fit: "Passa við sýn",
} satisfies Catalog<ViewportMessages>
