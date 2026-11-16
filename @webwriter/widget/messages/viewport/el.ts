import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Προβολή",
  zoomOut: "Σμίκρυνση",
  zoomIn: "Μεγέθυνση",
  percent: percent => `${percent}%`,
  reset: percent => `Μεγέθυνση ${percent}%. Επαναφορά στο 100%`,
  fit: "Προσαρμογή στην προβολή",
} satisfies Catalog<ViewportMessages>
