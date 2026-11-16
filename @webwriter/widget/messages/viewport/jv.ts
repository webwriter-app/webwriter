import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Tampilan",
  zoomOut: "Cilikake",
  zoomIn: "Gedhekake",
  percent: percent => `${percent}%`,
  reset: percent => `Zoom ${percent}%. Setel ulang menyang 100%`,
  fit: "Pas karo tampilan",
} satisfies Catalog<ViewportMessages>
