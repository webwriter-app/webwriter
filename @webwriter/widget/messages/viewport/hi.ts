import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "दृश्य",
  zoomOut: "ज़ूम घटाएँ",
  zoomIn: "ज़ूम बढ़ाएँ",
  percent: percent => `${percent}%`,
  reset: percent => `ज़ूम ${percent}%। 100% पर रीसेट करें`,
  fit: "पूरा दिखाएँ",
} satisfies Catalog<ViewportMessages>
