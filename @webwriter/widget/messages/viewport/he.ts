import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "תצוגה",
  zoomOut: "התרחקות",
  zoomIn: "התקרבות",
  percent: percent => `${percent}%`,
  reset: percent => `זום ${percent}%. איפוס ל-100%`,
  fit: "התאמה לתצוגה",
} satisfies Catalog<ViewportMessages>
