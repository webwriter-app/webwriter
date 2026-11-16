import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Mwonekano",
  zoomOut: "Punguza",
  zoomIn: "Kuza",
  percent: percent => `${percent}%`,
  reset: percent => `Kuza ${percent}%. Rudisha hadi 100%`,
  fit: "Tosha mwonekano",
} satisfies Catalog<ViewportMessages>
