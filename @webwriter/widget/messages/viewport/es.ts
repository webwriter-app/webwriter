import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Vista",
  zoomOut: "Reducir",
  zoomIn: "Ampliar",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Zoom ${percent}\u00a0%. Restablecer al 100\u00a0%`,
  fit: "Ajustar a la vista",
} satisfies Catalog<ViewportMessages>
