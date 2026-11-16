import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Visning",
  zoomOut: "Zoom ut",
  zoomIn: "Zoom inn",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Zoom ${percent}\u00a0%. Tilbakestill til 100\u00a0%`,
  fit: "Tilpass til visning",
} satisfies Catalog<ViewportMessages>
