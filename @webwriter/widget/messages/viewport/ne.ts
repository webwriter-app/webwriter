import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "दृश्य",
  zoomOut: "जुम घटाउनुहोस्",
  zoomIn: "जुम बढाउनुहोस्",
  percent: percent => `${percent}%`,
  reset: percent => `जुम ${percent}%। 100% मा रिसेट गर्नुहोस्`,
  fit: "पूरै देखाउनुहोस्",
} satisfies Catalog<ViewportMessages>
