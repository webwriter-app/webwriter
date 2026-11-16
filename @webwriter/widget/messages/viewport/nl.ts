import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Weergave",
  zoomOut: "Uitzoomen",
  zoomIn: "Inzoomen",
  percent: percent => `${percent}%`,
  reset: percent => `Zoom ${percent}%. Terugzetten naar 100%`,
  fit: "Aanpassen aan weergave",
} satisfies Catalog<ViewportMessages>
