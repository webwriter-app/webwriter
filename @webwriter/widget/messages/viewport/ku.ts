import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Dîmen",
  zoomOut: "Biçûk bike",
  zoomIn: "Mezin bike",
  percent: percent => `${percent}%`,
  reset: percent => `Mezinkirin ${percent}%. Vegerîne 100%`,
  fit: "Li dîmenê bicivîne",
} satisfies Catalog<ViewportMessages>
