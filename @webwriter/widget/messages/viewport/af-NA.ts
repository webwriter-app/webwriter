import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Aansig",
  zoomOut: "Zoem uit",
  zoomIn: "Zoem in",
  percent: percent => `${percent}%`,
  reset: percent => `Zoem ${percent}%. Stel terug na 100%`,
  fit: "Pas by aansig",
} satisfies Catalog<ViewportMessages>
