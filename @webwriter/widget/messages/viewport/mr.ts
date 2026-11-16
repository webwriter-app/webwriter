import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "दृश्य",
  zoomOut: "झूम कमी करा",
  zoomIn: "झूम वाढवा",
  percent: percent => `${percent}%`,
  reset: percent => `झूम ${percent}%. 100% वर रीसेट करा`,
  fit: "पूर्ण दाखवा",
} satisfies Catalog<ViewportMessages>
