import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "ನೋಟ",
  zoomOut: "ಜೂಮ್ ಕಡಿಮೆ ಮಾಡಿ",
  zoomIn: "ಜೂಮ್ ಹೆಚ್ಚಿಸಿ",
  percent: percent => `${percent}%`,
  reset: percent => `ಜೂಮ್ ${percent}%. 100% ಗೆ ಮರುಹೊಂದಿಸಿ`,
  fit: "ಪೂರ್ಣ ತೋರಿಸಿ",
} satisfies Catalog<ViewportMessages>
