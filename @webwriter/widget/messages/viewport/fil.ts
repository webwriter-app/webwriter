import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "View",
  zoomOut: "I-zoom out",
  zoomIn: "I-zoom in",
  percent: percent => `${percent}%`,
  reset: percent => `Zoom ${percent}%. I-reset sa 100%`,
  fit: "Ihanay sa view",
} satisfies Catalog<ViewportMessages>
