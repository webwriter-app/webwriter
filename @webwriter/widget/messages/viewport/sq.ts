import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Pamja",
  zoomOut: "Zvogëlo",
  zoomIn: "Zmadho",
  percent: percent => `${percent}%`,
  reset: percent => `Zmadhimi ${percent}%. Rivendos në 100%`,
  fit: "Përshtat me pamjen",
} satisfies Catalog<ViewportMessages>
