import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Vista",
  zoomOut: "Riduci",
  zoomIn: "Ingrandisci",
  percent: percent => `${percent}%`,
  reset: percent => `Zoom ${percent}%. Ripristina al 100%`,
  fit: "Adatta alla vista",
} satisfies Catalog<ViewportMessages>
