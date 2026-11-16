import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Prikaz",
  zoomOut: "Smanji",
  zoomIn: "Povećaj",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Zumiranje ${percent}\u00a0%. Vrati na 100\u00a0%`,
  fit: "Prilagodi prikazu",
} satisfies Catalog<ViewportMessages>
