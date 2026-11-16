import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Pogled",
  zoomOut: "Pomanjšaj",
  zoomIn: "Povečaj",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Povečava ${percent}\u00a0%. Ponastavi na 100\u00a0%`,
  fit: "Prilagodi pogledu",
} satisfies Catalog<ViewportMessages>
