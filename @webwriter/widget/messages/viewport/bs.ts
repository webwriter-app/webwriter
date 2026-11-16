import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Prikaz",
  zoomOut: "Smanji",
  zoomIn: "Povećaj",
  percent: percent => `${percent}%`,
  reset: percent => `Zumiranje ${percent}%. Vrati na 100%`,
  fit: "Prilagodi prikazu",
} satisfies Catalog<ViewportMessages>
