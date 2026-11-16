import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Vista",
  zoomOut: "Redueix",
  zoomIn: "Amplia",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Zoom ${percent}\u00a0%. Restableix al 100\u00a0%`,
  fit: "Ajusta a la vista",
} satisfies Catalog<ViewportMessages>
