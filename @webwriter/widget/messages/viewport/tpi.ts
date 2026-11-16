import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Window",
  zoomOut: "Mekim liklik",
  zoomIn: "Mekim bikpela",
  percent: percent => `${percent}%`,
  reset: percent => `Zum ${percent}%. Statim gen long 100%`,
  fit: "Fitim long window",
} satisfies Catalog<ViewportMessages>
