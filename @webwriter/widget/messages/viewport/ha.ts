import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Dubawa",
  zoomOut: "Ƙarami",
  zoomIn: "Ƙara girma",
  percent: percent => `${percent}%`,
  reset: percent => `Girmamawa ${percent}%. Mayar da 100%`,
  fit: "Daidaita da dubawa",
} satisfies Catalog<ViewportMessages>
