import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Prikaz",
  zoomOut: "Umanji",
  zoomIn: "Uvećaj",
  percent: percent => `${percent}%`,
  reset: percent => `Zum ${percent}%. Vrati na 100%`,
  fit: "Prilagodi prikazu",
} satisfies Catalog<ViewportMessages>
