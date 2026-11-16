import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Visning",
  zoomOut: "Zoom ud",
  zoomIn: "Zoom ind",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Zoom ${percent}\u00a0%. Nulstil til 100\u00a0%`,
  fit: "Tilpas til visning",
} satisfies Catalog<ViewportMessages>
