import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Golwg",
  zoomOut: "Chwyddo allan",
  zoomIn: "Chwyddo i mewn",
  percent: percent => `${percent}%`,
  reset: percent => `Chwyddo ${percent}%. Ailosod i 100%`,
  fit: "Ffitio i'r golwg",
} satisfies Catalog<ViewportMessages>
